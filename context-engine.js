const DEFAULT_MESSAGE_TOKEN_BUDGET = 650000;
const DEFAULT_HISTORY_TOKEN_BUDGET = 12000;
const DEFAULT_HISTORY_TURN_LIMIT = 12;
const HISTORY_STOP_TERMS = new Set([
  '什么', '怎么', '怎样', '这个', '那个', '现在', '以前', '之前', '曾经', '说过', '记得',
  '用户', '麻衣', '喜欢', '觉得', '还是', '可以', '是不是', '有没有'
]);

function estimateTokenCount(value) {
  const text = String(value || '');
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const other = text.length - cjk;
  return Math.max(1, Math.ceil(cjk * 1.15 + other / 3.4));
}

function truncateToTokenBudget(value, tokenBudget, keepEnd = false) {
  const text = String(value || '').trim();
  const budget = Math.max(1, Math.floor(Number(tokenBudget) || 1));
  if (estimateTokenCount(text) <= budget) return text;
  let low = 1;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const sample = keepEnd ? text.slice(-middle) : text.slice(0, middle);
    if (estimateTokenCount(sample) <= budget) low = middle;
    else high = middle - 1;
  }
  const clipped = keepEnd ? text.slice(-low) : text.slice(0, low);
  return keepEnd ? `…${clipped}` : `${clipped}…`;
}

function trimMessagesToTokenBudget(messages, options = {}) {
  const tokenBudget = Math.max(1000, Number(options.tokenBudget) || DEFAULT_MESSAGE_TOKEN_BUDGET);
  const messageLimit = Math.max(2, Number(options.messageLimit) || 1600);
  const maxMessageTokens = Math.max(256, Number(options.maxMessageTokens) || 16000);
  const candidates = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && ['user', 'assistant'].includes(message.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').trim()
    }))
    .filter((message) => message.content)
    .slice(-messageLimit);
  const selected = [];
  let usedTokens = 0;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const remaining = tokenBudget - usedTokens;
    if (remaining <= 32) break;
    let content = candidate.content;
    const contentTokens = estimateTokenCount(content);
    if (contentTokens > maxMessageTokens) {
      content = truncateToTokenBudget(content, maxMessageTokens, index < candidates.length - 4);
    }
    const tokens = estimateTokenCount(content) + 8;
    if (tokens > remaining) {
      if (!selected.length || index >= candidates.length - 2) {
        content = truncateToTokenBudget(content, Math.max(32, remaining - 8), true);
        selected.unshift({ role: candidate.role, content });
      }
      break;
    }
    selected.unshift({ role: candidate.role, content });
    usedTokens += tokens;
  }
  return selected;
}

function queryTerms(value) {
  const normalized = String(value || '').toLocaleLowerCase('zh-CN');
  const terms = new Set(normalized.match(/[a-z0-9][a-z0-9_-]{1,}|[\u3400-\u9fff]{2}/g) || []);
  for (const run of normalized.match(/[\u3400-\u9fff]{3,}/g) || []) {
    for (let index = 0; index < run.length - 1; index += 1) {
      terms.add(run.slice(index, index + 2));
    }
  }
  for (const term of HISTORY_STOP_TERMS) terms.delete(term);
  return terms;
}

function overlapScore(left, right) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const term of left) {
    if (right.has(term)) overlap += 1;
  }
  return overlap;
}

function sessionTurns(sessions, excludedSessionId = '') {
  const turns = [];
  for (const session of Array.isArray(sessions) ? sessions : []) {
    if (!session || String(session.id) === String(excludedSessionId || '')) continue;
    const messages = Array.isArray(session.messages) ? session.messages : [];
    for (let index = 0; index < messages.length; index += 1) {
      const user = messages[index];
      if (user?.role !== 'user' || !String(user.content || '').trim()) continue;
      const assistant = messages[index + 1]?.role === 'assistant' ? messages[index + 1] : null;
      turns.push({
        sessionId: String(session.id || ''),
        sessionTitle: String(session.title || '历史对话').slice(0, 50),
        user: String(user.content || '').trim(),
        assistant: String(assistant?.content || '').trim(),
        createdAt: user.createdAt || session.updatedAt || session.createdAt || ''
      });
    }
  }
  return turns;
}

function selectHistoricalTurns(sessions, messages, options = {}) {
  const limit = Math.max(1, Number(options.limit) || DEFAULT_HISTORY_TURN_LIMIT);
  const tokenBudget = Math.max(1000, Number(options.tokenBudget) || DEFAULT_HISTORY_TOKEN_BUDGET);
  const recentMessages = (Array.isArray(messages) ? messages : []).slice(-8);
  const latestUser = [...recentMessages].reverse().find((message) => message?.role === 'user')?.content || '';
  const latestQuerySet = queryTerms(latestUser);
  const supportingQuerySet = queryTerms(recentMessages.slice(0, -1).map((message) => message?.content).join(' '));
  const excludedEvidence = (Array.isArray(options.excludedEvidence) ? options.excludedEvidence : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const now = Number(options.now) || Date.now();
  const ranked = sessionTurns(sessions, options.excludedSessionId)
    .map((turn) => {
      const terms = queryTerms(`${turn.user} ${turn.assistant}`);
      const latestOverlap = overlapScore(latestQuerySet, terms);
      const supportingOverlap = overlapScore(supportingQuerySet, terms);
      const timestamp = new Date(turn.createdAt || 0).getTime();
      const ageDays = Number.isFinite(timestamp) && timestamp > 0
        ? Math.max(0, (now - timestamp) / 86400000)
        : 365;
      const recency = Math.max(0, 8 - Math.log10(ageDays + 1) * 3);
      const explicit = /记住|别忘|我叫|我喜欢|我不喜欢|我的生日|我住在|我计划|我打算/.test(turn.user) ? 3 : 0;
      const duplicatesStructuredMemory = excludedEvidence.some((evidence) => (
        evidence.length >= 4
        && (turn.user.includes(evidence) || evidence.includes(turn.user))
      ));
      const score = latestOverlap * 16 + supportingOverlap * 4 + recency * 0.35 + explicit;
      return { turn, score, latestOverlap, supportingOverlap, duplicatesStructuredMemory };
    })
    .filter((item) => (
      !item.duplicatesStructuredMemory
      && item.latestOverlap >= 1
      && item.score >= 14
    ))
    .sort((left, right) => right.score - left.score);
  const selected = [];
  let usedTokens = 0;
  for (const { turn } of ranked) {
    if (selected.length >= limit) break;
    const itemTokens = estimateTokenCount(turn.user) + estimateTokenCount(turn.assistant) + 40;
    if (usedTokens + itemTokens > tokenBudget) continue;
    selected.push(turn);
    usedTokens += itemTokens;
  }
  return selected;
}

module.exports = {
  DEFAULT_HISTORY_TOKEN_BUDGET,
  DEFAULT_HISTORY_TURN_LIMIT,
  DEFAULT_MESSAGE_TOKEN_BUDGET,
  estimateTokenCount,
  selectHistoricalTurns,
  trimMessagesToTokenBudget,
  truncateToTokenBudget
};
