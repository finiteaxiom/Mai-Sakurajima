'use strict';

const { CHAT_MODE, runChatRuntime } = require('./chat-runtime');

const REQUIRED_DEPENDENCIES = [
  'sanitizeMessages',
  'directReply',
  'requestReply',
  'noteUserReply',
  'appendConversationHistory',
  'applyReplyState',
  'mergeCommitments',
  'extractExplicitMemories',
  'mergeCandidateMemories',
  'captureTurnState',
  'restoreTurnState',
  'saveTurnState',
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
    const assertRequestCurrent = typeof options.assertRequestCurrent === 'function'
      ? options.assertRequestCurrent
      : () => {};
    const messages = dependencies.sanitizeMessages(options.messages);
    const latestUserText = [...messages]
      .reverse()
      .find((message) => message.role === 'user')?.content || '';

    assertRequestCurrent();

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
        requestId: options.requestId,
        signal: options.signal,
        assertRequestCurrent: options.assertRequestCurrent,
        onDelta: typeof options.onDelta === 'function' ? options.onDelta : null,
        responseInstruction: String(options.responseInstruction || '').slice(0, 1200),
        diagnostic: options.diagnostic,
        workspaceContext: options.workspaceContext || null
      }
    });

    assertRequestCurrent();
    const turnSnapshot = dependencies.captureTurnState();
    let session;
    let storedMessages = [];
    let memorySource;
    let commitmentsChanged = false;
    try {
      // All persistent Chat turn mutations are made synchronously as one Main
      // owned commit after the provider has returned and the request is current.
      dependencies.noteUserReply({ save: false });
      session = dependencies.appendConversationHistory(messages, reply, options.sessionId, {
        workspaceContext: Boolean(options.workspaceContext)
      });
      storedMessages = Array.isArray(session?.messages) ? session.messages : [];
      const storedUserMessage = [...storedMessages]
        .reverse()
        .find((message) => message.role === 'user');
      memorySource = {
        sourceText: latestUserText,
        sourceSessionId: session.id,
        sourceMessageId: storedUserMessage?.id || '',
        sourceCreatedAt: storedUserMessage?.createdAt || new Date().toISOString()
      };
      dependencies.applyReplyState({
        messages,
        reply,
        session,
        source: memorySource,
        workspaceContext: options.workspaceContext || null,
        persist: false,
        notify: false
      });

      // Workspace data is ephemeral and untrusted. It may be displayed in this
      // turn's ordinary messages, but no model-derived candidate is consumed.
      if (!options.workspaceContext) {
        const commitmentResult = dependencies.mergeCommitments(reply.commitments, {
          ...memorySource,
          save: false,
          notify: false
        });
        commitmentsChanged = commitmentResult?.changed === true;
        dependencies.mergeCandidateMemories([
          ...dependencies.extractExplicitMemories(latestUserText),
          ...(Array.isArray(reply.memories) ? reply.memories : [])
        ], { ...memorySource, save: false });
      }
      assertRequestCurrent();
      dependencies.saveTurnState();
    } catch (error) {
      dependencies.restoreTurnState(turnSnapshot);
      throw error;
    }

    try {
      dependencies.afterTurnCommitted?.({
        session,
        memorySource,
        commitmentsChanged,
        workspaceContext: Boolean(options.workspaceContext)
      });
      dependencies.broadcastLifeHubState();
    } catch (error) {
      dependencies.onPostCommitNotificationError?.(error);
    }

    const deliveredReply = {
      ...reply,
      createdAt: storedMessages.at(-1)?.createdAt || new Date().toISOString(),
      voiceMode,
      voiceProfile: options.voiceProfile || null,
      runtimeMode: CHAT_MODE
    };
    if (typeof dependencies.deliverReply === 'function') {
      try { dependencies.deliverReply(deliveredReply); }
      catch (error) { dependencies.onPostCommitNotificationError?.(error); }
    }

    return {
      ...deliveredReply,
      sessionId: session.id,
      requestId: options.requestId || '',
      sessions: dependencies.publicSessions(),
      lastRun: null,
      taskState: null
    };
  }
}

module.exports = {
  ChatService
};
