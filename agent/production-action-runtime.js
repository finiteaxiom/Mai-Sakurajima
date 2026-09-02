'use strict';

const { ActionRuntimeManager, normalizeActionConfiguration } = require('./action-runtime-manager');
const { MaiAgentRuntime } = require('./mai-agent-runtime');
const { DeepSeekAgentAdapter } = require('./deepseek-agent-adapter');

// The persisted runtime selector existed while the Phase 1 mock was the only
// implementation. Production Work has exactly one backend: MaiAgentRuntime.
function normalizeProductionActionConfiguration(value = {}) {
  return {
    ...normalizeActionConfiguration(value),
    runtime: 'mai-agent'
  };
}

function createProductionActionRuntimeManager(options = {}) {
  if (typeof options.getConfiguration !== 'function') {
    throw new TypeError('Production Action Runtime requires getConfiguration().');
  }
  const getConfiguration = () => normalizeProductionActionConfiguration(options.getConfiguration());
  const modelAdapter = new DeepSeekAgentAdapter({
    getApiKey: typeof options.getApiKey === 'function' ? options.getApiKey : () => '',
    getModel: typeof options.getModel === 'function' ? options.getModel : () => ''
  });
  const runtime = new MaiAgentRuntime({
    modelAdapter,
    getWorkspacePath: typeof options.getWorkspacePath === 'function' ? options.getWorkspacePath : () => '',
    limits: options.limits
  });
  return new ActionRuntimeManager({
    getConfiguration,
    capabilityPolicy: options.capabilityPolicy
  }).register(runtime);
}

module.exports = {
  createProductionActionRuntimeManager,
  normalizeProductionActionConfiguration
};
