'use strict';

const { CHAT_MODE, runChatRuntime } = require('./chat-runtime');

const REQUIRED_DEPENDENCIES = [
  'sanitizeMessages',
  'directReply',
  'requestReply',
  'noteUserReply',
  'appendConversationHistory',
  'mergeCommitments',
  'extractExplicitMemories',
  'mergeCandidateMemories',
  'broadcastLifeHubState',
  'publicSessions'
];

class ChatService {
  constructor(dependencies = {}) {
    for (const name of REQUIRED_DEPENDENCIES) {
      if (typeof dependencies[name] !== 'function') {
        throw new TypeError(`Chat service requires a ${name} function.`);
      }
    }
    this.dependencies = dependencies;
  }

  async send(options = {}) {
    const dependencies = this.dependencies;
    const messages = dependencies.sanitizeMessages(options.messages);
    const latestUserText = [...messages]
      .reverse()
      .find((message) => message.role === 'user')?.content || '';

    // Preserve the existing companion lifecycle: returning users stop pending
    // follow-ups before Mai starts producing the next Chat reply.
    dependencies.noteUserReply();

    const voiceMode = options.voiceMode === true;
    const reply = await runChatRuntime({
      messages,
      directReply: dependencies.directReply,
      requestReply: dependencies.requestReply,
      requestOptions: {
        maxTokens: Number.isFinite(options.maxTokens)
          ? options.maxTokens
          : voiceMode ? 360 : 700,
        structured: true,
        sessionId: options.sessionId,
        onDelta: typeof options.onDelta === 'function' ? options.onDelta : null,
        responseInstruction: String(options.responseInstruction || '').slice(0, 1200),
        diagnostic: options.diagnostic,
        workspaceContext: options.workspaceContext || null
      }
    });

    const session = dependencies.appendConversationHistory(messages, reply, options.sessionId);
    const storedMessages = Array.isArray(session?.messages) ? session.messages : [];
    const storedUserMessage = [...storedMessages]
      .reverse()
      .find((message) => message.role === 'user');
    const memorySource = {
      sourceText: latestUserText,
      sourceSessionId: session.id,
      sourceMessageId: storedUserMessage?.id || '',
      sourceCreatedAt: storedUserMessage?.createdAt || new Date().toISOString()
    };

    // Workspace data is explicitly ephemeral and untrusted. The original user
    // message and final reply may remain in this conversation, but neither the
    // file content nor model-derived file facts can enter long-term memory.
    if (!options.workspaceContext) {
      dependencies.mergeCommitments(reply.commitments, memorySource);
      dependencies.mergeCandidateMemories([
        ...dependencies.extractExplicitMemories(latestUserText),
        ...(Array.isArray(reply.memories) ? reply.memories : [])
      ], memorySource);
    }
    dependencies.broadcastLifeHubState();

    const deliveredReply = {
      ...reply,
      createdAt: storedMessages.at(-1)?.createdAt || new Date().toISOString(),
      voiceMode,
      voiceProfile: options.voiceProfile || null,
      runtimeMode: CHAT_MODE
    };
    if (typeof dependencies.deliverReply === 'function') {
      dependencies.deliverReply(deliveredReply);
    }

    return {
      ...deliveredReply,
      sessionId: session.id,
      sessions: dependencies.publicSessions(),
      lastRun: null,
      taskState: null
    };
  }
}

module.exports = {
  ChatService
};
