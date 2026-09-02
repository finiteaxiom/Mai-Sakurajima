const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maiPet', {
  getSettings: () => ipcRenderer.invoke('pet:get-settings'),
  getContext: () => ipcRenderer.invoke('pet:get-context'),
  moveWindow: (x, y) => ipcRenderer.send('pet:move-window', x, y),
  endDrag: () => ipcRenderer.send('pet:drag-end'),
  showContextMenu: () => ipcRenderer.send('pet:context-menu'),
  hide: () => ipcRenderer.send('pet:hide'),
  openChat: () => ipcRenderer.send('pet:open-chat'),
  openTimer: () => ipcRenderer.send('pet:open-timer'),
  openAssistant: (tab) => ipcRenderer.send('pet:open-assistant', tab),
  setHovering: (hovered) => ipcRenderer.send('pet:hover-changed', hovered),
  setInvisibleMode: (enabled) => ipcRenderer.invoke('pet:set-invisible-mode', enabled),
  onAction: (callback) => {
    ipcRenderer.on('pet:action', (_event, action) => callback(action));
  },
  onAiReply: (callback) => {
    ipcRenderer.on('pet:ai-reply', (_event, payload) => callback(payload));
  },
  onProactiveGreeting: (callback) => {
    ipcRenderer.on('pet:proactive-greeting', (_event, payload) => callback(payload));
  },
  onReminder: (callback) => {
    ipcRenderer.on('pet:reminder', (_event, payload) => callback(payload));
  },
  onInvisibleMode: (callback) => {
    ipcRenderer.on('pet:invisible-mode', (_event, enabled) => callback(enabled));
  },
  onSyndromeVisible: (callback) => {
    ipcRenderer.on('pet:syndrome-visible', (_event, payload) => callback(payload));
  },
  getTimerState: () => ipcRenderer.invoke('timer:get-state'),
  startTimer: (input) => ipcRenderer.invoke('timer:start', input),
  cancelTimer: () => ipcRenderer.invoke('timer:cancel'),
  onTimerState: (callback) => {
    ipcRenderer.on('timer:state', (_event, state) => callback(state));
  },
  getChatConfig: () => ipcRenderer.invoke('chat:get-config'),
  setWallpaper: (wallpaperId) => ipcRenderer.invoke('chat:set-wallpaper', wallpaperId),
  chooseCustomWallpaper: () => ipcRenderer.invoke('chat:choose-custom-wallpaper'),
  clearCustomWallpaper: () => ipcRenderer.invoke('chat:clear-custom-wallpaper'),
  setAppearance: (appearance) => ipcRenderer.invoke('chat:set-appearance', appearance),
  chooseCustomAvatar: (target) => ipcRenderer.invoke('chat:choose-custom-avatar', target),
  clearCustomAvatar: (target) => ipcRenderer.invoke('chat:clear-custom-avatar', target),
  saveChatConfig: (config) => ipcRenderer.invoke('chat:save-config', config),
  clearApiKey: () => ipcRenderer.invoke('chat:clear-api-key'),
  testChatConnection: () => ipcRenderer.invoke('chat:test-connection'),
  getVoiceCapabilities: () => ipcRenderer.invoke('voice:get-capabilities'),
  getLocalVoiceStatus: () => ipcRenderer.invoke('voice:get-local-status'),
  installLocalVoice: () => ipcRenderer.invoke('voice:install-local'),
  cancelLocalVoiceInstall: () => ipcRenderer.invoke('voice:cancel-local-install'),
  synthesizeLocalVoice: (input) => ipcRenderer.invoke('voice:synthesize', input),
  analyzeVoiceAudio: (input) => ipcRenderer.invoke('voice:analyze-audio', input),
  listenVoice: (input) => ipcRenderer.invoke('voice:listen', input),
  stopVoiceListening: () => ipcRenderer.invoke('voice:stop-listening'),
  onLocalVoiceStatus: (callback) => {
    ipcRenderer.on('voice:local-status', (_event, status) => callback(status));
  },
  onVoiceStreamDelta: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('chat:voice-stream-delta', listener);
    return () => ipcRenderer.removeListener('chat:voice-stream-delta', listener);
  },
  getActionStatus: () => ipcRenderer.invoke('agent:get-status'),
  configureAction: (input) => ipcRenderer.invoke('agent:configure', input),
  executeAction: (input) => ipcRenderer.invoke('agent:execute', input),
  getWorkData: () => ipcRenderer.invoke('agent:get-work-data'),
  createWorkProject: (input) => ipcRenderer.invoke('agent:create-project', input),
  renameWorkProject: (input) => ipcRenderer.invoke('agent:rename-project', input),
  openWorkProject: (projectId) => ipcRenderer.invoke('agent:open-project', projectId),
  createWorkSession: (input) => ipcRenderer.invoke('agent:create-work-session', input),
  getWorkSession: (sessionId) => ipcRenderer.invoke('agent:get-work-session', sessionId),
  renameWorkSession: (input) => ipcRenderer.invoke('agent:rename-work-session', input),
  deleteWorkSession: (input) => ipcRenderer.invoke('agent:delete-work-session', input),
  cancelAction: (sessionId) => ipcRenderer.invoke('agent:cancel', sessionId),
  getActionWorkspace: (projectId) => ipcRenderer.invoke('agent:get-workspace', projectId),
  selectActionWorkspace: (projectId) => ipcRenderer.invoke('agent:select-workspace', projectId),
  listActionWorkspaceDirectory: (input) => ipcRenderer.invoke('agent:list-workspace-directory', input),
  previewActionWorkspaceFile: (input) => ipcRenderer.invoke('agent:preview-workspace-file', input),
  getChatWorkspaceCapability: (input) => ipcRenderer.invoke('workspace-capability:status', input),
  selectChatWorkspaceCapability: (input) => ipcRenderer.invoke('workspace-capability:select', input),
  revokeChatWorkspaceCapability: (input) => ipcRenderer.invoke('workspace-capability:revoke', input),
  executeChatWorkspaceCapability: (input) => ipcRenderer.invoke('workspace-capability:execute', input),
  getActionSession: (sessionId) => ipcRenderer.invoke('agent:get-session', sessionId),
  listActionSessions: () => ipcRenderer.invoke('agent:list-sessions'),
  onActionSessionStarted: (callback) => {
    const listener = (_event, session) => callback(session);
    ipcRenderer.on('agent:session-started', listener);
    return () => ipcRenderer.removeListener('agent:session-started', listener);
  },
  onAgentEvent: (callback) => {
    const listener = (_event, agentEvent) => callback(agentEvent);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
  sendChat: (payload) => ipcRenderer.invoke('chat:send', payload),
  getChatHistory: () => ipcRenderer.invoke('chat:get-history'),
  getChatState: () => ipcRenderer.invoke('chat:get-state'),
  newChatSession: () => ipcRenderer.invoke('chat:new-session'),
  selectChatSession: (id) => ipcRenderer.invoke('chat:select-session', id),
  renameChatSession: (id, title) => ipcRenderer.invoke('chat:rename-session', id, title),
  deleteChatSession: (id) => ipcRenderer.invoke('chat:delete-session', id),
  clearChatHistory: () => ipcRenderer.invoke('chat:clear-history'),
  getMemories: () => ipcRenderer.invoke('chat:get-memories'),
  getMemoryDiagnostics: () => ipcRenderer.invoke('chat:get-memory-diagnostics'),
  rebuildMemories: () => ipcRenderer.invoke('chat:rebuild-memories'),
  addMemory: (input) => ipcRenderer.invoke('chat:add-memory', input),
  updateMemory: (id, input) => ipcRenderer.invoke('chat:update-memory', id, input),
  correctMemory: (id, action, input) => ipcRenderer.invoke('chat:correct-memory', id, action, input),
  deleteMemory: (id) => ipcRenderer.invoke('chat:delete-memory', id),
  clearMemory: () => ipcRenderer.invoke('chat:clear-memory'),
  getSharedLife: () => ipcRenderer.invoke('chat:get-shared-life'),
  rebuildSharedLife: () => ipcRenderer.invoke('chat:rebuild-shared-life'),
  updateEpisode: (id, input) => ipcRenderer.invoke('chat:update-episode', id, input),
  deleteEpisode: (id) => ipcRenderer.invoke('chat:delete-episode', id),
  setTopicStatus: (id, status) => ipcRenderer.invoke('chat:set-topic-status', id, status),
  deleteTopic: (id) => ipcRenderer.invoke('chat:delete-topic', id),
  getLifeHub: () => ipcRenderer.invoke('chat:get-life-hub'),
  rebuildLifeHub: () => ipcRenderer.invoke('chat:rebuild-life-hub'),
  addPerson: (input) => ipcRenderer.invoke('chat:add-person', input),
  updatePerson: (id, input) => ipcRenderer.invoke('chat:update-person', id, input),
  deletePerson: (id) => ipcRenderer.invoke('chat:delete-person', id),
  getContinuity: () => ipcRenderer.invoke('chat:get-continuity'),
  searchContinuity: (input) => ipcRenderer.invoke('chat:search-continuity', input),
  addProject: (input) => ipcRenderer.invoke('chat:add-project', input),
  updateProject: (id, input) => ipcRenderer.invoke('chat:update-project', id, input),
  deleteProject: (id) => ipcRenderer.invoke('chat:delete-project', id),
  addProjectStep: (projectId, input) => ipcRenderer.invoke('chat:add-project-step', projectId, input),
  updateProjectStep: (projectId, stepId, input) => ipcRenderer.invoke('chat:update-project-step', projectId, stepId, input),
  deleteProjectStep: (projectId, stepId) => ipcRenderer.invoke('chat:delete-project-step', projectId, stepId),
  addHabit: (input) => ipcRenderer.invoke('chat:add-habit', input),
  updateHabit: (id, input) => ipcRenderer.invoke('chat:update-habit', id, input),
  deleteHabit: (id) => ipcRenderer.invoke('chat:delete-habit', id),
  checkInHabit: (id, input) => ipcRenderer.invoke('chat:check-in-habit', id, input),
  getAssistantState: () => ipcRenderer.invoke('assistant:get-state'),
  saveAssistantSettings: (input) => ipcRenderer.invoke('assistant:save-settings', input),
  createAssistantBriefing: (type) => ipcRenderer.invoke('assistant:create-briefing', type),
  answerPromise: (id, response) => ipcRenderer.invoke('assistant:answer-promise', id, response),
  startFocusSession: (input) => ipcRenderer.invoke('assistant:start-focus', input),
  getKnowledgeState: () => ipcRenderer.invoke('knowledge:get-state'),
  searchKnowledge: (input) => ipcRenderer.invoke('knowledge:search', input),
  importKnowledgeFiles: (input) => ipcRenderer.invoke('knowledge:import-files', input),
  addKnowledgeNote: (input) => ipcRenderer.invoke('knowledge:add-note', input),
  addKnowledgeLibrary: (input) => ipcRenderer.invoke('knowledge:add-library', input),
  updateKnowledgeLibrary: (id, input) => ipcRenderer.invoke('knowledge:update-library', id, input),
  deleteKnowledgeLibrary: (id) => ipcRenderer.invoke('knowledge:delete-library', id),
  updateKnowledgeDocument: (id, input) => ipcRenderer.invoke('knowledge:update-document', id, input),
  deleteKnowledgeDocument: (id) => ipcRenderer.invoke('knowledge:delete-document', id),
  refreshKnowledge: () => ipcRenderer.invoke('knowledge:refresh'),
  locateSource: (input) => ipcRenderer.invoke('chat:locate-source', input),
  checkDatabase: () => ipcRenderer.invoke('chat:check-database'),
  repairDatabase: () => ipcRenderer.invoke('chat:repair-database'),
  listBackups: () => ipcRenderer.invoke('chat:list-backups'),
  createBackup: () => ipcRenderer.invoke('chat:create-backup'),
  restoreBackup: () => ipcRenderer.invoke('chat:restore-backup'),
  exportData: () => ipcRenderer.invoke('chat:export-data'),
  getLifeState: () => ipcRenderer.invoke('chat:get-life-state'),
  getMomentsState: () => ipcRenderer.invoke('chat:get-moments-state'),
  generateMoment: () => ipcRenderer.invoke('chat:generate-moment'),
  commentOnMoment: (input) => ipcRenderer.invoke('chat:comment-on-moment', input),
  addLifeItem: (input) => ipcRenderer.invoke('chat:add-life-item', input),
  toggleLifeItem: (id, completed) => ipcRenderer.invoke('chat:toggle-life-item', id, completed),
  deleteLifeItem: (id) => ipcRenderer.invoke('chat:delete-life-item', id),
  resetMind: () => ipcRenderer.invoke('chat:reset-mind'),
  refreshWeather: () => ipcRenderer.invoke('chat:refresh-weather'),
  sendProactiveGreeting: () => ipcRenderer.invoke('chat:send-proactive-greeting'),
  sendGirlfriendMessage: () => ipcRenderer.invoke('chat:send-girlfriend-message'),
  onShowChatSettings: (callback) => {
    ipcRenderer.on('chat:show-settings', () => callback());
  },
  onShowLifePanel: (callback) => {
    ipcRenderer.on('chat:show-life', () => callback());
  },
  onChatProactiveGreeting: (callback) => {
    ipcRenderer.on('chat:proactive-greeting', (_event, payload) => callback(payload));
  },
  onMomentsUpdated: (callback) => {
    ipcRenderer.on('chat:moments-updated', (_event, payload) => callback(payload));
  },
  onSharedLifeUpdated: (callback) => {
    ipcRenderer.on('chat:shared-life-updated', (_event, payload) => callback(payload));
  },
  onLifeHubUpdated: (callback) => {
    ipcRenderer.on('chat:life-hub-updated', (_event, payload) => callback(payload));
  },
  onContinuityUpdated: (callback) => {
    ipcRenderer.on('chat:continuity-updated', (_event, payload) => callback(payload));
  },
  onAssistantStateUpdated: (callback) => {
    ipcRenderer.on('assistant:state-updated', (_event, payload) => callback(payload));
  },
  onKnowledgeStateUpdated: (callback) => {
    ipcRenderer.on('knowledge:state-updated', (_event, payload) => callback(payload));
  },
  onAssistantSelectTab: (callback) => {
    ipcRenderer.on('assistant:select-tab', (_event, tab) => callback(tab));
  }
});
