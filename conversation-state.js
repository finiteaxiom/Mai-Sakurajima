function normalizeActiveSessionId(sessions, requestedId) {
  const requested = String(requestedId || '');
  return sessions.some((session) => session.id === requested)
    ? requested
    : sessions[0]?.id || '';
}

function createConversationState({ createSession, sessionTitleFromMessages, maxSessions, maxMessages, maxMessageChars = 12000 }) {
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
    if (memoryState.sessions.length >= maxSessions) {
      throw Object.assign(new Error('聊天记录已达到安全上限，请先删除不再需要的历史对话。'), {
        code: 'CHAT_SESSION_LIMIT_REACHED'
      });
    }
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
    if (memoryState.sessions.length >= maxSessions) {
      throw Object.assign(new Error('聊天记录已达到安全上限，请先删除不再需要的历史对话。'), {
        code: 'CHAT_SESSION_LIMIT_REACHED'
      });
    }
    const session = createSession();
    memoryState.sessions.unshift(session);
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

  function assertCanAppendTurn(memoryState, { sessionId, userMessage, assistantMessage }) {
    const session = getSession(memoryState, String(sessionId || memoryState.activeSessionId || ''));
    if (!session) {
      throw Object.assign(new Error('这段聊天已不存在，请重新选择历史对话后再发送。'), {
        code: 'CHAT_SESSION_UNAVAILABLE'
      });
    }
    const previous = session.messages[session.messages.length - 1];
    const appendsUser = Boolean(userMessage?.content)
      && !(previous?.role === 'user' && previous.content === userMessage.content);
    if (session.messages.length + (appendsUser ? 2 : 1) > maxMessages) {
      throw Object.assign(new Error('这段聊天已达到单段安全上限。请新建一段对话后继续，原有历史会完整保留。'), {
        code: 'CHAT_HISTORY_LIMIT_REACHED'
      });
    }
    if ([userMessage, assistantMessage].some((message) => (
      typeof message?.content === 'string' && message.content.length > maxMessageChars
    ))) {
      throw Object.assign(new Error('单条聊天消息过长，请缩短后重试；本轮尚未提交。'), {
        code: 'CHAT_MESSAGE_TOO_LARGE'
      });
    }
    return session;
  }

  function appendConversationTurn(memoryState, { sessionId, userMessage, assistantMessage, updatedAt }) {
    const session = assertCanAppendTurn(memoryState, { sessionId, userMessage, assistantMessage });
    const previous = session.messages[session.messages.length - 1];
    let storedUserMessage = null;
    if (userMessage?.content && !(previous?.role === 'user' && previous.content === userMessage.content)) {
      storedUserMessage = userMessage;
      session.messages.push(storedUserMessage);
    } else if (previous?.role === 'user' && previous.content === userMessage?.content) {
      storedUserMessage = previous;
    }
    session.messages.push(assistantMessage);
    session.title = sessionTitleFromMessages(session.messages);
    session.updatedAt = updatedAt;
    memoryState.sessions = memoryState.sessions
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    return { session, storedUserMessage };
  }

  function appendProactiveMessage(memoryState, { sessionId, message, updatedAt }) {
    const targetId = String(sessionId || memoryState.activeSessionId || '');
    const session = targetId ? getSession(memoryState, targetId) : ensureActiveSession(memoryState);
    if (!session) {
      throw Object.assign(new Error('主动消息对应的聊天已不存在，消息没有写入其他会话。'), {
        code: 'CHAT_SESSION_UNAVAILABLE'
      });
    }
    if (session.messages.length >= maxMessages) {
      throw Object.assign(new Error('这段聊天已达到单段安全上限，主动消息没有写入。'), {
        code: 'CHAT_HISTORY_LIMIT_REACHED'
      });
    }
    if (typeof message?.content === 'string' && message.content.length > maxMessageChars) {
      throw Object.assign(new Error('主动消息过长，没有写入聊天记录。'), {
        code: 'CHAT_MESSAGE_TOO_LARGE'
      });
    }
    session.messages.push(message);
    session.updatedAt = updatedAt;
    return session;
  }

  return {
    activateSession,
    appendConversationTurn,
    appendProactiveMessage,
    assertCanAppendTurn,
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
