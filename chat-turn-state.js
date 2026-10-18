'use strict';

const {
  applyMindTurn,
  beginRelationshipWaiting
} = require('./companion-state');
const {
  extractBehaviorPatternCandidates,
  mergeBehaviorPatternObservations
} = require('./intelligence');
const {
  extractEpisodeCandidates,
  mergeEpisodes,
  updateTopicThreads
} = require('./shared-life');
const {
  extractPersonCandidates,
  mergePeople
} = require('./life-hub');
const {
  mergeHabitCandidates,
  mergeProjectCandidates
} = require('./continuity-engine');
const { advanceWorldState } = require('./world-engine');

function createChatTurnStateWriter(options = {}) {
  for (const name of ['getMemoryState', 'setMemoryState', 'conversationState', 'createId', 'saveMemory']) {
    if (typeof options[name] !== 'function' && name !== 'conversationState') {
      throw new TypeError(`Chat turn state writer requires ${name}.`);
    }
  }
  if (!options.conversationState || typeof options.conversationState.appendConversationTurn !== 'function') {
    throw new TypeError('Chat turn state writer requires a conversationState owner.');
  }

  function appendConversationHistory(messages, reply, sessionId, turnOptions = {}) {
    const lastUserMessage = (Array.isArray(messages) ? messages : [])
      .slice().reverse().find((message) => message?.role === 'user');
    const nowText = new Date(options.now?.() ?? Date.now()).toISOString();
    const content = String(lastUserMessage?.content || '').trim().slice(0, 12000);
    const contextSource = turnOptions.workspaceContext === true ? 'workspace' : undefined;
    const userMessage = content ? {
      id: String(lastUserMessage.id || options.createId('message')).slice(0, 120),
      role: 'user',
      content,
      contextSource,
      createdAt: nowText
    } : null;
    const state = options.getMemoryState();
    const { session } = options.conversationState.appendConversationTurn(state, {
      sessionId,
      userMessage,
      assistantMessage: {
        id: options.createId('message'),
        role: 'assistant',
        content: String(reply?.content || '').trim().slice(0, 12000),
        action: reply?.action,
        emotion: reply?.emotion,
        contextSource,
        createdAt: nowText
      },
      updatedAt: nowText
    });
    if (contextSource) {
      const storedUserMessage = [...session.messages].reverse().find((message) => (
        message?.role === 'user' && message.content === content
      ));
      if (storedUserMessage) storedUserMessage.contextSource = contextSource;
    }
    return session;
  }

  function applySharedLifeTurn(state, userText, reply, sessionId, sourceCreatedAt, sourceMessageId) {
    const source = String(userText || '').trim().slice(0, 12000);
    const merged = mergeEpisodes(state.episodes, [
      ...extractEpisodeCandidates(source),
      ...(Array.isArray(reply?.episodes) ? reply.episodes : [])
    ], {
      sourceText: source,
      sourceSessionId: sessionId,
      sourceMessageId,
      sourceCreatedAt,
      max: options.maxEpisodes
    });
    state.episodes = merged.episodes;
    const topicResult = updateTopicThreads(state.topicThreads, {
      userText: source,
      reply,
      candidates: Array.isArray(reply?.topics) ? reply.topics : [],
      sourceSessionId: sessionId,
      now: new Date(sourceCreatedAt).getTime() || Date.now(),
      max: options.maxTopicThreads
    });
    state.topicThreads = topicResult.topics;
    const peopleResult = mergePeople(state.people, [
      ...extractPersonCandidates(source),
      ...(Array.isArray(reply?.people) ? reply.people : [])
    ], {
      sourceText: source,
      sessionId,
      messageId: sourceMessageId,
      createdAt: sourceCreatedAt,
      max: options.maxPeople
    });
    state.people = peopleResult.people;
    const projectResult = mergeProjectCandidates(state.projects, reply?.projects, {
      sourceText: source,
      sessionId,
      messageId: sourceMessageId,
      createdAt: sourceCreatedAt,
      max: options.maxProjects
    });
    state.projects = projectResult.projects;
    const habitResult = mergeHabitCandidates(state.habits, reply?.habits, {
      sourceText: source,
      sessionId,
      messageId: sourceMessageId,
      createdAt: sourceCreatedAt,
      max: options.maxHabits
    });
    state.habits = habitResult.habits;
    state.world = advanceWorldState(state.world, Date.now());
    return {
      episodes: merged.stats,
      topics: topicResult.stats,
      people: peopleResult.stats,
      projects: projectResult.stats,
      habits: habitResult.stats
    };
  }

  function applyReplyState(input = {}) {
    const state = options.getMemoryState();
    const session = input.session;
    const storedUserMessage = (Array.isArray(session?.messages) ? session.messages : [])
      .slice().reverse().find((message) => message?.role === 'user');
    const now = Number(options.now?.() ?? Date.now());
    beginRelationshipWaiting(state, {
      waitingSince: now,
      waitingSessionId: String(session?.id || ''),
      lastUserMessageAt: now,
      lastCompanionMessageAt: now,
      followUpCount: 0
    }, options.maxContactCount);

    // Workspace context is temporary and untrusted. Preserve session and
    // relationship lifecycle bookkeeping, but do not consume any model fields.
    if (!input.workspaceContext) {
      const reply = input.reply || {};
      applyMindTurn(state, {
        userMessage: String(storedUserMessage?.content || ''),
        reply,
        topic: reply?.mind?.topic,
        now
      });
      if (storedUserMessage?.content) {
        state.behaviorPatterns = mergeBehaviorPatternObservations(
          state.behaviorPatterns,
          extractBehaviorPatternCandidates(storedUserMessage.content),
          {
            sourceText: storedUserMessage.content,
            sourceSessionId: session.id,
            sourceMessageId: storedUserMessage.id,
            observedAt: storedUserMessage.createdAt || new Date(now).toISOString()
          }
        );
      }
      applySharedLifeTurn(
        state,
        storedUserMessage?.content || '',
        {
          ...reply,
          mind: {
            ...(reply?.mind || {}),
            topic: reply?.mind?.topic || state.mind.activeTopic,
            pendingQuestion: reply?.mind?.pendingQuestion || state.mind.pendingQuestion
          }
        },
        session.id,
        storedUserMessage?.createdAt || new Date(now).toISOString(),
        storedUserMessage?.id || ''
      );
    }

    options.setMemoryState(state);
    options.saveMemory();
    options.broadcastSharedLifeState?.();
    options.scheduleGirlfriendFollowUp?.();
    return session;
  }

  return { appendConversationHistory, applyReplyState, applySharedLifeTurn: (userText, reply, sessionId, sourceCreatedAt, sourceMessageId) => (
    applySharedLifeTurn(options.getMemoryState(), userText, reply, sessionId, sourceCreatedAt, sourceMessageId)
  ) };
}

module.exports = { createChatTurnStateWriter };
