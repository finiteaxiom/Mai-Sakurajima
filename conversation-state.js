function normalizeActiveSessionId(sessions, requestedId) {
  const requested = String(requestedId || '');
  return sessions.some((session) => session.id === requested)
    ? requested
    : sessions[0]?.id || '';
}

function createConversationState({ createSession, sessionTitleFromMessages, maxSessions, maxMessages }) {
  if (typeof createSession !== 'function' || typeof sessionTitleFromMessages !== 'function') {
    throw new Error('Conversation state requires session creation and title helpers.');
  }

  function getSession(memoryState, sessionId = memoryState.activeSessionId) {
    return memoryState.sessions.find((session) => session.id === sessionId) || null;
  }

  function ensureActiveSession(memoryState, sessionId) {
    const requested = getSession(memoryState, String(sessionId || ''));
    if (requested) {
      memoryState.activeSessionId = requested.id;
      return requested;
    }
    const active = getSession(memoryState);
    if (active) return active;
    const session = createSession();
    memoryState.sessions.unshift(session);
    memoryState.activeSessionId = session.id;
    return session;
  }

  function activateSession(memoryState, sessionId) {
    const session = getSession(memoryState, String(sessionId || ''));
    if (!session) return null;
    memoryState.activeSessionId = session.id;
    return session;
  }

  function createNewSession(memoryState) {
    const current = getSession(memoryState);
    if (current && current.messages.length === 0) {
      return { session: current, created: false };
    }
    const session = createSession();
    memoryState.sessions.unshift(session);
    memoryState.sessions = memoryState.sessions.slice(0, maxSessions);
    memoryState.activeSessionId = session.id;
    return { session, created: true };
  }

  function renameSession(memoryState, sessionId, title, updatedAt) {
    const session = getSession(memoryState, String(sessionId || ''));
    if (!session) return null;
    session.title = title;
    session.updatedAt = updatedAt;
    return session;
  }

  function deleteSession(memoryState, sessionId) {
    const normalizedId = String(sessionId || '');
    memoryState.sessions = memoryState.sessions.filter((session) => session.id !== normalizedId);
    if (!memoryState.sessions.length) {
      memoryState.sessions = [createSession()];
    }
    memoryState.activeSessionId = normalizeActiveSessionId(memoryState.sessions, memoryState.activeSessionId);
    return getSession(memoryState);
  }

  function clearSessions(memoryState) {
    const session = createSession();
    memoryState.sessions = [session];
    memoryState.activeSessionId = session.id;
    return session;
  }

  function appendConversationTurn(memoryState, { sessionId, userMessage, assistantMessage, updatedAt }) {
    const session = ensureActiveSession(memoryState, sessionId);
    const previous = session.messages[session.messages.length - 1];
    let storedUserMessage = null;
    if (userMessage?.content && !(previous?.role === 'user' && previous.content === userMessage.content)) {
      storedUserMessage = userMessage;
      session.messages.push(storedUserMessage);
    } else if (previous?.role === 'user' && previous.content === userMessage?.content) {
      storedUserMessage = previous;
    }
    session.messages.push(assistantMessage);
    session.messages = session.messages.slice(-maxMessages);
    session.title = sessionTitleFromMessages(session.messages);
    session.updatedAt = updatedAt;
    memoryState.activeSessionId = session.id;
    memoryState.sessions = memoryState.sessions
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .slice(0, maxSessions);
    return { session, storedUserMessage };
  }

  function appendProactiveMessage(memoryState, { sessionId, message, updatedAt }) {
    const session = getSession(memoryState, sessionId) || ensureActiveSession(memoryState);
    session.messages.push(message);
    session.messages = session.messages.slice(-maxMessages);
    session.updatedAt = updatedAt;
    return session;
  }

  return {
    activateSession,
    appendConversationTurn,
    appendProactiveMessage,
    clearSessions,
    createNewSession,
    deleteSession,
    ensureActiveSession,
    getSession,
    renameSession
  };
}

module.exports = {
  createConversationState,
  normalizeActiveSessionId
};
