'use strict';

const ACTION_SESSION_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

class ActionRuntimeError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ActionRuntimeError';
    this.code = code;
  }
}

class ActionRuntime {
  constructor(id, metadata = {}) {
    this.id = String(id || '').trim();
    if (!this.id) throw new TypeError('Action runtime requires an id.');
    this.metadata = {
      label: String(metadata.label || this.id),
      available: metadata.available !== false,
      streaming: metadata.streaming === true,
      capabilities: Array.isArray(metadata.capabilities) ? metadata.capabilities.map(String) : []
    };
  }

  async execute() {
    throw new ActionRuntimeError('action_runtime_unavailable', '当前行动能力暂不可用。');
  }

  async cancel() {
    return false;
  }
}

module.exports = {
  ACTION_SESSION_STATUS,
  ActionRuntime,
  ActionRuntimeError
};
