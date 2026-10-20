'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ActionRuntimeManager } = require('../agent/action-runtime-manager');
const { MaiAgentRuntime } = require('../agent/mai-agent-runtime');
const { DeepSeekAgentAdapter } = require('../agent/deepseek-agent-adapter');
const { FakeAgentModelAdapter } = require('../agent/fake-agent-model-adapter');
const { createToolRegistry, createSafeAgentToolRegistry } = require('../agent/agent-tool-registry');
const { createCapabilityPolicy } = require('../agent/capability-policy');
const { ToolOrchestrator } = require('../agent/tool-orchestrator');

function createHarness(options = {}) {
  const runtime = new MaiAgentRuntime({
    modelAdapter: new FakeAgentModelAdapter({ mode: options.mode, echoText: options.echoText }),
    toolRegistry: options.toolRegistry,
    limits: options.limits,
    now: options.now
  });
  const manager = new ActionRuntimeManager({ getConfiguration: () => ({ enabled: true, runtime: 'mai-agent' }) }).register(runtime);
  return { runtime, manager };
}

test('Mai Agent Harness follows task -> model -> safe tool -> observation -> model -> final with ordered events', async () => {
  const { manager } = createHarness();
  const events = [];
  const response = await manager.execute({ text: '测试最小链路', capabilities: ['safe-local'], onEvent: (event) => events.push(event) });
  assert.equal(response.session.status, 'completed');
  assert.equal(response.session.result.summary, 'done');
  assert.equal(response.session.task.rounds, 2);
  assert.equal(response.session.task.toolCalls, 1);
  assert.equal(response.session.task.toolErrors, 0);
  assert.equal(response.session.task.status, 'completed');
  assert.doesNotThrow(() => JSON.stringify(response));
  assert.deepEqual(events.map((event) => event.type), [
    'TaskStarted', 'TurnStarted', 'ModelRequestStarted', 'ModelRequestCompleted',
    'ToolCallRequested', 'ToolExecutionStarted', 'ToolCompleted', 'TurnCompleted',
    'TurnStarted', 'ModelRequestStarted', 'ModelRequestCompleted', 'TurnCompleted', 'TaskCompleted'
  ]);
  assert.deepEqual(events.map((event) => event.sequence), events.map((_event, index) => index + 1));
  assert.ok(events.every((event) => event.eventId && event.timestamp && event.sessionId && event.taskId));
  assert.equal(events.filter((event) => /^Task(Completed|Failed|Cancelled)$/.test(event.type)).length, 1);
});

test('no-tool final completes in one turn', async () => {
  const { manager } = createHarness({ mode: 'no_tool' });
  const response = await manager.execute({ text: '不需要工具', capabilities: ['safe-local'] });
  assert.equal(response.session.status, 'completed');
  assert.equal(response.session.task.rounds, 1);
  assert.equal(response.session.task.toolCalls, 0);
});

test('a late DeepSeek fetch success after Work cancellation cannot complete the task', async () => {
  let markFetchStarted;
  let releaseFetch;
  const fetchStarted = new Promise((resolve) => { markFetchStarted = resolve; });
  const fetchGate = new Promise((resolve) => { releaseFetch = resolve; });
  let requestSignal;
  const adapter = new DeepSeekAgentAdapter({
    getApiKey: () => 'synthetic-test-key',
    fetchImpl: async (_url, options) => {
      requestSignal = options.signal;
      markFetchStarted();
      return fetchGate;
    }
  });
  const runtime = new MaiAgentRuntime({ modelAdapter: adapter });
  const manager = new ActionRuntimeManager({ getConfiguration: () => ({ enabled: true, runtime: 'mai-agent' }) }).register(runtime);
  const events = [];
  let sessionId = '';
  const pending = manager.execute({
    text: 'synthetic cancellation test',
    capabilities: ['safe-local'],
    projectId: 'test-project',
    workSessionId: 'test-session',
    onStarted: (session) => { sessionId = session.id; },
    onEvent: (event) => events.push(event)
  });
  await fetchStarted;
  const cancelResponse = await manager.cancel(sessionId);
  assert.equal(cancelResponse.status, 'running');
  assert.equal(requestSignal.aborted, true);
  releaseFetch({
    ok: true,
    status: 200,
    async json() {
      return {
        model: 'deepseek-chat',
        usage: { prompt_tokens: 1, completion_tokens: 1 },
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'synthetic late final response' } }]
      };
    }
  });

  const result = await pending;
  assert.equal(result.session.status, 'cancelled');
  assert.equal(result.session.task.status, 'cancelled');
  assert.equal(result.session.error.code, 'action_cancelled');
  assert.deepEqual(events.filter((event) => /^Task(Completed|Failed|Cancelled)$/.test(event.type)).map((event) => event.type), ['TaskCancelled']);
  assert.equal(events.some((event) => event.type === 'ModelRequestCompleted'), false);
});

