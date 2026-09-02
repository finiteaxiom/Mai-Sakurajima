'use strict';

const CHAT_MODE = 'chat';

async function runChatRuntime(options = {}) {
  const messages = Array.isArray(options.messages) ? options.messages : [];
  const directReply = typeof options.directReply === 'function' ? options.directReply : null;
  const requestReply = options.requestReply;
  if (typeof requestReply !== 'function') {
    throw new TypeError('Chat runtime requires a requestReply function.');
  }

  const localReply = directReply ? await directReply(messages, options) : null;
  if (localReply) {
    return { ...localReply, runtimeMode: CHAT_MODE };
  }
  const reply = await requestReply(messages, options.requestOptions || {});
  return { ...reply, runtimeMode: CHAT_MODE };
}

module.exports = {
  CHAT_MODE,
  runChatRuntime
};
