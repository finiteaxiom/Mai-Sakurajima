'use strict';

const { AgentModelAdapter, AgentModelAdapterError } = require('./agent-model-adapter');

function waitForAbort(signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || new Error('Agent request cancelled.'));
  return new Promise((resolve, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason || new Error('Agent request cancelled.')), { once: true });
  });
}

class FakeAgentModelAdapter extends AgentModelAdapter {
  constructor(options = {}) {
    super('fake');
    this.mode = String(options.mode || 'normal');
    this.echoText = String(options.echoText || 'hello');
  }

  async runRound(context = {}, options = {}) {
    if (options.signal?.aborted) throw options.signal.reason || new Error('Agent request cancelled.');
    if (this.mode === 'model_error') throw new AgentModelAdapterError('AGENT_MODEL_FAILURE', 'Fake Agent 模型请求失败。');
    if (this.mode === 'never_finish' || this.mode === 'cancel_wait') await waitForAbort(options.signal);
    if (this.mode === 'no_tool') return this.final();
    if (this.mode === 'always_tool') {
      return this.call(`call-${Number(context.round || 1)}`, this.echoText);
    }
    const hasEchoObservation = Array.isArray(context.observations)
      && context.observations.some((item) => item?.toolName === 'echo');
    return hasEchoObservation ? this.final() : this.call('call-1', this.echoText);
  }

  call(callId, text) {
    return {
      assistantItem: { role: 'assistant', content: '' },
      toolCalls: [{ callId, name: 'echo', arguments: { text } }],
      finishReason: 'tool_calls',
      continuation: null,
      usage: { inputTokens: 0, outputTokens: 0 }
    };
  }

  final() {
    return {
      assistantItem: { role: 'assistant', content: 'done' },
      toolCalls: [],
      finishReason: 'final',
      continuation: null,
      usage: { inputTokens: 0, outputTokens: 0 }
    };
  }
}

module.exports = { FakeAgentModelAdapter, waitForAbort };
