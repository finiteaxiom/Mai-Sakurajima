'use strict';

class LocalModelProvider {
  constructor(options = {}) {
    this.id = 'local';
    this.reason = String(options.reason || '本地模型入口已经预留，但当前版本尚未安装或连接本地推理后端。');
  }

  metadata() {
    return {
      label: '本地模型（未来支持）',
      available: false,
      local: true,
      streaming: true,
      cancellation: true,
      models: [],
      reason: this.reason
    };
  }

  async complete() {
    const error = new Error(this.reason);
    error.name = 'ModelProviderError';
    error.code = 'provider_unavailable';
    throw error;
  }
}

module.exports = { LocalModelProvider };
