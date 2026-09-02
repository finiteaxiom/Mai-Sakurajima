const test = require('node:test');
const assert = require('node:assert/strict');
const {
  describeVoiceProfile,
  extractSpeakableSegments,
  planSpeechStyle
} = require('../voice-emotion');
const {
  createSseParser,
  extractStreamingReply
} = require('../deepseek-stream');

test('voice profile combines acoustic and text emotion clues', () => {
  const profile = describeVoiceProfile('今天真的好难过', { vocalTone: 'soft' }, 'SAD');
  assert.equal(profile.emotion, 'concerned');
  assert.match(profile.description, /关心/);
});

test('speech style gives emotional CosyVoice instructions and safe speed', () => {
  const style = planSpeechStyle('别怕，我会陪着你。', { emotion: 'concerned', baseRate: 1.4 });
  assert.equal(style.emotion, 'concerned');
  assert.match(style.instruction, /温柔/);
  assert.ok(style.rate <= 1.3);
});

test('streamed text is split on natural Chinese sentence boundaries', () => {
  const first = extractSpeakableSegments('我在这里。你可以慢慢说，我会听着', false);
  assert.deepEqual(first.segments, ['我在这里。']);
  assert.equal(first.remainder, '你可以慢慢说，我会听着');
  const final = extractSpeakableSegments(first.remainder, true);
  assert.deepEqual(final.segments, ['你可以慢慢说，我会听着']);
});

test('partial structured DeepSeek JSON exposes reply text before completion', () => {
  const parsed = extractStreamingReply('{"reply":"别担心，\\n我在这里。","action":"wave"}', true);
  assert.equal(parsed.text, '别担心，\n我在这里。');
  assert.equal(parsed.complete, true);
});

test('SSE parser tolerates chunks split across event boundaries', () => {
  const events = [];
  const parser = createSseParser((data) => events.push(data));
  parser.push('data: {"a":');
  parser.push('1}\n\ndata: [DONE]\n\n');
  assert.deepEqual(events, ['{"a":1}', '[DONE]']);
});
