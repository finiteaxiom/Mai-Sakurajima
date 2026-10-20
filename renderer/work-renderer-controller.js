(function attachWorkRendererController() {
'use strict';

function copy(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function sameIdentity(left, right) {
  return Boolean(left && right)
    && left.mode === right.mode
    && left.generation === right.generation
    && left.projectId === right.projectId
    && left.workSessionId === right.workSessionId
    && left.workspacePath === right.workspacePath;
}

function createWorkRendererController(options = {}) {
  const api = options.api || {};
  let disposed = false;
  let view = { mode: 'chat', generation: 0, projectId: '', workSessionId: '', workspacePath: '' };
  let projects = [];
  let sessions = [];
  let lastOpenedProjectId = '';
  let runtimeStatus = { enabled: false, available: false, reason: '' };
  let activeActionSessionId = '';
  let activeTaskId = '';
  let actionEvents = [];
  let activeExecution = null;
  let cancelOperation = null;
  let workDataRequestId = 0;
  let statusRequestId = 0;
  let actionSessionProjectionGeneration = 0;
  let selectionRequestId = 0;
  let listenerDisposers = [];
  let operationSequence = 0;

  function getIdentity() {
    return { ...view };
  }

  function isViewCurrent(identity) {
    return !disposed && sameIdentity(identity, view);
  }

  function isOperationCurrent(operation) {
    return !disposed && activeExecution === operation && isViewCurrent(operation.identity);
  }

  function findProject(projectId) {
    return projects.find((project) => project.id === projectId) || null;
  }

  function findSession(sessionId) {
    return sessions.find((session) => session.id === sessionId) || null;
  }

  function isBusy() {
    return Boolean(activeExecution || runtimeStatus.activeSessionId);
  }

  function getState() {
    const project = findProject(view.projectId);
    return {
      mode: view.mode,
      identity: getIdentity(),
      projects: copy(projects),
      sessions: copy(sessions),
      lastOpenedProjectId,
      projectId: view.projectId,
      workSessionId: view.workSessionId,
      project,
      session: findSession(view.workSessionId),
      runtimeStatus: copy(runtimeStatus),
      activeActionSessionId,
      activeTaskId,
      events: copy(actionEvents),
      busy: isBusy(),
      executionPending: Boolean(activeExecution),
      cancelPending: Boolean(cancelOperation),
      disposed
    };
  }

  function notify() {
    if (!disposed) options.onStateChange?.(getState());
  }

  function replaceView(next = {}) {
    const projectId = String(next.projectId ?? view.projectId);
    const workSessionId = String(next.workSessionId ?? view.workSessionId);
    const workspacePath = String(next.workspacePath ?? findProject(projectId)?.workspacePath ?? '');
    const mode = next.mode === undefined ? view.mode : (next.mode === 'agent' ? 'agent' : 'chat');
    if (view.mode === mode && view.projectId === projectId && view.workSessionId === workSessionId
      && view.workspacePath === workspacePath) return false;
    const previous = view;
    view = { mode, generation: view.generation + 1, projectId, workSessionId, workspacePath };
    workDataRequestId += 1;
    statusRequestId += 1;
    if (mode !== 'agent' || previous.mode !== mode || previous.projectId !== projectId
      || previous.workSessionId !== workSessionId || previous.workspacePath !== workspacePath) {
      activeActionSessionId = '';
      activeTaskId = '';
      actionEvents = [];
    }
    options.onViewChange?.(getIdentity(), { previous: { ...previous } });
    return true;
  }

  function applyWorkData(state, expectedIdentity) {
    if (expectedIdentity && !isViewCurrent(expectedIdentity)) return false;
    projects = Array.isArray(state?.projects) ? copy(state.projects) : [];
    sessions = Array.isArray(state?.sessions) ? copy(state.sessions) : [];
    lastOpenedProjectId = String(state?.lastOpenedProjectId || '');
    const nextProjectId = projects.some((project) => project.id === view.projectId)
      ? view.projectId
      : (projects.some((project) => project.id === lastOpenedProjectId)
        ? lastOpenedProjectId
        : (projects[0]?.id || ''));
    const projectSessions = sessions.filter((session) => session.projectId === nextProjectId);
    const nextSessionId = projectSessions.some((session) => session.id === view.workSessionId)
      ? view.workSessionId
      : (projectSessions[0]?.id || '');
    replaceView({ projectId: nextProjectId, workSessionId: nextSessionId, workspacePath: findProject(nextProjectId)?.workspacePath || '' });
    return true;
  }

  function setInitialData(state) {
    if (disposed) return false;
    applyWorkData(state);
    notify();
    return true;
  }

  function setInitialRuntimeStatus(status) {
    if (disposed) return false;
    runtimeStatus = status && typeof status === 'object'
      ? { enabled: status.enabled === true, available: status.available === true, reason: String(status.reason || ''), activeSessionId: String(status.activeSessionId || '') || null }
      : { enabled: false, available: false, reason: '', activeSessionId: null };
    notify();
    return true;
  }

  async function refreshWorkData() {
    if (disposed || typeof api.getWorkData !== 'function') return null;
    const identity = getIdentity();
    const requestId = ++workDataRequestId;
    try {
      const state = await api.getWorkData();
      if (!isViewCurrent(identity) || requestId !== workDataRequestId) return null;
      applyWorkData(state, identity);
      notify();
      return getState();
    } catch (error) {
      if (!isViewCurrent(identity) || requestId !== workDataRequestId) return null;
      projects = [];
      sessions = [];
      lastOpenedProjectId = '';
      replaceView({ projectId: '', workSessionId: '', workspacePath: '' });
      options.onNotice?.(error);
      notify();
      return null;
    }
  }

  async function refreshRuntimeStatus() {
    if (disposed || typeof api.getActionStatus !== 'function') return null;
    const identity = getIdentity();
    const requestId = ++statusRequestId;
    const executionId = activeExecution?.id || 0;
    const sessionProjection = actionSessionProjectionGeneration;
    let nextStatus;
    try {
      nextStatus = await api.getActionStatus();
    } catch (error) {
      if (!isViewCurrent(identity) || requestId !== statusRequestId
        || executionId !== (activeExecution?.id || 0)
        || sessionProjection !== actionSessionProjectionGeneration) return null;
      runtimeStatus = { enabled: false, available: false, reason: String(error?.message || '无法读取 Work 状态。') };
      options.onNotice?.(error);
      notify();
      return getState();
    }
    if (!isViewCurrent(identity) || requestId !== statusRequestId
      || executionId !== (activeExecution?.id || 0)
      || sessionProjection !== actionSessionProjectionGeneration) return null;
    runtimeStatus = nextStatus && typeof nextStatus === 'object'
      ? { enabled: nextStatus.enabled === true, available: nextStatus.available === true, reason: String(nextStatus.reason || ''), activeSessionId: String(nextStatus.activeSessionId || '') || null }
      : { enabled: false, available: false, reason: '无法读取 Work 状态。', activeSessionId: null };
    if (!runtimeStatus.activeSessionId || runtimeStatus.activeSessionId === activeActionSessionId) {
      if (!runtimeStatus.activeSessionId && !activeExecution) {
        activeActionSessionId = '';
        activeTaskId = '';
      }
    }
    notify();
    return getState();
  }

  async function configureEnabled(expectedIdentity = getIdentity()) {
    if (disposed || !isViewCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent') return null;
    if (typeof api.configureAction !== 'function') throw new TypeError('Work configuration is unavailable.');
    try {
      const status = await api.configureAction({ enabled: true });
      if (!isViewCurrent(expectedIdentity)) return null;
      runtimeStatus = status && typeof status === 'object'
        ? { enabled: status.enabled === true, available: status.available === true, reason: String(status.reason || ''), activeSessionId: String(status.activeSessionId || '') || null }
        : runtimeStatus;
      notify();
      return getState();
    } catch (error) {
      if (isViewCurrent(expectedIdentity)) options.onNotice?.(error);
      throw error;
    }
  }

  async function selectProject(projectId, expectedIdentity = getIdentity()) {
    const targetId = String(projectId || '');
    if (disposed || !isViewCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent') return false;
    if (isBusy()) { options.onBusySelection?.(); return false; }
    const target = findProject(targetId);
    if (!target || targetId === view.projectId) return false;
    const previous = getIdentity();
    const requestId = ++selectionRequestId;
    replaceView({ mode: 'agent', projectId: target.id, workSessionId: '', workspacePath: target.workspacePath || '' });
    const selectedIdentity = getIdentity();
    notify();
    try {
      await api.openWorkProject(target.id);
      if (!isViewCurrent(selectedIdentity) || requestId !== selectionRequestId) return false;
      const refreshed = await refreshWorkData();
      return Boolean(refreshed && refreshed.mode === 'agent' && refreshed.projectId === target.id
        && isViewCurrent(refreshed.identity) && requestId === selectionRequestId);
    } catch (error) {
      if (isViewCurrent(selectedIdentity) && requestId === selectionRequestId) {
        replaceView(previous);
        options.onNotice?.(error);
        notify();
      }
      return false;
    }
  }

  async function selectSession(projectId, workSessionId, expectedIdentity = getIdentity()) {
    const targetProjectId = String(projectId || '');
    const targetSessionId = String(workSessionId || '');
    if (disposed || !isViewCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent') return false;
    if (isBusy()) { options.onBusySelection?.(); return false; }
    const target = findSession(targetSessionId);
    if (!target || target.projectId !== targetProjectId) return false;
    if (targetProjectId === view.projectId && targetSessionId === view.workSessionId) return false;
    const previous = getIdentity();
    const requestId = ++selectionRequestId;
    const project = findProject(targetProjectId);
    replaceView({ mode: 'agent', projectId: targetProjectId, workSessionId: targetSessionId, workspacePath: project?.workspacePath || '' });
    const selectedIdentity = getIdentity();
    notify();
    try {
      if (targetProjectId !== previous.projectId) await api.openWorkProject(targetProjectId);
      if (!isViewCurrent(selectedIdentity) || requestId !== selectionRequestId) return false;
      const refreshed = await refreshWorkData();
      return Boolean(refreshed && refreshed.mode === 'agent' && refreshed.projectId === targetProjectId
        && refreshed.workSessionId === targetSessionId && isViewCurrent(refreshed.identity)
        && requestId === selectionRequestId);
    } catch (error) {
      if (isViewCurrent(selectedIdentity) && requestId === selectionRequestId) {
        replaceView(previous);
        options.onNotice?.(error);
        notify();
      }
      return false;
    }
  }

  async function createWorkSession(expectedIdentity = getIdentity(), optionsForCreate = {}) {
    const operation = optionsForCreate.operation || null;
    if (disposed || expectedIdentity.mode !== 'agent'
      || (operation
        ? (operation.identity !== expectedIdentity || !isOperationCurrent(operation))
        : !isViewCurrent(expectedIdentity))) return null;
    const projectId = view.projectId;
    if (!projectId || typeof api.createWorkSession !== 'function') return null;
    const session = await api.createWorkSession({ projectId });
    if (operation ? !isOperationCurrent(operation) : !isViewCurrent(expectedIdentity)) return null;
    if (!session?.id || session.projectId !== projectId) return null;
    if (!sessions.some((item) => item.id === session.id)) sessions = [...sessions, copy(session)];
    replaceView({ mode: 'agent', projectId, workSessionId: session.id, workspacePath: findProject(projectId)?.workspacePath || '' });
    if (operation) operation.identity = getIdentity();
    notify();
    return copy(session);
  }

  async function createProject(name, expectedIdentity = getIdentity()) {
    if (disposed || !isViewCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent' || isBusy()) return null;
    const project = await api.createWorkProject({ name });
    if (!isViewCurrent(expectedIdentity)) return null;
    if (!project?.id) return null;
    projects = [...projects, copy(project)];
    replaceView({ mode: 'agent', projectId: project.id, workSessionId: '', workspacePath: project.workspacePath || '' });
    notify();
    const refreshed = await refreshWorkData();
    return refreshed && refreshed.mode === 'agent' && refreshed.projectId === project.id
      && isViewCurrent(refreshed.identity) ? copy(project) : null;
  }

  async function renameProject(projectId, name, expectedIdentity = getIdentity()) {
    if (disposed || !isViewCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent'
      || String(projectId || '') !== expectedIdentity.projectId || isBusy()) return false;
    await api.renameWorkProject({ projectId, name });
    if (!isViewCurrent(expectedIdentity)) return false;
    const refreshed = await refreshWorkData();
    return Boolean(refreshed && refreshed.mode === 'agent' && refreshed.projectId === expectedIdentity.projectId
      && isViewCurrent(refreshed.identity));
  }

  async function renameSession(projectId, workSessionId, title, expectedIdentity = getIdentity()) {
    const targetProjectId = String(projectId || '');
    const target = findSession(String(workSessionId || ''));
    if (disposed || !isViewCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent'
      || !findProject(targetProjectId) || !target || target.projectId !== targetProjectId || isBusy()) return false;
    await api.renameWorkSession({ projectId: targetProjectId, workSessionId, title });
    if (!isViewCurrent(expectedIdentity)) return false;
    const refreshed = await refreshWorkData();
    return Boolean(refreshed && refreshed.mode === 'agent' && refreshed.projectId === expectedIdentity.projectId
      && isViewCurrent(refreshed.identity));
  }

  async function deleteSession(projectId, workSessionId, expectedIdentity = getIdentity()) {
    const targetProjectId = String(projectId || '');
    const target = findSession(String(workSessionId || ''));
    if (disposed || !isViewCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent'
      || !findProject(targetProjectId) || !target || target.projectId !== targetProjectId || isBusy()) return false;
    await api.deleteWorkSession({ projectId: targetProjectId, workSessionId });
    if (!isViewCurrent(expectedIdentity)) return false;
    if (view.workSessionId === workSessionId) replaceView({ workSessionId: '' });
    const refreshed = await refreshWorkData();
    return Boolean(refreshed && refreshed.mode === 'agent' && refreshed.projectId === expectedIdentity.projectId
      && isViewCurrent(refreshed.identity));
  }

  async function selectWorkspace(expectedIdentity = getIdentity()) {
    if (disposed || !isViewCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent' || isBusy()) return false;
    if (!view.projectId) return false;
    try {
      await api.selectActionWorkspace(view.projectId);
      if (!isViewCurrent(expectedIdentity)) return false;
      const selectedProjectId = expectedIdentity.projectId;
      const refreshed = await refreshWorkData();
      if (!refreshed || refreshed.mode !== 'agent' || refreshed.projectId !== selectedProjectId
        || !isViewCurrent(refreshed.identity)) return false;
      await options.onWorkspaceRefresh?.(refreshed.identity);
      return isViewCurrent(refreshed.identity);
    } catch (error) {
      if (isViewCurrent(expectedIdentity)) options.onNotice?.(error);
      return false;
    }
  }

  function acceptStartedSession(operation, session) {
    if (!isOperationCurrent(operation) || !session?.id || operation.baselineSessionIds.has(String(session.id))) return false;
    if (session.status !== 'running' || String(session.projectId || '') !== operation.projectId
      || String(session.workSessionId || '') !== operation.workSessionId) return false;
    const createdAt = Date.parse(session.createdAt || '');
    if (Number.isFinite(createdAt) && createdAt < operation.startedAt) return false;
    const verificationId = ++operation.startedVerificationId;
    const statusPromise = typeof api.getActionStatus === 'function' ? api.getActionStatus() : Promise.resolve(null);
    const sessionPromise = typeof api.getActionSession === 'function' ? api.getActionSession(session.id) : Promise.resolve(session);
    Promise.all([statusPromise, sessionPromise]).then(([status, storedSession]) => {
      if (!isOperationCurrent(operation) || verificationId !== operation.startedVerificationId) return;
      const confirmed = status?.activeSessionId === session.id
        || (storedSession?.id === session.id && storedSession.status !== 'running'
          && storedSession.projectId === operation.projectId
          && storedSession.workSessionId === operation.workSessionId
          && String(storedSession.request?.text || '') === operation.content);
      if (!confirmed) return;
      operation.sessionId = session.id;
      operation.taskId = String(storedSession?.task?.taskId || session.task?.taskId || '');
      actionSessionProjectionGeneration += 1;
      statusRequestId += 1;
      activeActionSessionId = session.id;
      activeTaskId = operation.taskId;
      if (status && typeof status === 'object') {
        runtimeStatus = { enabled: status.enabled === true, available: status.available === true, reason: String(status.reason || ''), activeSessionId: String(status.activeSessionId || '') || null };
      }
      for (const event of operation.pendingEvents.splice(0)) projectActionEvent(operation, event);
      notify();
    }).catch(() => {});
    return true;
  }

  function projectActionEvent(operation, agentEvent) {
    if (!isOperationCurrent(operation) || !operation.sessionId || agentEvent?.sessionId !== operation.sessionId) return false;
    const taskId = String(agentEvent?.taskId || '');
    if (!taskId) return false;
    if (!operation.taskId) {
      if (agentEvent.type !== 'TaskStarted') return false;
      operation.taskId = taskId;
      activeTaskId = taskId;
    }
    if (taskId !== operation.taskId) return false;
    actionEvents = [...actionEvents, copy(agentEvent)].slice(-100);
    notify();
    return true;
  }

  function handleActionSessionStarted(session) {
    const operation = activeExecution;
    if (!operation || !isOperationCurrent(operation)) return false;
    return acceptStartedSession(operation, session);
  }

  function handleAgentEvent(agentEvent) {
    const operation = activeExecution;
    if (!operation || !isOperationCurrent(operation) || !agentEvent?.sessionId) return false;
    if (!operation.sessionId) {
      if (operation.pendingEvents.length < 128) operation.pendingEvents.push(copy(agentEvent));
      return true;
    }
    return projectActionEvent(operation, agentEvent);
  }

  async function executeAction(content, workspaceSelection = '', expectedIdentity = getIdentity()) {
    const text = String(content || '').trim();
    if (disposed || !text || !isViewCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent'
      || isBusy() || runtimeStatus.available !== true || !view.projectId) return null;
    const project = findProject(view.projectId);
    if (!project) return null;
    const operation = {
      id: ++operationSequence,
      identity: getIdentity(),
      projectId: project.id,
      workSessionId: view.workSessionId,
      workspacePath: view.workspacePath,
      content: text,
      startedAt: 0,
      baselineSessionIds: new Set(),
      pendingEvents: [],
      sessionId: '',
      taskId: '',
      startedVerificationId: 0
    };
    activeExecution = operation;
    statusRequestId += 1;
    actionSessionProjectionGeneration += 1;
    activeActionSessionId = '';
    activeTaskId = '';
    actionEvents = [];
    notify();
    let response = null;
    try {
      if (!operation.workSessionId) {
        const created = await createWorkSession(operation.identity, { operation });
        if (!created || !isOperationCurrent(operation)) return null;
        operation.workSessionId = created.id;
      }
      if (typeof api.listActionSessions === 'function') {
        const knownSessions = await api.listActionSessions();
        if (!isOperationCurrent(operation)) return null;
        operation.baselineSessionIds = new Set((Array.isArray(knownSessions) ? knownSessions : []).map((session) => String(session?.id || '')).filter(Boolean));
      }
      operation.startedAt = Date.now();
      response = await api.executeAction({
        text,
        projectId: operation.projectId,
        workSessionId: operation.workSessionId,
        workspaceSelection: String(workspaceSelection || '')
      });
      if (!isOperationCurrent(operation)) return null;
      const session = response?.session;
      if (session?.id && session.projectId === operation.projectId && session.workSessionId === operation.workSessionId) {
        operation.sessionId = String(session.id);
        operation.taskId = String(session.task?.taskId || operation.taskId || '');
        activeActionSessionId = operation.sessionId;
        activeTaskId = operation.taskId;
        if (session.status !== 'running') runtimeStatus = { ...runtimeStatus, activeSessionId: null };
      }
      if (session?.status !== 'completed') options.onActionResult?.(response, operation.identity);
      notify();
      return response;
    } catch (error) {
      if (isOperationCurrent(operation)) options.onNotice?.(error);
      return null;
    } finally {
      if (activeExecution === operation) {
        const current = isViewCurrent(operation.identity);
        activeExecution = null;
        if (!response?.session || response.session.status !== 'running') {
          runtimeStatus = { ...runtimeStatus, activeSessionId: null };
        }
        if (current) {
          notify();
          options.onExecutionSettled?.(getIdentity());
        } else if (!disposed && view.mode === 'agent') {
          // A fresh read is bound to the new view; the stale operation itself
          // never projects its result or cleanup into that view.
          options.onStaleExecutionSettled?.(getIdentity());
        }
      }
    }
  }

  async function cancelAction(expectedIdentity = getIdentity()) {
    if (disposed || !isViewCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent' || cancelOperation) return null;
    const sessionId = String(activeActionSessionId || runtimeStatus.activeSessionId || '');
    if (!sessionId || typeof api.cancelAction !== 'function') return null;
    const operation = { id: ++operationSequence, identity: getIdentity(), sessionId };
    cancelOperation = operation;
    notify();
    try {
      const result = await api.cancelAction(sessionId);
      if (cancelOperation !== operation || !isViewCurrent(operation.identity)) return null;
      return result;
    } catch (error) {
      if (cancelOperation === operation && isViewCurrent(operation.identity)) options.onNotice?.(error);
      return null;
    } finally {
      if (cancelOperation === operation) {
        const current = isViewCurrent(operation.identity);
        cancelOperation = null;
        if (current) notify();
      }
    }
  }

  function attachListener(register, callback) {
    if (typeof register !== 'function') return;
    try {
      const disposeListener = register(callback);
      if (typeof disposeListener === 'function') listenerDisposers.push(disposeListener);
    } catch { /* An unavailable event channel cannot own Renderer lifecycle. */ }
  }

  attachListener(api.onActionSessionStarted, handleActionSessionStarted);
  attachListener(api.onAgentEvent, handleAgentEvent);

  function dispose() {
    if (disposed) return false;
    disposed = true;
    workDataRequestId += 1;
    statusRequestId += 1;
    selectionRequestId += 1;
    activeExecution = null;
    cancelOperation = null;
    actionSessionProjectionGeneration += 1;
    activeActionSessionId = '';
    activeTaskId = '';
    actionEvents = [];
    for (const disposeListener of listenerDisposers.splice(0)) {
      try { disposeListener(); } catch { /* Release every remaining subscription. */ }
    }
    return true;
  }

  return {
    activateMode(mode) {
      if (disposed) return false;
      const changed = replaceView({ mode, projectId: view.projectId, workSessionId: view.workSessionId, workspacePath: view.workspacePath });
      if (changed) notify();
      return true;
    },
    cancelAction,
    configureEnabled,
    createProject,
    createWorkSession,
    deleteSession,
    dispose,
    executeAction,
    getIdentity,
    getState,
    isBusy,
    isCurrentModeBusy(mode, chatState = {}) {
      return mode === 'agent' ? isBusy() : Boolean(chatState?.busy);
    },
    isViewCurrent,
    refreshRuntimeStatus,
    refreshWorkData,
    renameProject,
    renameSession,
    selectProject,
    selectSession,
    selectWorkspace,
    setInitialData,
    setInitialRuntimeStatus
  };
}

const api = { createWorkRendererController };
if (typeof module === 'object' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.MaiWorkRendererController = api;
})();
