'use strict';

function cancellationError(reason = 'cancelled') {
  const descriptions = {
    cancelled: '本轮聊天已取消。',
    session_deleted: '聊天记录已删除，本轮回复已取消。',
    history_cleared: '聊天历史已清空，本轮回复已取消。',
    session_switched: '你已切换聊天，本轮回复已取消。',
    window_closed: '聊天窗口已关闭，本轮回复已取消。',
    app_quit: '应用正在退出，本轮回复已取消。',
    restore_started: '数据正在恢复，本轮回复已取消。',
    restore_rollback_failed: '数据恢复失败，待处理的聊天请求已取消。',
    user_turn_started: '用户开始了新一轮聊天，主动消息已让位。'
  };
  return Object.assign(new Error(descriptions[reason] || descriptions.cancelled), {
    code: 'CHAT_REQUEST_CANCELLED',
    reason
  });
}

function requestError(code, message) {
  return Object.assign(new Error(message), { code });
}

function createChatRequestLifecycle(options = {}) {
  const createId = typeof options.createId === 'function'
    ? options.createId
    : (() => `chat-request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const byRequest = new Map();
  const bySession = new Map();
  const bySender = new Map();

  function remove(entry) {
    if (byRequest.get(entry.requestId) === entry) byRequest.delete(entry.requestId);
    if (bySession.get(entry.sessionId) === entry) bySession.delete(entry.sessionId);
    const senderEntries = bySender.get(entry.senderId);
    senderEntries?.delete(entry);
    if (senderEntries?.size === 0) bySender.delete(entry.senderId);
  }

  function isCurrent(entry) {
    return entry.status === 'active'
      && byRequest.get(entry.requestId) === entry
      && !entry.controller.signal.aborted;
  }

  function assertCurrent(entry) {
    if (isCurrent(entry)) return true;
    const reason = entry.controller.signal.reason;
    if (reason instanceof Error) throw reason;
    throw cancellationError(entry.cancelReason || 'cancelled');
  }

  function cancel(entry, reason) {
    if (!entry || entry.status !== 'active') return false;
    entry.status = 'cancelled';
    entry.cancelReason = reason;
    entry.controller.abort(cancellationError(reason));
    remove(entry);
    return true;
  }

  function begin(input = {}) {
    const sessionId = String(input.sessionId || '').trim();
    if (!sessionId) throw requestError('CHAT_SESSION_UNAVAILABLE', '找不到当前聊天，请重新打开历史对话。');
    const kind = input.kind === 'proactive' ? 'proactive' : 'chat';
    const existing = bySession.get(sessionId);
    if (existing && kind !== 'proactive' && existing.kind === 'proactive') {
      cancel(existing, 'user_turn_started');
    } else if (existing) {
      throw requestError('CHAT_REQUEST_IN_PROGRESS', '这段对话正在等待回复，请先停止当前请求后再发送。');
    }
    const senderId = input.senderId === null || input.senderId === undefined
      ? 'unknown-sender'
      : String(input.senderId);
    const entry = {
      requestId: String(createId()),
      sessionId,
      senderId,
      kind,
      controller: new AbortController(),
      status: 'active',
      cancelReason: ''
    };
    entry.signal = entry.controller.signal;
    entry.isCurrent = () => isCurrent(entry);
    entry.assertCurrent = () => assertCurrent(entry);
    entry.finish = () => {
      if (entry.status === 'active') {
        entry.status = 'finished';
        remove(entry);
      }
    };
    entry.cancel = (reason = 'cancelled') => cancel(entry, reason);
    byRequest.set(entry.requestId, entry);
    bySession.set(sessionId, entry);
    if (!bySender.has(senderId)) bySender.set(senderId, new Set());
    bySender.get(senderId).add(entry);
    return entry;
  }

  function cancelSession(sessionId, reason = 'session_deleted') {
    return cancel(bySession.get(String(sessionId || '')), reason);
  }

  function cancelSessionForSender(sessionId, senderId, reason = 'cancelled') {
    const entry = bySession.get(String(sessionId || ''));
    if (!entry || entry.senderId !== String(senderId)) return false;
    return cancel(entry, reason);
  }

  function cancelSender(senderId, reason = 'cancelled') {
    const entries = [...(bySender.get(String(senderId)) || [])];
    for (const entry of entries) cancel(entry, reason);
    return entries.length;
  }

  function cancelAll(reason = 'cancelled') {
    const entries = [...byRequest.values()];
    for (const entry of entries) cancel(entry, reason);
    return entries.length;
  }

  return {
    begin,
    cancelAll,
    cancelSender,
    cancelSession,
    cancelSessionForSender,
    hasSession: (sessionId) => bySession.has(String(sessionId || '')),
    activeCount: () => byRequest.size
  };
}

module.exports = { cancellationError, createChatRequestLifecycle };
