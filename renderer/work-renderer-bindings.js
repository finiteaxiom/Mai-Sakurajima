(function attachWorkRendererBindings() {
'use strict';

const workControllerApi = typeof window !== 'undefined'
  ? window.MaiWorkRendererController
  : require('./work-renderer-controller');
const explorerControllerApi = typeof window !== 'undefined'
  ? window.MaiWorkspaceExplorerController
  : require('./workspace-explorer-controller');

function createWorkRendererBindings(options = {}) {
  const api = options.api || {};
  let workController = null;
  const explorerController = explorerControllerApi.createWorkspaceExplorerController({
    api,
    getViewIdentity: () => workController?.getIdentity() || null,
    onStateChange: options.onExplorerStateChange,
    onNotice: options.onNotice
  });

  function refreshCurrentWorkView(expectedIdentity = workController?.getIdentity()) {
    if (!workController || !expectedIdentity || expectedIdentity.mode !== 'agent'
      || !workController.isViewCurrent(expectedIdentity)) return;
    const startedIdentity = { ...expectedIdentity };
    Promise.all([workController.refreshRuntimeStatus(), workController.refreshWorkData()]).then(([, refreshed]) => {
      const current = workController?.getIdentity();
      if (!current || !workController.isViewCurrent(startedIdentity)
        || refreshed?.identity?.generation !== startedIdentity.generation
        || current.mode !== startedIdentity.mode || current.projectId !== startedIdentity.projectId
        || current.workSessionId !== startedIdentity.workSessionId
        || current.workspacePath !== startedIdentity.workspacePath) return;
      if (current.workspacePath) return explorerController.refresh(startedIdentity);
      return undefined;
    }).catch(() => {});
  }

  workController = workControllerApi.createWorkRendererController({
    api,
    onStateChange: options.onWorkStateChange,
    onNotice: options.onNotice,
    onBusySelection: options.onBusySelection,
    onActionResult: options.onActionResult,
    onViewChange: (identity) => {
      explorerController.activateView(identity);
      if (identity.mode === 'agent' && identity.workspacePath && !explorerController.getState().listings.has('')) {
        explorerController.loadDirectory('', identity).catch(() => {});
      }
    },
    onWorkspaceRefresh: (identity) => explorerController.refresh(identity),
    onExecutionSettled: refreshCurrentWorkView,
    onStaleExecutionSettled: refreshCurrentWorkView
  });

  return {
    activateMode: (mode) => workController.activateMode(mode),
    cancelAction: (identity) => workController.cancelAction(identity),
    closeWorkspacePreview: (identity) => explorerController.closePreview(identity),
    configureEnabled: (identity) => workController.configureEnabled(identity),
    createProject: (name, identity) => workController.createProject(name, identity),
    async createWorkSession(identity) {
      const session = await workController.createWorkSession(identity);
      return session ? { ...session, rendererViewIdentity: workController.getIdentity() } : null;
    },
    deleteSession: (projectId, sessionId, identity) => workController.deleteSession(projectId, sessionId, identity),
    dispose() {
      workController.dispose();
      explorerController.dispose();
    },
    async executeAction(content, workspaceSelection, identity) {
      const response = await workController.executeAction(content, workspaceSelection, identity);
      return response ? { ...response, rendererViewIdentity: workController.getIdentity() } : null;
    },
    getExplorerIdentity: () => explorerController.getIdentity(),
    getExplorerState: () => explorerController.getState(),
    getIdentity: () => workController.getIdentity(),
    getState: () => workController.getState(),
    isCurrentModeBusy: (mode, chatState) => workController.isCurrentModeBusy(mode, chatState),
    isViewCurrent: (identity) => workController.isViewCurrent(identity),
    loadWorkspaceDirectory: (relativePath, identity) => explorerController.loadDirectory(relativePath, identity),
    markWorkspaceStale: (identity) => explorerController.setStale(identity),
    refreshRuntimeStatus: () => workController.refreshRuntimeStatus(),
    refreshWorkData: () => workController.refreshWorkData(),
    refreshWorkspace: (identity) => explorerController.refresh(identity),
    renameProject: (projectId, name, identity) => workController.renameProject(projectId, name, identity),
    renameSession: (projectId, sessionId, title, identity) => workController.renameSession(projectId, sessionId, title, identity),
    selectProject: (projectId, identity) => workController.selectProject(projectId, identity),
    selectSession: (projectId, sessionId, identity) => workController.selectSession(projectId, sessionId, identity),
    selectWorkspace: (identity) => workController.selectWorkspace(identity),
    selectWorkspaceEntry: (entry, identity) => explorerController.selectEntry(entry, identity),
    setInitialData: (state) => workController.setInitialData(state),
    setInitialRuntimeStatus: (status) => workController.setInitialRuntimeStatus(status)
  };
}

const api = { createWorkRendererBindings };
if (typeof module === 'object' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.MaiWorkRendererBindings = api;
})();