test('AgentLoop rechecks cancellation after a late model adapter success', async () => {
  let markModelStarted;
  let releaseModel;
  const modelStarted = new Promise((resolve) => { markModelStarted = resolve; });
  const modelGate = new Promise((resolve) => { releaseModel = resolve; });
  const runtime = new MaiAgentRuntime({
    modelAdapter: {
      id: 'ignores-abort',
      async runRound() {
        markModelStarted();
        return modelGate;
      }
    }
  });
  const manager = new ActionRuntimeManager({ getConfiguration: () => ({ enabled: true, runtime: 'mai-agent' }) }).register(runtime);
  const events = [];
  let sessionId = '';
  const pending = manager.execute({
    text: 'synthetic late adapter test',
    capabilities: ['safe-local'],
    onStarted: (session) => { sessionId = session.id; },
    onEvent: (event) => events.push(event)
  });
  await modelStarted;
  await manager.cancel(sessionId);
  releaseModel({ assistantItem: { role: 'assistant', content: 'late success' }, toolCalls: [], finishReason: 'stop' });

  const result = await pending;
  assert.equal(result.session.status, 'cancelled');
  assert.equal(result.session.task.status, 'cancelled');
  assert.deepEqual(events.filter((event) => /^Task(Completed|Failed|Cancelled)$/.test(event.type)).map((event) => event.type), ['TaskCancelled']);
  assert.equal(events.some((event) => event.type === 'ModelRequestCompleted'), false);
});

test('tool failures become ToolResult observations and are bounded', async () => {
  const failingTools = createToolRegistry([{
    name: 'echo', capabilities: ['safe-local'], timeoutMs: 100,
    validate: (args) => args,
    execute: async () => { throw Object.assign(new Error('回显失败'), { code: 'ECHO_FAILED' }); }
  }]);
  const softFailure = createHarness({ toolRegistry: failingTools });
  const complete = await softFailure.manager.execute({ text: '工具失败后继续', capabilities: ['safe-local'] });
  assert.equal(complete.session.status, 'completed');
  assert.equal(complete.session.task.toolErrors, 1);

  const bounded = createHarness({ toolRegistry: failingTools, limits: { maxToolErrors: 1 } });
  const events = [];
  const failed = await bounded.manager.execute({ text: '工具失败上限', capabilities: ['safe-local'], onEvent: (event) => events.push(event) });
  assert.equal(failed.session.status, 'failed');
  assert.equal(failed.session.error.code, 'AGENT_MAX_TOOL_ERRORS');
  assert.equal(events.at(-1).type, 'TaskFailed');

  const slowTools = createToolRegistry([{
    name: 'echo', capabilities: ['safe-local'], timeoutMs: 5,
    validate: (args) => args,
    execute: async () => new Promise((resolve) => setTimeout(() => resolve({ late: true }), 50))
  }]);
  const timedTool = createHarness({ toolRegistry: slowTools });
  const timedEvents = [];
  const timed = await timedTool.manager.execute({ text: '工具超时', capabilities: ['safe-local'], onEvent: (event) => timedEvents.push(event) });
  assert.equal(timed.session.status, 'completed');
  assert.equal(timed.session.task.toolErrors, 1);
  assert.equal(timedEvents.find((event) => event.type === 'ToolCompleted').payload.result.error.code, 'AGENT_TOOL_TIMEOUT');
});

test('max rounds and max tool calls fail with stable codes', async () => {
  const rounds = createHarness({ mode: 'always_tool', limits: { maxRounds: 1, maxToolCalls: 10 } });
  const roundResult = await rounds.manager.execute({ text: '循环轮次', capabilities: ['safe-local'] });
  assert.equal(roundResult.session.error.code, 'AGENT_MAX_ROUNDS');

  const calls = createHarness({ mode: 'always_tool', limits: { maxRounds: 5, maxToolCalls: 1 } });
  const callResult = await calls.manager.execute({ text: '循环工具', capabilities: ['safe-local'] });
  assert.equal(callResult.session.error.code, 'AGENT_MAX_TOOL_CALLS');
});

