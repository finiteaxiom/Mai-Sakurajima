'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DeepSeekAgentAdapter } = require('../agent/deepseek-agent-adapter');
const { createWorkspaceAgentToolRegistry } = require('../agent/workspace-tools');

function response(payload, status = 200) { return { ok: status >= 200 && status < 300, status, async json() { return payload; } }; }

test('DeepSeekAgentAdapter keeps Agent tool calling outside the Chat provider contract', async () => {
  const requests = [];
  const adapter = new DeepSeekAgentAdapter({ getApiKey: () => 'test-key', getModel: () => 'deepseek-v4-flash', fetchImpl: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return response({ model: 'deepseek-v4-flash', choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, reasoning_content: 'tool reasoning', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'get_current_time', arguments: '{}' } }] } }] });
  } });
  const result = await adapter.runRound({ messages: [{ role: 'user', content: '现在几点？' }], tools: [{ type: 'function', function: { name: 'get_current_time', parameters: { type: 'object' } } }] });
  assert.equal(result.toolCalls[0].name, 'get_current_time');
  assert.equal(result.assistantItem.reasoning_content, 'tool reasoning');
  assert.equal(requests[0].response_format, undefined);
  assert.equal(requests[0].tools[0].function.name, 'get_current_time');
  assert.equal(requests[0].tool_choice, 'auto');
});

test('DeepSeekAgentAdapter preserves cancellation and normalizes provider errors', async () => {
  const adapter = new DeepSeekAgentAdapter({ getApiKey: () => 'test-key', fetchImpl: async () => response({ error: { message: 'bad request' } }, 400) });
  await assert.rejects(adapter.runRound({ messages: [{ role: 'user', content: 'x' }] }), { code: 'provider_http_error' });
  const pending = new DeepSeekAgentAdapter({ getApiKey: () => 'test-key', fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })) });
  const controller = new AbortController(); const run = pending.runRound({ messages: [{ role: 'user', content: 'x' }] }, { signal: controller.signal });
  const reason = Object.assign(new Error('stop'), { code: 'action_cancelled' }); controller.abort(reason);
  await assert.rejects(run, (error) => error === reason);
});

test('DeepSeekAgentAdapter sends the capability-filtered Workspace tool schema unchanged', async () => {
  const requests = [];
  const tools = createWorkspaceAgentToolRegistry({ getWorkspacePath: () => 'C:\\workspace' })
    .list()
    .filter((tool) => ['safe-local', 'workspace-read'].includes(tool.capabilities[0]))
    .map((tool) => tool.definition());
  const adapter = new DeepSeekAgentAdapter({
    getApiKey: () => 'test-key',
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return response({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'list-1', type: 'function', function: { name: 'list_files', arguments: '{}' } }] } }] });
    }
  });
  const result = await adapter.runRound({ messages: [{ role: 'user', content: '帮我看看 workspace 里有什么文件' }], tools });
  assert.equal(result.toolCalls[0].name, 'list_files');
  const listFiles = requests[0].tools.find((tool) => tool.function.name === 'list_files');
  assert.ok(listFiles);
  assert.match(listFiles.function.description, /当前 Work Workspace 内文件和目录/);
  assert.equal(listFiles.function.parameters.required, undefined);
  assert.match(listFiles.function.parameters.properties.path.description, /根目录使用/);
  assert.equal(requests[0].tool_choice, 'auto');
  assert.equal(requests[0].thinking.type, 'disabled');
});
