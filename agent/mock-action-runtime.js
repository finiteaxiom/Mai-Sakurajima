'use strict';

const { ActionRuntime, ActionRuntimeError } = require('./action-runtime');

class MockActionRuntime extends ActionRuntime {
  constructor(options = {}) {
    super('mock', {
      label: '行动模式',
      available: true,
      streaming: false,
      capabilities: []
    });
    this.delayMs = Math.max(0, Math.min(Number(options.delayMs) || 180, 3000));
  }

  async execute(request = {}, options = {}) {
    const text = String(request.text || '').trim();
    if (!text) throw new ActionRuntimeError('invalid_action_request', '请先告诉我需要处理什么。');
    await this.wait(options.signal);
    if (text.includes('[mock-fail]')) {
      throw new ActionRuntimeError('mock_execution_failed', '这次模拟行动没有完成。');
    }
    return {
      success: true,
      summary: `我已经把“${text.slice(0, 160)}”整理成一个可执行的起点。`,
      steps: [
        { title: '确认目标', status: 'completed' },
        { title: '整理下一步', status: 'completed' }
      ],
      artifacts: [],
      capabilitiesUsed: []
    };
  }

  wait(signal) {
    if (signal?.aborted) return Promise.reject(signal.reason || new ActionRuntimeError('action_cancelled', '行动已取消。'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, this.delayMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason || new ActionRuntimeError('action_cancelled', '行动已取消。'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

module.exports = { MockActionRuntime };
