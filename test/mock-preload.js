const { contextBridge } = require('electron');

const now = new Date().toISOString();
const momentsState = {
  automaticEnabled: true,
  meta: { nextPostAt: Date.now() + 8 * 60 * 60 * 1000 },
  moments: [
    {
      id: 'preview-moment',
      content: '收工后绕了一点远路，晚风比想象中舒服。路过甜品店的时候想起你上次说的口味，所以替你多看了一眼。',
      createdAt: now,
      comments: [
        { id: 'c1', role: 'user', content: '只是多看一眼，没有替我买一份吗？', createdAt: now },
        {
          id: 'c2',
          role: 'assistant',
          content: '{"reply":"当然买了，不过要看你什么时候来陪我一起吃。你今晚有空吗？","action":"love","memories":[{"content":"truncated',
          createdAt: now
        }
      ]
    }
  ]
};

const sharedLifeState = {
  world: {
    currentLabel: '收工后的私人时间',
    location: '家里',
    detail: '刚把外套挂好，正在给你回消息。',
    startedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    nextLabel: '晚间休息',
    nextAt: new Date(Date.now() + 90 * 60 * 1000).toISOString()
  },
  episodes: [
    {
      id: 'preview-episode',
      title: '约好周末一起看电影',
      summary: '你提议周末一起看一部轻松的电影，我们还没有决定片名。',
      category: 'plan',
      eventAt: now,
      createdAt: now,
      evidence: { quote: '周末一起看电影吧', messageId: 'preview-message', role: 'user' },
      pinned: false,
      status: 'active'
    }
  ],
  topics: [
    {
      id: 'preview-topic',
      title: '周末电影选片',
      summary: '想知道你更想看喜剧还是爱情片。',
      pendingQuestion: '你更想看喜剧还是爱情片？',
      status: 'open',
      dueAt: Date.now() + 2 * 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now
    }
  ],
  meta: { totalEpisodes: 1, openTopics: 1 }
};

const lifeHubState = {
  world: sharedLifeState.world,
  timeline: [{
    id: 'preview-timeline',
    type: 'episode',
    title: '约好周末一起看电影',
    summary: '你们约好周末一起选一部轻松的电影。',
    occurredAt: now,
    importance: 4,
    source: { sessionId: 'preview', messageId: 'preview-message', evidence: '周末一起看电影吧' }
  }],
  people: [{
    id: 'preview-person', name: '小林', relation: '朋友', notes: '经常一起看电影',
    manual: false, confidence: 0.92, lastSeenAt: now,
    evidence: [{ sessionId: 'preview', messageId: 'preview-message', evidence: '朋友小林' }]
  }],
  digests: [{
    id: 'preview-digest', period: 'day', title: '今天', content: '约好了周末电影。', entryIds: ['preview-timeline']
  }],
  health: {
    status: 'healthy', checkedAt: now, bytes: 4096,
    counts: { messages: 1, facts: 1, timeline: 1, people: 1 }, errors: [], warnings: []
  },
  meta: {}
};

const continuityState = {
  projects: [{
    id: 'preview-project', title: '选好周末电影', outcome: '决定片名并安排时间', status: 'active',
    priority: 4, progress: 50, steps: [
      { id: 'step-1', title: '确定电影类型', status: 'done' },
      { id: 'step-2', title: '选出具体片名', status: 'todo' }
    ], source: { sessionId: 'preview', messageId: 'preview-message', evidence: '周末一起看电影吧' }
  }],
  habits: [{
    id: 'preview-habit', title: '每天读书', frequency: 'daily', targetPerPeriod: 1,
    active: true, currentCount: 0, dueToday: true, completedToday: false, streak: 2,
    checkIns: [], source: {}
  }],
  reviews: [{
    id: 'preview-review', factId: 'preview-memory', reason: '建议再次确认', severity: 1,
    fact: {
      id: 'preview-memory', text: '用户周末喜欢看轻松的电影', category: 'preference',
      importance: 4, confidence: 0.86, evidence: '周末我喜欢看轻松一点的电影',
      source: 'conversation', createdAt: now, updatedAt: now
    }
  }],
  summary: { activeProjects: 1, dueHabits: 1, reviewItems: 1, searchableItems: 8 },
  meta: {}
};

const memories = [{
  id: 'preview-memory',
  text: '用户周末喜欢看轻松的电影',
  category: 'preference',
  importance: 4,
  confidence: 0.96,
  evidence: '周末我喜欢看轻松一点的电影',
  source: 'automatic',
  pinned: false,
  createdAt: now,
  updatedAt: now
}];

