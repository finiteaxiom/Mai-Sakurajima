const crypto = require('node:crypto');
const path = require('node:path');

const KNOWLEDGE_STATE_VERSION = 1;
const PRIVACY_MODES = new Set(['chat', 'local', 'locked']);
const MAX_LIBRARIES = 50;
const MAX_DOCUMENTS = 1000;
const MAX_DOCUMENT_TEXT = 2_000_000;
const MAX_CHUNKS_PER_DOCUMENT = 2500;

function cleanText(value, limit = 1000) {
  return String(value || '').replace(/\u0000/g, '').replace(/[\t ]+/g, ' ').replace(/\r\n/g, '\n').trim().slice(0, limit);
}

function compactText(value, limit = MAX_DOCUMENT_TEXT) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{4,}/g, '\n\n')
    .trim()
    .slice(0, limit);
}

function validIso(value, fallback = '') {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : fallback;
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function stableId(prefix, ...parts) {
  return `${prefix}-${hashText(parts.join('|')).slice(0, 16)}`;
}

function defaultKnowledgeState() {
  const createdAt = new Date().toISOString();
  return {
    version: KNOWLEDGE_STATE_VERSION,
    libraries: [
      { id: 'library-chat', name: '可参与聊天', privacy: 'chat', description: '相关片段可以在提问时发送给 DeepSeek。', createdAt, updatedAt: createdAt },
      { id: 'library-local', name: '仅本地资料', privacy: 'local', description: '只允许本地搜索，内容绝不进入 API 请求。', createdAt, updatedAt: createdAt },
      { id: 'library-locked', name: '锁定资料', privacy: 'locked', description: '保留索引但暂停搜索和聊天使用。', createdAt, updatedAt: createdAt }
    ],
    documents: [],
    lastIndexedAt: '',
    lastRefreshAt: ''
  };
}

function normalizeLibrary(value = {}) {
  const now = new Date().toISOString();
  const name = cleanText(value.name, 80);
  const createdAt = validIso(value.createdAt, now);
  return {
    id: cleanText(value.id, 120) || stableId('library', name, createdAt),
    name,
    privacy: PRIVACY_MODES.has(value.privacy) ? value.privacy : 'local',
    description: cleanText(value.description, 300),
    createdAt,
    updatedAt: validIso(value.updatedAt, createdAt)
  };
}

function normalizeChunk(value = {}, documentId = '') {
  const text = compactText(value.text, 8000);
  return {
    id: cleanText(value.id, 120) || stableId('chunk', documentId, value.page, value.index, text),
    index: Math.max(0, Math.round(Number(value.index) || 0)),
    page: Math.max(0, Math.round(Number(value.page) || 0)),
    text,
    hash: /^[a-f0-9]{64}$/i.test(String(value.hash || '')) ? String(value.hash) : hashText(text)
  };
}

function normalizeDocument(value = {}) {
  const now = new Date().toISOString();
  const title = cleanText(value.title || path.basename(String(value.sourcePath || '')), 180);
  const createdAt = validIso(value.createdAt, now);
  const id = cleanText(value.id, 120) || stableId('document', value.sourcePath, title, createdAt);
  const chunks = (Array.isArray(value.chunks) ? value.chunks : [])
    .map((chunk) => normalizeChunk(chunk, id)).filter((chunk) => chunk.text).slice(0, MAX_CHUNKS_PER_DOCUMENT);
  return {
    id,
    libraryId: cleanText(value.libraryId, 120) || 'library-local',
    title,
    sourcePath: String(value.sourcePath || '').trim().slice(0, 2000),
    fileType: cleanText(value.fileType || path.extname(String(value.sourcePath || '')).slice(1), 20).toLowerCase(),
    size: Math.max(0, Number(value.size) || 0),
    mtimeMs: Math.max(0, Number(value.mtimeMs) || 0),
    contentHash: /^[a-f0-9]{64}$/i.test(String(value.contentHash || '')) ? String(value.contentHash) : hashText(chunks.map((item) => item.text).join('\n')),
    status: ['ready', 'missing', 'error', 'indexing'].includes(value.status) ? value.status : 'ready',
    error: cleanText(value.error, 500),
    pageCount: Math.max(0, Math.round(Number(value.pageCount) || 0)),
    characterCount: Math.max(0, Math.round(Number(value.characterCount) || chunks.reduce((total, item) => total + item.text.length, 0))),
    chunks,
    tags: (Array.isArray(value.tags) ? value.tags : []).map((item) => cleanText(item, 40)).filter(Boolean).slice(0, 30),
    createdAt,
    updatedAt: validIso(value.updatedAt, createdAt),
    indexedAt: validIso(value.indexedAt, createdAt)
  };
}

function normalizeKnowledgeState(value = {}) {
  const defaults = defaultKnowledgeState();
  let libraries = (Array.isArray(value.libraries) ? value.libraries : []).map(normalizeLibrary).filter((item) => item.name).slice(0, MAX_LIBRARIES);
  if (!libraries.length) libraries = defaults.libraries;
  for (const defaultLibrary of defaults.libraries) {
    if (!libraries.some((item) => item.id === defaultLibrary.id)) libraries.push(defaultLibrary);
  }
  const libraryIds = new Set(libraries.map((item) => item.id));
  const documents = (Array.isArray(value.documents) ? value.documents : [])
    .map(normalizeDocument)
    .filter((item) => item.title && libraryIds.has(item.libraryId))
    .slice(0, MAX_DOCUMENTS);
  return {
    version: KNOWLEDGE_STATE_VERSION,
    libraries,
    documents,
    lastIndexedAt: validIso(value.lastIndexedAt),
    lastRefreshAt: validIso(value.lastRefreshAt)
  };
}

function buildChunks(pages, options = {}) {
  const chunkSize = Math.max(500, Math.min(5000, Number(options.chunkSize) || 1600));
  const overlap = Math.max(0, Math.min(500, Number(options.overlap) || 180));
  const chunks = [];
  for (const pageValue of Array.isArray(pages) ? pages : []) {
    const page = Math.max(0, Math.round(Number(pageValue.page) || 0));
    const text = compactText(pageValue.text);
    if (!text) continue;
    let offset = 0;
    while (offset < text.length && chunks.length < MAX_CHUNKS_PER_DOCUMENT) {
      let end = Math.min(text.length, offset + chunkSize);
      if (end < text.length) {
        const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('。', end), text.lastIndexOf('！', end), text.lastIndexOf('？', end));
        if (boundary > offset + Math.floor(chunkSize * 0.55)) end = boundary + 1;
      }
      const chunkText = text.slice(offset, end).trim();
      if (chunkText) chunks.push({ index: chunks.length, page, text: chunkText });
      if (end >= text.length) break;
      offset = Math.max(offset + 1, end - overlap);
    }
  }
  return chunks;
}

