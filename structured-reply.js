(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MaiStructuredReply = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const keys = ['reply', 'content', 'message', 'answer', 'text'];
  const unavailable = '这条回复格式不完整，暂时无法显示，请重试。';
  function read(rawContent) {
    const raw = String(rawContent ?? '');
    const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let payload;
    try { payload = JSON.parse(normalized); } catch { /* Recover only a complete first visible string below. */ }
    if (payload !== undefined) {
      const object = payload && typeof payload === 'object' && !Array.isArray(payload);
      const key = object && keys.find(key => Object.prototype.hasOwnProperty.call(payload, key));
      const content = key && typeof payload[key] === 'string' ? payload[key].trim() : '';
      return { payload, content, parseSuccess: true, envelope: Boolean(key), recovered: false };
    }
    // Anchored to the first top-level field: never extract nested memory/topic text.
    const prefix = /^\{\s*"(?:reply|content|message|answer|text)"\s*:\s*/.exec(normalized);
    if (prefix) {
      const value = normalized.slice(prefix[0].length);
      const match = /^"(?:\\[\s\S]|[^"\\])*"/.exec(value);
      if (match && /^\s*(?:[,}]|$)/.test(value.slice(match[0].length))) {
        try {
          const content = JSON.parse(match[0]).trim();
          if (content) return { payload: null, content, parseSuccess: false, envelope: true, recovered: true };
        } catch { /* Invalid escapes/control characters are not safe text. */ }
      }
    }
    const structuredLike = /^[{\[]/.test(normalized) || /^```json\b/i.test(raw.trim());
    return { payload: null, content: structuredLike ? '' : raw.trim(), parseSuccess: false, envelope: structuredLike, recovered: false };
  }
  function visibleHistoryText(content) {
    const result = read(content);
    return result.envelope ? (result.content || unavailable) : String(content ?? '');
  }
  return { read, visibleHistoryText };
});
