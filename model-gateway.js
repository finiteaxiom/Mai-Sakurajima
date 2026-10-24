'use strict';

const { runtimeDiagnostics } = require('./runtime-diagnostics');

class ModelGateway {
  constructor(options = {}) {
    if (!options.registry || typeof options.registry.require !== 'function') {
      throw new TypeError('ModelGateway requires a provider registry.');
    }
    this.registry = options.registry;
    this.getProviderId = typeof options.getProviderId === 'function'
      ? options.getProviderId
      : () => 'deepseek';
  }

  provider(options = {}) {
    return this.registry.require(options.provider || this.getProviderId());
  }

  generate(options = {}) {
    const { tools: _tools, tool_choice: _toolChoice, toolChoice: _toolChoiceAlias, ...request } = options;
    return runtimeDiagnostics.span('model', 'generate', () => this.provider(options).complete({
      ...request,
      stream: false,
      onDelta: null,
      allowEmpty: true
    }));
  }

  stream(options = {}) {
    if (typeof options.onDelta !== 'function') {
      throw new TypeError('ModelGateway.stream requires onDelta().');
    }
    const { tools: _tools, tool_choice: _toolChoice, toolChoice: _toolChoiceAlias, ...request } = options;
    return runtimeDiagnostics.span('model', 'stream', () => this.provider(options).complete({
      ...request,
      stream: true,
      allowEmpty: true
    }));
  }

  providers() {
    return this.registry.list();
  }
}

module.exports = { ModelGateway };
