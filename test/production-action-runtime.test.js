'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createProductionActionRuntimeManager, normalizeProductionActionConfiguration } = require('../agent/production-action-runtime');
const { MaiAgentRuntime } = require('../agent/mai-agent-runtime');
const { DeepSeekAgentAdapter } = require('../agent/deepseek-agent-adapter');

test('production Work always selects MaiAgentRuntime with DeepSeekAgentAdapter and fails closed', async () => {
  assert.deepEqual(normalizeProductionActionConfiguration({ enabled: true, runtime: 'mock', workspacePath: ' C:\\workspace ' }), {
    enabled: true,
    runtime: 'mai-agent'
  });
  const manager = createProductionActionRuntimeManager({
    getConfiguration: () => ({ enabled: true, runtime: 'mock' }),
    getApiKey: () => '',
    getModel: () => 'deepseek-v4-flash',
    getWorkspacePath: () => ''
  });
  assert.deepEqual([...manager.runtimes.keys()], ['mai-agent']);
  const runtime = manager.runtimes.get('mai-agent');
  assert.ok(runtime instanceof MaiAgentRuntime);
  assert.ok(runtime.modelAdapter instanceof DeepSeekAgentAdapter);
  const response = await manager.execute({ text: '?' });
  assert.equal(response.session.status, 'failed');
  assert.equal(response.session.error.code, 'missing_api_key');
  assert.doesNotMatch(response.presentation.content, /整理好了|可执行的起点/);
});
