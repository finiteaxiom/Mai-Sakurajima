'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerActionIpc } = require('../action-ipc');
const { ActionRuntimeManager } = require('../agent/action-runtime-manager');
const { MaiAgentRuntime } = require('../agent/mai-agent-runtime');
const { WorkStore } = require('../work/work-store');
const { createWorkRendererBindings } = require('../renderer/work-renderer-bindings');
const { createChatTurnCoordinator } = require('../renderer/chat-turn-coordinator');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message || 'condition did not become true');
}

function loadRendererFunction(sandbox, startMarker, endMarker, exportName) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat.js'), 'utf8');
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${exportName} should exist in Renderer source`);
  vm.runInNewContext(`${source.slice(start, end)}\nthis.${exportName} = ${exportName};`, sandbox);
  return sandbox[exportName];
}

function loadProactiveGreetingCallback(sandbox) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat.js'), 'utf8');
  const registration = source.indexOf('api.onChatProactiveGreeting(async (payload) => {');
  const start = source.indexOf('async (payload) => {', registration);
  const end = source.indexOf('\n});', start) + 2;
  assert.ok(registration >= 0 && start > registration && end > start, 'proactive greeting callback should exist');
  vm.runInNewContext(`this.handleProactiveGreeting = (${source.slice(start, end)});`, sandbox);
  return sandbox.handleProactiveGreeting;
}

function makeFinalModelAdapter(onRound = null) {
  return {
    id: 'renderer-lifecycle-fixture',
    async runRound(context, options) {
      if (onRound) await onRound(context, options);
      return {
        assistantItem: { role: 'assistant', content: '隔离集成测试完成' },
        toolCalls: [],
        finishReason: 'final',
        continuation: null,
        usage: { inputTokens: 0, outputTokens: 0 }
      };
    }
  };
}

function createIntegration(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-work-renderer-'));
  const workspaceA = path.join(root, 'workspace-a');
  const workspaceB = path.join(root, 'workspace-b');
  const workspaceA2 = path.join(root, 'workspace-a-new-root');
  for (const workspace of [workspaceA, workspaceB, workspaceA2]) fs.mkdirSync(workspace, { recursive: true });
  for (const workspace of [workspaceA, workspaceB, workspaceA2]) {
    fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'same.txt'), `内容来自 ${path.basename(workspace)}`, 'utf8');
    fs.writeFileSync(path.join(workspace, 'docs', 'note.txt'), `资料来自 ${path.basename(workspace)}`, 'utf8');
  }

  const workStore = new WorkStore({ filePath: path.join(root, 'mai-work.json') });
  workStore.load();
  const projectA = workStore.createProject({ name: '项目 A', workspacePath: workspaceA });
  const sessionA = workStore.createSession(projectA.id, { title: 'A 记录一' });
  const sessionA2 = workStore.createSession(projectA.id, { title: 'A 记录二' });
  const projectB = workStore.createProject({ name: '项目 B', workspacePath: workspaceB });
  const sessionB = workStore.createSession(projectB.id, { title: 'B 记录一' });
  const sessionB2 = workStore.createSession(projectB.id, { title: 'B 记录二' });
  workStore.openProject(projectA.id);

  const handlers = new Map();
  const startedListeners = new Set();
  const eventListeners = new Set();
  const config = { enabled: true, runtime: 'mai-agent' };
  const runtime = new MaiAgentRuntime({ modelAdapter: options.modelAdapter || makeFinalModelAdapter() });
  const manager = new ActionRuntimeManager({ getConfiguration: () => config }).register(runtime);
  const apiHooks = { status: [], workData: [], list: [], preview: [], configure: [] };
  const apiCalls = [];
  const sent = [];
  let activeIpcCalls = 0;
  const sender = {
    isDestroyed: () => false,
    send(channel, payload) {
      sent.push({ channel, payload });
      const listeners = channel === 'agent:session-started' ? startedListeners : eventListeners;
      for (const callback of listeners) callback(payload);
    }
  };
  const invoke = async (channel, ...args) => {
    apiCalls.push({ channel, args });
    const handler = handlers.get(channel);
    assert.ok(handler, `missing registered IPC handler ${channel}`);
    activeIpcCalls += 1;
    try { return await handler({ sender }, ...args); }
    finally { activeIpcCalls -= 1; }
  };
  registerActionIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    actionRuntimeManager: manager,
    workStore,
    getConfiguration: () => config,
    saveConfiguration: (next) => Object.assign(config, next),
    selectWorkspace: async (project) => workStore.setProjectWorkspace(project.id, options.selectedWorkspacePath || project.workspacePath || workspaceA2)
  });

  async function intercepted(key, args, execute) {
    const result = await execute();
    let next = result;
    for (const hook of [...apiHooks[key]]) next = await hook({ args, result: next });
    return next;
  }

  const api = {
    getActionStatus: () => intercepted('status', [], () => invoke('agent:get-status')),
    configureAction: (input) => intercepted('configure', [input], () => invoke('agent:configure', input)),
    executeAction: (input) => invoke('agent:execute', input),
    getWorkData: () => intercepted('workData', [], () => invoke('agent:get-work-data')),
    createWorkProject: (input) => invoke('agent:create-project', input),
    renameWorkProject: (input) => invoke('agent:rename-project', input),
    openWorkProject: (id) => invoke('agent:open-project', id),
    createWorkSession: (input) => invoke('agent:create-work-session', input),
    renameWorkSession: (input) => invoke('agent:rename-work-session', input),
    deleteWorkSession: (input) => invoke('agent:delete-work-session', input),
    cancelAction: (id) => invoke('agent:cancel', id),
    getActionSession: (id) => invoke('agent:get-session', id),
    listActionSessions: () => invoke('agent:list-sessions'),
    selectActionWorkspace: (id) => invoke('agent:select-workspace', id),
    listActionWorkspaceDirectory: (input) => intercepted('list', [input], () => invoke('agent:list-workspace-directory', input)),
    previewActionWorkspaceFile: (input) => intercepted('preview', [input], () => invoke('agent:preview-workspace-file', input)),
    onActionSessionStarted(callback) {
      startedListeners.add(callback);
      return () => { startedListeners.delete(callback); disposers += 1; };
    },
    onAgentEvent(callback) {
      eventListeners.add(callback);
      return () => { eventListeners.delete(callback); disposers += 1; };
    }
  };
  let disposers = 0;
  const workStates = [];
  const explorerStates = [];
  const notices = [];
  const bindings = createWorkRendererBindings({
    api,
    onWorkStateChange: (state) => workStates.push(state),
    onExplorerStateChange: (state) => explorerStates.push(state),
    onNotice: (error) => notices.push(error)
  });

  async function initialize({ agent = false } = {}) {
    bindings.setInitialRuntimeStatus(await api.getActionStatus());
    bindings.setInitialData(await api.getWorkData());
    if (agent) {
      bindings.activateMode('agent');
      await waitFor(() => bindings.getExplorerState().listings.has(''), `initial Workspace root listing should complete: ${JSON.stringify({ work: bindings.getIdentity(), explorer: { projectId: bindings.getExplorerState().projectId, path: bindings.getExplorerState().workspacePath, listings: [...bindings.getExplorerState().listings.keys()], loading: [...bindings.getExplorerState().loadingPaths], error: bindings.getExplorerState().loadError }, notices: notices.map((item) => item?.message) })}`);
    }
  }

  function deferNext(key, predicate = () => true) {
    const gate = deferred();
    const started = deferred();
    let used = false;
    const hook = async (event) => {
      if (!used && predicate(event.args, event.result)) {
        used = true;
        started.resolve(event);
        try { await gate.promise; }
        finally {
          const index = apiHooks[key].indexOf(hook);
          if (index >= 0) apiHooks[key].splice(index, 1);
        }
      }
      return event.result;
    };
    apiHooks[key].push(hook);
    return { gate, started: started.promise };
  }

  function emitAgentEvent(event) {
    for (const callback of eventListeners) callback(event);
  }

  function dispose() {
    bindings.dispose();
  }

  async function drain() {
    await waitFor(() => activeIpcCalls === 0, 'IPC operations should settle before fixture cleanup');
  }

  return {
    api,
    apiCalls,
    bindings,
    deferNext,
    dispose,
    emitAgentEvent,
    explorerStates,
    handlers,
    notices,
    projectA,
    projectB,
    root,
    runtime,
    sent,
    sessionA,
    sessionA2,
    sessionB,
    sessionB2,
    startedListeners,
    eventListeners,
    workDataPath: path.join(root, 'mai-work.json'),
    workStates,
    workStore,
    workspaceA,
    workspaceA2,
    workspaceB,
    drain,
    get disposerCount() { return disposers; },
    initialize
  };
}

async function withIntegration(callback, options = {}) {
  const integration = createIntegration(options);
  try { await callback(integration); }
  finally {
    integration.dispose();
    await integration.drain();
    fs.rmSync(integration.root, { recursive: true, force: true });
  }
}

test('Work Renderer scripts are classic IIFEs loaded before chat.js', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'chat.html'), 'utf8');
  const scripts = [
    'chat-turn-coordinator.js',
    'work-renderer-controller.js',
    'workspace-explorer-controller.js',
    'work-renderer-bindings.js',
    'chat.js'
  ].map((file) => page.indexOf(`<script src="${file}"></script>`));
  assert.ok(scripts.every((index) => index >= 0));
  assert.deepEqual([...scripts].sort((a, b) => a - b), scripts);
  for (const file of scripts.slice(1, 4)) {
    const name = ['work-renderer-controller.js', 'workspace-explorer-controller.js', 'work-renderer-bindings.js'][scripts.indexOf(file) - 1];
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'renderer', name), 'utf8'), /^\(function attach/);
  }
});

test('Work refresh and project/session selection preserve the Work mode through real WorkStore and IPC', async () => {
  await withIntegration(async (integration) => {
    await integration.initialize({ agent: true });
    assert.equal(integration.bindings.getIdentity().mode, 'agent');
    const refreshed = await integration.bindings.refreshWorkData();
    assert.equal(refreshed.mode, 'agent');
    assert.equal(refreshed.projectId, integration.projectA.id);
    const projectSelected = await integration.bindings.selectProject(integration.projectB.id, refreshed.identity);
    assert.equal(projectSelected, true, JSON.stringify({ identity: integration.bindings.getIdentity(), state: integration.bindings.getState(), notices: integration.notices.map((item) => item?.message) }));
    assert.equal(integration.bindings.getIdentity().projectId, integration.projectB.id);
    assert.equal(integration.bindings.getIdentity().mode, 'agent');
    assert.equal(await integration.bindings.selectSession(integration.projectB.id, integration.sessionB2.id, integration.bindings.getIdentity()), true);
    assert.equal(integration.bindings.getIdentity().workSessionId, integration.sessionB2.id);
    await waitFor(() => integration.bindings.getExplorerState().listings.has('') && !integration.bindings.getExplorerState().loading, 'selected project Explorer should settle');
    assert.ok(integration.apiCalls.some((call) => call.channel === 'agent:open-project' && call.args[0] === integration.projectB.id));
  });
});

test('a delayed configure callback cannot run Chat UI effects after changing to Chat', async () => {
  await withIntegration(async (integration) => {
    await integration.initialize({ agent: true });
    const configure = integration.deferNext('configure');
    let focused = 0;
    let hidden = 0;
    const sandbox = {
      workRendererBindings: integration.bindings,
      messageInput: { focus() { focused += 1; } },
      hideNotice() { hidden += 1; },
      showNotice() {},
      errorText: (error) => String(error?.message || error)
    };
    const enableActionRuntime = loadRendererFunction(sandbox, 'async function enableActionRuntime()', '\nasync function sendActionMessage()', 'enableActionRuntime');
    const pending = enableActionRuntime();
    await configure.started;
    integration.bindings.activateMode('chat');
    configure.gate.resolve();
    await pending;
    assert.equal(focused, 0);
    assert.equal(hidden, 0);
  });
});

test('Work session rename/delete UI waits are bound to the captured project view and use controller methods', async () => {
  await withIntegration(async (integration) => {
    await integration.initialize({ agent: true });
    const identity = integration.bindings.getIdentity();
    const notices = [];
    let resolveDialog;
    const sandbox = {
      conversationContextKind: 'work',
      workRendererBindings: integration.bindings,
      api: integration.api,
      showNotice: (message) => notices.push(message),
      errorText: (error) => String(error?.message || error),
      openInputDialog: () => new Promise((resolve) => { resolveDialog = resolve; }),
      window: { confirm: () => true }
    };
    const rename = loadRendererFunction(sandbox, 'async function renameConversationSession(', '\nasync function deleteConversationSession(', 'renameConversationSession');
    const renamePending = rename(integration.workStore.getSession(integration.sessionA.id), 'work', identity);
    integration.bindings.activateMode('chat');
    resolveDialog({ title: '切换期间的旧操作' });
    assert.equal(await renamePending, false);
    assert.equal(integration.workStore.getSession(integration.sessionA.id).title, 'A 记录一');
    assert.equal(notices.length, 0);

    integration.bindings.activateMode('agent');
    const current = integration.bindings.getIdentity();
    sandbox.openInputDialog = async () => ({ title: '重命名后的记录' });
    assert.equal(await rename(integration.workStore.getSession(integration.sessionA.id), 'work', current), true);
    assert.equal(integration.workStore.getSession(integration.sessionA.id).title, '重命名后的记录');
    assert.equal(notices.at(-1), '对话名称已更新。');
    assert.ok(integration.apiCalls.some((call) => call.channel === 'agent:rename-work-session'
      && call.args[0].projectId === integration.projectA.id
      && call.args[0].workSessionId === integration.sessionA.id));

    assert.equal(await rename(integration.workStore.getSession(integration.sessionB.id), 'work', current, integration.projectB.id), true);
    assert.equal(integration.workStore.getSession(integration.sessionB.id).title, '重命名后的记录');
    assert.ok(integration.apiCalls.some((call) => call.channel === 'agent:rename-work-session'
      && call.args[0].projectId === integration.projectB.id
      && call.args[0].workSessionId === integration.sessionB.id));

    const remove = loadRendererFunction(sandbox, 'async function deleteConversationSession(', '\nfunction voiceConfig()', 'deleteConversationSession');
    assert.equal(await remove(integration.workStore.getSession(integration.sessionA.id), 'work', current), true);
    assert.equal(integration.workStore.getSession(integration.sessionA.id), null);
    assert.equal(notices.at(-1), '这条 Work 记录已删除。');
    assert.ok(integration.apiCalls.some((call) => call.channel === 'agent:delete-work-session'
      && call.args[0].projectId === integration.projectA.id
      && call.args[0].workSessionId === integration.sessionA.id));
  });
});

test('independent Workspace directory requests complete without cancelling each other', async () => {
  await withIntegration(async (integration) => {
    await integration.initialize({ agent: true });
    const alpha = integration.deferNext('list', ([input]) => input.path === 'alpha');
    const beta = integration.deferNext('list', ([input]) => input.path === 'docs');
    fs.mkdirSync(path.join(integration.workspaceA, 'alpha'));
    fs.writeFileSync(path.join(integration.workspaceA, 'alpha', 'item.txt'), 'alpha', 'utf8');
    const identity = integration.bindings.getExplorerIdentity();
    const alphaLoad = integration.bindings.loadWorkspaceDirectory('alpha', identity);
    const betaLoad = integration.bindings.loadWorkspaceDirectory('docs', identity);
    await Promise.all([alpha.started, beta.started]);
    assert.deepEqual([...integration.bindings.getExplorerState().loadingPaths].sort(), ['alpha', 'docs']);
    alpha.gate.resolve();
    await alphaLoad;
    assert.equal(integration.bindings.getExplorerState().listings.has('alpha'), true);
    assert.equal(integration.bindings.getExplorerState().loadingPaths.has('docs'), true);
    beta.gate.resolve();
    await betaLoad;
    assert.equal(integration.bindings.getExplorerState().listings.has('docs'), true);
    assert.equal(integration.bindings.getExplorerState().loading, false);
  });
});

test('late expanded-directory refresh cannot restore a same-name selection in another project', async () => {
  await withIntegration(async (integration) => {
    await integration.initialize({ agent: true });
    const originalIdentity = integration.bindings.getExplorerIdentity();
    await integration.bindings.selectWorkspaceEntry({ type: 'folder', relativePath: 'docs' }, originalIdentity);
    const file = integration.bindings.getExplorerState().listings.get('docs').entries.find((entry) => entry.name === 'note.txt');
    await integration.bindings.selectWorkspaceEntry(file, integration.bindings.getExplorerIdentity());
    assert.equal(integration.bindings.getExplorerState().selection.relativePath, 'docs/note.txt');

    const delayedRestore = integration.deferNext('list', ([input]) => input.projectId === integration.projectA.id && input.path === 'docs');
    const refresh = integration.bindings.refreshWorkspace(integration.bindings.getExplorerIdentity());
    await delayedRestore.started;
    const currentWorkIdentity = integration.bindings.getIdentity();
    assert.equal(await integration.bindings.selectProject(integration.projectB.id, currentWorkIdentity), true);
    await waitFor(() => integration.bindings.getExplorerState().listings.has(''), 'Project B root should load');
    delayedRestore.gate.resolve();
    assert.equal(await refresh, false);
    assert.equal(integration.bindings.getExplorerState().projectId, integration.projectB.id);
    assert.equal(integration.bindings.getExplorerState().selection, null);
  });
});

test('late Workspace previews are dropped after project, root, or WorkSession identity changes', async () => {
  await withIntegration(async (integration) => {
    await integration.initialize({ agent: true });
    const previewEntry = integration.bindings.getExplorerState().listings.get('').entries.find((entry) => entry.name === 'same.txt');
    const staleProjectPreview = integration.deferNext('preview', ([input]) => input.projectId === integration.projectA.id);
    const projectPreview = integration.bindings.selectWorkspaceEntry(previewEntry, integration.bindings.getExplorerIdentity());
    await staleProjectPreview.started;
    assert.equal(await integration.bindings.selectProject(integration.projectB.id, integration.bindings.getIdentity()), true);
    staleProjectPreview.gate.resolve();
    assert.equal(await projectPreview, false);
    assert.equal(integration.bindings.getExplorerState().preview, null);

    const backToA = integration.bindings.selectProject(integration.projectA.id, integration.bindings.getIdentity());
    assert.equal(await backToA, true);
    await waitFor(() => integration.bindings.getExplorerState().listings.has(''), 'Project A root should reload');
    const rootChangePreview = integration.deferNext('preview', ([input]) => input.projectId === integration.projectA.id);
    const currentEntry = integration.bindings.getExplorerState().listings.get('').entries.find((entry) => entry.name === 'same.txt');
    const rootPreview = integration.bindings.selectWorkspaceEntry(currentEntry, integration.bindings.getExplorerIdentity());
    await rootChangePreview.started;
    integration.workStore.setProjectWorkspace(integration.projectA.id, integration.workspaceA2);
    await integration.bindings.refreshWorkData();
    rootChangePreview.gate.resolve();
    assert.equal(await rootPreview, false);
    assert.equal(integration.bindings.getExplorerState().workspacePath, integration.workspaceA2);
    assert.equal(integration.bindings.getExplorerState().preview, null);

    await waitFor(() => integration.bindings.getExplorerState().listings.has(''), 'replacement Workspace root should load');
    const rejectedPreview = integration.deferNext('preview', ([input]) => input.projectId === integration.projectA.id);
    const newEntry = integration.bindings.getExplorerState().listings.get('').entries.find((entry) => entry.name === 'same.txt');
    const errorsBefore = integration.notices.length;
    const errorPreview = integration.bindings.selectWorkspaceEntry(newEntry, integration.bindings.getExplorerIdentity());
    await rejectedPreview.started;
    assert.equal(await integration.bindings.selectSession(integration.projectA.id, integration.sessionA2.id, integration.bindings.getIdentity()), true);
    rejectedPreview.gate.reject(new Error('旧 Workspace 预览错误'));
    assert.equal(await errorPreview, false);
    assert.equal(integration.bindings.getExplorerState().identity.workSessionId, integration.sessionA2.id);
    assert.equal(integration.bindings.getExplorerState().preview, null);
    assert.equal(integration.notices.length, errorsBefore);
  });
});

test('real ActionRuntime events and WorkStore turn persistence are projected only for the active execution', async () => {
  let releaseModel;
  const modelStarted = deferred();
  const modelGate = new Promise((resolve) => { releaseModel = resolve; });
  await withIntegration(async (integration) => {
    integration.dispose();
    const delayed = createIntegration({ modelAdapter: makeFinalModelAdapter(async (_context, { signal }) => {
      modelStarted.resolve();
      if (signal.aborted) throw signal.reason;
      await modelGate;
    }) });
    try {
      await delayed.initialize({ agent: true });
      const before = delayed.deferNext('status');
      const staleStatus = delayed.bindings.refreshRuntimeStatus();
      await before.started;
      const run = delayed.bindings.executeAction('执行隔离集成', '', delayed.bindings.getIdentity());
      await modelStarted.promise;
      await waitFor(() => Boolean(delayed.bindings.getState().activeActionSessionId), 'ActionSession should be projected after Main confirmation');
      const sessionId = delayed.bindings.getState().activeActionSessionId;
      const taskId = delayed.bindings.getState().activeTaskId;
      assert.ok(taskId);
      assert.equal(delayed.bindings.isCurrentModeBusy('agent', { busy: false }), true);
      assert.equal(delayed.bindings.isCurrentModeBusy('chat', { busy: false }), false);
      delayed.emitAgentEvent({ type: 'TaskCompleted', sessionId: 'old-session', taskId: 'old-task' });
      delayed.emitAgentEvent({ type: 'TaskCompleted', sessionId, taskId: 'different-task' });
      assert.equal(delayed.bindings.getState().events.some((event) => event.sessionId === 'old-session' || event.taskId === 'different-task'), false);
      before.gate.resolve();
      await staleStatus;
      assert.equal(delayed.bindings.getState().activeActionSessionId, sessionId, 'pre-execution status must not clear the active session projection');
      releaseModel();
      const response = await run;
      assert.equal(response.session.status, 'completed');
      assert.equal(delayed.workStore.getSession(delayed.sessionA.id).messages.length, 2);
      assert.deepEqual(delayed.workStore.getSession(delayed.sessionA.id).messages.map((message) => message.role), ['user', 'assistant']);
      assert.ok(delayed.bindings.getState().events.some((event) => event.sessionId === sessionId && event.taskId === taskId && event.type === 'TaskCompleted'));
      assert.equal(delayed.bindings.getState().busy, false);
    } finally {
      delayed.dispose();
      fs.rmSync(delayed.root, { recursive: true, force: true });
    }
  });
});

test('Work event subscriptions dispose once and mode-specific busy projection stays separate from Chat', async () => {
  await withIntegration(async (integration) => {
    await integration.initialize();
    const chat = createChatTurnCoordinator({ api: {} });
    chat.applyChatState({ activeSessionId: 'chat-session', messages: [] });
    const chatTurn = chat.beginTurn({ sessionId: 'chat-session' });
    assert.equal(integration.bindings.isCurrentModeBusy('chat', chat.getState()), true);
    assert.equal(integration.bindings.isCurrentModeBusy('agent', chat.getState()), false);
    chat.dispose();
    assert.equal(integration.startedListeners.size, 1);
    assert.equal(integration.eventListeners.size, 1);
    integration.bindings.dispose();
    integration.bindings.dispose();
    assert.equal(integration.disposerCount, 2);
    assert.equal(integration.startedListeners.size, 0);
    assert.equal(integration.eventListeners.size, 0);
  });
});

test('Workspace intent read completing after a Work switch cannot start a hidden Chat send', async () => {
  await withIntegration(async (integration) => {
    await integration.initialize();
    const capabilityGate = deferred();
    let capabilityStarted;
    const capabilityStart = new Promise((resolve) => { capabilityStarted = resolve; });
    const coordinator = createChatTurnCoordinator({ api: {} });
    coordinator.applyChatState({ activeSessionId: 'chat-session', messages: [] });
    const sandbox = {
      selectedRuntimeMode: 'chat',
      runtimeModeGeneration: 0,
      chatTurnCoordinator: coordinator,
      workRendererBindings: integration.bindings,
      activeChatSessionId: () => coordinator.getState().sessionId,
      api: { executeChatWorkspaceCapability: async () => { capabilityStarted(); return capabilityGate.promise; } },
      sendMessageCalls: [],
      sendMessage(options) { this.sendMessageCalls.push(options); },
      showNotice() {},
      errorText: (error) => String(error?.message || error),
      refreshChatWorkspaceCapability: async () => {}
    };
    const sendWorkspaceIntent = loadRendererFunction(sandbox, 'async function sendWorkspaceIntent(', '\nfunction removeOptimisticMessage(', 'sendWorkspaceIntent');
    const pending = sendWorkspaceIntent('请看看 README', { operation: 'read', relativePath: 'README.md' });
    await capabilityStart;
    integration.bindings.activateMode('agent');
    sandbox.selectedRuntimeMode = 'agent';
    sandbox.runtimeModeGeneration += 1;
    const workMessages = ['当前 Work DOM'];
    const sendMessage = loadRendererFunction({ selectedRuntimeMode: 'agent' }, 'async function sendMessage(options = {})', '\nasync function saveSettings()', 'sendMessage');
    assert.equal(await sendMessage({ content: '不能进入 Work' }), null);
    capabilityGate.resolve({ ok: true, execution: { contextId: 'one-time-context' } });
    assert.equal(await pending, null);
    assert.deepEqual(sandbox.sendMessageCalls, []);
    assert.deepEqual(workMessages, ['当前 Work DOM']);
    coordinator.dispose();
  });
});

test('Chat history actions keep Chat routing even after the Work context menu was last used', async () => {
  await withIntegration(async (integration) => {
    await integration.initialize({ agent: true });
    const workSession = integration.workStore.getSession(integration.sessionA.id);
    let chatRenameCount = 0;
    let chatDeleteCount = 0;
    const sandbox = {
      conversationContextKind: 'work',
      workRendererBindings: integration.bindings,
      api: {
        ...integration.api,
        async renameChatSession(sessionId, title) { chatRenameCount += 1; return { activeSessionId: sessionId, messages: [], sessions: [{ id: sessionId, title }] }; },
        async deleteChatSession(sessionId) { chatDeleteCount += 1; return { activeSessionId: '', messages: [], sessions: [] }; }
      },
      openInputDialog: async () => ({ title: '聊天标题已改' }),
      showNotice() {},
      errorText: (error) => String(error?.message || error),
      applyChatState() {},
      window: { confirm: () => true }
    };
    const rename = loadRendererFunction(sandbox, 'async function renameConversationSession(', '\nasync function deleteConversationSession(', 'renameConversationSession');
    const remove = loadRendererFunction(sandbox, 'async function deleteConversationSession(', '\nfunction voiceConfig()', 'deleteConversationSession');
    const chatSession = { id: 'chat-history-session', title: '旧聊天标题' };
    integration.bindings.activateMode('chat');
    assert.equal(await rename(chatSession, 'chat'), true);
    assert.equal(await remove(chatSession, 'chat'), true);
    assert.equal(chatRenameCount, 1);
    assert.equal(chatDeleteCount, 1);
    assert.ok(integration.workStore.getSession(workSession.id), 'stale Work menu state must not route Chat actions into WorkStore');
    assert.equal(integration.apiCalls.some((call) => ['agent:rename-work-session', 'agent:delete-work-session'].includes(call.channel)), false);
  });
});

test('a Chat proactive greeting updates Chat memory and metadata while Work is visible, then renders on return', async () => {
  const metadata = [];
  const coordinator = createChatTurnCoordinator({
    api: { async getChatState() { return { activeSessionId: 'chat-session', sessions: [{ id: 'chat-session', messageCount: 2 }] }; } },
    onApplySessionMetadata: (state) => metadata.push(state)
  });
  coordinator.applyChatState({ activeSessionId: 'chat-session', messages: [] });
  const integration = createIntegration();
  const rendered = [];
  const sandbox = {
    selectedRuntimeMode: 'agent',
    chatTurnCoordinator: coordinator,
    conversation: [{ role: 'user', content: '先前的 Chat 消息' }],
    runtimeSessions: [],
    voiceCallActive: false,
    MAX_RENDER_CONTEXT_MESSAGES: 30,
    addMessage: (...args) => rendered.push(args),
    setMood: () => assert.fail('hidden Chat mood must not render into Work mode'),
    voiceConfig: () => ({ autoReadReplies: false }),
    speakText: () => assert.fail('hidden Chat greeting must not trigger visible Work voice effects'),
    api: { getChatState: async () => ({ activeSessionId: 'chat-session', sessions: [{ id: 'chat-session', messageCount: 2 }] }) },
    refreshLifeState: async () => {}
  };
  try {
    await integration.initialize();
    integration.bindings.activateMode('agent');
    await waitFor(() => integration.bindings.getExplorerState().listings.has(''), 'Work Workspace root should load before the greeting test');
    const greeting = loadProactiveGreetingCallback(sandbox);
    await greeting({ id: 'greeting-1', sessionId: 'chat-session', content: 'Work 期间到来的 Chat 问候', createdAt: '2026-10-20T00:00:00.000Z' });
    assert.equal(sandbox.conversation.at(-1).content, 'Work 期间到来的 Chat 问候');
    assert.equal(rendered.length, 0);
    assert.equal(metadata.length, 1);
    integration.bindings.activateMode('chat');
    sandbox.selectedRuntimeMode = 'chat';
    const loadHistory = loadRendererFunction({
      conversation: [],
      messagesElement: { innerHTML: '' },
      addMessage: (...args) => rendered.push(args),
      MAX_RENDER_CONTEXT_MESSAGES: 30,
      setMood() {}
    }, 'function loadHistory(history)', '\ncomposer.addEventListener(', 'loadHistory');
    loadHistory(sandbox.conversation);
    assert.ok(rendered.some(([role, content]) => role === 'assistant' && content === 'Work 期间到来的 Chat 问候'));
  } finally {
    integration.dispose();
    fs.rmSync(integration.root, { recursive: true, force: true });
    coordinator.dispose();
  }
});
