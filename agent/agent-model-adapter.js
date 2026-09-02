'use strict';

class AgentModelAdapterError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AgentModelAdapterError';
    this.code = String(code || 'AGENT_MODEL_FAILURE');
  }
}

class AgentModelAdapter {
  constructor(id = 'unknown') {
    this.id = String(id || 'unknown').slice(0, 80);
  }

  async runRound() {
    throw new AgentModelAdapterError('AGENT_MODEL_UNAVAILABLE', '当前 Agent 模型适配器不可用。');
  }
}

module.exports = { AgentModelAdapter, AgentModelAdapterError };
