const test = require('node:test');
const assert = require('node:assert/strict');

const { CHAT_MODE, runChatRuntime } = require('../chat-runtime');

test('Chat runtime returns local replies without contacting the model', async () => {
  let modelCalls = 0;
  const result = await runChatRuntime({
    messages: [{ role: 'user', content: '现在几点？' }],
    directReply: async () => ({ reply: '现在是十点。' }),
    requestReply: async () => {
      modelCalls += 1;
      return { reply: '不应调用' };
    }
  });

  assert.equal(modelCalls, 0);
  assert.equal(result.reply, '现在是十点。');
  assert.equal(result.runtimeMode, CHAT_MODE);
});

test('Chat runtime delegates ordinary conversation without tool configuration', async () => {
  const messages = [{ role: 'user', content: '陪我聊一会儿。' }];
  let observedMessages;
  let observedOptions;
  const result = await runChatRuntime({
    messages,
    directReply: async () => null,
    requestReply: async (inputMessages, requestOptions) => {
      observedMessages = inputMessages;
      observedOptions = requestOptions;
      return { reply: '好，我在。' };
    },
    requestOptions: { maxTokens: 700 }
  });

  assert.deepEqual(observedMessages, messages);
  assert.deepEqual(observedOptions, { maxTokens: 700 });
  assert.equal(result.reply, '好，我在。');
  assert.equal(result.runtimeMode, CHAT_MODE);
});
