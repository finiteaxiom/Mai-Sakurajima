const test = require('node:test');
const assert = require('node:assert/strict');
const { read, visibleHistoryText } = require('../structured-reply');
const { serializeHistoricalAssistantReplies } = require('../chat-history-boundary');

test('truncated metadata recovers only a completed top-level reply and discards payload', () => {
  const raw = '{"reply":"我在。你现在还好吗？","action":"idle","memories":["private"],"mind":{"pendingQuestion';
  const result = read(raw);
  assert.equal(result.content, '我在。你现在还好吗？');
  assert.equal(result.payload, null);
  assert.equal(result.recovered, true);
  assert.equal(result.parseSuccess, false);
  assert.equal(visibleHistoryText(raw), result.content);
  const input = [{role:'assistant',content:raw},{role:'user',content:raw}];
  const history = serializeHistoricalAssistantReplies(input);
  assert.ok(history[0].content.endsWith(result.content));
  assert.ok(!history[0].content.includes('private'));
  assert.equal(history[1].content,raw);
  assert.equal(input[0].content,raw);
});

test('recovery handles JSON fences, escaped quotes and unicode without exposing metadata', () => {
  const raw = '```json\n{"reply":"她说：\\"你好\\"\\n\\u4f60好","topics":[';
  assert.equal(read(raw).content, '她说："你好"\n你好');
});

test('incomplete strings, invalid escapes, non-string fields and nested reply do not recover', () => {
  for (const raw of ['{"reply":"未结束', '{"reply":"bad\\q","mind":', '{"reply":{"private":"x"}}', '{"mind":{"reply":"private"},', '{"reply":"ok"garbage']) {
    assert.equal(read(raw).content, '',raw);
    assert.equal(visibleHistoryText(raw).includes('private'),false);
  }
});

test('valid payload state remains available; ordinary text and JSON examples remain visible', () => {
  const raw = '{"reply":"你好","memories":["candidate"]}';
  assert.deepEqual(read(raw).payload.memories,['candidate']);
  for (const text of ['你好。', '示例：{"reply":"文字"}', '{"count":3}']) assert.equal(visibleHistoryText(text),text);
});