const noop = () => {};
const mockWallpapers = [];
const mockConfig = {
  configured: true,
  provider: 'deepseek',
  providers: [{ id: 'deepseek', available: true }],
  model: 'deepseek-v4-flash',
  personality: 'classic',
  memoryEnabled: true,
  proactiveGreetingEnabled: true,
  proactiveIntervalMinutes: 45,
  proactiveDailyLimit: 5,
  girlfriendModeEnabled: false,
  girlfriendIntervalMinutes: 20,
  girlfriendMaxFollowUps: 4,
  momentsEnabled: true,
  voice: {
    autoReadReplies: false,
    engine: 'local',
    culture: 'zh-CN',
    voiceName: '',
    rate: 1,
    pitch: 1,
    volume: 1
  },
  weatherEnabled: false,
  weatherCity: '',
  wallpaper: 'none',
  wallpaperDefault: 'none',
  wallpapers: mockWallpapers,
  avatarSelections: { mai: '', user: '' },
  avatarDefaults: { mai: '../assets/mai-profile.png', user: '../assets/mai-icon.png' },
  avatarPaths: { mai: '../assets/mai-profile.png', user: '../assets/mai-icon.png' },
  avatars: []
};
const mockWorkProject = { id: 'preview-work', name: 'Workspace 验收', workspacePath: 'D:\\Mai Workspace', createdAt: now, updatedAt: now, lastOpenedAt: now };
const mockWorkSession = {
  id: 'preview-work-session', projectId: mockWorkProject.id, title: '检查 README', createdAt: now, updatedAt: now,
  messages: [{ role: 'assistant', content: '文件操作反馈会显示在这里。', createdAt: now, operationResults: [{ operation: 'write', title: '已修改', ok: true, path: 'Workspace/README.md', sourcePath: '', destinationPath: '', kind: '', error: null }] }]
};
let mockChatWorkspaceStatus = { granted: false, operations: ['list', 'read'] };
function mockWorkspaceListing(request = {}) {
  if (request.path === 'docs') return { path: 'Workspace/docs', relativePath: 'docs', name: 'docs', entries: [], truncated: false };
  return { path: 'Workspace', relativePath: '', name: 'Mai Workspace', truncated: false, entries: [
    { name: 'docs', relativePath: 'docs', type: 'folder', extension: '', size: 0, modifiedAt: now, readable: false },
    { name: 'README.md', relativePath: 'README.md', type: 'file', extension: '.md', size: 28, modifiedAt: now, readable: true },
    { name: 'image.png', relativePath: 'image.png', type: 'file', extension: '.png', size: 60, modifiedAt: now, readable: false }
  ] };
}
contextBridge.exposeInMainWorld('maiPet', {
  getChatConfig: async () => ({ ...mockConfig }),
  setWallpaper: async (wallpaper) => ({ ...mockConfig, wallpaper }),
  chooseCustomWallpaper: async () => ({ ...mockConfig }),
  clearCustomWallpaper: async () => ({ ...mockConfig, wallpaper: 'none', wallpapers: [] }),
  chooseCustomAvatar: async (target) => ({
    ...mockConfig,
    avatarSelectionChanged: false,
    avatarSelections: { ...mockConfig.avatarSelections, [target]: '' }
  }),
  clearCustomAvatar: async (target) => ({
    ...mockConfig,
    avatarSelections: { ...mockConfig.avatarSelections, [target]: '' }
  }),
  getChatState: async () => ({ activeSessionId: 'preview', sessions: [], messages: [] }),
  getMemories: async () => memories,
  correctMemory: async () => memories,
  getMemoryDiagnostics: async () => ({
    facts: memories.length,
    sessions: 0,
    messages: 0,
    contextWindowTokens: 1000000,
    maxPromptTokens: 900000,
    maxStoredFacts: 10000,
    maxMemoryFactsPerRequest: 320,
    maxContextMessagesPerRequest: 1600
  }),
  rebuildMemories: async () => ({ memories: [], diagnostics: {}, stats: {} }),
  getLifeState: async () => ({ mind: {}, items: [], weather: null, weatherEnabled: false, weatherCity: '' }),
  getSharedLife: async () => sharedLifeState,
  rebuildSharedLife: async () => sharedLifeState,
  updateEpisode: async () => sharedLifeState,
  deleteEpisode: async () => sharedLifeState,
  setTopicStatus: async () => sharedLifeState,
  deleteTopic: async () => sharedLifeState,
  getLifeHub: async () => lifeHubState,
  rebuildLifeHub: async () => ({ state: lifeHubState, stats: { messages: 1, timeline: 1 } }),
  addPerson: async () => lifeHubState,
  updatePerson: async () => lifeHubState,
  deletePerson: async () => lifeHubState,
  getContinuity: async () => continuityState,
  searchContinuity: async () => [{
    id: 'conversation:preview:preview-message', type: 'conversation', title: '你 · 周末电影',
    snippet: '周末一起看电影吧', updatedAt: now, score: 88,
    source: { sessionId: 'preview', messageId: 'preview-message', evidence: '周末一起看电影吧' }
  }],
  addProject: async () => continuityState,
  updateProject: async () => continuityState,
  deleteProject: async () => continuityState,
  addProjectStep: async () => continuityState,
  updateProjectStep: async () => continuityState,
  deleteProjectStep: async () => continuityState,
  addHabit: async () => continuityState,
  updateHabit: async () => continuityState,
  deleteHabit: async () => continuityState,
  checkInHabit: async () => continuityState,
  locateSource: async () => ({ found: false }),
  checkDatabase: async () => lifeHubState.health,
  repairDatabase: async () => ({ after: lifeHubState.health, hub: lifeHubState }),
  listBackups: async () => [],
  createBackup: async () => ({ canceled: true }),
  restoreBackup: async () => ({ canceled: true }),
  exportData: async () => ({ canceled: true }),
  getActionStatus: async () => ({ enabled: true, available: true, reason: '', activeSessionId: null }),
  configureAction: async () => ({ enabled: true, available: true, reason: '', activeSessionId: null }),
  executeAction: async ({ text }) => ({
    session: { id: 'preview-action', status: 'completed' },
    presentation: { content: `我帮你整理好了。${text}`, steps: [] }
  }),
  cancelAction: async () => ({ id: 'preview-action', status: 'cancelled' }),
  getActionSession: async () => null,
  getWorkData: async () => ({ version: 1, projects: [mockWorkProject], sessions: [mockWorkSession], lastOpenedProjectId: mockWorkProject.id }),
  listActionWorkspaceDirectory: async (request) => mockWorkspaceListing(request),
  previewActionWorkspaceFile: async (request) => request.path === 'README.md'
    ? { ok: true, data: { path: 'Workspace/README.md', relativePath: 'README.md', content: '# Mai Workspace\n\nLocal preview.' } }
    : { ok: false, error: { code: 'UNSUPPORTED_FILE', userMessage: '当前文件类型不在允许的文本读取范围内。', retryable: false } },
  getChatWorkspaceCapability: async () => ({ ok: true, status: mockChatWorkspaceStatus }),
  selectChatWorkspaceCapability: async () => {
    mockChatWorkspaceStatus = { granted: true, workspaceId: 'preview-chat-workspace', displayName: 'Mai Workspace', operations: ['list', 'read'] };
    return { ok: true, status: mockChatWorkspaceStatus };
  },
  revokeChatWorkspaceCapability: async () => {
    mockChatWorkspaceStatus = { granted: false, operations: ['list', 'read'] };
    return { ok: true, status: mockChatWorkspaceStatus };
  },
  executeChatWorkspaceCapability: async (request) => ({
    ok: true,
    execution: { contextId: 'preview-context', operation: request.operation, result: { relativePath: request.relativePath, entries: [], truncated: false } }
  }),
  sendChat: async (input) => ({
    content: input?.workspaceContextId ? '我已经根据这次授权的 Workspace 内容回答你。' : '我在。',
    action: 'wave', emotion: 'happy', createdAt: now, sessionId: 'preview', sessions: []
  }),
  getMomentsState: async () => momentsState,
  getVoiceCapabilities: async () => ({
    available: true,
    defaultCulture: 'zh-CN',
    recognizers: [{ id: 'preview', name: 'Windows 中文语音识别', culture: 'zh-CN' }],
    localTts: {
      installed: true,
      enhanced: true,
      ready: true,
      state: 'ready',
      runtime: {
        device: 'NVIDIA GeForce RTX 4060 Laptop GPU',
        expressive: true,
        senseVoice: true
      }
    }
  }),
  getLocalVoiceStatus: async () => ({ installed: true, enhanced: true, ready: true, state: 'ready' }),
  installLocalVoice: async () => ({ installed: true, enhanced: true, ready: true, state: 'ready' }),
  cancelLocalVoiceInstall: async () => ({ canceled: true }),
  synthesizeLocalVoice: async () => ({ ok: false }),
  analyzeVoiceAudio: async () => ({ ok: false, available: false }),
  listenVoice: async () => new Promise(() => {}),
  stopVoiceListening: async () => ({ stopped: true }),
  generateMoment: async () => momentsState,
  commentOnMoment: async () => momentsState,
  onShowChatSettings: noop,
  onShowLifePanel: noop,
  onVoiceStreamDelta: noop,
  onActionSessionStarted: noop,
  onAgentEvent: noop,
  onLocalVoiceStatus: noop,
  onMomentsUpdated: noop,
  onSharedLifeUpdated: noop,
  onLifeHubUpdated: noop,
  onContinuityUpdated: noop,
  onChatProactiveGreeting: noop
});
