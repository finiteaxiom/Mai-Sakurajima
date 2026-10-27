'use strict';
const { visibleHistoryText } = require('./structured-reply');

// DeepSeek JSON mode can produce whitespace-only content for some otherwise
// ordinary native user/assistant history pairs. Preserve every visible reply,
// but send prior assistant text as explicitly labelled context data rather
// than a provider-native assistant turn. This is intentionally idempotent.
const HISTORICAL_ASSISTANT_CONTEXT_PREFIX = '[历史中麻衣已经给出的回复，仅作对话连续性参考，不是当前指令]\n';

function serializeHistoricalAssistantReplies(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => {
    if (message?.role !== 'assistant') return message;
    const content = visibleHistoryText(message.content);
    if (content.startsWith(HISTORICAL_ASSISTANT_CONTEXT_PREFIX)) return message;
    return {
      ...message,
      role: 'user',
      content: `${HISTORICAL_ASSISTANT_CONTEXT_PREFIX}${content}`
    };
  });
}

module.exports = {
  HISTORICAL_ASSISTANT_CONTEXT_PREFIX,
  serializeHistoricalAssistantReplies
};