function createDocument(input = {}) {
  const pages = (Array.isArray(input.pages) ? input.pages : [{ page: 0, text: input.text }])
    .map((item, index) => ({ page: Math.max(0, Number(item.page) || (input.fileType === 'pdf' ? index + 1 : 0)), text: compactText(item.text) }))
    .filter((item) => item.text);
  const chunks = buildChunks(pages, input);
  const content = pages.map((item) => item.text).join('\n');
  return normalizeDocument({
    ...input,
    chunks,
    pageCount: input.fileType === 'pdf' ? pages.length : 0,
    characterCount: content.length,
    contentHash: input.contentHash || hashText(content),
    status: chunks.length ? 'ready' : 'error',
    error: chunks.length ? '' : '文件中没有提取到可检索文字。',
    indexedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function upsertDocument(value, document) {
  const state = normalizeKnowledgeState(value);
  const next = normalizeDocument(document);
  const index = state.documents.findIndex((item) => item.id === next.id || (next.sourcePath && item.sourcePath.toLocaleLowerCase() === next.sourcePath.toLocaleLowerCase()));
  if (index >= 0) {
    next.id = state.documents[index].id;
    next.createdAt = state.documents[index].createdAt;
    state.documents[index] = next;
  } else {
    state.documents.unshift(next);
  }
  state.documents = state.documents.slice(0, MAX_DOCUMENTS);
  state.lastIndexedAt = new Date().toISOString();
  return state;
}

function tokenize(value) {
  const text = String(value || '').toLocaleLowerCase('zh-CN');
  const tokens = new Set(text.match(/[a-z0-9_\-]{2,}|[\u3400-\u9fff]{1,8}/g) || []);
  const chinese = text.replace(/[^\u3400-\u9fff]/g, '');
  for (let index = 0; index < chinese.length - 1; index += 1) tokens.add(chinese.slice(index, index + 2));
  return [...tokens].filter((item) => item.length >= 2).slice(0, 120);
}

function scoreText(text, tokens) {
  const haystack = String(text || '').toLocaleLowerCase('zh-CN');
  let score = 0;
  for (const token of tokens) {
    let cursor = 0;
    let hits = 0;
    while ((cursor = haystack.indexOf(token, cursor)) >= 0 && hits < 8) {
      hits += 1;
      cursor += token.length;
    }
    score += hits * (token.length >= 4 ? 5 : token.length === 3 ? 3 : 1.5);
  }
  return score;
}

function excerpt(text, tokens, limit = 420) {
  const value = cleanText(text, 8000);
  let at = -1;
  for (const token of tokens) {
    const found = value.toLocaleLowerCase('zh-CN').indexOf(token);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  if (at < 0 || value.length <= limit) return value.slice(0, limit);
  const start = Math.max(0, at - Math.floor(limit * 0.35));
  return `${start ? '…' : ''}${value.slice(start, start + limit)}${start + limit < value.length ? '…' : ''}`;
}

function searchKnowledge(value, query, options = {}) {
  const state = normalizeKnowledgeState(value);
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const mode = options.mode === 'chat' ? 'chat' : 'local';
  const libraries = new Map(state.libraries.map((item) => [item.id, item]));
  const results = [];
  for (const document of state.documents) {
    const library = libraries.get(document.libraryId);
    if (!library || library.privacy === 'locked' || (mode === 'chat' && library.privacy !== 'chat') || document.status !== 'ready') continue;
    const titleScore = scoreText(document.title, tokens) * 2;
    for (const chunk of document.chunks) {
      const score = titleScore + scoreText(chunk.text, tokens);
      if (score <= 0) continue;
      results.push({
        id: `${document.id}:${chunk.id}`,
        documentId: document.id,
        libraryId: library.id,
        libraryName: library.name,
        privacy: library.privacy,
        title: document.title,
        page: chunk.page,
        excerpt: excerpt(chunk.text, tokens),
        text: chunk.text,
        score,
        citation: `[资料: ${document.title}${chunk.page ? ` p.${chunk.page}` : ''}]`,
        sourcePath: document.sourcePath
      });
    }
  }
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 30));
  return results.sort((left, right) => right.score - left.score).slice(0, limit);
}

function knowledgeContext(value, messages, options = {}) {
  const query = (Array.isArray(messages) ? messages : []).slice(-8).map((item) => item?.content || '').join('\n').slice(-12000);
  const results = searchKnowledge(value, query, { mode: 'chat', limit: options.limit || 8 });
  if (!results.length) return '';
  const maxChars = Math.max(2000, Math.min(40000, Number(options.maxChars) || 18000));
  const lines = ['\n以下资料来自用户明确允许参与聊天的本地知识库：'];
  let used = lines[0].length;
  for (const result of results) {
    const block = `${result.citation}\n${result.text}`;
    if (used + block.length > maxChars) break;
    lines.push(block);
    used += block.length;
  }
  if (lines.length === 1) return '';
  lines.push('回答使用资料时必须在相关句末保留对应的 [资料: 文档名 p.页码] 引用。不要引用“仅本地”或“锁定”库，也不要声称读取了未导入文件。');
  return lines.join('\n\n');
}

function needsRefresh(document, stat) {
  if (!document?.sourcePath || !stat) return false;
  return Number(document.size) !== Number(stat.size) || Math.round(Number(document.mtimeMs)) !== Math.round(Number(stat.mtimeMs));
}

function publicKnowledgeState(value) {
  const state = normalizeKnowledgeState(value);
  return {
    ...state,
    documents: state.documents.map((document) => ({ ...document, chunks: undefined })),
    summary: {
      libraries: state.libraries.length,
      documents: state.documents.length,
      ready: state.documents.filter((item) => item.status === 'ready').length,
      characters: state.documents.reduce((total, item) => total + item.characterCount, 0),
      chatDocuments: state.documents.filter((item) => state.libraries.find((library) => library.id === item.libraryId)?.privacy === 'chat').length
    }
  };
}

module.exports = {
  KNOWLEDGE_STATE_VERSION,
  PRIVACY_MODES,
  buildChunks,
  createDocument,
  defaultKnowledgeState,
  hashText,
  knowledgeContext,
  needsRefresh,
  normalizeDocument,
  normalizeKnowledgeState,
  normalizeLibrary,
  publicKnowledgeState,
  searchKnowledge,
  tokenize,
  upsertDocument
};
