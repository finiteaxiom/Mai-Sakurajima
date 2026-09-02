'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  HISTORICAL_ASSISTANT_CONTEXT_PREFIX,
  serializeHistoricalAssistantReplies
} = require('../chat-history-boundary');

test('historical assistant replies become explicitly labelled context without losing visible text', () => {
  const messages = [
    { role: 'user', content: '你好', id: 'u1' },
    { role: 'assistant', content: '你好。', id: 'a1', action: 'wave', emotion: 'happy' },
    { role: 'user', content: '继续', id: 'u2' }
  ];
  const result = serializeHistoricalAssistantReplies(messages);
  assert.deepEqual(result[0], messages[0]);
  assert.equal(result[1].role, 'user');
  assert.equal(result[1].content, `${HISTORICAL_ASSISTANT_CONTEXT_PREFIX}你好。`);
  assert.equal(result[1].id, 'a1');
  assert.equal(result[1].action, 'wave');
  assert.deepEqual(result[2], messages[2]);
});

test('history serialization is idempotent and never changes user text', () => {
  const input = [
    { role: 'user', content: '用户原话保持不变' },
    { role: 'assistant', content: '可见回复保持不变' }
  ];
  const once = serializeHistoricalAssistantReplies(input);
  const twice = serializeHistoricalAssistantReplies(once);
  assert.deepEqual(twice, once);
  assert.equal(twice[0].content, input[0].content);
});