test('model failure, timeout, and cancellation produce isolated terminal task states', async () => {
  const modelFailure = createHarness({ mode: 'model_error' });
  const modelResult = await modelFailure.manager.execute({ text: '模型失败', capabilities: ['safe-local'] });
  assert.equal(modelResult.session.status, 'failed');
  assert.equal(modelResult.session.error.code, 'AGENT_MODEL_FAILURE');

  const timeout = createHarness({ mode: 'never_finish', limits: { timeoutMs: 20 } });
  const timeoutResult = await timeout.manager.execute({ text: '超时', capabilities: ['safe-local'] });
  assert.equal(timeoutResult.session.status, 'failed');
  assert.equal(timeoutResult.session.error.code, 'AGENT_TIMEOUT');
  assert.equal(timeoutResult.session.task.status, 'failed');

  const cancelled = createHarness({ mode: 'cancel_wait', limits: { timeoutMs: 1_000 } });
  let sessionId = '';
  const pending = cancelled.manager.execute({ text: '取消', capabilities: ['safe-local'], onStarted: (session) => { sessionId = session.id; } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(sessionId);
  await cancelled.manager.cancel(sessionId);
  const cancelledResult = await pending;
  assert.equal(cancelledResult.session.status, 'cancelled');
  assert.equal(cancelledResult.session.task.status, 'cancelled');
  assert.equal(cancelledResult.session.error.code, 'action_cancelled');

  const waitingTools = createToolRegistry([{
    name: 'echo', capabilities: ['safe-local'], timeoutMs: 5_000,
    validate: (args) => args,
    execute: async (_args, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })
  }]);
  const toolCancelled = createHarness({ toolRegistry: waitingTools, limits: { timeoutMs: 1_000 } });
  let toolSessionId = '';
  const toolPending = toolCancelled.manager.execute({ text: '取消工具', capabilities: ['safe-local'], onStarted: (session) => { toolSessionId = session.id; } });
  await new Promise((resolve) => setImmediate(resolve));
  await toolCancelled.manager.cancel(toolSessionId);
  const toolCancelledResult = await toolPending;
  assert.equal(toolCancelledResult.session.status, 'cancelled');
  assert.equal(toolCancelledResult.session.task.status, 'cancelled');
});

test('safe-local remains capability-policy protected and only static safe tools are registered', async () => {
  const runtime = new MaiAgentRuntime({ modelAdapter: new FakeAgentModelAdapter() });
  const deniedManager = new ActionRuntimeManager({
    getConfiguration: () => ({ enabled: true, runtime: 'mai-agent' }),
    capabilityPolicy: createCapabilityPolicy()
  }).register(runtime);
  await assert.rejects(deniedManager.execute({ text: '未授权', capabilities: ['safe-local'] }), { code: 'capability_not_granted' });

  const registry = createSafeAgentToolRegistry({ now: () => new Date('2026-08-22T00:00:00.000Z') });
  assert.deepEqual(registry.list().map((tool) => tool.name), ['echo', 'get_current_time']);
  const tools = new ToolOrchestrator({ registry, capabilityPolicy: createCapabilityPolicy({ allowed: ['safe-local'] }) });
  const time = await tools.execute({ callId: 'time-1', name: 'get_current_time', arguments: {} }, { grantedCapabilities: ['safe-local'] });
  assert.deepEqual(time.output, { iso: '2026-08-22T00:00:00.000Z' });
});

test('Workspace list task executes list_files and returns the model answer from observed files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-agent-workspace-'));
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), 'A');
    fs.writeFileSync(path.join(root, 'b.md'), '# B');
    fs.mkdirSync(path.join(root, 'folder'));
    const rounds = [];
    const modelAdapter = {
      id: 'deterministic-workspace',
      async runRound(context) {
        rounds.push(context);
        if (context.round === 1) {
          assert.match(context.messages[0].content, /完成用户明确交给你的任务/);
          assert.match(context.messages[0].content, /用户是你的学弟/);
          assert.match(context.messages[0].content, /麻衣写给学弟\.docx/);
          assert.deepEqual(context.tools.map((tool) => tool.function.name), [
            'echo', 'get_current_time', 'get_workspace_info', 'list_files', 'read_file',
            'get_file_info', 'search_files', 'search_file_content',
            'create_file', 'write_file', 'create_word_document', 'append_word_document', 'create_directory', 'rename_path', 'move_path', 'copy_file', 'delete_path'
          ]);
          const listFiles = context.tools.find((tool) => tool.function.name === 'list_files');
          assert.match(listFiles.function.description, /列出当前 Work Workspace 内文件和目录/);
          return {
            assistantItem: { role: 'assistant', content: null, tool_calls: [{ id: 'list-1', type: 'function', function: { name: 'list_files', arguments: '{}' } }] },
            toolCalls: [{ callId: 'list-1', name: 'list_files', arguments: {} }],
            finishReason: 'tool_calls'
          };
        }
        const observation = context.observations.find((item) => item.toolName === 'list_files');
        assert.equal(observation.ok, true);
        assert.deepEqual(observation.data.entries.map((entry) => entry.name).sort(), ['a.txt', 'b.md', 'folder']);
        assert.equal(context.messages.at(-1).role, 'tool');
        assert.equal(context.messages.at(-1).tool_call_id, 'list-1');
        return { assistantItem: { role: 'assistant', content: 'Workspace 中有 a.txt、b.md 和 folder。' }, toolCalls: [], finishReason: 'stop' };
      }
    };
    const runtime = new MaiAgentRuntime({ modelAdapter, getWorkspacePath: () => root });
    const manager = new ActionRuntimeManager({ getConfiguration: () => ({ enabled: true, runtime: 'mai-agent' }) }).register(runtime);
    const events = [];
    const response = await manager.execute({
      text: '帮我看看workspace里有什么文件',
      workspacePath: root,
      projectId: 'project-a',
      workSessionId: 'work-session-a',
      capabilities: ['safe-local', 'workspace-read', 'workspace-write'],
      onEvent: (event) => events.push(event)
    });
    assert.equal(response.session.status, 'completed');
    assert.equal(response.session.result.summary, 'Workspace 中有 a.txt、b.md 和 folder。');
    assert.equal(response.presentation.content, 'Workspace 中有 a.txt、b.md 和 folder。');
    assert.equal(response.session.task.toolCalls, 1);
    assert.deepEqual(events.filter((event) => event.type === 'ToolCallRequested').map((event) => event.payload.toolName), ['list_files']);
    assert.equal(events.find((event) => event.type === 'ToolCompleted').payload.result.ok, true);
    assert.deepEqual(events.filter((event) => event.type === 'ModelRequestStarted').map((event) => event.payload.adapter), ['deterministic-workspace', 'deterministic-workspace']);
    assert.equal(rounds.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Work treats a brief request from the younger student as a Word creation task instead of asking for more context', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-agent-word-draft-'));
  try {
    const draft = '学弟，今天别把所有事情都挤在最后一刻。先把最重要的那一件做好，剩下的慢慢来。我会在这里等你把结果告诉我。';
    const modelAdapter = {
      id: 'word-draft-agent',
      async runRound(context) {
        if (context.round === 1) {
          assert.match(context.messages[0].content, /不要因缺少额外背景而先反问/);
          assert.match(context.messages[0].content, /用户是你的学弟/);
          assert.ok(context.tools.some((tool) => tool.function.name === 'create_word_document'));
          return {
            assistantItem: { role: 'assistant', content: null, tool_calls: [{ id: 'word-1', type: 'function', function: { name: 'create_word_document', arguments: JSON.stringify({ path: '麻衣写给学弟.docx', content: draft }) } }] },
            toolCalls: [{ callId: 'word-1', name: 'create_word_document', arguments: { path: '麻衣写给学弟.docx', content: draft } }], finishReason: 'tool_calls'
          };
        }
        const observation = context.observations.find((item) => item.toolName === 'create_word_document');
        assert.equal(observation.ok, true);
        return { assistantItem: { role: 'assistant', content: '我已经写好并放进 Word 文档了，学弟。' }, toolCalls: [], finishReason: 'stop' };
      }
    };
    const runtime = new MaiAgentRuntime({ modelAdapter, getWorkspacePath: () => root });
    const manager = new ActionRuntimeManager({ getConfiguration: () => ({ enabled: true, runtime: 'mai-agent' }) }).register(runtime);
    const response = await manager.execute({ text: '学姐现在写一写，100字就够。', workspacePath: root, capabilities: ['safe-local', 'workspace-read', 'workspace-write'], requestApproval: async () => true });
    assert.equal(response.session.status, 'completed');
    const document = fs.readFileSync(path.join(root, '麻衣写给学弟.docx'));
    assert.equal(document.subarray(0, 2).toString('utf8'), 'PK');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
