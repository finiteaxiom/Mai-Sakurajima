const MAX_MOMENTS = 120;
const MAX_MOMENT_COMMENTS = 60;

function makeId(prefix, now = Date.now()) {
  return `${prefix}-${Number(now).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeMomentText(value, maximum = 1200) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
    .slice(0, maximum);
}

function parseMomentReplyPayload(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    const candidate = value.reply ?? value.content ?? value.message ?? value.answer ?? value.text;
    return candidate === undefined ? '' : parseMomentReplyPayload(candidate, depth + 1);
  }

  const original = String(value).trim();
  if (!original) return '';
  const normalized = original
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(normalized);
    if (parsed !== normalized) {
      const extracted = parseMomentReplyPayload(parsed, depth + 1);
      if (extracted) return extracted;
    }
  } catch {
    const firstBrace = normalized.indexOf('{');
    const lastBrace = normalized.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(normalized.slice(firstBrace, lastBrace + 1));
        const extracted = parseMomentReplyPayload(parsed, depth + 1);
        if (extracted) return extracted;
      } catch {
        // A reply can be useful even when the model's trailing JSON was truncated.
      }
    }
  }

  const replyField = normalized.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/s);
  if (replyField) {
    try {
      return JSON.parse(`"${replyField[1]}"`);
    } catch {
      return replyField[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }
  return normalized;
}

function normalizeMomentReplyText(value, maximum = 600) {
  return normalizeMomentText(parseMomentReplyPayload(value), maximum);
}

function validTimestamp(value, fallback) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(fallback).toISOString();
}

function normalizeComment(comment, fallbackTime) {
  if (!comment || !['user', 'assistant'].includes(comment.role)) {
    return null;
  }
  const content = comment.role === 'assistant'
    ? normalizeMomentReplyText(comment.content, 600)
    : normalizeMomentText(comment.content, 600);
  if (!content) {
    return null;
  }
  return {
    id: String(comment.id || makeId('moment-comment', fallbackTime)),
    role: comment.role,
    content,
    createdAt: validTimestamp(comment.createdAt, fallbackTime)
  };
}

function normalizeMoment(moment, fallbackTime = Date.now()) {
  const content = normalizeMomentText(moment?.content, 1200);
  if (!content) {
    return null;
  }
  const createdAt = validTimestamp(moment?.createdAt, fallbackTime);
  const comments = (Array.isArray(moment?.comments) ? moment.comments : [])
    .map((comment, index) => normalizeComment(comment, Date.parse(createdAt) + index + 1))
    .filter(Boolean)
    .slice(-MAX_MOMENT_COMMENTS);
  return {
    id: String(moment?.id || makeId('moment', Date.parse(createdAt))),
    content,
    mood: normalizeMomentText(moment?.mood, 24),
    source: ['ai', 'fallback', 'seed'].includes(moment?.source) ? moment.source : 'fallback',
    createdAt,
    comments
  };
}

function fallbackMomentText(now = new Date(), index = 0) {
  const date = now instanceof Date ? now : new Date(now);
  const hour = date.getHours();
  const groups = hour < 6
    ? [
        '夜已经很安静了。刚刚把灯调暗，忽然有点想知道你现在在做什么。',
        '窗外一点声音都没有，适合把白天没说完的话慢慢想清楚。你还醒着吗？'
      ]
    : hour < 11
      ? [
          '今天的光线很好，出门前多看了一会儿窗外。希望你也有一个不慌不忙的早晨。',
          '刚喝完第一口热饮，今天才算真正开始。你今天最想先完成哪件事？'
        ]
      : hour < 17
        ? [
            '刚结束一段忙碌，终于能安静坐一会儿。偶尔停下来看看身边，其实也不错。',
            '午后的时间总是过得很快。刚才路过一家店，看到一样东西的时候突然想起了你。'
          ]
        : hour < 22
          ? [
              '今天的事情差不多告一段落了。回来的路上风很舒服，要是你也在就好了。',
              '把晚上的时间留给喜欢的事，心情会慢慢变好。今天有没有一件事值得你开心？'
            ]
          : [
              '忙完以后才发现已经这么晚了。现在很想听你讲讲今天发生的事。',
              '夜里适合说一点白天没来得及说的话。我今天确实有几次想到了你。'
            ];
  return groups[Math.abs(Number(index) || 0) % groups.length];
}

function fallbackMomentReply(comment) {
  const text = normalizeMomentText(comment, 600);
  if (/想你|喜欢|爱你|抱抱/.test(text)) {
    return '看到了。其实我发这条的时候，也有一点希望你会这样回复我。';
  }
  if (/累|难受|不开心|烦|压力/.test(text)) {
    return '那就先到我这里歇一会儿吧。发生了什么，愿意再和我说一点吗？';
  }
  if (/哈哈|开心|好耶|太好/.test(text)) {
    return '你这样一说，我的心情也跟着变好了。刚才是什么让你这么开心？';
  }
  if (/[？?]$/.test(text)) {
    return '我认真看到了。让我想一想——比起随便回答，我更想知道你为什么突然问这个。';
  }
  return '嗯，我看到你的回复了。只有你会出现在这里，所以我会认真记住你说的话。';
}

function nextMomentAt(now = Date.now(), random = Math.random) {
  const base = Number(now) || Date.now();
  const hours = 9 + Math.max(0, Math.min(1, Number(random()) || 0)) * 6;
  const next = new Date(base + hours * 60 * 60 * 1000);
  const hour = next.getHours();
  if (hour >= 1 && hour < 8) {
    next.setHours(8, 15 + Math.floor(Math.max(0, Math.min(1, Number(random()) || 0)) * 45), 0, 0);
  }
  return next.getTime();
}

function normalizeMomentsState(stored, storedVersion = 0, now = Date.now()) {
  let moments = (Array.isArray(stored?.moments) ? stored.moments : [])
    .map((moment, index) => normalizeMoment(moment, now - index * 1000))
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, MAX_MOMENTS);

  if (Number(storedVersion || 0) < 6 && moments.length === 0) {
    const createdAt = now - 2 * 60 * 60 * 1000;
    moments = [{
      id: makeId('moment', createdAt),
      content: '这里以后就只放给你看的日常吧。既然是第一条，那就从一句“今天也请多关照”开始。',
      mood: '期待',
      source: 'seed',
      createdAt: new Date(createdAt).toISOString(),
      comments: []
    }];
  }

  const lastPostAt = Math.max(
    0,
    Number(stored?.momentsMeta?.lastPostAt) || Date.parse(moments[0]?.createdAt || '') || 0
  );
  let nextPostAt = Math.max(0, Number(stored?.momentsMeta?.nextPostAt) || 0);
  if (!nextPostAt) {
    nextPostAt = nextMomentAt(Math.max(now, lastPostAt));
  }
  return {
    moments,
    momentsMeta: { lastPostAt, nextPostAt }
  };
}

function publicMoments(memoryState) {
  return {
    moments: (Array.isArray(memoryState?.moments) ? memoryState.moments : []).map((moment) => ({
      ...moment,
      comments: Array.isArray(moment.comments) ? moment.comments.map((comment) => ({ ...comment })) : []
    })),
    meta: {
      lastPostAt: Math.max(0, Number(memoryState?.momentsMeta?.lastPostAt) || 0),
      nextPostAt: Math.max(0, Number(memoryState?.momentsMeta?.nextPostAt) || 0)
    }
  };
}

module.exports = {
  MAX_MOMENTS,
  MAX_MOMENT_COMMENTS,
  fallbackMomentReply,
  fallbackMomentText,
  makeMomentId: makeId,
  nextMomentAt,
  normalizeMomentReplyText,
  normalizeMomentText,
  normalizeMomentsState,
  publicMoments
};
