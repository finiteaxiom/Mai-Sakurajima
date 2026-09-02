'use strict';

class AgentEventStream {
  constructor({ sessionId, taskId, now, onEvent } = {}) {
    this.sessionId = String(sessionId || '');
    this.taskId = String(taskId || '');
    this.now = now || (() => Date.now());
    this.onEvent = typeof onEvent === 'function' ? onEvent : null;
    this.sequence = 0;
    this.events = [];
  }

  emit(type, payload = {}) {
    const sequence = ++this.sequence;
    const event = Object.freeze({
      eventId: `${this.taskId}:${sequence}`,
      sequence,
      timestamp: new Date(this.now()).toISOString(),
      sessionId: this.sessionId,
      taskId: this.taskId,
      type: String(type),
      payload: Object.freeze({ ...payload })
    });
    this.events.push(event);
    try { this.onEvent?.(event); } catch { /* event listeners cannot alter execution */ }
    return event;
  }
}

module.exports = { AgentEventStream };
