const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  screen,
  shell,
  Tray
} = require('electron');
const {
  createSmokeDiagnostics,
  rendererSmokeMode
} = require('./smoke-diagnostics');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  PROACTIVE_POLICIES,
  decideProactive,
  defaultMindState,
  effectiveDueAt,
  localDateKey,
  normalizeBehaviorPatterns,
  migrateMindState,
  normalizeLifeItem,
  normalizeMindState,
  weatherDescription
} = require('./intelligence');
const {
  appendEvidenceTrail,
  canonicalizeMemoryKey,
  findMemoryMatch,
  memoryTextKey,
  normalizeEvidenceTrail,
  resolveCanonicalFactConflicts
} = require('./memory-engine');
const {
  estimateTokenCount,
  trimMessagesToTokenBudget,
} = require('./context-engine');
const {
  evidenceAppearsInSource,
  extractExplicitMemoryCandidates,
  shouldStoreAsLongTermFact
} = require('./memory-extractor');
const {
  MAX_MOMENTS,
  MAX_MOMENT_COMMENTS,
  fallbackMomentReply,
  fallbackMomentText,
  makeMomentId,
  nextMomentAt,
  normalizeMomentReplyText,
  normalizeMomentText,
  normalizeMomentsState,
  publicMoments
} = require('./moments');
const {
  PERSONALITY_PROMPTS
} = require('./persona');
const {
  advanceWorldState,
  defaultWorldState,
  normalizeWorldState
} = require('./world-engine');
const {
  extractEpisodeCandidates,
  memoryCandidateIsBlocked,
  mergeEpisodes,
  normalizeEpisode,
  normalizeMemoryCorrection,
  normalizeTopic,
  selectTopicContext
} = require('./shared-life');
const {
  buildDigests,
  lifeHubContext: buildLifeHubContext,
  normalizeDigest,
  normalizePerson,
  normalizeTemporalMetadata,
  normalizeTimelineEntry,
  rebuildPeopleFromSessions,
  rebuildTimeline,
  stableId
} = require('./life-hub');
const {
  createBackupBundle,
  createPortableExport,
  inspectDatabase,
  prepareBackupRestore
} = require('./backup-engine');
const {
  ensureFileBackup,
  preserveFileAtomically,
  readJsonFile,
  writeFileAtomic: persistFileAtomic,
  writeJsonAtomic: persistJsonAtomic
} = require('./json-persistence');
const { commitFileSetAtomically, recoverInterruptedFileSetTransaction } = require('./file-set-transaction');
const {
  continuityContext: buildContinuityContext,
  continuityProactiveCue,
  deriveContinuityState,
  mergeHabitCandidates,
  mergeProjectCandidates,
  normalizeHabit,
  normalizeProject,
  normalizeProjectStep,
  publicContinuityState: buildPublicContinuityState,
  searchContinuity
} = require('./continuity-engine');
const { initializeStorage } = require('./storage');
const { VoiceService } = require('./voice-service');
const { LocalTtsService } = require('./local-tts-service');
const { describeVoiceProfile } = require('./voice-emotion');
const { ChatService } = require('./chat-service');
const { createChatRequestLifecycle } = require('./chat-request-lifecycle');
const { createChatTurnStateWriter } = require('./chat-turn-state');
const { getApiKey: getStoredApiKey, migratePlaintextApiKey, setApiKey: setStoredApiKey } = require('./api-key-storage');
const { ChatRequestService } = require('./chat-request-service');
const { createChatPromptContext } = require('./chat-prompt-context');
const { createChatRealityContext } = require('./chat-reality-context');
const { serializeHistoricalAssistantReplies } = require('./chat-history-boundary');
const { createLlmCacheDiagnosticLogger } = require('./llm-cache-diagnostics');
const { runConversationMessageBisect, runConversationMessageShapeAudit, runIncrementalSmoke } = require('./deepseek-incremental-smoke');
const { ModelGateway } = require('./model-gateway');
const { ModelProviderRegistry, PROVIDER_IDS } = require('./model-provider-registry');
const { LocalModelProvider } = require('./local-model-provider');
const {
  DEEPSEEK_ENDPOINT,
  DEEPSEEK_MODELS,
  DeepSeekProvider,
  emptyResponseMessage
} = require('./deepseek-provider');
const {
  applyActivitySample,
  answerAssistantPromise,
  assistantContext: buildAssistantContext,
  assistantProactiveCue,
  defaultAssistantState,
  ensureBriefing,
  ensureMaiPlan,
  finishFocusSession,
  markAssistantCue,
  normalizeAssistantState,
  publicAssistantState: buildPublicAssistantState,
  startFocusSession
} = require('./life-assistant');
const { readForegroundApplication } = require('./activity-tracker');
const {
  createDocument,
  defaultKnowledgeState,
  knowledgeContext: buildKnowledgeContext,
  needsRefresh: knowledgeDocumentNeedsRefresh,
  normalizeKnowledgeState,
  normalizeLibrary,
  publicKnowledgeState: buildPublicKnowledgeState,
  searchKnowledge,
  upsertDocument
} = require('./knowledge-engine');
const { readKnowledgeDocument } = require('./knowledge-importer');
const {
  CUSTOM_WALLPAPER_ID,
  DEFAULT_WALLPAPER_ID,
  normalizeWallpaperId,
  publicWallpaperState
} = require('./wallpaper-catalog');
const {
  AVATAR_TARGETS,
  CUSTOM_AVATAR_ID,
  normalizeAvatarSelections,
  publicAvatarState
} = require('./avatar-catalog');
const { createWindowManager } = require('./window-manager');
const { registerVoiceIpc } = require('./voice-ipc');
const { registerAssistantIpc } = require('./assistant-ipc');
const { registerTimerIpc } = require('./timer-ipc');
const { createPetVisibility } = require('./pet-visibility');
const { createConversationState, normalizeActiveSessionId } = require('./conversation-state');
const {
  applyMindTurn,
  beginRelationshipWaiting,
  clearRelationshipWaiting,
  incrementRelationshipFollowUp,
  markMindUserReturned,
  normalizeRelationship,
  normalizeRelationshipState,
  recordCompanionMessage,
  recordProactiveGreeting,
  recordProactiveReason,
  recordRelationshipUserReply,
  resetMind
} = require('./companion-state');
const { createAutomaticBackupService } = require('./automatic-backup-service');
const { WorkStore, normalizeWorkState } = require('./work/work-store');
const { WorkspaceCapabilityGateway } = require('./workspace-capability-gateway');
const { registerWorkspaceCapabilityIpc } = require('./workspace-capability-ipc');
const actionRuntimeModules = (() => {
  try {
    return {
      registerActionIpc: require('./action-ipc').registerActionIpc,
      createProductionActionRuntimeManager: require('./agent/production-action-runtime').createProductionActionRuntimeManager,
      normalizeActionConfiguration: require('./agent/production-action-runtime').normalizeProductionActionConfiguration
    };
  } catch (error) {
    console.warn('Action Runtime is unavailable; Companion Runtime will continue normally.', error?.message || error);
    return null;
  }
})();
const normalizeActionConfiguration = actionRuntimeModules?.normalizeActionConfiguration || ((value = {}) => ({
  enabled: value?.enabled === true,
  runtime: 'mai-agent'
}));

const rendererSmoke = rendererSmokeMode(process.env);
const smokeDiagnostics = createSmokeDiagnostics(process.env);
if (rendererSmoke) {
  // Smoke runs need deterministic software rendering. This must happen before app.whenReady().
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('no-sandbox');
  smokeDiagnostics?.attachApp(app);
  smokeDiagnostics?.checkpoint('hardware_acceleration_disabled', { rendererSmoke });
}

const storage = initializeStorage(app);
if (process.env.MAI_EXPECTED_USER_DATA_DIR) {
  const expectedUserData = path.resolve(process.env.MAI_EXPECTED_USER_DATA_DIR);
  if (path.resolve(storage.userDataDirectory) !== expectedUserData) {
    throw new Error(`Isolated smoke userData mismatch: expected ${expectedUserData}, got ${storage.userDataDirectory}`);
  }
}
const productDataWriteProtection = {
  state: 'startup-recovery-pending',
  rollbackError: null,
  userMessage: ''
};
let productDataGeneration = 0;
let weatherSettingsGeneration = 0;
let startupFileSetRecovery = null;
const workStore = new WorkStore({
  filePath: storage.workPath,
  beforeSave: assertProductDataWritable
});
let legacyAgentWorkspacePath = '';
const voiceService = new VoiceService();
const localTtsService = new LocalTtsService({
  onStatus: (status) => broadcastLocalTtsStatus(status)
});
const modelProviders = new ModelProviderRegistry()
  .register(new DeepSeekProvider({
    getApiKey: () => getDeepSeekApiKey(),
    getModel: () => settings?.deepseek?.model,
    estimateTokens: estimateTokenCount
  }))
  .register(new LocalModelProvider());
const modelGateway = new ModelGateway({
  registry: modelProviders,
  getProviderId: () => settings?.model?.provider || PROVIDER_IDS.DEEPSEEK
});

const WINDOW_WIDTH = 310;
const WINDOW_HEIGHT = 390;
const MEMORY_SCHEMA_VERSION = 16;
const DEEPSEEK_CONTEXT_WINDOW_TOKENS = 1_000_000;
const MAX_PROMPT_TOKENS = 900_000;
const CURRENT_CONVERSATION_TOKEN_BUDGET = 650_000;
const MEMORY_CONTEXT_TOKEN_BUDGET = 14_000;
const HISTORICAL_RECALL_TOKEN_BUDGET = 12_000;
const MAX_LONG_TERM_MEMORIES = 10_000;
const MAX_MEMORY_CANDIDATES_PER_REPLY = 32;
const MAX_MEMORY_CONTEXT = 32;
const MAX_CHAT_SESSIONS = 200;
const MAX_MESSAGES_PER_SESSION = 2000;
const MAX_CHAT_MESSAGE_CHARS = 12000;
const MAX_CONTEXT_MESSAGES = 1600;
const MAX_LIFE_ITEMS = 100;
const MAX_EPISODES = 2000;
const MAX_EPISODE_CANDIDATES_PER_REPLY = 4;
const MAX_EPISODE_CONTEXT = 12;
const EPISODE_CONTEXT_TOKEN_BUDGET = 10000;
const MAX_TOPIC_THREADS = 500;
const MAX_TOPIC_CONTEXT = 6;
const MAX_MEMORY_CORRECTIONS = 1000;
const MAX_TIMELINE_ENTRIES = 5000;
const MAX_PEOPLE = 1000;
const MAX_MEMORY_DIGESTS = 1200;
const MAX_PROJECTS = 500;
const MAX_HABITS = 300;
const KNOWLEDGE_CONTEXT_TOKEN_BUDGET = 30000;
const ACTIVITY_SAMPLE_INTERVAL_MS = 15000;
const KNOWLEDGE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const WEATHER_CACHE_DURATION_MS = 30 * 60 * 1000;
const MIN_CONTACT_INTERVAL_MINUTES = 1;
const MAX_CONTACT_INTERVAL_MINUTES = 10080;
const MIN_CONTACT_COUNT = 1;
const MAX_CONTACT_COUNT = 999;
const MEMORY_CATEGORIES = new Set([
  'identity',
  'preference',
  'relationship',
  'goal',
  'routine',
  'experience',
  'boundary',
  'other'
]);
const GIRLFRIEND_INTENSITIES = {
  gentle: {
    firstDelayMinutes: 45,
    followUpDelayMinutes: [60],
    maxFollowUps: 2
  },
  caring: {
    firstDelayMinutes: 20,
    followUpDelayMinutes: [18, 30, 45],
    maxFollowUps: 4
  },
  clingy: {
    firstDelayMinutes: 8,
    followUpDelayMinutes: [8, 12, 18, 25],
    maxFollowUps: 5
  }
};
const PET_ACTIONS = new Set([
  'idle',
  'wave',
  'jump',
  'love',
  'angry',
  'sleep',
  'lazy',
  'study',
  'work',
  'snack'
]);
const PET_EMOTIONS = new Set([
  'neutral',
  'happy',
  'curious',
  'shy',
  'concerned',
  'angry',
  'sleepy',
  'focused'
]);
const PROACTIVE_GREETINGS = {
  classic: {
    morning: ['早上好。今天也让我陪你慢慢开始吧。', '新的一天开始了。别急，我会陪着你。'],
    noon: ['已经中午了，记得好好吃饭。', '先休息一下吧，下午才有精神继续。'],
    afternoon: ['下午也辛苦了。要不要伸个懒腰？', '做得不错，再专心一会儿就休息吧。'],
    evening: ['晚上好。今天过得怎么样？', '忙了一天，偶尔也该看看我了吧。'],
    late: ['已经很晚了，别把自己累坏。', '夜深了。做完手上的事就早点休息，好吗？']
  },
  gentle: {
    morning: ['早上好。慢慢来，今天也会顺利的。'],
    noon: ['到吃饭时间了。照顾好自己，我才放心。'],
    afternoon: ['辛苦了。喝点水，休息一小会儿吧。'],
    evening: ['欢迎回到安静的晚上。今天也已经很努力了。'],
    late: ['夜深了。你不需要一直勉强自己，早点休息吧。']
  },
  playful: {
    morning: ['早安。再不起床的话，我可要亲自叫你了。'],
    noon: ['午饭时间到。工作不能当饭吃，听见了吗？'],
    afternoon: ['抓到一只忘记休息的人。罚你伸个懒腰。'],
    evening: ['终于到晚上了。现在可以把注意力分给我一点了吧？'],
    late: ['这么晚还不睡？看来需要我监督你了。']
  },
  focused: {
    morning: ['早上好。选出今天最重要的一件事，我们先完成它。'],
    noon: ['中午了。补充能量，然后确认下午的首要目标。'],
    afternoon: ['检查一下进度。先完成当前这一步，再处理下一件事。'],
    evening: ['收尾时间。记录今天完成的事，剩下的留给明天。'],
    late: ['效率也需要睡眠支撑。保存进度，准备休息。']
  }
};
const PROACTIVE_QUESTIONS = {
  morning: [
    '你今天最想先完成哪件事？',
    '昨晚睡得好吗，今天精神怎么样？',
    '今天有什么值得期待的安排吗？'
  ],
  noon: [
    '午饭吃了什么？',
    '上午过得顺利吗，有没有什么想和我说的？',
    '下午最重要的一件事是什么？'
  ],
  afternoon: [
    '现在的进度怎么样，需要我陪你理一理吗？',
    '今天到目前为止，哪件事最让你有成就感？',
    '累不累，要不要和我聊两分钟？'
  ],
  evening: [
    '今天发生了什么让你印象最深的事？',
    '忙完以后，你最想怎样放松？',
    '今天有哪一刻让你觉得开心吗？'
  ],
  late: [
    '夜已经很深了。你现在最想和我聊什么？',
    '我还在听。刚才的话题，你还想从哪里继续？',
    '这个时间还醒着，是不是有件事特别想告诉我？'
  ]
};

let mainWindow = null;
let chatWindow = null;
let timerWindow = null;
let assistantWindow = null;
let tray = null;
let quitting = false;
const appStartedAt = Date.now();
let proactiveGreetingTimer = null;
let girlfriendFollowUpTimer = null;
let girlfriendMessageSending = false;
let momentPostTimer = null;
let momentPostSending = false;
const momentReplyingIds = new Set();
let reminderTimer = null;
let activityTrackingTimer = null;
let knowledgeRefreshTimer = null;
let knowledgeRefreshPromise = null;
let chatSendHandler = null;
let llmDiagnosticSequence = 0;
let lastActivityPersistAt = 0;
let memoryState = {
  version: MEMORY_SCHEMA_VERSION,
  facts: [],
  memoryCorrections: [],
  sessions: [],
  activeSessionId: '',
  legacyAgentArchive: [],
  mind: defaultMindState(),
  behaviorPatterns: [],
  world: defaultWorldState(),
  episodes: [],
  topicThreads: [],
  sharedLifeMeta: {
    lastRebuiltAt: '',
    lastRebuildMessageCount: 0
  },
  timeline: [],
  people: [],
  memoryDigests: [],
  projects: [],
  habits: [],
  assistant: defaultAssistantState(),
  continuityMeta: {
    lastMigratedAt: ''
  },
  hubMeta: {
    lastRebuiltAt: '',
    lastRebuildMessageCount: 0,
    lastHealthCheckAt: ''
  },
  lifeItems: [],
  moments: [],
  momentsMeta: {
    lastPostAt: 0,
    nextPostAt: 0
  },
  memoryMeta: {
    lastRebuiltAt: '',
    lastRebuildMessageCount: 0
  },
  reality: {
    weather: null
  },
  relationship: {
    waitingSince: 0,
    waitingSessionId: '',
    lastUserMessageAt: 0,
    lastCompanionMessageAt: 0,
    followUpCount: 0
  }
};
let lastSavedMemoryState = structuredClone(memoryState);
let settings = {
  alwaysOnTop: true,
  openAtLogin: true,
  firstLaunch: true,
  position: null,
  invisibleMode: false,
  appearance: {
    wallpaper: DEFAULT_WALLPAPER_ID,
    theme: 'auto',
    glassIntensity: 'balanced',
    transparency: 72,
    uiScale: 100,
    chatDensity: 'comfortable',
    motion: 'full',
    avatars: {
      mai: '',
      user: ''
    }
  },
  reminder: {
    endAt: 0,
    label: '番茄钟',
    mode: 'study',
    startedAt: 0,
    minutes: 25
  },
  assistant: {
    morningEnabled: true,
    morningTime: '08:00',
    eveningEnabled: true,
    eveningTime: '21:30',
    activityTrackingEnabled: false,
    excludedApps: ['mai sakurajima', 'keepass', '1password', 'bitwarden'],
    knowledgeAutoRefresh: true
  },
  model: {
    provider: PROVIDER_IDS.DEEPSEEK
  },
  agent: {
    enabled: false,
    runtime: 'mai-agent'
  },
  voice: {
    autoReadReplies: false,
    engine: 'local',
    culture: 'zh-CN',
    voiceName: '',
    rate: 1,
    pitch: 1,
    volume: 1
  },
  deepseek: {
    apiKeyEncrypted: '',
    apiKeyPlain: '',
    model: 'deepseek-v4-flash',
    personality: 'classic',
    customPrompt: '',
    memoryEnabled: true,
    proactiveGreetingEnabled: true,
    proactiveFrequency: 'balanced',
    proactiveIntervalMinutes: 45,
    proactiveDailyLimit: 5,
    girlfriendModeEnabled: false,
    girlfriendIntensity: 'caring',
    girlfriendIntervalMinutes: 20,
    girlfriendMaxFollowUps: 4,
    momentsEnabled: true,
    weatherEnabled: false,
    weatherCity: '',
    lastGreetingAt: 0
  }
};
let lastSavedSettings = structuredClone(settings);
let knowledgeState = defaultKnowledgeState();
let lastSavedKnowledgeState = structuredClone(knowledgeState);
let legacyPlaintextKeyNeedsSecureStorage = false;
let dataStoresReadyForShutdown = false;

const chatPromptContext = createChatPromptContext({
  getMemoryState: () => memoryState,
  getSettings: () => settings,
  isDataWritable: productDataWritesAllowed,
  getDataGeneration: () => productDataGeneration,
  memoryCategories: MEMORY_CATEGORIES,
  petActions: PET_ACTIONS,
  petEmotions: PET_EMOTIONS,
  limits: {
    memoryContextTokenBudget: MEMORY_CONTEXT_TOKEN_BUDGET,
    historicalRecallTokenBudget: HISTORICAL_RECALL_TOKEN_BUDGET,
    maxMemoryContext: MAX_MEMORY_CONTEXT,
    maxEpisodeContext: MAX_EPISODE_CONTEXT,
    episodeContextTokenBudget: EPISODE_CONTEXT_TOKEN_BUDGET,
    maxTopicContext: MAX_TOPIC_CONTEXT,
    maxMemoryCandidatesPerReply: MAX_MEMORY_CANDIDATES_PER_REPLY,
    maxEpisodeCandidatesPerReply: MAX_EPISODE_CANDIDATES_PER_REPLY
  }
});
const chatRealityContext = createChatRealityContext({
  getSettings: () => settings,
  getMemoryState: () => memoryState,
  getDataGeneration: () => productDataGeneration,
  getSettingsGeneration: () => weatherSettingsGeneration,
  isDataWritable: productDataWritesAllowed,
  saveMemory,
  weatherDescription,
  onError: (error) => console.error('Could not refresh weather context:', error),
  fetcher: (url, requestOptions) => fetch(url, requestOptions)
});

function productDataWritesAllowed() {
  return productDataWriteProtection.state === 'ready';
}

function assertProductDataWritable() {
  if (productDataWritesAllowed()) return;
  if (productDataWriteProtection.state === 'restore-rollback-failed') {
    throw Object.assign(new Error(productDataWriteProtection.userMessage), {
      code: 'PRODUCT_DATA_WRITE_PROTECTED',
      recoveryJournalPath: productDataWriteProtection.rollbackError?.recoveryJournalPath || ''
    });
  }
  throw Object.assign(new Error('Mai 尚未完成本地恢复事务，当前已暂停产品数据写入。'), {
    code: 'PRODUCT_DATA_RECOVERY_PENDING'
  });
}

function markProductDataRecoveryComplete() {
  productDataWriteProtection.state = 'ready';
  productDataWriteProtection.rollbackError = null;
  productDataWriteProtection.userMessage = '';
}

function stopProductDataSchedulers() {
  chatRequestLifecycle.cancelAll('restore_rollback_failed');
  clearTimeout(proactiveGreetingTimer);
  clearTimeout(girlfriendFollowUpTimer);
  clearTimeout(momentPostTimer);
  clearTimeout(reminderTimer);
  clearInterval(activityTrackingTimer);
  clearInterval(knowledgeRefreshTimer);
  proactiveGreetingTimer = null;
  girlfriendFollowUpTimer = null;
  momentPostTimer = null;
  reminderTimer = null;
  activityTrackingTimer = null;
  knowledgeRefreshTimer = null;
  try {
    const cancellation = actionRuntimeManager?.cancelAll?.();
    cancellation?.catch?.((error) => console.error('Could not cancel Work after restore rollback failure:', error));
  } catch (error) {
    console.error('Could not cancel Work after restore rollback failure:', error);
  }
}

function freezeProductDataWritesAfterRollbackFailure(error) {
  productDataWriteProtection.state = 'restore-rollback-failed';
  productDataWriteProtection.rollbackError = error;
  const journalName = path.basename(error?.recoveryJournalPath || 'mai-restore-transaction.json');
  productDataWriteProtection.userMessage = `备份恢复失败，自动回滚未能完成。为保护数据，Mai 已暂停所有本地数据写入。请关闭并重新启动 Mai，让启动时重试事务恢复；请不要删除或移动事务日志 ${journalName} 及其原始副本。若重试仍失败，请保留 Mai 数据目录并联系支持。`;
  stopProductDataSchedulers();
  return {
    canceled: false,
    restored: false,
    writeProtectionActive: true,
    message: productDataWriteProtection.userMessage
  };
}

function saveProductDataOnShutdown() {
  if (!dataStoresReadyForShutdown) return { memorySaved: false, knowledgeSaved: false, skipped: true };
  const result = { memorySaved: false, knowledgeSaved: false, skipped: false };
  try {
    saveMemory();
    result.memorySaved = true;
  } catch (error) {
    result.memoryError = String(error?.code || error?.message || error);
    console.error('Could not save memory during shutdown:', error);
  }
  try {
    saveKnowledge();
    result.knowledgeSaved = true;
  } catch (error) {
    result.knowledgeError = String(error?.code || error?.message || error);
    console.error('Could not save knowledge during shutdown:', error);
  }
  return result;
}
let chatService = null;
let chatRequestService = null;
const chatRequestLifecycle = createChatRequestLifecycle({ createId: () => makeLocalId('chat-request') });
const actionRuntimeManager = (() => {
  if (!actionRuntimeModules) return null;
  try {
    return actionRuntimeModules.createProductionActionRuntimeManager({
      getConfiguration: () => settings.agent,
      getApiKey: () => getDeepSeekApiKey(),
      getModel: () => settings?.deepseek?.model,
      getWorkspacePath: () => ''
    });
  } catch (error) {
    console.warn('Action Runtime initialization failed; Companion Runtime will continue normally.', error?.message || error);
    return null;
  }
})();

function settingsPath() {
  return storage.settingsPath;
}

function memoryPath() {
  return storage.memoryPath;
}

function knowledgePath() {
  return path.join(app.getPath('userData'), 'mai-knowledge-index.json');
}

function customWallpaperPath() {
  return path.join(app.getPath('userData'), 'custom-wallpaper.jpg');
}

function currentWallpaperState() {
  return publicWallpaperState(settings.appearance?.wallpaper, customWallpaperPath());
}

function customAvatarPaths() {
  const userData = app.getPath('userData');
  return {
    mai: path.join(userData, 'custom-avatar-mai.jpg'),
    user: path.join(userData, 'custom-avatar-user.jpg')
  };
}

function requireCustomResourceTarget(filePath) {
  const allowed = [customWallpaperPath(), ...Object.values(customAvatarPaths())].map((item) => path.resolve(item));
  const target = path.resolve(filePath);
  if (!allowed.includes(target)) throw new Error('不支持写入这个自定义资源路径。');
  return target;
}

function writeCustomResource(filePath, bytes) {
  assertProductDataWritable();
  return persistFileAtomic(requireCustomResourceTarget(filePath), bytes);
}

function deleteCustomResource(filePath) {
  assertProductDataWritable();
  const target = requireCustomResourceTarget(filePath);
  try { fs.unlinkSync(target); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function backupResource(filePath, maxBytes, label) {
  let bytes;
  try { bytes = fs.readFileSync(filePath); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!bytes.length || bytes.length > maxBytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`${label}文件无效或超出备份上限，完整备份已取消。`);
  }
  return { mimeType: 'image/jpeg', dataBase64: bytes.toString('base64') };
}

function snapshotCustomResources() {
  const avatars = customAvatarPaths();
  return {
    customWallpaper: backupResource(customWallpaperPath(), 20 * 1024 * 1024, '自定义壁纸'),
    customAvatars: {
      mai: backupResource(avatars.mai, 10 * 1024 * 1024, '麻衣头像'),
      user: backupResource(avatars.user, 10 * 1024 * 1024, '用户头像')
    }
  };
}

function snapshotUserDataForBackup() {
  return {
    appVersion: app.getVersion(),
    memory: structuredClone(memoryState),
    settings: structuredClone(settings),
    knowledge: structuredClone(knowledgeState),
    work: workStore.snapshot(),
    resources: snapshotCustomResources()
  };
}

function currentAvatarState() {
  return publicAvatarState(settings.appearance?.avatars, customAvatarPaths());
}

function requireAvatarTarget(target) {
  if (!AVATAR_TARGETS.includes(target)) throw new Error('不支持的头像位置。');
  return target;
}

async function importCustomAvatar(ownerWindow, target) {
  const normalizedTarget = requireAvatarTarget(target);
  const selected = await dialog.showOpenDialog(ownerWindow, {
    title: normalizedTarget === 'mai' ? '选择麻衣头像' : '选择用户头像',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png'] }]
  });
  const sourcePath = selected.canceled ? '' : selected.filePaths?.[0];
  if (!sourcePath) return false;
  const stat = await fs.promises.stat(sourcePath);
  if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('头像必须是不超过 10 MB 的 JPG 或 PNG 图片。');
  let image = nativeImage.createFromPath(sourcePath);
  if (image.isEmpty()) throw new Error('无法读取这张图片，请选择有效的 JPG 或 PNG 文件。');
  const size = image.getSize();
  if (!size.width || !size.height || size.width * size.height > 20_000_000) throw new Error('头像像素尺寸过大，请选择不超过 2000 万像素的图片。');
  const scale = Math.min(1, 1024 / size.width, 1024 / size.height);
  if (scale < 1) image = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'best' });
  const encoded = image.toJPEG(90);
  if (!encoded.length || encoded.length > 10 * 1024 * 1024) throw new Error('无法在安全大小内保存这张头像。');
  const targetPath = customAvatarPaths()[normalizedTarget];
  writeCustomResource(targetPath, encoded);
  return true;
}

async function importCustomWallpaper(ownerWindow) {
  const selected = await dialog.showOpenDialog(ownerWindow, {
    title: '选择本地壁纸',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png'] }]
  });
  const sourcePath = selected.canceled ? '' : selected.filePaths?.[0];
  if (!sourcePath) return false;
  const stat = await fs.promises.stat(sourcePath);
  if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error('壁纸必须是不超过 20 MB 的 JPG 或 PNG 图片。');
  let image = nativeImage.createFromPath(sourcePath);
  if (image.isEmpty()) throw new Error('无法读取这张图片，请选择有效的 JPG 或 PNG 文件。');
  const size = image.getSize();
  if (!size.width || !size.height || size.width * size.height > 40_000_000) throw new Error('壁纸像素尺寸过大，请选择不超过 4000 万像素的图片。');
  const scale = Math.min(1, 3840 / size.width, 2160 / size.height);
  if (scale < 1) image = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'best' });
  const encoded = image.toJPEG(90);
  if (!encoded.length || encoded.length > 20 * 1024 * 1024) throw new Error('无法在安全大小内保存这张壁纸。');
  const targetPath = customWallpaperPath();
  writeCustomResource(targetPath, encoded);
  return true;
}

function loadKnowledge() {
  const source = knowledgePath();
  let loaded;
  try {
    loaded = readJsonFile(source);
    if (loaded.exists && (!loaded.value || typeof loaded.value !== 'object' || Array.isArray(loaded.value))) {
      throw Object.assign(new Error('Knowledge JSON root must be an object.'), { code: 'JSON_SHAPE_ERROR' });
    }
  } catch (error) {
    if (!['JSON_PARSE_ERROR', 'JSON_SHAPE_ERROR'].includes(error?.code)) throw error;
    const recoveryPath = `${source}.unreadable-${safeFileTimestamp()}.backup.json`;
    preserveFileAtomically(source, recoveryPath);
    console.error(`Unreadable Mai knowledge index was preserved at ${recoveryPath}:`, error);
    knowledgeState = defaultKnowledgeState();
    lastSavedKnowledgeState = structuredClone(knowledgeState);
    saveKnowledge();
    return;
  }
  knowledgeState = loaded.exists ? normalizeKnowledgeState(loaded.value) : defaultKnowledgeState();
  lastSavedKnowledgeState = structuredClone(knowledgeState);
}

function saveKnowledge() {
  const rollbackState = structuredClone(lastSavedKnowledgeState || knowledgeState);
  try {
    assertProductDataWritable();
    const normalized = normalizeKnowledgeState(knowledgeState);
    persistJsonAtomic(knowledgePath(), normalized);
    knowledgeState = normalized;
    lastSavedKnowledgeState = structuredClone(normalized);
  } catch (error) {
    knowledgeState = rollbackState;
    throw error;
  }
}

function loadSettings() {
  let loaded;
  try {
    loaded = readJsonFile(settingsPath());
    if (loaded.exists && (!loaded.value || typeof loaded.value !== 'object' || Array.isArray(loaded.value))) {
      throw Object.assign(new Error('Settings JSON root must be an object.'), { code: 'JSON_SHAPE_ERROR' });
    }
  } catch (error) {
    if (!['JSON_PARSE_ERROR', 'JSON_SHAPE_ERROR'].includes(error?.code)) throw error;
    const recoveryPath = `${settingsPath()}.unreadable-${safeFileTimestamp()}.backup.json`;
    preserveFileAtomically(settingsPath(), recoveryPath);
    console.error(`Unreadable Mai settings were preserved at ${recoveryPath}:`, error);
    lastSavedSettings = structuredClone(settings);
    saveSettings();
    return;
  }
  if (!loaded.exists) {
    lastSavedSettings = structuredClone(settings);
    return;
  }

  const stored = loaded.value;
  const storedDeepSeek = stored.deepseek || {};
  legacyAgentWorkspacePath = typeof stored?.agent?.workspacePath === 'string' ? stored.agent.workspacePath.trim().slice(0, 2000) : '';
  settings = {
    ...settings,
    ...stored,
    deepseek: {
      ...settings.deepseek,
      ...(stored.deepseek || {})
    },
    reminder: {
      ...settings.reminder,
      ...(stored.reminder || {})
    },
    assistant: {
      ...settings.assistant,
      ...(stored.assistant || {})
    },
    model: {
      ...settings.model,
      ...(stored.model || {}),
      provider: PROVIDER_IDS.DEEPSEEK
    },
    agent: normalizeActionConfiguration({
      ...settings.agent,
      ...(stored.agent && typeof stored.agent === 'object' ? stored.agent : {})
    }),
    voice: {
      ...settings.voice,
      ...(stored.voice || {})
    },
    appearance: {
      ...settings.appearance,
      ...(stored.appearance || {}),
      avatars: {
        ...settings.appearance.avatars,
        ...(stored.appearance?.avatars || {})
      }
    }
  };
  settings.appearance = normalizeAppearanceSettings(settings.appearance);
  const legacyProactive = PROACTIVE_POLICIES[storedDeepSeek.proactiveFrequency]
    || PROACTIVE_POLICIES.balanced;
  const legacyGirlfriend = GIRLFRIEND_INTENSITIES[storedDeepSeek.girlfriendIntensity]
    || GIRLFRIEND_INTENSITIES.caring;
  if (!Number.isFinite(Number(storedDeepSeek.proactiveIntervalMinutes))) {
    settings.deepseek.proactiveIntervalMinutes = legacyProactive.intervalMinutes;
  }
  if (!Number.isFinite(Number(storedDeepSeek.proactiveDailyLimit))) {
    settings.deepseek.proactiveDailyLimit = legacyProactive.dailyLimit;
  }
  if (!Number.isFinite(Number(storedDeepSeek.girlfriendIntervalMinutes))) {
    settings.deepseek.girlfriendIntervalMinutes = legacyGirlfriend.firstDelayMinutes;
  }
  if (!Number.isFinite(Number(storedDeepSeek.girlfriendMaxFollowUps))) {
    settings.deepseek.girlfriendMaxFollowUps = legacyGirlfriend.maxFollowUps;
  }
  const hadRetiredSetting = (
    Object.prototype.hasOwnProperty.call(stored, 'outfit')
    || Object.prototype.hasOwnProperty.call(stored, 'outfitCatalogVersion')
    || Object.prototype.hasOwnProperty.call(stored, 'affection')
  );
  delete settings.outfit;
  delete settings.outfitCatalogVersion;
  delete settings.affection;
  lastSavedSettings = structuredClone(settings);

  let saveNormalizedSettings = hadRetiredSetting;
  const keyMigration = migratePlaintextApiKey(settings, safeStorage);
  legacyPlaintextKeyNeedsSecureStorage = keyMigration.warning;
  if (keyMigration.changed) saveNormalizedSettings = true;
  if (saveNormalizedSettings) saveSettings();
}

function saveSettings() {
  const rollbackState = structuredClone(lastSavedSettings || settings);
  try {
    assertProductDataWritable();
    persistJsonAtomic(settingsPath(), settings);
    if (weatherSettingsKey(lastSavedSettings) !== weatherSettingsKey(settings)) {
      weatherSettingsGeneration += 1;
    }
    lastSavedSettings = structuredClone(settings);
  } catch (error) {
    settings = rollbackState;
    throw error;
  }
}

function weatherSettingsKey(value) {
  const deepseek = value?.deepseek || {};
  return JSON.stringify([
    deepseek.weatherEnabled === true,
    String(deepseek.weatherCity || '').trim()
  ]);
}

function normalizeAppearanceSettings(value = {}) {
  const appearance = value && typeof value === 'object' ? value : {};
  return {
    wallpaper: normalizeWallpaperId(appearance.wallpaper, customWallpaperPath()),
    theme: ['auto', 'light', 'dark'].includes(appearance.theme) ? appearance.theme : 'auto',
    glassIntensity: ['soft', 'balanced', 'clear'].includes(appearance.glassIntensity)
      ? appearance.glassIntensity : 'balanced',
    transparency: boundedInteger(appearance.transparency, 58, 90, 72),
    uiScale: boundedInteger(appearance.uiScale, 90, 110, 100),
    chatDensity: ['comfortable', 'compact', 'relaxed'].includes(appearance.chatDensity)
      ? appearance.chatDensity : 'comfortable',
    motion: ['off', 'full', 'reduced'].includes(appearance.motion) ? appearance.motion : 'full',
    avatars: normalizeAvatarSelections(appearance.avatars, customAvatarPaths())
  };
}

function makeLocalId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeStoredMessage(message) {
  if (!message || !['user', 'assistant'].includes(message.role)) {
    return null;
  }
  const content = String(message.content || '').trim();
  if (!content) {
    return null;
  }
  const createdAt = message.createdAt || new Date().toISOString();
  return {
    id: String(message.id || stableId('message', message.role, createdAt, content)).slice(0, 120),
    role: message.role,
    content,
    action: PET_ACTIONS.has(message.action) ? message.action : undefined,
    emotion: PET_EMOTIONS.has(message.emotion) ? message.emotion : undefined,
    proactive: message.proactive === true,
    contextSource: message.contextSource === 'workspace' ? 'workspace' : undefined,
    source: ['girlfriend', 'greeting', 'reminder'].includes(message.source)
      ? message.source
      : undefined,
    createdAt
  };
}

function sessionTitleFromMessages(messages) {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  if (!firstUserMessage) {
    return '新对话';
  }
  const title = String(firstUserMessage.content || '')
    .replace(/\s+/g, ' ')
    .trim();
  return title.length > 26 ? `${title.slice(0, 26)}…` : title || '新对话';
}

function normalizeSession(session, fallbackMessages = []) {
  const messages = (Array.isArray(session?.messages) ? session.messages : fallbackMessages)
    .map(normalizeStoredMessage)
    .filter(Boolean);
  const createdAt = session?.createdAt || messages[0]?.createdAt || new Date().toISOString();
  const updatedAt = session?.updatedAt
    || messages[messages.length - 1]?.createdAt
    || createdAt;
  return {
    id: String(session?.id || makeLocalId('chat')),
    title: String(session?.title || sessionTitleFromMessages(messages)).trim().slice(0, 40) || '新对话',
    createdAt,
    updatedAt,
    messages
  };
}

function migrateLegacyAgentWorkspace() {
  workStore.load();
  const legacyPath = String(legacyAgentWorkspacePath || '').trim();
  if (!legacyPath) return;
  const existing = workStore.snapshot().projects;
  if (!existing.some((project) => project.workspacePath === legacyPath)) {
    try {
      const backup = path.join(app.getPath('userData'), 'mai-pet-deepseek-settings.before-work-projects.backup.json');
      ensureFileBackup(settingsPath(), backup);
      workStore.createProject({ name: existing.length ? '迁移的 Work 项目' : '默认项目', workspacePath: legacyPath });
    } catch (error) {
      console.error('Could not migrate the legacy Work workspace:', error);
      throw error;
    }
  }
  legacyAgentWorkspacePath = '';
  saveSettings();
}

const conversationState = createConversationState({
  createSession: () => normalizeSession({ id: makeLocalId('chat'), title: '新对话' }),
  sessionTitleFromMessages,
  maxSessions: MAX_CHAT_SESSIONS,
  maxMessages: MAX_MESSAGES_PER_SESSION,
  maxMessageChars: MAX_CHAT_MESSAGE_CHARS
});
const chatTurnStateWriter = createChatTurnStateWriter({
  getMemoryState: () => memoryState,
  setMemoryState: (state) => { memoryState = state; },
  conversationState,
  createId: makeLocalId,
  maxContactCount: MAX_CONTACT_COUNT,
  maxEpisodes: MAX_EPISODES,
  maxTopicThreads: MAX_TOPIC_THREADS,
  maxPeople: MAX_PEOPLE,
  maxProjects: MAX_PROJECTS,
  maxHabits: MAX_HABITS,
  saveMemory,
  broadcastSharedLifeState,
  scheduleGirlfriendFollowUp
});

function normalizeLegacyAgentArchive(stored) {
  const source = Array.isArray(stored?.legacyAgentArchive)
    ? stored.legacyAgentArchive
    : Array.isArray(stored?.agentSessions)
      ? stored.agentSessions
      : [];
  return source
    .map((session) => {
      const normalized = normalizeSession(session);
      return {
        ...normalized,
        title: String(session?.title || normalized.title || '旧任务记录').trim().slice(0, 80),
        archivedAt: session?.archivedAt || new Date().toISOString(),
        source: 'retired-agent-v5',
        runs: Array.isArray(session?.runs) ? session.runs.slice(-120) : [],
        taskState: session?.taskState && typeof session.taskState === 'object'
          ? session.taskState
          : null
      };
    })
    .filter((session) => session.messages.length || session.runs.length || session.taskState);
}

function normalizeMemoryState(stored) {
  const facts = resolveCanonicalFactConflicts((Array.isArray(stored?.facts) ? stored.facts : [])
    .map((fact) => ({
      id: String(fact?.id || makeLocalId('memory')),
      text: normalizeMemoryText(fact?.text),
      key: canonicalizeMemoryKey(fact?.key),
      category: MEMORY_CATEGORIES.has(fact?.category) ? fact.category : 'other',
      importance: Math.max(1, Math.min(5, Math.round(Number(fact?.importance) || 3))),
      pinned: fact?.pinned === true,
      source: fact?.source === 'manual' ? 'manual' : 'conversation',
      confidence: Math.max(0, Math.min(1, Number(fact?.confidence) || (fact?.source === 'manual' ? 1 : 0.75))),
      evidence: String(fact?.evidence || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      sourceSessionId: String(fact?.sourceSessionId || '').slice(0, 120),
      sourceMessageId: String(fact?.sourceMessageId || '').slice(0, 120),
      sourceCreatedAt: fact?.sourceCreatedAt || fact?.createdAt || '',
      evidenceTrail: normalizeEvidenceTrail(fact?.evidenceTrail, {
        evidence: fact?.evidence,
        sourceSessionId: fact?.sourceSessionId,
        sourceMessageId: fact?.sourceMessageId,
        sourceCreatedAt: fact?.sourceCreatedAt || fact?.createdAt,
        recordedAt: fact?.updatedAt || fact?.createdAt
      }),
      temporalStatus: normalizeTemporalMetadata(fact, fact?.sourceCreatedAt || fact?.createdAt).status,
      validFrom: normalizeTemporalMetadata(fact, fact?.sourceCreatedAt || fact?.createdAt).validFrom,
      validTo: normalizeTemporalMetadata(fact, fact?.sourceCreatedAt || fact?.createdAt).validTo,
      cause: normalizeTemporalMetadata(fact, fact?.sourceCreatedAt || fact?.createdAt).cause,
      effect: normalizeTemporalMetadata(fact, fact?.sourceCreatedAt || fact?.createdAt).effect,
      confirmationCount: Math.max(1, Math.round(Number(fact?.confirmationCount) || 1)),
      history: (Array.isArray(fact?.history) ? fact.history : [])
        .map((entry) => ({
          text: normalizeMemoryText(entry?.text),
          evidence: String(entry?.evidence || '').replace(/\s+/g, ' ').trim().slice(0, 240),
          temporalStatus: ['current', 'historical', 'future', 'uncertain'].includes(entry?.temporalStatus)
            ? entry.temporalStatus
            : 'historical',
          validFrom: entry?.validFrom || '',
          validTo: entry?.validTo || entry?.replacedAt || '',
          cause: String(entry?.cause || '').slice(0, 240),
           effect: String(entry?.effect || '').slice(0, 240),
           confirmationCount: Math.max(1, Math.round(Number(entry?.confirmationCount) || 1)),
           evidenceTrail: normalizeEvidenceTrail(entry?.evidenceTrail, {
             evidence: entry?.evidence,
             sourceSessionId: entry?.sourceSessionId,
             sourceMessageId: entry?.sourceMessageId,
             sourceCreatedAt: entry?.sourceCreatedAt,
             recordedAt: entry?.replacedAt
           }),
           replacedAt: entry?.replacedAt || ''
        }))
        .filter((entry) => entry.text)
        .slice(-12),
      useCount: Math.max(0, Math.round(Number(fact?.useCount) || 0)),
      lastUsedAt: fact?.lastUsedAt || '',
      retrievalCount: Math.max(0, Math.round(Number(fact?.retrievalCount ?? fact?.useCount) || 0)),
      lastRetrievedAt: fact?.lastRetrievedAt || fact?.lastUsedAt || '',
      lastConfirmedAt: fact?.lastConfirmedAt || fact?.updatedAt || fact?.createdAt || '',
      createdAt: fact?.createdAt || new Date().toISOString(),
      updatedAt: fact?.updatedAt || fact?.createdAt || new Date().toISOString()
    }))
    .filter((fact) => fact.text.length >= 3)
    .slice(0, MAX_LONG_TERM_MEMORIES));
  const memoryCorrections = (Array.isArray(stored?.memoryCorrections) ? stored.memoryCorrections : [])
    .map(normalizeMemoryCorrection)
    .filter((item) => item.targetKey || item.targetTextKey)
    .slice(-MAX_MEMORY_CORRECTIONS);
  const activeFacts = facts.filter((fact) => !memoryCandidateIsBlocked(fact, memoryCorrections));

  let sessions = (Array.isArray(stored?.sessions) ? stored.sessions : [])
    .map((session) => normalizeSession(session));

  if (!sessions.length && Array.isArray(stored?.history) && stored.history.length) {
    sessions = [normalizeSession({
      id: makeLocalId('chat'),
      title: '从旧版本恢复的对话'
    }, stored.history)];
  }

  if (!sessions.length) {
    sessions = [normalizeSession({ id: makeLocalId('chat'), title: '新对话' })];
  }

  const requestedActiveId = String(stored?.activeSessionId || '');
  const activeSessionId = normalizeActiveSessionId(sessions, requestedActiveId);

  const legacyAgentArchive = normalizeLegacyAgentArchive(stored);

  const lifeItems = (Array.isArray(stored?.lifeItems) ? stored.lifeItems : [])
    .map((item) => {
      const normalized = normalizeLifeItem(item);
      return {
        ...normalized,
        id: normalized.id || makeLocalId('life')
      };
    })
    .filter((item) => item.title && item.dueAt)
    .slice(0, MAX_LIFE_ITEMS);

  const storedWeather = stored?.reality?.weather;
  const weather = storedWeather && typeof storedWeather === 'object'
    ? {
        city: String(storedWeather.city || '').slice(0, 80),
        locationName: String(storedWeather.locationName || '').slice(0, 100),
        temperature: Number(storedWeather.temperature),
        apparentTemperature: Number(storedWeather.apparentTemperature),
        weatherCode: Number(storedWeather.weatherCode),
        description: String(storedWeather.description || '').slice(0, 60),
        windSpeed: Number(storedWeather.windSpeed),
        fetchedAt: Math.max(0, Number(storedWeather.fetchedAt) || 0)
      }
    : null;

  const mind = migrateMindState(stored?.mind, stored?.version);
  const normalizedMoments = normalizeMomentsState(stored, stored?.version, Date.now());
  const episodes = (Array.isArray(stored?.episodes) ? stored.episodes : [])
    .map((episode) => normalizeEpisode(episode))
    .filter((episode) => episode.title && episode.summary)
    .slice(0, MAX_EPISODES);
  const topicThreads = (Array.isArray(stored?.topicThreads) ? stored.topicThreads : [])
    .map((topic) => normalizeTopic(topic))
    .filter((topic) => topic.title)
    .slice(0, MAX_TOPIC_THREADS);
  const timeline = (Array.isArray(stored?.timeline) ? stored.timeline : [])
    .map((entry) => normalizeTimelineEntry(entry))
    .filter((entry) => entry.title)
    .slice(0, MAX_TIMELINE_ENTRIES);
  const people = (Array.isArray(stored?.people) ? stored.people : [])
    .map((person) => normalizePerson(person))
    .filter((person) => person.name && person.relation)
    .slice(0, MAX_PEOPLE);
  const memoryDigests = (Array.isArray(stored?.memoryDigests) ? stored.memoryDigests : [])
    .map((digest) => normalizeDigest(digest))
    .filter((digest) => digest.title && digest.content)
    .slice(0, MAX_MEMORY_DIGESTS);
  const continuity = deriveContinuityState({
    projects: stored?.projects,
    habits: stored?.habits,
    facts: activeFacts,
    continuityMeta: stored?.continuityMeta
  });
  const assistant = normalizeAssistantState(stored?.assistant, { lifeItems });

  const normalizedState = {
    ...(stored && typeof stored === 'object' ? stored : {}),
    version: MEMORY_SCHEMA_VERSION,
    facts: activeFacts,
    memoryCorrections,
    sessions,
    activeSessionId,
    legacyAgentArchive,
    mind,
    behaviorPatterns: normalizeBehaviorPatterns(stored?.behaviorPatterns),
    world: normalizeWorldState(stored?.world, Date.now()),
    episodes,
    topicThreads,
    sharedLifeMeta: {
      lastRebuiltAt: stored?.sharedLifeMeta?.lastRebuiltAt || '',
      lastRebuildMessageCount: Math.max(0, Number(stored?.sharedLifeMeta?.lastRebuildMessageCount) || 0)
    },
    timeline,
    people,
    memoryDigests,
    projects: continuity.projects.slice(0, MAX_PROJECTS),
    habits: continuity.habits.slice(0, MAX_HABITS),
    assistant,
    continuityMeta: {
      lastMigratedAt: stored?.continuityMeta?.lastMigratedAt || '',
      dismissedProjectOrigins: (Array.isArray(stored?.continuityMeta?.dismissedProjectOrigins)
        ? stored.continuityMeta.dismissedProjectOrigins : []).map(String).slice(-1000),
      dismissedHabitOrigins: (Array.isArray(stored?.continuityMeta?.dismissedHabitOrigins)
        ? stored.continuityMeta.dismissedHabitOrigins : []).map(String).slice(-1000)
    },
    hubMeta: {
      lastRebuiltAt: stored?.hubMeta?.lastRebuiltAt || '',
      lastRebuildMessageCount: Math.max(0, Number(stored?.hubMeta?.lastRebuildMessageCount) || 0),
      lastHealthCheckAt: stored?.hubMeta?.lastHealthCheckAt || ''
    },
    lifeItems,
    moments: normalizedMoments.moments,
    momentsMeta: normalizedMoments.momentsMeta,
    memoryMeta: {
      lastRebuiltAt: stored?.memoryMeta?.lastRebuiltAt || '',
      lastRebuildMessageCount: Math.max(0, Number(stored?.memoryMeta?.lastRebuildMessageCount) || 0)
    },
    reality: { weather },
    relationship: normalizeRelationshipState(stored?.relationship, MAX_CONTACT_COUNT)
  };
  normalizedState.timeline = rebuildTimeline(normalizedState, { max: MAX_TIMELINE_ENTRIES });
  normalizedState.memoryDigests = buildDigests(normalizedState.timeline, normalizedState.memoryDigests)
    .slice(0, MAX_MEMORY_DIGESTS);
  delete normalizedState.agentSessions;
  delete normalizedState.activeAgentSessionId;
  return normalizedState;
}

function loadMemory() {
  const source = memoryPath();
  let loaded;
  try {
    loaded = readJsonFile(source);
    if (loaded.exists && (!loaded.value || typeof loaded.value !== 'object' || Array.isArray(loaded.value))) {
      throw Object.assign(new Error('Memory JSON root must be an object.'), { code: 'JSON_SHAPE_ERROR' });
    }
  } catch (error) {
    if (!['JSON_PARSE_ERROR', 'JSON_SHAPE_ERROR'].includes(error?.code)) throw error;
    const recoveryPath = path.join(path.dirname(source), `mai-pet-memory.unreadable-${safeFileTimestamp()}.backup.json`);
    preserveFileAtomically(source, recoveryPath);
    console.error(`Unreadable memory database was preserved at ${recoveryPath}:`, error);
    memoryState = normalizeMemoryState({});
    lastSavedMemoryState = structuredClone(memoryState);
    saveMemory();
    return;
  }

  if (!loaded.exists) {
    memoryState = normalizeMemoryState({});
    lastSavedMemoryState = structuredClone(memoryState);
    return;
  }

  const stored = loaded.value;
  const needsMomentReplyRepair = (Array.isArray(stored?.moments) ? stored.moments : [])
    .some((moment) => (Array.isArray(moment?.comments) ? moment.comments : [])
      .some((comment) => (
        comment?.role === 'assistant'
        && normalizeMomentReplyText(comment.content, 600) !== normalizeMomentText(comment.content, 600)
      )));
  const normalized = normalizeMemoryState(stored);
  const needsSchemaUpgrade = Number(stored?.version || 0) < MEMORY_SCHEMA_VERSION;
  if (needsSchemaUpgrade) backupMemoryBeforeUpgrade(Number(stored?.version || 0));
  memoryState = normalized;
  lastSavedMemoryState = structuredClone(normalized);
  if (needsSchemaUpgrade && Number(stored?.version || 0) < 11) {
    if (Number(stored?.version || 0) < 7) rebuildMemoriesFromHistory({ save: false });
    if (Number(stored?.version || 0) < 8) rebuildSharedLifeFromHistory({ save: false });
    rebuildLifeHubFromHistory({ save: false });
    rebuildContinuityState();
    memoryState.assistant = normalizeAssistantState(memoryState.assistant, { lifeItems: memoryState.lifeItems });
  }
  if (needsSchemaUpgrade || needsMomentReplyRepair) saveMemory();
}

function backupMemoryBeforeUpgrade(version) {
  const source = memoryPath();
  try { fs.statSync(source); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const backup = path.join(
    path.dirname(source),
    `mai-pet-memory.before-v${MEMORY_SCHEMA_VERSION}-from-v${Math.max(0, version)}.backup.json`
  );
  return ensureFileBackup(source, backup);
}

function rebuildContinuityState() {
  const continuity = deriveContinuityState(memoryState);
  memoryState.projects = continuity.projects.slice(0, MAX_PROJECTS);
  memoryState.habits = continuity.habits.slice(0, MAX_HABITS);
  memoryState.continuityMeta = {
    ...(memoryState.continuityMeta || {}),
    lastMigratedAt: memoryState.continuityMeta?.lastMigratedAt || new Date().toISOString()
  };
  return continuity;
}

function synchronizeLifeHubState() {
  rebuildContinuityState();
  memoryState.assistant = normalizeAssistantState(memoryState.assistant, { lifeItems: memoryState.lifeItems });
  memoryState.timeline = rebuildTimeline(memoryState, { max: MAX_TIMELINE_ENTRIES });
  memoryState.memoryDigests = buildDigests(memoryState.timeline, memoryState.memoryDigests)
    .slice(0, MAX_MEMORY_DIGESTS);
  memoryState.version = MEMORY_SCHEMA_VERSION;
}

function saveMemory() {
  const rollbackState = structuredClone(lastSavedMemoryState || memoryState);
  try {
    assertProductDataWritable();
    synchronizeLifeHubState();
    persistJsonAtomic(memoryPath(), memoryState);
    lastSavedMemoryState = structuredClone(memoryState);
  } catch (error) {
    memoryState = rollbackState;
    throw error;
  }
}

function getDeepSeekApiKey() {
  // A development-only smoke can receive an ephemeral process key when the
  // Electron safe-storage context is unavailable. Normal app requests never
  // read this environment variable and the key is never persisted or logged.
  if (process.env.MAI_DEEPSEEK_INCREMENTAL_SMOKE === '1'
    || process.env.MAI_DEEPSEEK_REAL_SESSION_SMOKE === '1'
    || process.env.MAI_DEEPSEEK_SESSION_MESSAGE_BISECT === '1'
    || process.env.MAI_DEEPSEEK_SESSION_MESSAGE_SHAPE_AUDIT === '1') {
    const diagnosticKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
    if (diagnosticKey) return diagnosticKey;
  }
  return getStoredApiKey(settings, safeStorage, (error) => {
    console.error('Could not decrypt DeepSeek API key:', error);
  });
}

function setDeepSeekApiKey(apiKey) {
  setStoredApiKey(settings, apiKey, safeStorage);
  legacyPlaintextKeyNeedsSecureStorage = false;
}

function boundedInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function boundedNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, number));
}

function requiredIntegerSetting(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label}必须是 ${minimum}–${maximum} 之间的整数。`);
  }
  return number;
}

function proactivePolicy() {
  const legacy = PROACTIVE_POLICIES[settings.deepseek.proactiveFrequency]
    || PROACTIVE_POLICIES.balanced;
  return {
    intervalMinutes: boundedInteger(
      settings.deepseek.proactiveIntervalMinutes,
      MIN_CONTACT_INTERVAL_MINUTES,
      MAX_CONTACT_INTERVAL_MINUTES,
      legacy.intervalMinutes
    ),
    dailyLimit: boundedInteger(
      settings.deepseek.proactiveDailyLimit,
      MIN_CONTACT_COUNT,
      MAX_CONTACT_COUNT,
      legacy.dailyLimit
    )
  };
}

function girlfriendPolicy() {
  const legacy = GIRLFRIEND_INTENSITIES[settings.deepseek.girlfriendIntensity]
    || GIRLFRIEND_INTENSITIES.caring;
  return {
    intervalMinutes: boundedInteger(
      settings.deepseek.girlfriendIntervalMinutes,
      MIN_CONTACT_INTERVAL_MINUTES,
      MAX_CONTACT_INTERVAL_MINUTES,
      legacy.firstDelayMinutes
    ),
    maxFollowUps: boundedInteger(
      settings.deepseek.girlfriendMaxFollowUps,
      MIN_CONTACT_COUNT,
      MAX_CONTACT_COUNT,
      legacy.maxFollowUps
    )
  };
}

function publicDeepSeekSettings() {
  const proactive = proactivePolicy();
  const girlfriend = girlfriendPolicy();
  const wallpaper = currentWallpaperState();
  const avatars = currentAvatarState();
  return {
    provider: settings.model.provider,
    providers: modelGateway.providers(),
    configured: Boolean(getDeepSeekApiKey()),
    credentialStorageWarning: legacyPlaintextKeyNeedsSecureStorage
      ? '检测到旧版明文 API Key。系统安全存储不可用，因此已保留本机旧值并排除在所有备份和导出之外；请重新启用 Windows 安全存储后再保存 Key。'
      : '',
    model: DEEPSEEK_MODELS.has(settings.deepseek.model)
      ? settings.deepseek.model
      : 'deepseek-v4-flash',
    endpoint: DEEPSEEK_ENDPOINT,
    personality: PERSONALITY_PROMPTS[settings.deepseek.personality]
      ? settings.deepseek.personality
      : 'classic',
    customPrompt: String(settings.deepseek.customPrompt || '').slice(0, 1000),
    memoryEnabled: settings.deepseek.memoryEnabled !== false,
    proactiveGreetingEnabled: settings.deepseek.proactiveGreetingEnabled !== false,
    proactiveIntervalMinutes: proactive.intervalMinutes,
    proactiveDailyLimit: proactive.dailyLimit,
    girlfriendModeEnabled: settings.deepseek.girlfriendModeEnabled === true,
    girlfriendIntervalMinutes: girlfriend.intervalMinutes,
    girlfriendMaxFollowUps: girlfriend.maxFollowUps,
    momentsEnabled: settings.deepseek.momentsEnabled !== false,
    voice: {
      autoReadReplies: settings.voice.autoReadReplies === true,
      engine: settings.voice.engine === 'system' ? 'system' : 'local',
      culture: String(settings.voice.culture || 'zh-CN').slice(0, 12),
      voiceName: String(settings.voice.voiceName || '').slice(0, 160),
      rate: boundedNumber(settings.voice.rate, 0.7, 1.4, 1),
      pitch: boundedNumber(settings.voice.pitch, 0.7, 1.3, 1),
      volume: boundedNumber(settings.voice.volume, 0.1, 1, 1)
    },
    weatherEnabled: settings.deepseek.weatherEnabled === true,
    weatherCity: String(settings.deepseek.weatherCity || '').trim().slice(0, 80),
    appearance: {
      theme: settings.appearance.theme,
      glassIntensity: settings.appearance.glassIntensity,
      transparency: settings.appearance.transparency,
      uiScale: settings.appearance.uiScale,
      chatDensity: settings.appearance.chatDensity,
      motion: settings.appearance.motion
    },
    wallpaper: wallpaper.selected,
    wallpaperDefault: wallpaper.defaultId,
    wallpapers: wallpaper.wallpapers,
    avatarSelections: avatars.selections,
    avatarDefaults: avatars.defaults,
    avatarPaths: avatars.paths,
    avatars: avatars.avatars
  };
}

function actionConfiguration() {
  return normalizeActionConfiguration(settings.agent);
}

function saveActionConfiguration(next) {
  settings.agent = normalizeActionConfiguration(next);
  saveSettings();
  return settings.agent;
}

function publicPetSettings() {
  const { deepseek: _privateDeepSeek, ...petSettings } = settings;
  return {
    ...petSettings,
    invisibleMode: settings.invisibleMode === true,
    reminder: publicReminderState(),
    deepseek: publicDeepSeekSettings()
  };
}

function broadcastLocalTtsStatus(status = localTtsService.status()) {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.webContents.send('voice:local-status', status);
  }
  return status;
}

function publicReminderState() {
  const endAt = Number(settings.reminder?.endAt) || 0;
  const remainingMs = Math.max(0, endAt - Date.now());
  return {
    active: remainingMs > 0,
    endAt: remainingMs > 0 ? endAt : 0,
    remainingMs,
    label: String(settings.reminder?.label || '番茄钟').slice(0, 40),
    mode: ['study', 'work', 'reading', 'creative', 'rest', 'custom'].includes(settings.reminder?.mode)
      ? settings.reminder.mode
      : 'study',
    startedAt: Math.max(0, Number(settings.reminder?.startedAt) || 0),
    minutes: Math.max(1, Math.min(180, Number(settings.reminder?.minutes) || 25))
  };
}

function broadcastTimerState() {
  const state = publicReminderState();
  if (timerWindow && !timerWindow.isDestroyed()) {
    timerWindow.webContents.send('timer:state', state);
  }
  refreshTrayMenu();
  return state;
}

function reminderMenuLabel() {
  const state = publicReminderState();
  if (!state.active) {
    return '';
  }
  const totalSeconds = Math.ceil(state.remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${state.label} · ${minutes}:${seconds}`;
}

function scheduleReminder() {
  clearTimeout(reminderTimer);
  const state = publicReminderState();
  if (!state.active) {
    if (Number(settings.reminder?.endAt) > 0) {
      reminderTimer = setTimeout(finishReminder, 900);
    }
    return;
  }
  reminderTimer = setTimeout(finishReminder, Math.min(state.remainingMs, 2147483000));
}

function startReminder(minutes, label, mode = 'study') {
  const normalizedMinutes = Number(minutes);
  if (!Number.isFinite(normalizedMinutes) || normalizedMinutes < 1 || normalizedMinutes > 180) {
    throw new Error('倒计时必须在 1 到 180 分钟之间。');
  }
  const now = Date.now();
  const normalizedMode = ['study', 'work', 'reading', 'creative', 'rest', 'custom'].includes(mode) ? mode : 'study';
  settings.reminder = {
    endAt: now + Math.round(normalizedMinutes * 60 * 1000),
    label: String(label || '番茄钟').trim().slice(0, 40) || '番茄钟',
    mode: normalizedMode,
    startedAt: now,
    minutes: normalizedMinutes
  };
  memoryState.assistant = startFocusSession(memoryState.assistant, {
    minutes: normalizedMinutes,
    label: settings.reminder.label,
    mode: normalizedMode
  }, now);
  saveMemory();
  saveSettings();
  scheduleReminder();
  broadcastAssistantState();
  return broadcastTimerState();
}

function cancelReminder() {
  clearTimeout(reminderTimer);
  memoryState.assistant = finishFocusSession(memoryState.assistant, { cancelled: true }, Date.now());
  settings.reminder = { endAt: 0, label: '番茄钟', mode: 'study', startedAt: 0, minutes: 25 };
  saveMemory();
  saveSettings();
  broadcastAssistantState();
  return broadcastTimerState();
}

function finishReminder() {
  clearTimeout(reminderTimer);
  const label = String(settings.reminder?.label || '番茄钟').slice(0, 40);
  const mode = settings.reminder?.mode || 'study';
  memoryState.assistant = finishFocusSession(memoryState.assistant, {}, Date.now());
  settings.reminder = { endAt: 0, label: '番茄钟', mode: 'study', startedAt: 0, minutes: 25 };
  saveMemory();
  saveSettings();
  broadcastTimerState();
  broadcastAssistantState();
  showPet('jump');
  temporarilyRevealPet(10000);
  const payload = {
    content: `${label}时间到了。${mode === 'study' || mode === 'reading' ? '这一段学习已经记下来了，要不要顺手总结一下刚才最重要的内容？' : '辛苦了，休息一下再继续吧。'}`,
    action: 'jump',
    emotion: 'happy',
    createdAt: new Date().toISOString()
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pet:reminder', payload);
  }
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.webContents.send('chat:proactive-greeting', payload);
  }
}

function publicMemories() {
  return memoryState.facts
    .slice()
    .sort((left, right) => {
      const pinnedDifference = Number(right.pinned === true) - Number(left.pinned === true);
      if (pinnedDifference !== 0) {
        return pinnedDifference;
      }
      const importanceDifference = Number(right.importance || 0) - Number(left.importance || 0);
      if (importanceDifference !== 0) {
        return importanceDifference;
      }
      return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
    })
    .map((fact) => ({
      id: fact.id,
      text: fact.text,
      key: canonicalizeMemoryKey(fact.key),
      category: MEMORY_CATEGORIES.has(fact.category) ? fact.category : 'other',
      importance: fact.importance,
      pinned: fact.pinned === true,
      source: fact.source === 'manual' ? 'manual' : 'conversation',
      confidence: Math.max(0, Math.min(1, Number(fact.confidence) || 0)),
      evidence: String(fact.evidence || ''),
      sourceSessionId: String(fact.sourceSessionId || ''),
      sourceMessageId: String(fact.sourceMessageId || ''),
      sourceCreatedAt: fact.sourceCreatedAt || '',
      evidenceTrail: normalizeEvidenceTrail(fact.evidenceTrail, {
        evidence: fact.evidence,
        sourceSessionId: fact.sourceSessionId,
        sourceMessageId: fact.sourceMessageId,
        sourceCreatedAt: fact.sourceCreatedAt,
        recordedAt: fact.updatedAt
      }),
      temporalStatus: fact.temporalStatus || 'current',
      validFrom: fact.validFrom || '',
      validTo: fact.validTo || '',
      cause: fact.cause || '',
      effect: fact.effect || '',
      confirmationCount: Math.max(1, Number(fact.confirmationCount) || 1),
      history: Array.isArray(fact.history) ? fact.history.slice(-12) : [],
      useCount: Number(fact.useCount) || 0,
      lastUsedAt: fact.lastUsedAt || '',
      retrievalCount: Number(fact.retrievalCount ?? fact.useCount) || 0,
      lastRetrievedAt: fact.lastRetrievedAt || fact.lastUsedAt || '',
      lastConfirmedAt: fact.lastConfirmedAt || '',
      createdAt: fact.createdAt,
      updatedAt: fact.updatedAt
    }));
}

function publicMemoryDiagnostics() {
  const messages = memoryState.sessions.reduce(
    (total, session) => total + (Array.isArray(session.messages) ? session.messages.length : 0),
    0
  );
  const archivedTaskMessages = memoryState.legacyAgentArchive.reduce(
    (total, session) => total + (Array.isArray(session.messages) ? session.messages.length : 0),
    0
  );
  const continuity = buildPublicContinuityState(memoryState);
  return {
    version: memoryState.version,
    facts: memoryState.facts.length,
    pinnedFacts: memoryState.facts.filter((fact) => fact.pinned === true).length,
    rejectedFacts: (memoryState.memoryCorrections || []).length,
    episodes: (memoryState.episodes || []).length,
    openTopics: (memoryState.topicThreads || []).filter((topic) => ['active', 'waiting'].includes(topic.status)).length,
    timelineEntries: (memoryState.timeline || []).length,
    people: (memoryState.people || []).length,
    memoryDigests: (memoryState.memoryDigests || []).length,
    projects: continuity.projects.length,
    habits: continuity.habits.length,
    focusSessions: (memoryState.assistant?.focusSessions || []).length,
    knowledgeLibraries: knowledgeState.libraries.length,
    knowledgeDocuments: knowledgeState.documents.length,
    memoryReviewItems: continuity.reviews.length,
    sessions: memoryState.sessions.length,
    messages,
    archivedTaskSessions: memoryState.legacyAgentArchive.length,
    archivedTaskMessages,
    contextWindowTokens: DEEPSEEK_CONTEXT_WINDOW_TOKENS,
    maxPromptTokens: MAX_PROMPT_TOKENS,
    currentConversationTokenBudget: CURRENT_CONVERSATION_TOKEN_BUDGET,
    memoryContextTokenBudget: MEMORY_CONTEXT_TOKEN_BUDGET,
    historicalRecallTokenBudget: HISTORICAL_RECALL_TOKEN_BUDGET,
    maxStoredFacts: MAX_LONG_TERM_MEMORIES,
    maxMemoryFactsPerRequest: MAX_MEMORY_CONTEXT,
    maxStoredSessions: MAX_CHAT_SESSIONS,
    maxStoredMessagesPerSession: MAX_MESSAGES_PER_SESSION,
    maxContextMessagesPerRequest: MAX_CONTEXT_MESSAGES,
    lastRebuiltAt: memoryState.memoryMeta?.lastRebuiltAt || '',
    lastRebuildMessageCount: Number(memoryState.memoryMeta?.lastRebuildMessageCount) || 0
  };
}

function refreshWorldState(now = Date.now()) {
  memoryState.world = advanceWorldState(memoryState.world, now);
  return memoryState.world;
}

function publicEpisodes() {
  return (memoryState.episodes || [])
    .slice()
    .sort((left, right) => (
      Number(right.pinned === true) - Number(left.pinned === true)
      || String(right.sourceCreatedAt || right.createdAt).localeCompare(String(left.sourceCreatedAt || left.createdAt))
    ))
    .map((episode) => ({ ...normalizeEpisode(episode) }));
}

function publicTopicThreads() {
  return (memoryState.topicThreads || [])
    .slice()
    .sort((left, right) => (
      Number(['active', 'waiting'].includes(right.status)) - Number(['active', 'waiting'].includes(left.status))
      || String(right.updatedAt).localeCompare(String(left.updatedAt))
    ))
    .map((topic) => ({ ...normalizeTopic(topic) }));
}

function publicSharedLifeState() {
  return {
    world: { ...refreshWorldState() },
    episodes: publicEpisodes(),
    topics: publicTopicThreads(),
    meta: { ...(memoryState.sharedLifeMeta || {}) }
  };
}

function publicLifeHubState() {
  synchronizeLifeHubState();
  const health = inspectDatabase(memoryState);
  memoryState.hubMeta = {
    ...(memoryState.hubMeta || {}),
    lastHealthCheckAt: health.checkedAt
  };
  return {
    world: { ...refreshWorldState() },
    timeline: (memoryState.timeline || []).slice(0, 800).map((entry) => ({ ...entry, source: { ...(entry.source || {}) } })),
    people: (memoryState.people || []).map((person) => ({
      ...person,
      aliases: [...(person.aliases || [])],
      evidence: (person.evidence || []).map((item) => ({ ...item }))
    })),
    digests: (memoryState.memoryDigests || []).slice(0, 120).map((digest) => ({ ...digest, entryIds: [...(digest.entryIds || [])] })),
    health,
    meta: { ...(memoryState.hubMeta || {}) }
  };
}

function broadcastLifeHubState() {
  const state = publicLifeHubState();
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.webContents.send('chat:life-hub-updated', state);
  }
  return state;
}

function publicContinuity() {
  const state = buildPublicContinuityState(memoryState);
  return {
    ...state,
    meta: {
      lastMigratedAt: memoryState.continuityMeta?.lastMigratedAt || ''
    }
  };
}

function broadcastContinuityState() {
  const state = publicContinuity();
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.webContents.send('chat:continuity-updated', state);
  }
  return state;
}

function saveAndBroadcastContinuity() {
  saveMemory();
  broadcastLifeHubState();
  return broadcastContinuityState();
}

function publicAssistantState() {
  memoryState.world = advanceWorldState(memoryState.world, Date.now());
  const withPlan = ensureMaiPlan(memoryState.assistant, publicMindState(), memoryState.world, Date.now());
  memoryState.assistant = withPlan.state;
  return buildPublicAssistantState(memoryState.assistant, {
    lifeItems: publicLifeItems(),
    mind: publicMindState(),
    world: memoryState.world,
    settings: {
      ...settings.assistant,
      activityTrackingEnabled: settings.assistant.activityTrackingEnabled === true
    }
  });
}

function broadcastAssistantState() {
  const state = publicAssistantState();
  for (const window of [assistantWindow, chatWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('assistant:state-updated', state);
  }
  return state;
}

function publicKnowledgeState() {
  return buildPublicKnowledgeState(knowledgeState);
}

function broadcastKnowledgeState() {
  const state = publicKnowledgeState();
  if (assistantWindow && !assistantWindow.isDestroyed()) {
    assistantWindow.webContents.send('knowledge:state-updated', state);
  }
  return state;
}

function validClock(value, fallback) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : fallback;
}

function updateAssistantSettings(input = {}) {
  settings.assistant = {
    ...settings.assistant,
    morningEnabled: input.morningEnabled !== false,
    morningTime: validClock(input.morningTime, settings.assistant.morningTime || '08:00'),
    eveningEnabled: input.eveningEnabled !== false,
    eveningTime: validClock(input.eveningTime, settings.assistant.eveningTime || '21:30'),
    activityTrackingEnabled: input.activityTrackingEnabled === true,
    excludedApps: (Array.isArray(input.excludedApps) ? input.excludedApps : settings.assistant.excludedApps || [])
      .map((item) => String(item || '').trim().toLocaleLowerCase('zh-CN').slice(0, 100))
      .filter(Boolean).slice(0, 100),
    knowledgeAutoRefresh: input.knowledgeAutoRefresh !== false
  };
  saveSettings();
  scheduleActivityTracking();
  scheduleKnowledgeRefresh();
  scheduleProactiveGreeting(true);
  return broadcastAssistantState();
}

async function sampleForegroundApplication() {
  if (settings.assistant.activityTrackingEnabled !== true || quitting || !productDataWritesAllowed()) return null;
  const sample = await readForegroundApplication();
  if (!sample?.processName) return null;
  const normalizedName = sample.processName.toLocaleLowerCase('zh-CN').replace(/\.exe$/, '');
  const excluded = new Set((settings.assistant.excludedApps || []).map((item) => String(item).toLocaleLowerCase('zh-CN').replace(/\.exe$/, '')));
  if (excluded.has(normalizedName) || ['mai sakurajima', 'mai-sakurajima'].includes(normalizedName)) return null;
  const now = Date.now();
  const previousApp = memoryState.assistant?.appUsage?.current?.app || '';
  memoryState.assistant = applyActivitySample(memoryState.assistant, sample, now);
  if (previousApp !== memoryState.assistant.appUsage.current?.app || now - lastActivityPersistAt >= 60 * 1000) {
    saveMemory();
    lastActivityPersistAt = now;
  }
  broadcastAssistantState();
  return sample;
}

function scheduleActivityTracking() {
  clearInterval(activityTrackingTimer);
  activityTrackingTimer = null;
  if (settings.assistant.activityTrackingEnabled !== true || quitting || !productDataWritesAllowed()) return;
  sampleForegroundApplication().catch((error) => console.error('Could not sample foreground application:', error));
  activityTrackingTimer = setInterval(() => {
    sampleForegroundApplication().catch((error) => console.error('Could not sample foreground application:', error));
  }, ACTIVITY_SAMPLE_INTERVAL_MS);
}

function createAssistantBriefing(type = 'morning', options = {}) {
  const now = Number(options.now) || Date.now();
  const result = ensureBriefing(memoryState.assistant, {
    lifeItems: publicLifeItems(),
    projects: buildPublicContinuityState(memoryState, now).projects,
    habits: buildPublicContinuityState(memoryState, now).habits,
    weather: memoryState.reality?.weather
  }, type === 'review' ? 'review' : 'morning', now);
  memoryState.assistant = result.state;
  saveMemory();
  broadcastAssistantState();
  return result.brief;
}

function answerPromise(promiseId, response) {
  const result = answerAssistantPromise(memoryState.assistant, promiseId, response, Date.now());
  if (!result.promise) throw new Error('找不到这条承诺。');
  memoryState.assistant = result.state;
  const { promise } = result;
  if (promise.sourceItemId) {
    const item = memoryState.lifeItems.find((entry) => entry.id === promise.sourceItemId);
    if (item && promise.lastResponse === 'done') {
      item.completed = true;
      item.updatedAt = promise.updatedAt;
    }
  }
  saveMemory();
  return broadcastAssistantState();
}

async function importKnowledgeFiles(input = {}) {
  const requestedLibrary = knowledgeState.libraries.find((item) => item.id === String(input.libraryId || ''))
    || knowledgeState.libraries.find((item) => item.privacy === 'local')
    || knowledgeState.libraries[0];
  let filePaths = Array.isArray(input.paths) ? input.paths.map(String) : [];
  if (!filePaths.length) {
    const result = await dialog.showOpenDialog(assistantWindow || chatWindow || mainWindow, {
      title: '导入资料到麻衣的知识库',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '支持的资料', extensions: ['pdf', 'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'html', 'htm'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (result.canceled) return { ...publicKnowledgeState(), imported: 0, errors: [] };
    filePaths = result.filePaths;
  }
  const errors = [];
  let imported = 0;
  for (const filePath of filePaths.slice(0, 100)) {
    try {
      const extracted = await readKnowledgeDocument(filePath);
      const existing = knowledgeState.documents.find((item) => item.sourcePath.toLocaleLowerCase('zh-CN') === extracted.sourcePath.toLocaleLowerCase('zh-CN'));
      const document = createDocument({
        ...extracted,
        id: existing?.id,
        libraryId: requestedLibrary.id,
        createdAt: existing?.createdAt,
        tags: existing?.tags
      });
      knowledgeState = upsertDocument(knowledgeState, document);
      imported += 1;
    } catch (error) {
      errors.push({ file: path.basename(String(filePath || '')), error: error.message || String(error) });
    }
  }
  saveKnowledge();
  broadcastKnowledgeState();
  return { ...publicKnowledgeState(), imported, errors };
}

function addKnowledgeNote(input = {}) {
  const title = String(input.title || '').trim().slice(0, 180);
  const text = String(input.text || '').trim().slice(0, 2_000_000);
  const library = knowledgeState.libraries.find((item) => item.id === String(input.libraryId || '')) || knowledgeState.libraries[0];
  if (title.length < 2 || text.length < 2) throw new Error('笔记标题和内容至少需要 2 个字。');
  knowledgeState = upsertDocument(knowledgeState, createDocument({
    id: makeLocalId('knowledge-note'), libraryId: library.id, title, text, fileType: 'note', sourcePath: ''
  }));
  saveKnowledge();
  return broadcastKnowledgeState();
}

function addKnowledgeLibrary(input = {}) {
  const library = normalizeLibrary({ ...input, id: makeLocalId('library') });
  if (library.name.length < 2) throw new Error('知识库名称至少需要 2 个字。');
  knowledgeState.libraries.push(library);
  knowledgeState = normalizeKnowledgeState(knowledgeState);
  saveKnowledge();
  return broadcastKnowledgeState();
}

function updateKnowledgeLibrary(libraryId, input = {}) {
  const index = knowledgeState.libraries.findIndex((item) => item.id === String(libraryId || ''));
  if (index < 0) throw new Error('找不到这个知识库。');
  knowledgeState.libraries[index] = normalizeLibrary({
    ...knowledgeState.libraries[index], ...input, id: knowledgeState.libraries[index].id,
    createdAt: knowledgeState.libraries[index].createdAt, updatedAt: new Date().toISOString()
  });
  saveKnowledge();
  return broadcastKnowledgeState();
}

function deleteKnowledgeDocument(documentId) {
  knowledgeState.documents = knowledgeState.documents.filter((item) => item.id !== String(documentId || ''));
  saveKnowledge();
  return broadcastKnowledgeState();
}

function deleteKnowledgeLibrary(libraryId) {
  const id = String(libraryId || '');
  if (['library-chat', 'library-local', 'library-locked'].includes(id)) throw new Error('内置知识库不能删除，可以修改其隐私模式。');
  const fallback = knowledgeState.libraries.find((item) => item.id === 'library-local') || knowledgeState.libraries[0];
  knowledgeState.documents.forEach((item) => { if (item.libraryId === id) item.libraryId = fallback.id; });
  knowledgeState.libraries = knowledgeState.libraries.filter((item) => item.id !== id);
  saveKnowledge();
  return broadcastKnowledgeState();
}

async function refreshKnowledgeIndex() {
  assertProductDataWritable();
  if (knowledgeRefreshPromise) return knowledgeRefreshPromise;
  knowledgeRefreshPromise = (async () => {
    let updated = 0;
    for (const document of [...knowledgeState.documents]) {
      if (!document.sourcePath) continue;
      try {
        const stat = fs.statSync(document.sourcePath);
        if (!knowledgeDocumentNeedsRefresh(document, stat)) continue;
        const extracted = await readKnowledgeDocument(document.sourcePath);
        knowledgeState = upsertDocument(knowledgeState, createDocument({
          ...extracted, id: document.id, libraryId: document.libraryId, createdAt: document.createdAt, tags: document.tags
        }));
        updated += 1;
      } catch (error) {
        const target = knowledgeState.documents.find((item) => item.id === document.id);
        if (target) {
          target.status = fs.existsSync(document.sourcePath) ? 'error' : 'missing';
          target.error = String(error.message || error).slice(0, 500);
        }
      }
    }
    knowledgeState.lastRefreshAt = new Date().toISOString();
    saveKnowledge();
    broadcastKnowledgeState();
    return { state: publicKnowledgeState(), updated };
  })().finally(() => { knowledgeRefreshPromise = null; });
  return knowledgeRefreshPromise;
}

function scheduleKnowledgeRefresh() {
  clearInterval(knowledgeRefreshTimer);
  knowledgeRefreshTimer = null;
  if (settings.assistant.knowledgeAutoRefresh === false || quitting || !productDataWritesAllowed()) return;
  knowledgeRefreshTimer = setInterval(() => {
    refreshKnowledgeIndex().catch((error) => console.error('Could not refresh knowledge index:', error));
  }, KNOWLEDGE_REFRESH_INTERVAL_MS);
}

function addProject(input = {}) {
  const merged = mergeProjectCandidates(memoryState.projects, [{ ...input, manual: true }], {
    createdAt: new Date().toISOString()
  });
  if (!merged.stats.added && !merged.stats.updated) throw new Error('项目名称至少需要 2 个字。');
  memoryState.projects = merged.projects.slice(0, MAX_PROJECTS);
  scheduleProactiveGreeting(false, 60 * 1000);
  return saveAndBroadcastContinuity();
}

function updateProject(projectId, input = {}) {
  const index = memoryState.projects.findIndex((item) => item.id === String(projectId || ''));
  if (index < 0) throw new Error('找不到这个项目。');
  const current = memoryState.projects[index];
  const next = normalizeProject({
    ...current,
    ...input,
    id: current.id,
    title: input.title ?? current.title,
    outcome: input.outcome ?? current.outcome,
    steps: Array.isArray(input.steps) ? input.steps : current.steps,
    source: current.source,
    manual: current.manual,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  });
  if (next.title.length < 2) throw new Error('项目名称至少需要 2 个字。');
  memoryState.projects[index] = next;
  return saveAndBroadcastContinuity();
}

function deleteProject(projectId) {
  const id = String(projectId || '');
  const project = memoryState.projects.find((item) => item.id === id);
  if (project?.source?.originId) {
    memoryState.continuityMeta.dismissedProjectOrigins = [
      ...(memoryState.continuityMeta.dismissedProjectOrigins || []),
      project.source.originId
    ].slice(-1000);
  }
  memoryState.projects = memoryState.projects.filter((item) => item.id !== id);
  return saveAndBroadcastContinuity();
}

function addProjectStep(projectId, input = {}) {
  const project = memoryState.projects.find((item) => item.id === String(projectId || ''));
  if (!project) throw new Error('找不到这个项目。');
  const step = normalizeProjectStep({ ...input, createdAt: new Date().toISOString() });
  if (step.title.length < 2) throw new Error('步骤名称至少需要 2 个字。');
  project.steps = [...(project.steps || []), step].slice(0, 200);
  project.updatedAt = new Date().toISOString();
  return saveAndBroadcastContinuity();
}

function updateProjectStep(projectId, stepId, input = {}) {
  const project = memoryState.projects.find((item) => item.id === String(projectId || ''));
  if (!project) throw new Error('找不到这个项目。');
  const index = (project.steps || []).findIndex((step) => step.id === String(stepId || ''));
  if (index < 0) throw new Error('找不到这个步骤。');
  const current = project.steps[index];
  project.steps[index] = normalizeProjectStep({
    ...current,
    ...input,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  }, current.createdAt);
  project.updatedAt = new Date().toISOString();
  return saveAndBroadcastContinuity();
}

function deleteProjectStep(projectId, stepId) {
  const project = memoryState.projects.find((item) => item.id === String(projectId || ''));
  if (!project) throw new Error('找不到这个项目。');
  project.steps = (project.steps || []).filter((step) => step.id !== String(stepId || ''));
  project.updatedAt = new Date().toISOString();
  return saveAndBroadcastContinuity();
}

function addHabit(input = {}) {
  const merged = mergeHabitCandidates(memoryState.habits, [{ ...input, manual: true }], {
    createdAt: new Date().toISOString()
  });
  if (!merged.stats.added && !merged.stats.updated) throw new Error('习惯名称至少需要 2 个字。');
  memoryState.habits = merged.habits.slice(0, MAX_HABITS);
  scheduleProactiveGreeting(false, 60 * 1000);
  return saveAndBroadcastContinuity();
}

function updateHabit(habitId, input = {}) {
  const index = memoryState.habits.findIndex((item) => item.id === String(habitId || ''));
  if (index < 0) throw new Error('找不到这个习惯。');
  const current = memoryState.habits[index];
  const next = normalizeHabit({
    ...current,
    ...input,
    id: current.id,
    title: input.title ?? current.title,
    checkIns: current.checkIns,
    source: current.source,
    manual: current.manual,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  });
  if (next.title.length < 2) throw new Error('习惯名称至少需要 2 个字。');
  memoryState.habits[index] = next;
  return saveAndBroadcastContinuity();
}

function deleteHabit(habitId) {
  const id = String(habitId || '');
  const habit = memoryState.habits.find((item) => item.id === id);
  if (habit?.source?.originId) {
    memoryState.continuityMeta.dismissedHabitOrigins = [
      ...(memoryState.continuityMeta.dismissedHabitOrigins || []),
      habit.source.originId
    ].slice(-1000);
  }
  memoryState.habits = memoryState.habits.filter((item) => item.id !== id);
  return saveAndBroadcastContinuity();
}

function checkInHabit(habitId, input = {}) {
  const habit = memoryState.habits.find((item) => item.id === String(habitId || ''));
  if (!habit) throw new Error('找不到这个习惯。');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ''))
    ? String(input.date)
    : localDateKey(new Date());
  const existing = (habit.checkIns || []).find((item) => item.date === date);
  if (input.undo === true) {
    if (existing && existing.count > 1) existing.count -= 1;
    else habit.checkIns = (habit.checkIns || []).filter((item) => item.date !== date);
  } else if (existing) {
    existing.count = Math.min(99, existing.count + Math.max(1, Math.round(Number(input.count) || 1)));
    existing.note = String(input.note || existing.note || '').trim().slice(0, 160);
  } else {
    habit.checkIns = [...(habit.checkIns || []), {
      date,
      count: Math.max(1, Math.round(Number(input.count) || 1)),
      note: String(input.note || '').trim().slice(0, 160),
      createdAt: new Date().toISOString()
    }].slice(-1000);
  }
  habit.updatedAt = new Date().toISOString();
  return saveAndBroadcastContinuity();
}

async function createUserBackup() {
  assertProductDataWritable();
  const result = await dialog.showSaveDialog(chatWindow || mainWindow, {
    title: '备份 Mai Sakurajima 的全部本地数据',
    defaultPath: path.join(app.getPath('documents'), `Mai-Sakurajima-完整备份-${localDateKey(new Date())}.json`),
    filters: [{ name: 'Mai Sakurajima 备份', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  assertProductDataWritable();
  const bundle = createBackupBundle(snapshotUserDataForBackup());
  writeJsonAtomic(result.filePath, bundle);
  return { canceled: false, name: path.basename(result.filePath), path: result.filePath, size: fs.statSync(result.filePath).size };
}

async function exportUserData() {
  assertProductDataWritable();
  const result = await dialog.showSaveDialog(chatWindow || mainWindow, {
    title: '导出不含 API Key 的个人数据',
    defaultPath: path.join(app.getPath('documents'), `Mai-Sakurajima-数据导出-${localDateKey(new Date())}.json`),
    filters: [{ name: 'JSON 数据', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  assertProductDataWritable();
  writeJsonAtomic(result.filePath, createPortableExport(snapshotUserDataForBackup()));
  return { canceled: false, name: path.basename(result.filePath), path: result.filePath, size: fs.statSync(result.filePath).size };
}

async function restoreUserBackup() {
  assertProductDataWritable();
  const smokeBackupPath = process.env.MAI_RESTORE_PROTECTION_SMOKE === '1'
    ? String(process.env.MAI_RESTORE_PROTECTION_BACKUP || '')
    : '';
  const result = smokeBackupPath
    ? { canceled: false, filePaths: [smokeBackupPath] }
    : await dialog.showOpenDialog(chatWindow || mainWindow, {
      title: '恢复 Mai Sakurajima 完整备份',
      properties: ['openFile'],
      filters: [{ name: 'Mai Sakurajima 备份', extensions: ['json'] }]
    });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  assertProductDataWritable();
  const loaded = readJsonFile(result.filePaths[0]);
  if (!loaded.exists) throw new Error('所选备份文件不存在。');
  const current = snapshotUserDataForBackup();
  const plan = prepareBackupRestore(loaded.value, current);
  const currentCredentialAvailable = Boolean(getDeepSeekApiKey());
  const restoredMemory = normalizeMemoryState(plan.memory);
  const restoredKnowledge = normalizeKnowledgeState(plan.knowledge);
  const restoredWork = normalizeWorkState(plan.work);
  const requestedAppearance = plan.settings.appearance || {};
  const missingResources = [];
  const hasWallpaper = Boolean(plan.resources?.customWallpaper);
  if (requestedAppearance.wallpaper === CUSTOM_WALLPAPER_ID && !hasWallpaper) missingResources.push('自定义壁纸');
  const normalizedAvatarSelections = { ...(requestedAppearance.avatars || {}) };
  const avatarPaths = customAvatarPaths();
  for (const target of AVATAR_TARGETS) {
    const hasAvatar = Boolean(plan.resources?.customAvatars?.[target]);
    if (normalizedAvatarSelections[target] === CUSTOM_AVATAR_ID && !hasAvatar) {
      missingResources.push(target === 'mai' ? '麻衣头像' : '用户头像');
      normalizedAvatarSelections[target] = '';
    }
  }
  const appearanceForNormalization = {
    ...requestedAppearance,
    wallpaper: requestedAppearance.wallpaper === CUSTOM_WALLPAPER_ID && !hasWallpaper
      ? DEFAULT_WALLPAPER_ID
      : requestedAppearance.wallpaper,
    avatars: normalizedAvatarSelections
  };
  const restoredSettings = {
    ...plan.settings,
    model: { ...plan.settings.model, provider: PROVIDER_IDS.DEEPSEEK },
    appearance: normalizeAppearanceSettings(appearanceForNormalization)
  };
  if (requestedAppearance.wallpaper === CUSTOM_WALLPAPER_ID && hasWallpaper) {
    restoredSettings.appearance.wallpaper = CUSTOM_WALLPAPER_ID;
  }
  for (const target of AVATAR_TARGETS) {
    if (normalizedAvatarSelections[target] === CUSTOM_AVATAR_ID && plan.resources?.customAvatars?.[target]) {
      restoredSettings.appearance.avatars[target] = CUSTOM_AVATAR_ID;
    }
  }
  const priorMemoryState = memoryState;
  try {
    memoryState = restoredMemory;
    rebuildLifeHubFromHistory({ save: false });
    synchronizeLifeHubState();
  } finally {
    memoryState = priorMemoryState;
  }

  const jsonBytes = (value) => Buffer.from(JSON.stringify(value, null, 2), 'utf8');
  const resources = plan.resources || {};
  const resourceBytes = (value) => value ? Buffer.from(value.dataBase64, 'base64') : null;
  const entries = [
    { path: memoryPath(), data: jsonBytes(restoredMemory) },
    { path: settingsPath(), data: jsonBytes(restoredSettings) },
    { path: knowledgePath(), data: jsonBytes(restoredKnowledge) },
    { path: workStore.filePath, data: jsonBytes(restoredWork) },
    { path: customWallpaperPath(), data: resourceBytes(resources.customWallpaper) },
    ...AVATAR_TARGETS.map((target) => ({
      path: avatarPaths[target],
      data: resourceBytes(resources.customAvatars?.[target])
    }))
  ];

  // Validate and protect the complete current product snapshot before the
  // multi-file transaction starts. A failed automatic backup aborts restore.
  productDataGeneration += 1;
  chatRequestLifecycle.cancelAll('restore_started');
  createAutomaticBackup('before-restore');
  productDataWriteProtection.state = 'restore-in-progress';
  let transaction;
  try {
    transaction = commitFileSetAtomically(app.getPath('userData'), entries, {
      allowedTargets: [memoryPath(), settingsPath(), knowledgePath(), workStore.filePath, customWallpaperPath(), ...Object.values(avatarPaths)]
    });
  } catch (error) {
    if (error?.code === 'RESTORE_ROLLBACK_FAILED') {
      return freezeProductDataWritesAfterRollbackFailure(error);
    }
    productDataWriteProtection.state = 'ready';
    throw error;
  }
  productDataWriteProtection.state = 'ready';

  memoryState = restoredMemory;
  settings = restoredSettings;
  weatherSettingsGeneration += 1;
  knowledgeState = restoredKnowledge;
  workStore.adoptPersistedState(restoredWork);
  lastSavedMemoryState = structuredClone(memoryState);
  lastSavedSettings = structuredClone(settings);
  lastSavedKnowledgeState = structuredClone(knowledgeState);
  legacyPlaintextKeyNeedsSecureStorage = Boolean(
    settings.deepseek.apiKeyPlain && !safeStorage.isEncryptionAvailable()
  );
  const unavailableKnowledgeSources = (Array.isArray(knowledgeState.documents) ? knowledgeState.documents : [])
    .filter((document) => document.sourcePath)
    .flatMap((document) => {
      try {
        const stat = fs.statSync(document.sourcePath);
        return stat.isFile() ? [] : [{ title: document.title, sourcePath: document.sourcePath, status: 'not-a-file' }];
      } catch (error) {
        return [{ title: document.title, sourcePath: document.sourcePath, status: error?.code === 'EACCES' ? 'access-denied' : 'unavailable' }];
      }
    });
  scheduleProactiveGreeting(true);
  scheduleGirlfriendFollowUp();
  scheduleMomentPosting(true);
  scheduleActivityTracking();
  scheduleKnowledgeRefresh();
  return {
    canceled: false,
    config: publicDeepSeekSettings(),
    chat: publicChatState(),
    memories: publicMemories(),
    diagnostics: publicMemoryDiagnostics(),
    hub: broadcastLifeHubState(),
    continuity: broadcastContinuityState(),
    assistant: broadcastAssistantState(),
    knowledge: broadcastKnowledgeState(),
    credentialsMissing: !currentCredentialAvailable,
    missingResources,
    unavailableKnowledgeSources,
    cleanupWarnings: transaction.cleanupWarnings.map((error) => String(error?.message || error))
  };
}

function repairDatabase() {
  const before = inspectDatabase(memoryState);
  createAutomaticBackup('before-repair');
  memoryState = normalizeMemoryState(memoryState);
  const rebuilt = rebuildLifeHubFromHistory({ save: false });
  saveMemory();
  const after = inspectDatabase(memoryState);
  return { before, after, rebuilt, hub: broadcastLifeHubState() };
}

function addOrUpdatePerson(input = {}, personId = '') {
  const name = String(input.name || '').trim().slice(0, 80);
  const relation = String(input.relation || '').trim().slice(0, 40);
  if (!name || !relation) throw new Error('人物姓名和关系都不能为空。');
  const existing = memoryState.people.find((person) => person.id === String(personId || ''));
  const now = new Date().toISOString();
  if (existing) {
    existing.name = name;
    existing.relation = relation;
    existing.notes = String(input.notes || '').trim().slice(0, 600);
    existing.manual = true;
    existing.confidence = 1;
    existing.updatedAt = now;
  } else {
    memoryState.people.unshift(normalizePerson({
      id: makeLocalId('person'),
      name,
      relation,
      notes: input.notes,
      manual: true,
      confidence: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now
    }));
  }
  memoryState.people = memoryState.people.slice(0, MAX_PEOPLE);
  saveMemory();
  return broadcastLifeHubState();
}

function locateConversationSource(input = {}) {
  const requestedSessionId = String(input.sessionId || input.sourceSessionId || '');
  const requestedMessageId = String(input.messageId || input.sourceMessageId || '');
  const evidence = String(input.evidence || '').replace(/\s+/g, ' ').trim();
  const candidateSessions = requestedSessionId
    ? [getSession(requestedSessionId), ...memoryState.sessions.filter((session) => session.id !== requestedSessionId)].filter(Boolean)
    : memoryState.sessions;
  for (const session of candidateSessions) {
    const message = session.messages.find((item) => (
      (requestedMessageId && item.id === requestedMessageId)
      || (evidence && item.role === 'user' && evidenceAppearsInSource(evidence, item.content))
    ));
    if (!message) continue;
    conversationState.activateSession(memoryState, session.id);
    saveMemory();
    return { found: true, targetMessageId: message.id, ...publicChatState(session.id) };
  }
  return { found: false, targetMessageId: '', activeSessionId: memoryState.activeSessionId, sessions: publicSessions(), messages: publicSessionMessages() };
}

function broadcastSharedLifeState() {
  const state = publicSharedLifeState();
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.webContents.send('chat:shared-life-updated', state);
    chatWindow.webContents.send('chat:life-hub-updated', publicLifeHubState());
    chatWindow.webContents.send('chat:continuity-updated', publicContinuity());
  }
  return state;
}

function updateEpisodeEntry(id, input = {}) {
  const episode = memoryState.episodes.find((item) => item.id === String(id || ''));
  if (!episode) throw new Error('找不到这段共同回忆。');
  if (typeof input.pinned === 'boolean') episode.pinned = input.pinned;
  if (input.title) episode.title = String(input.title).trim().slice(0, 100);
  if (input.summary) episode.summary = String(input.summary).trim().slice(0, 600);
  episode.updatedAt = new Date().toISOString();
  saveMemory();
  return broadcastSharedLifeState();
}

function setTopicStatus(id, status) {
  if (!['active', 'waiting', 'resolved', 'paused'].includes(status)) {
    throw new Error('无效的话题状态。');
  }
  const topic = memoryState.topicThreads.find((item) => item.id === String(id || ''));
  if (!topic) throw new Error('找不到这个话题。');
  topic.status = status;
  topic.updatedAt = new Date().toISOString();
  if (status === 'resolved' || status === 'paused') {
    topic.pendingQuestion = '';
    topic.nextFollowUpAt = 0;
    topic.resolvedAt = status === 'resolved' ? topic.updatedAt : '';
  } else {
    topic.resolvedAt = '';
  }
  saveMemory();
  return broadcastSharedLifeState();
}

function getSession(sessionId = memoryState.activeSessionId) {
  return conversationState.getSession(memoryState, sessionId);
}

function ensureActiveSession(sessionId) {
  return conversationState.ensureActiveSession(memoryState, sessionId);
}

function publicSessionMessages(sessionId = memoryState.activeSessionId) {
  const session = getSession(sessionId);
  if (!session) {
    return [];
  }
  return session.messages
    .map(normalizeStoredMessage)
    .filter(Boolean);
}

function publicHistory() {
  return publicSessionMessages();
}

function publicSessions() {
  return memoryState.sessions
    .slice()
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .map((session) => {
      const latest = session.messages[session.messages.length - 1];
      return {
        id: session.id,
        title: session.title,
        preview: String(latest?.content || '还没有消息').replace(/\s+/g, ' ').slice(0, 72),
        messageCount: session.messages.length,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        active: session.id === memoryState.activeSessionId,
        runtimeMode: 'chat'
      };
    });
}

function publicChatState(sessionId = memoryState.activeSessionId) {
  const session = ensureActiveSession(sessionId);
  return {
    runtimeMode: 'chat',
    activeSessionId: session.id,
    sessions: publicSessions(),
    messages: publicSessionMessages(session.id),
    lastRun: null
  };
}

function resetRelationshipWaiting() {
  clearRelationshipWaiting(memoryState, MAX_CONTACT_COUNT);
  clearTimeout(girlfriendFollowUpTimer);
}

function createNewChatSession() {
  const previousSessionId = memoryState.activeSessionId;
  const { session } = conversationState.createNewSession(memoryState);
  if (session.id !== previousSessionId) {
    chatRequestLifecycle.cancelSession(previousSessionId, 'session_switched');
  }
  resetRelationshipWaiting();
  saveMemory();
  scheduleGirlfriendFollowUp();
  return publicChatState(session.id);
}

function selectChatSession(sessionId) {
  const requested = conversationState.getSession(memoryState, sessionId);
  if (!requested) {
    throw new Error('找不到这段历史对话，它可能已经被删除。');
  }
  const previousSessionId = memoryState.activeSessionId;
  if (previousSessionId !== requested.id) {
    chatRequestLifecycle.cancelSession(previousSessionId, 'session_switched');
  }
  const session = conversationState.activateSession(memoryState, sessionId);
  if (!session) {
    throw new Error('找不到这段历史对话，它可能已经被删除。');
  }
  saveMemory();
  return publicChatState(session.id);
}

function renameChatSession(sessionId, title) {
  const session = getSession(String(sessionId || ''));
  if (!session) {
    throw new Error('找不到这段历史对话，它可能已经被删除。');
  }
  const normalizedTitle = String(title || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!normalizedTitle) {
    throw new Error('对话名称不能为空。');
  }
  conversationState.renameSession(memoryState, session.id, normalizedTitle, new Date().toISOString());
  saveMemory();
  return publicChatState();
}

function deleteChatSession(sessionId) {
  chatRequestLifecycle.cancelSession(sessionId, 'session_deleted');
  conversationState.deleteSession(memoryState, sessionId);
  resetRelationshipWaiting();
  saveMemory();
  scheduleGirlfriendFollowUp();
  return publicChatState();
}

function clearChatHistory() {
  chatRequestLifecycle.cancelAll('history_cleared');
  const session = conversationState.clearSessions(memoryState);
  resetRelationshipWaiting();
  saveMemory();
  scheduleGirlfriendFollowUp();
  return publicChatState(session.id);
}

function normalizeMemoryText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 360);
}

function memoryKey(value) {
  return memoryTextKey(normalizeMemoryText(value));
}

function memoryLooksSensitive(value) {
  return /\bsk-[a-z0-9_-]+|api\s*key|密码|口令|验证码|身份证|银行卡|信用卡|私钥|助记词/i.test(value);
}

function mergeCandidateMemories(candidates, options = {}) {
  if ((!settings.deepseek.memoryEnabled && options.force !== true) || !Array.isArray(candidates)) {
    return { added: 0, updated: 0, skipped: 0 };
  }

  const now = new Date().toISOString();
  const sourceText = String(options.sourceText || '').trim();
  const manualSource = options.source === 'manual';
  const stats = { added: 0, updated: 0, skipped: 0 };
  for (const candidate of candidates.slice(0, MAX_MEMORY_CANDIDATES_PER_REPLY)) {
    const text = normalizeMemoryText(
      typeof candidate === 'string' ? candidate : candidate?.text
    );
    if (
      text.length < 3
      || memoryLooksSensitive(text)
      || (!manualSource && !shouldStoreAsLongTermFact({ ...(candidate || {}), text }))
      || (!manualSource && memoryCandidateIsBlocked({ ...candidate, text }, memoryState.memoryCorrections))
    ) {
      stats.skipped += 1;
      continue;
    }

    const evidence = String(candidate?.evidence || options.evidence || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
    if (!manualSource && sourceText && !evidenceAppearsInSource(evidence, sourceText)) {
      stats.skipped += 1;
      continue;
    }
    if (!manualSource && !sourceText && options.allowUnverified !== true) {
      stats.skipped += 1;
      continue;
    }

    const textKey = memoryKey(text);
    const factsWithTextKeys = memoryState.facts.map((fact) => ({
      ...fact,
      _textKey: memoryKey(fact.text)
    }));
    const importance = Math.max(1, Math.min(5, Math.round(Number(candidate?.importance) || 3)));
    const category = MEMORY_CATEGORIES.has(candidate?.category) ? candidate.category : 'other';
    const confidence = manualSource
      ? 1
      : Math.max(0.55, Math.min(1, Number(candidate?.confidence) || 0.82));
    const temporal = normalizeTemporalMetadata({ ...(candidate || {}), text, evidence }, options.sourceCreatedAt || now);
    const semanticKey = canonicalizeMemoryKey(candidate?.key);
    const matched = findMemoryMatch(factsWithTextKeys, {
      ...(typeof candidate === 'object' && candidate ? candidate : {}),
      text,
      key: semanticKey,
      category
    }, textKey);
    const existing = matched
      ? memoryState.facts.find((fact) => fact.id === matched.id)
      : null;
    if (existing) {
      const existingTrail = normalizeEvidenceTrail(existing.evidenceTrail, {
        evidence: existing.evidence,
        sourceSessionId: existing.sourceSessionId,
        sourceMessageId: existing.sourceMessageId,
        sourceCreatedAt: existing.sourceCreatedAt,
        recordedAt: existing.updatedAt
      });
      const repeatsSameSource = Boolean(options.sourceMessageId) && existingTrail.some((item) => (
        item.sourceMessageId === String(options.sourceMessageId)
        && item.sourceSessionId === String(options.sourceSessionId || '')
      ));
      if (repeatsSameSource && existing.text !== text && semanticKey) {
        stats.skipped += 1;
        continue;
      }
      const changesSemanticValue = existing.text !== text && Boolean(semanticKey);
      const protectedManualMemory = !manualSource
        && changesSemanticValue
        && (existing.source === 'manual' || existing.pinned === true);
      if (protectedManualMemory) {
        stats.skipped += 1;
        continue;
      }
      const evidenceSource = {
        evidence,
        sourceSessionId: options.sourceSessionId,
        sourceMessageId: options.sourceMessageId,
        sourceCreatedAt: options.sourceCreatedAt || now,
        recordedAt: now
      };
      if (changesSemanticValue) {
        existing.history = [
          ...(Array.isArray(existing.history) ? existing.history : []),
          {
            text: existing.text,
            evidence: existing.evidence || '',
            sourceSessionId: existing.sourceSessionId || '',
            sourceMessageId: existing.sourceMessageId || '',
            sourceCreatedAt: existing.sourceCreatedAt || '',
            temporalStatus: 'historical',
            validFrom: existing.validFrom || '',
            validTo: now,
            cause: existing.cause || '',
            effect: existing.effect || '',
            confirmationCount: Math.max(1, Number(existing.confirmationCount) || 1),
            evidenceTrail: normalizeEvidenceTrail(existing.evidenceTrail, {
              evidence: existing.evidence,
              sourceSessionId: existing.sourceSessionId,
              sourceMessageId: existing.sourceMessageId,
              sourceCreatedAt: existing.sourceCreatedAt,
              recordedAt: existing.updatedAt
            }),
            replacedAt: now
          }
        ].slice(-12);
        existing.text = text;
        existing.confidence = confidence;
        existing.evidence = evidence;
        existing.evidenceTrail = normalizeEvidenceTrail([], evidenceSource);
        existing.confirmationCount = Math.max(1, existing.evidenceTrail.length);
        existing.sourceSessionId = String(options.sourceSessionId || '').slice(0, 120);
        existing.sourceMessageId = String(options.sourceMessageId || '').slice(0, 120);
        existing.sourceCreatedAt = options.sourceCreatedAt || now;
      } else {
        const appended = appendEvidenceTrail(existing.evidenceTrail, evidenceSource);
        existing.evidenceTrail = appended.trail;
        if (appended.added) {
          existing.confirmationCount = Math.max(1, Number(existing.confirmationCount) || 1) + 1;
          if (evidence) existing.evidence = evidence;
          if (options.sourceSessionId) existing.sourceSessionId = String(options.sourceSessionId).slice(0, 120);
          if (options.sourceMessageId) existing.sourceMessageId = String(options.sourceMessageId).slice(0, 120);
          if (options.sourceCreatedAt) existing.sourceCreatedAt = options.sourceCreatedAt;
        }
        existing.confidence = Math.max(Number(existing.confidence) || 0, confidence);
      }
      existing.updatedAt = now;
      existing.lastConfirmedAt = now;
      existing.importance = Math.max(Number(existing.importance) || 1, importance);
      existing.category = category === 'other' ? existing.category : category;
      existing.key = semanticKey || existing.key || '';
      existing.temporalStatus = temporal.status;
      existing.validFrom = changesSemanticValue ? temporal.validFrom : (temporal.validFrom || existing.validFrom || '');
      existing.validTo = temporal.validTo;
      existing.cause = temporal.cause;
      existing.effect = temporal.effect;
      if (manualSource) {
        existing.source = 'manual';
        existing.pinned = options.pinned === true || existing.pinned === true;
        existing.confidence = 1;
      }
      if (!changesSemanticValue && !semanticKey && text.length >= existing.text.length) {
        existing.text = text;
      }
      stats.updated += 1;
      continue;
    }

    memoryState.facts.push({
      id: makeLocalId('memory'),
      text,
      key: semanticKey,
      category,
      importance,
      pinned: options.pinned === true,
      source: options.source === 'manual' ? 'manual' : 'conversation',
      confidence,
      evidence,
      sourceSessionId: String(options.sourceSessionId || '').slice(0, 120),
      sourceMessageId: String(options.sourceMessageId || '').slice(0, 120),
      sourceCreatedAt: options.sourceCreatedAt || now,
      evidenceTrail: normalizeEvidenceTrail([], {
        evidence,
        sourceSessionId: options.sourceSessionId,
        sourceMessageId: options.sourceMessageId,
        sourceCreatedAt: options.sourceCreatedAt || now,
        recordedAt: now
      }),
      temporalStatus: temporal.status,
      validFrom: temporal.validFrom,
      validTo: temporal.validTo,
      cause: temporal.cause,
      effect: temporal.effect,
      confirmationCount: 1,
      history: [],
      useCount: 0,
      lastUsedAt: '',
      retrievalCount: 0,
      lastRetrievedAt: '',
      lastConfirmedAt: now,
      createdAt: now,
      updatedAt: now
    });
    stats.added += 1;
  }

  memoryState.facts = resolveCanonicalFactConflicts(publicMemories()).slice(0, MAX_LONG_TERM_MEMORIES);
  if (options.save !== false) saveMemory();
  return stats;
}

function rebuildMemoriesFromHistory(options = {}) {
  const total = { messages: 0, candidates: 0, added: 0, updated: 0, skipped: 0 };
  for (const session of memoryState.sessions) {
    for (const message of Array.isArray(session.messages) ? session.messages : []) {
      if (message?.role !== 'user' || message.contextSource === 'workspace') continue;
      total.messages += 1;
      const candidates = extractExplicitMemoryCandidates(message.content);
      total.candidates += candidates.length;
      if (!candidates.length) continue;
      const stats = mergeCandidateMemories(candidates, {
        force: true,
        sourceText: message.content,
        sourceSessionId: session.id,
        sourceMessageId: message.id,
        sourceCreatedAt: message.createdAt,
        save: false
      });
      total.added += stats.added;
      total.updated += stats.updated;
      total.skipped += stats.skipped;
    }
  }
  memoryState.memoryMeta = {
    ...(memoryState.memoryMeta || {}),
    lastRebuiltAt: new Date().toISOString(),
    lastRebuildMessageCount: total.messages
  };
  if (options.save !== false) saveMemory();
  return total;
}

function rebuildSharedLifeFromHistory(options = {}) {
  const total = { messages: 0, candidates: 0, added: 0, updated: 0, skipped: 0 };
  let episodes = memoryState.episodes || [];
  for (const session of memoryState.sessions) {
    for (const message of Array.isArray(session.messages) ? session.messages : []) {
      if (message?.role !== 'user' || message.contextSource === 'workspace') continue;
      total.messages += 1;
      const candidates = extractEpisodeCandidates(message.content);
      total.candidates += candidates.length;
      if (!candidates.length) continue;
      const merged = mergeEpisodes(episodes, candidates, {
        sourceText: message.content,
        sourceSessionId: session.id,
        sourceMessageId: message.id,
        sourceCreatedAt: message.createdAt,
        max: MAX_EPISODES
      });
      episodes = merged.episodes;
      total.added += merged.stats.added;
      total.updated += merged.stats.updated;
      total.skipped += merged.stats.skipped;
    }
  }
  memoryState.episodes = episodes;
  memoryState.sharedLifeMeta = {
    ...(memoryState.sharedLifeMeta || {}),
    lastRebuiltAt: new Date().toISOString(),
    lastRebuildMessageCount: total.messages
  };
  if (options.save !== false) saveMemory();
  return total;
}

function rebuildLifeHubFromHistory(options = {}) {
  const rebuiltPeople = rebuildPeopleFromSessions(memoryState.people, memoryState.sessions, { max: MAX_PEOPLE });
  memoryState.people = rebuiltPeople.people;
  memoryState.timeline = rebuildTimeline(memoryState, { max: MAX_TIMELINE_ENTRIES });
  memoryState.memoryDigests = buildDigests(memoryState.timeline, memoryState.memoryDigests)
    .slice(0, MAX_MEMORY_DIGESTS);
  memoryState.hubMeta = {
    ...(memoryState.hubMeta || {}),
    lastRebuiltAt: new Date().toISOString(),
    lastRebuildMessageCount: rebuiltPeople.stats.messages
  };
  if (options.save !== false) saveMemory();
  return {
    ...rebuiltPeople.stats,
    timeline: memoryState.timeline.length,
    digests: memoryState.memoryDigests.length
  };
}

function addOrUpdateMemory(input, memoryId = '') {
  const text = normalizeMemoryText(input?.text);
  if (text.length < 3) {
    throw new Error('长期记忆至少需要 3 个字。');
  }
  if (memoryLooksSensitive(text)) {
    throw new Error('这条内容看起来包含敏感信息，未保存到长期记忆。');
  }
  const now = new Date().toISOString();
  const category = MEMORY_CATEGORIES.has(input?.category) ? input.category : 'other';
  const importance = Math.max(1, Math.min(5, Math.round(Number(input?.importance) || 3)));
  const semanticKey = canonicalizeMemoryKey(input?.key);
  const pinned = input?.pinned === true;
  const temporal = normalizeTemporalMetadata({ ...input, text }, now);
  memoryState.memoryCorrections = (memoryState.memoryCorrections || []).filter((correction) => (
    !memoryCandidateIsBlocked({ text, key: semanticKey }, [correction])
  ));
  const existing = memoryState.facts.find((fact) => fact.id === String(memoryId || ''));
  if (existing) {
    if (existing.text !== text) {
      existing.history = [
        ...(Array.isArray(existing.history) ? existing.history : []),
        {
          text: existing.text,
          evidence: existing.evidence || '',
          temporalStatus: existing.temporalStatus || 'historical',
          validFrom: existing.validFrom || '',
           validTo: now,
           cause: existing.cause || '',
           effect: existing.effect || '',
           confirmationCount: Math.max(1, Number(existing.confirmationCount) || 1),
           evidenceTrail: normalizeEvidenceTrail(existing.evidenceTrail, {
             evidence: existing.evidence,
             sourceSessionId: existing.sourceSessionId,
             sourceMessageId: existing.sourceMessageId,
             sourceCreatedAt: existing.sourceCreatedAt,
             recordedAt: existing.updatedAt
           }),
           replacedAt: now
        }
      ].slice(-12);
    }
    existing.text = text;
    existing.key = semanticKey || existing.key || '';
    existing.category = category;
    existing.importance = importance;
    existing.pinned = typeof input?.pinned === 'boolean' ? input.pinned : existing.pinned === true;
    existing.source = 'manual';
    existing.confidence = 1;
    existing.evidence = '';
    existing.evidenceTrail = [];
    existing.temporalStatus = temporal.status;
    existing.validFrom = temporal.validFrom;
    existing.validTo = temporal.validTo;
    existing.cause = temporal.cause;
    existing.effect = temporal.effect;
    existing.confirmationCount = Math.max(1, Number(existing.confirmationCount) || 1) + 1;
    existing.lastConfirmedAt = now;
    existing.updatedAt = now;
  } else {
    mergeCandidateMemories(
      [{
        text,
        key: semanticKey,
        category,
        importance,
        temporalStatus: temporal.status,
        validFrom: temporal.validFrom,
        validTo: temporal.validTo,
        cause: temporal.cause,
        effect: temporal.effect
      }],
      { force: true, source: 'manual', pinned }
    );
    for (const fact of memoryState.facts) {
      if (
        memoryKey(fact.text) === memoryKey(text)
        || (semanticKey && canonicalizeMemoryKey(fact.key) === semanticKey)
      ) {
        fact.source = 'manual';
        fact.pinned = pinned;
        fact.lastConfirmedAt = now;
      }
    }
    saveMemory();
    return publicMemories();
  }
  saveMemory();
  return publicMemories();
}

function correctMemory(memoryId, action, input = {}) {
  const fact = memoryState.facts.find((item) => item.id === String(memoryId || ''));
  if (!fact) throw new Error('找不到这条记忆，它可能已经被修改或删除。');
  const now = new Date().toISOString();
  if (action === 'confirm') {
    fact.source = 'manual';
    fact.confidence = 1;
    fact.confirmationCount = Math.max(1, Number(fact.confirmationCount) || 1) + 1;
    fact.lastConfirmedAt = now;
    fact.updatedAt = now;
    saveMemory();
    return publicMemories();
  }
  if (action === 'update') {
    return addOrUpdateMemory({
      text: input?.text,
      key: fact.key,
      category: input?.category || fact.category,
      importance: input?.importance || fact.importance,
      pinned: typeof input?.pinned === 'boolean' ? input.pinned : fact.pinned
    }, fact.id);
  }
  if (action === 'reject') {
    memoryState.memoryCorrections = [
      ...(memoryState.memoryCorrections || []),
      normalizeMemoryCorrection({
        targetKey: fact.key,
        targetText: fact.text,
        evidence: fact.evidence,
        note: input?.note || '用户标记为误会，禁止再次自动写入。',
        createdAt: now
      })
    ].slice(-MAX_MEMORY_CORRECTIONS);
    memoryState.facts = memoryState.facts.filter((item) => item.id !== fact.id);
    saveMemory();
    return publicMemories();
  }
  throw new Error('不支持的记忆纠正操作。');
}

function applySharedLifeTurn(userText, reply, sessionId, sourceCreatedAt = new Date().toISOString(), sourceMessageId = '') {
  return chatTurnStateWriter.applySharedLifeTurn(userText, reply, sessionId, sourceCreatedAt, sourceMessageId);
}

function appendConversationHistory(messages, reply, sessionId, turnOptions = {}) {
  return chatTurnStateWriter.appendConversationHistory(messages, reply, sessionId, turnOptions);
}

function appendProactiveHistory(reply, source = 'girlfriend', sessionId = memoryState.activeSessionId) {
  const now = new Date().toISOString();
  const session = conversationState.appendProactiveMessage(memoryState, {
    sessionId,
    message: {
      id: makeLocalId('message'),
      role: 'assistant',
      content: String(reply.content || '').trim(),
      action: reply.action,
      emotion: reply.emotion,
      proactive: true,
      source,
      createdAt: now
    },
    updatedAt: now
  });
  const timestamp = Date.now();
  recordCompanionMessage(memoryState, timestamp, MAX_CONTACT_COUNT);
  applyMindTurn(memoryState, {
    reply: {
      ...reply,
      mind: {
        ...(reply?.mind || {}),
        intimacyDelta: Number(reply?.mind?.intimacyDelta) || 0,
        trustDelta: Number(reply?.mind?.trustDelta) || 0
      }
    },
    topic: reply?.mind?.topic,
    now: timestamp
  });
  applySharedLifeTurn('', {
    ...reply,
    mind: {
      ...(reply?.mind || {}),
      topic: reply?.mind?.topic || memoryState.mind.activeTopic,
      pendingQuestion: reply?.mind?.pendingQuestion || memoryState.mind.pendingQuestion
    }
  }, session.id, now);
  if (source === 'greeting') {
    const today = localDateKey(new Date(timestamp));
    recordProactiveGreeting(memoryState, timestamp, today);
  }
  saveMemory();
  broadcastSharedLifeState();
  return session;
}

function publicMindState() {
  return chatPromptContext.publicMindState(memoryState);
}

function publicLifeItems() {
  return chatPromptContext.publicLifeItems(memoryState);
}

function addLifeItem(input, source = 'manual', options = {}) {
  const title = String(input?.title || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const dueAt = new Date(input?.dueAt || 0);
  if (title.length < 2) {
    throw new Error('事项名称至少需要 2 个字。');
  }
  if (Number.isNaN(dueAt.getTime())) {
    throw new Error('请选择有效的日期和时间。');
  }
  const now = new Date().toISOString();
  const normalized = normalizeLifeItem({
    id: makeLocalId('life'),
    title,
    kind: input?.kind,
    dueAt: dueAt.toISOString(),
    recurring: input?.recurring,
    priority: input?.priority,
    notes: input?.notes,
    promise: input?.promise === true || source === 'conversation',
    sourceSessionId: input?.sourceSessionId,
    sourceMessageId: input?.sourceMessageId,
    evidence: input?.evidence,
    completed: false,
    source,
    createdAt: now,
    updatedAt: now,
    lastRemindedAt: 0
  });
  const duplicate = memoryState.lifeItems.find((item) => (
    item.title.toLocaleLowerCase('zh-CN') === normalized.title.toLocaleLowerCase('zh-CN')
    && Math.abs(new Date(item.dueAt).getTime() - dueAt.getTime()) < 12 * 60 * 60 * 1000
  ));
  if (duplicate) {
    duplicate.dueAt = normalized.dueAt;
    duplicate.kind = normalized.kind;
    duplicate.recurring = normalized.recurring;
    duplicate.priority = normalized.priority;
    duplicate.notes = normalized.notes;
    duplicate.promise = normalized.promise;
    duplicate.sourceSessionId = normalized.sourceSessionId || duplicate.sourceSessionId;
    duplicate.sourceMessageId = normalized.sourceMessageId || duplicate.sourceMessageId;
    duplicate.evidence = normalized.evidence || duplicate.evidence;
    duplicate.completed = false;
    duplicate.updatedAt = now;
  } else {
    memoryState.lifeItems.push(normalized);
  }
  memoryState.lifeItems = publicLifeItems().slice(0, MAX_LIFE_ITEMS);
  if (options.save !== false) saveMemory();
  if (options.notify !== false) {
    scheduleProactiveGreeting(false, 60 * 1000);
    broadcastAssistantState();
  }
  return publicLifeState();
}

function mergeCommitments(candidates, options = {}) {
  if (!Array.isArray(candidates)) return { changed: false };
  let changed = false;
  for (const candidate of candidates.slice(0, 4)) {
    const dueAt = new Date(candidate?.dueAt || 0);
    const title = String(candidate?.title || '').trim();
    const evidence = String(candidate?.evidence || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (
      title.length < 2
      || Number.isNaN(dueAt.getTime())
      || dueAt.getTime() < Date.now() - 24 * 60 * 60 * 1000
      || memoryLooksSensitive(title)
      || (options.sourceText && (!evidence || !evidenceAppearsInSource(evidence, options.sourceText)))
    ) {
      continue;
    }
    addLifeItem({
      title,
      dueAt: dueAt.toISOString(),
      kind: candidate?.kind,
      recurring: candidate?.recurring,
      priority: candidate?.priority,
      promise: true,
      sourceSessionId: options.sourceSessionId,
      sourceMessageId: options.sourceMessageId,
      evidence
    }, 'conversation', {
      save: options.save !== false,
      notify: options.notify !== false
    });
    changed = true;
  }
  return { changed };
}

function toggleLifeItem(itemId, completed) {
  const item = memoryState.lifeItems.find((candidate) => candidate.id === String(itemId || ''));
  if (!item) {
    throw new Error('找不到这项生活记录。');
  }
  item.completed = Boolean(completed);
  item.updatedAt = new Date().toISOString();
  saveMemory();
  broadcastAssistantState();
  return publicLifeState();
}

function deleteLifeItem(itemId) {
  memoryState.lifeItems = memoryState.lifeItems.filter(
    (item) => item.id !== String(itemId || '')
  );
  saveMemory();
  broadcastAssistantState();
  return publicLifeState();
}

function resetMindState() {
  resetMind(memoryState);
  saveMemory();
  return publicLifeState();
}

function publicLifeState() {
  const weather = memoryState.reality?.weather;
  return {
    mind: publicMindState(),
    items: publicLifeItems(),
    weather: weather
      ? {
          ...weather,
          stale: Date.now() - Number(weather.fetchedAt || 0) >= WEATHER_CACHE_DURATION_MS
        }
      : null,
    weatherEnabled: settings.deepseek.weatherEnabled === true,
    weatherCity: String(settings.deepseek.weatherCity || '').trim().slice(0, 80)
  };
}

function currentTimeDetails(now = new Date()) {
  return chatPromptContext.currentTimeDetails(now);
}

async function fetchWeather(force = false) {
  return chatRealityContext.fetchWeather(force);
}

async function realityContext(requestOptions) {
  const prepared = await chatRealityContext.prepare(requestOptions || {});
  return requestOptions && typeof requestOptions === 'object' ? prepared : prepared.text;
}

function directLocalTimeReply(messages) {
  const lastUserMessage = messages.slice().reverse().find((message) => message.role === 'user');
  const content = String(lastUserMessage?.content || '').trim();
  if (!content || content.length > 56) {
    return null;
  }
  const asksCurrentTime = (
    /(?:现在|当前|今天|此刻|此时).{0,10}(?:几点|时间|日期|几月几日|几号|星期几|周几|哪一年|什么年份|几年)/.test(content)
    || /^(?:麻衣[，,\s]*)?(?:请问[，,\s]*)?(?:今天)?(?:几号|星期几|周几|现在几点)[？?。.！!\s]*$/.test(content)
    || /现在是(?:哪一年|几几年|什么年份)/.test(content)
  );
  if (!asksCurrentTime) {
    return null;
  }

  const current = currentTimeDetails();
  return {
    content: `现在是 ${current.formatted}（${current.timeZone}）。`,
    action: 'wave',
    emotion: 'happy',
    memories: [],
    commitments: [],
    mind: {
      mood: 'calm',
      energyDelta: 0,
      intimacyDelta: 0.05,
      trustDelta: 0.05,
      topic: '现实时间',
      pendingQuestion: ''
    },
    localTimeAnswer: true
  };
}

function renderSystemPrompt(
  structured,
  messages = [],
  externalReality = '',
  responseInstruction = '',
  sessionId = '',
  workspaceContext = ''
) {
  return chatPromptContext.renderSystemPrompt(
    structured,
    messages,
    externalReality,
    responseInstruction,
    sessionId,
    workspaceContext
  );
}

function buildSystemPrompt(
  structured,
  messages = [],
  externalReality = '',
  responseInstruction = '',
  sessionId = '',
  recordSections = null,
  workspaceContext = ''
) {
  const rendered = renderSystemPrompt(
    structured, messages, externalReality, responseInstruction, sessionId, workspaceContext
  );
  if (typeof recordSections === 'function') recordSections(rendered.sections);
  return rendered.text;
}

function activeSessionReplayInput() {
  const session = getSession();
  const storedMessages = Array.isArray(session?.messages) ? session.messages : [];
  const replaySource = storedMessages.slice();
  // Determine the real conversation endpoint before provider-bound history
  // serialization relabels historical assistant messages as quoted context.
  if (replaySource.at(-1)?.role === 'assistant') replaySource.pop();
  const messages = sanitizeMessages(replaySource).slice();
  if (!messages.length || messages.at(-1)?.role !== 'user') {
    throw new Error('活动会话中没有可重放的用户消息。请先正常发送一条消息后再运行诊断。');
  }
  return { messages, sessionId: session.id };
}

async function runDeepSeekIncrementalSmoke({ useActiveSession = false } = {}) {
  if (!getDeepSeekApiKey()) {
    const error = new Error('真实增量 smoke 需要当前 PowerShell 会话中的 DEEPSEEK_API_KEY。');
    error.code = 'missing_api_key';
    throw error;
  }
  const replay = useActiveSession
    ? activeSessionReplayInput()
    : {
        messages: [{
          role: 'user',
          content: '这是一次固定的开发诊断。请给用户一句简短、自然的中文回复。'
        }],
        sessionId: ''
      };
  const messages = replay.messages;
  const externalReality = await realityContext();
  let promptSections = [];
  buildSystemPrompt(true, messages, externalReality, '', replay.sessionId, (sections) => {
    promptSections = Array.isArray(sections) ? sections : [];
  });
  if (!promptSections.length) throw new Error('无法从生产 buildSystemPrompt() 取得 structured sections。');

  const result = await runIncrementalSmoke({
    sections: promptSections,
    messages,
    maxTokens: 700,
    request: ({ messages: requestMessages, maxTokens, structured }) => modelGateway.generate({
      messages: requestMessages,
      maxTokens,
      structured,
      onDelta: null
    }),
    fileSystem: fs,
    pathModule: path,
    directory: path.join(__dirname, 'logs')
  });
  console.info(JSON.stringify({
    diagnostic: 'DeepSeek Incremental Structured Smoke',
    production_section_order: result.productionSectionOrder,
    all_incremental_cases_passed: result.allIncrementalCasesPassed,
    last_success_case: result.lastSuccessCase,
    first_failure_case: result.firstFailureCase,
    first_failure_added_section: result.firstFailureAddedSection,
    suspect_features: result.suspectFeatures,
    message_profile: {
      mode: useActiveSession ? 'active_session_replay' : 'fixed_safe_message',
      message_count: messages.length,
      message_chars: messages.reduce((total, message) => total + String(message?.content || '').length, 0),
      roles: messages.map((message) => String(message?.role || 'unknown'))
    },
    result_files: result.paths
  }));
  return result;
}

async function runDeepSeekSessionMessageBisect() {
  if (!getDeepSeekApiKey()) {
    const error = new Error('真实消息二分 smoke 需要当前 PowerShell 会话中的 DEEPSEEK_API_KEY。');
    error.code = 'missing_api_key';
    throw error;
  }
  const replay = activeSessionReplayInput();
  const externalReality = await realityContext();
  let promptSections = [];
  buildSystemPrompt(true, replay.messages, externalReality, '', replay.sessionId, (sections) => {
    promptSections = Array.isArray(sections) ? sections : [];
  });
  const result = await runConversationMessageBisect({
    sections: promptSections,
    messages: replay.messages,
    maxTokens: 700,
    request: ({ messages: requestMessages, maxTokens, structured }) => modelGateway.generate({
      messages: requestMessages,
      maxTokens,
      structured,
      onDelta: null
    }),
    fileSystem: fs,
    pathModule: path,
    directory: path.join(__dirname, 'logs')
  });
  console.info(JSON.stringify({
    diagnostic: 'DeepSeek Session Message Bisect',
    history_turn_count: result.historyTurnCount,
    base_passed: result.basePassed,
    full_history_passed: result.fullHistoryPassed,
    outcome: result.outcome,
    result_files: result.paths
  }));
  return result;
}

async function runDeepSeekSessionMessageShapeAudit() {
  if (!getDeepSeekApiKey()) {
    const error = new Error('真实消息形状审计需要当前 PowerShell 会话中的 DEEPSEEK_API_KEY。');
    error.code = 'missing_api_key';
    throw error;
  }
  const replay = activeSessionReplayInput();
  const externalReality = await realityContext();
  let promptSections = [];
  buildSystemPrompt(true, replay.messages, externalReality, '', replay.sessionId, (sections) => {
    promptSections = Array.isArray(sections) ? sections : [];
  });
  const result = await runConversationMessageShapeAudit({
    sections: promptSections,
    messages: replay.messages,
    maxTokens: 700,
    request: ({ messages: requestMessages, maxTokens, structured }) => modelGateway.generate({
      messages: requestMessages,
      maxTokens,
      structured,
      onDelta: null
    }),
    fileSystem: fs,
    pathModule: path,
    directory: path.join(__dirname, 'logs')
  });
  console.info(JSON.stringify({
    diagnostic: 'DeepSeek Session Message Shape Audit',
    selected_turn_index: result.selectedTurnIndex,
    cases: result.records.map((record) => ({
      case: record.case,
      success: record.success,
      finish_reason: record.finish_reason,
      content_non_whitespace_chars: record.content_non_whitespace_chars
    })),
    result_files: result.paths
  }));
  return result;
}

function greetingPeriod(hour) {
  if (hour >= 6 && hour < 11) {
    return 'morning';
  }
  if (hour >= 11 && hour < 14) {
    return 'noon';
  }
  if (hour >= 14 && hour < 18) {
    return 'afternoon';
  }
  if (hour >= 18 || hour < 3) {
    return 'evening';
  }
  return 'late';
}

function proactiveGreeting() {
  const personality = PROACTIVE_GREETINGS[settings.deepseek.personality]
    ? settings.deepseek.personality
    : 'classic';
  const period = greetingPeriod(new Date().getHours());
  const options = PROACTIVE_GREETINGS[personality][period];
  const greeting = options[Math.floor(Math.random() * options.length)];
  const questions = PROACTIVE_QUESTIONS[period];
  const question = questions[Math.floor(Math.random() * questions.length)];
  const content = /[？?]/.test(greeting) ? greeting : `${greeting} ${question}`;
  const hour = new Date().getHours();
  return {
    content,
    action: hour >= 3 && hour < 6 ? 'sleep' : personality === 'focused' ? 'work' : 'wave',
    emotion: hour >= 3 && hour < 6 ? 'sleepy' : personality === 'focused' ? 'focused' : 'happy'
  };
}

function fallbackProactiveMessage(decision = {}) {
  if (decision.reason === 'morning_briefing') {
    return {
      content: `${decision.brief?.content || '早上好。先看一眼今天的安排吧。'} 你今天最想优先完成哪一件？`,
      action: 'wave',
      emotion: 'happy'
    };
  }
  if (decision.reason === 'evening_review') {
    return {
      content: `${decision.brief?.content || '到晚间复盘的时间了。'} 今天哪件事最值得你给自己一点肯定？`,
      action: 'wave',
      emotion: 'concerned'
    };
  }
  if (decision.reason === 'promise_follow_up' && decision.promise) {
    return {
      content: `你之前说过“${decision.promise.title}”。现在是已经完成、需要延期，还是计划有变化？`,
      action: 'wave',
      emotion: 'curious'
    };
  }
  if (decision.reason === 'long_work_session' && decision.app) {
    return {
      content: `你已经在 ${decision.app.label} 里专注挺久了。要不要先活动一下、喝口水，再决定接着做什么？`,
      action: 'wave',
      emotion: 'concerned'
    };
  }
  if (decision.reason === 'topic_thread' && decision.topicThread) {
    const question = decision.topicThread.pendingQuestion
      || `“${decision.topicThread.title}”后来怎么样了？`;
    return {
      content: `我还记得我们之前聊到的事。${question}`,
      action: 'wave',
      emotion: 'curious'
    };
  }
  if (decision.reason === 'upcoming_life_item' && decision.item) {
    return {
      content: `“${decision.item.title}”快到时间了。准备得怎么样，需要我陪你再确认一下吗？`,
      action: 'work',
      emotion: 'focused'
    };
  }
  if (decision.reason === 'overdue_life_item' && decision.item) {
    return {
      content: `我还记得“${decision.item.title}”。这件事已经到时间了，你完成了吗？`,
      action: 'wave',
      emotion: 'concerned'
    };
  }
  if (decision.reason === 'project_upcoming' && decision.project) {
    return {
      content: `“${decision.project.title}”快到目标时间了。你现在最想先推进哪一步？`,
      action: 'work',
      emotion: 'focused'
    };
  }
  if (decision.reason === 'project_overdue' && decision.project) {
    return {
      content: `我还记得“${decision.project.title}”。计划需要调整，还是已经有了新进展？`,
      action: 'wave',
      emotion: 'concerned'
    };
  }
  if (decision.reason === 'habit_check_in' && decision.habit) {
    return {
      content: `今天的“${decision.habit.title}”还没有打卡。是还没开始，还是做了但忘记记下来？`,
      action: 'wave',
      emotion: 'curious'
    };
  }
  if (decision.reason === 'pending_question' && decision.pendingQuestion) {
    return {
      content: `我还在等你回答刚才那句呢——${decision.pendingQuestion}`,
      action: 'wave',
      emotion: 'curious'
    };
  }
  if (decision.reason === 'continue_topic' && decision.topic) {
    return {
      content: `刚才说到“${decision.topic}”，后来怎么样了？`,
      action: 'wave',
      emotion: 'curious'
    };
  }
  return proactiveGreeting();
}

function proactiveReasonInstruction(decision = {}) {
  const reasonMap = {
    manual_preview: '用户正在预览主动聊天，请展示一次自然的主动提问。',
    first_greeting: '这是今天第一次主动联系，可以轻松地询问用户现在的状态或计划。',
    caring_check_in: '用户已经安静了一段时间，请自然关心近况并提出一个具体问题。',
    topic_thread: `未完成话题“${decision.topicThread?.title || ''}”已经到了适合跟进的时间，请结合记录自然询问一次，不要机械复读。`,
    pending_question: `之前的问题“${decision.pendingQuestion || ''}”还没有得到回答，请温和追问，但不要施压。`,
    continue_topic: `最近关注的话题是“${decision.topic || ''}”，请询问它的最新进展。`,
    upcoming_life_item: `生活面板中的“${decision.item?.title || ''}”即将到时间，请自然提醒并询问准备情况。`,
    overdue_life_item: `生活面板中的“${decision.item?.title || ''}”已经到时间，请关心是否完成。`,
    project_upcoming: `用户项目“${decision.project?.title || ''}”即将到目标时间，请结合下一步自然询问进展。`,
    project_overdue: `用户项目“${decision.project?.title || ''}”已经超过目标时间，请关心真实进展，并允许用户调整计划。`,
    habit_check_in: `用户今天尚未完成习惯“${decision.habit?.title || ''}”，请轻松询问一次，不要训斥或连续催促。`,
    morning_briefing: `这是今天的晨间简报：${decision.brief?.content || ''} 请自然概括重点并询问用户最优先的一件事。`,
    evening_review: `这是今天的晚间复盘：${decision.brief?.content || ''} 请肯定真实完成项，并邀请用户说说今天的感受；不要把未完成说成失败。`,
    promise_follow_up: `用户曾明确承诺“${decision.promise?.title || ''}”。这是去重账本允许的本次跟进，请询问完成、延期或取消，不要指责。`,
    long_work_session: `用户已在获准记录的应用“${decision.app?.label || ''}”连续停留超过九十分钟。只说应用名称和持续较久，不得猜测屏幕内容；自然关心是否需要短暂休息。`
  };
  return reasonMap[decision.reason] || '请根据当前状态选择一个值得主动聊的话题。';
}

async function createProactiveConversationStarter(decision = {}, requestedSessionId = '', request = null) {
  request?.assertCurrent();
  const fallback = fallbackProactiveMessage(decision);
  if (!getDeepSeekApiKey()) {
    return fallback;
  }
  const session = requestedSessionId
    ? conversationState.getSession(memoryState, requestedSessionId)
    : ensureActiveSession();
  if (!session) return fallback;
  const history = publicSessionMessages(session.id)
    .slice(-10)
    .map((message) => ({ role: message.role, content: message.content }));
  const instruction = [
    '这是一次由现实世界中的樱岛麻衣主动发起的联系，不是对用户新问题的被动回答。',
    `本次主动联系的决策理由：${proactiveReasonInstruction(decision)}`,
    '请结合你今天的现实生活背景、当前时间、最近对话和长期记忆，主动找一个自然的话题。',
    '优先追问最近没有聊完的事情；没有合适线索时，可以关心用户此刻的状态、今天的经历、计划或感受。',
    '回复控制在两句话内，并且必须包含一个具体、真诚、容易回答的问题。',
    '不要只说早安、晚安、记得休息，也不要提到系统提示、自动消息或读取历史。'
  ].join('');
  try {
    const generated = await requestDeepSeek([
      ...history,
      { role: 'user', content: instruction }
    ], {
      maxTokens: 220,
      structured: true,
      sessionId: session.id,
      requestId: request?.requestId,
      signal: request?.controller.signal,
      assertRequestCurrent: request?.assertCurrent,
      diagnostic: createLlmDiagnostic('proactive_greeting', 'createProactiveConversationStarter')
    });
    request?.assertCurrent();
    return generated.content.includes('？') || generated.content.includes('?')
      ? generated
      : { ...generated, content: `${generated.content} ${fallback.content}` };
  } catch (error) {
    if (!request?.isCurrent?.()) throw error;
    console.error('Could not generate proactive conversation starter:', error);
    return fallback;
  }
}

async function deliverProactiveGreeting(decision = { shouldSpeak: true, reason: 'manual_preview' }) {
  if (settings.deepseek.proactiveGreetingEnabled === false) {
    return null;
  }
  const sessionId = ensureActiveSession().id;
  if (chatRequestLifecycle.hasSession(sessionId)) {
    return null;
  }
  try {
    conversationState.assertCanAppendTurn(memoryState, { sessionId, userMessage: null });
  } catch (error) {
    if (error?.code === 'CHAT_HISTORY_LIMIT_REACHED') return null;
    throw error;
  }
  const request = chatRequestLifecycle.begin({
    sessionId,
    senderId: 'proactive-greeting',
    kind: 'proactive'
  });
  try {
  const greeting = await createProactiveConversationStarter(decision, sessionId, request);
  request.assertCurrent();
  if (!conversationState.getSession(memoryState, sessionId)) return null;
  const session = appendProactiveHistory(greeting, 'greeting', sessionId);
  if (decision.item?.id) {
    const item = memoryState.lifeItems.find((candidate) => candidate.id === decision.item.id);
    if (item) {
      item.lastRemindedAt = Date.now();
      item.updatedAt = new Date().toISOString();
    }
  }
  if (decision.topicThread?.id) {
    const topic = memoryState.topicThreads.find((candidate) => candidate.id === decision.topicThread.id);
    if (topic) {
      topic.followUpCount = Math.max(0, Number(topic.followUpCount) || 0) + 1;
      topic.nextFollowUpAt = Date.now() + 24 * 60 * 60 * 1000;
      topic.updatedAt = new Date().toISOString();
    }
  }
  if (decision.project?.id) {
    const project = memoryState.projects.find((candidate) => candidate.id === decision.project.id);
    if (project) project.lastFollowUpAt = Date.now();
  }
  if (decision.habit?.id) {
    const habit = memoryState.habits.find((candidate) => candidate.id === decision.habit.id);
    if (habit) habit.lastFollowUpAt = Date.now();
  }
  if (decision.assistantCue?.key || ['morning_briefing', 'evening_review', 'promise_follow_up', 'long_work_session'].includes(decision.reason)) {
    memoryState.assistant = markAssistantCue(memoryState.assistant, decision.assistantCue || decision, Date.now());
  }
  recordProactiveReason(memoryState, decision.reason);
  saveMemory();
  const payload = {
    ...greeting,
    proactive: true,
    source: 'greeting',
    reason: decision.reason,
    sessionId: session.id,
    createdAt: session.messages.at(-1)?.createdAt || new Date().toISOString()
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.showInactive();
    mainWindow.webContents.send('pet:proactive-greeting', payload);
  }
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.webContents.send('chat:proactive-greeting', payload);
  }
  settings.deepseek.lastGreetingAt = Date.now();
  saveSettings();
  return payload;
  } catch (error) {
    if (request.status === 'cancelled') return null;
    throw error;
  } finally {
    request.finish();
  }
}

function scheduleProactiveGreeting(initial = false, requestedDelayMs = 0) {
  clearTimeout(proactiveGreetingTimer);
  if (settings.deepseek.proactiveGreetingEnabled === false || quitting || !productDataWritesAllowed()) {
    return;
  }

  const policy = proactivePolicy();
  const policyCheckDelay = Math.max(
    60 * 1000,
    Math.min(policy.intervalMinutes * 60 * 1000, 30 * 60 * 1000)
  );
  const delay = requestedDelayMs > 0
    ? requestedDelayMs
    : initial
      ? Math.min(3 * 60 * 1000, policyCheckDelay)
      : policyCheckDelay;
  proactiveGreetingTimer = setTimeout(async () => {
    let nextDelay = policyCheckDelay;
    try {
      const decisionNow = Date.now();
      let decision = decideProactive({
        now: decisionNow,
        mind: memoryState.mind,
        items: memoryState.lifeItems,
        intervalMinutes: policy.intervalMinutes,
        dailyLimit: policy.dailyLimit,
        appStartedAt
      });
      const dueTopic = selectTopicContext(memoryState.topicThreads, { limit: MAX_TOPIC_CONTEXT })
        .find((topic) => topic.nextFollowUpAt > 0 && topic.nextFollowUpAt <= decisionNow);
      const currentMind = normalizeMindState(memoryState.mind);
      const continuityCue = continuityProactiveCue(memoryState, decisionNow);
      const assistantCue = assistantProactiveCue(memoryState.assistant, {
        lifeItems: memoryState.lifeItems,
        settings: settings.assistant
      }, decisionNow);
      const topicCanSpeak = (
        dueTopic
        && currentMind.dailyProactiveCount < policy.dailyLimit
        && decisionNow - currentMind.lastProactiveAt >= policy.intervalMinutes * 60 * 1000
        && (new Date(decisionNow).getHours() >= 7 || new Date(decisionNow).getHours() < 1)
      );
      if (!decision.shouldSpeak && topicCanSpeak) {
        decision = { shouldSpeak: true, reason: 'topic_thread', topicThread: dueTopic };
      }
      const continuityCanSpeak = (
        continuityCue
        && currentMind.dailyProactiveCount < policy.dailyLimit
        && decisionNow - currentMind.lastProactiveAt >= policy.intervalMinutes * 60 * 1000
        && (new Date(decisionNow).getHours() >= 7 || new Date(decisionNow).getHours() < 1)
      );
      if (!decision.shouldSpeak && continuityCanSpeak) {
        decision = { shouldSpeak: true, ...continuityCue };
      }
      const assistantCanSpeak = (
        assistantCue
        && currentMind.dailyProactiveCount < policy.dailyLimit
        && decisionNow - currentMind.lastProactiveAt >= policy.intervalMinutes * 60 * 1000
        && new Date(decisionNow).getHours() >= 7
        && new Date(decisionNow).getHours() < 23
      );
      if (assistantCanSpeak) {
        let brief = null;
        if (assistantCue.reason === 'morning_briefing') brief = createAssistantBriefing('morning', { now: decisionNow });
        if (assistantCue.reason === 'evening_review') brief = createAssistantBriefing('review', { now: decisionNow });
        decision = { shouldSpeak: true, ...assistantCue, assistantCue, brief };
      }
      if (decision.shouldSpeak) {
        await deliverProactiveGreeting(decision);
      } else if (Number.isFinite(decision.nextCheckMs)) {
        nextDelay = Math.max(60 * 1000, Math.min(decision.nextCheckMs, 30 * 60 * 1000));
      }
    } catch (error) {
      console.error('Could not run proactive decision:', error);
    } finally {
      scheduleProactiveGreeting(false, nextDelay);
    }
  }, Math.min(delay, 2147483000));
}

function publicMomentsState() {
  return {
    ...publicMoments(memoryState),
    automaticEnabled: settings.deepseek.momentsEnabled !== false
  };
}

function broadcastMomentsState() {
  const state = publicMomentsState();
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.webContents.send('chat:moments-updated', state);
  }
  return state;
}

async function generateMomentContent() {
  const now = new Date();
  const assistant = publicAssistantState();
  const recent = (Array.isArray(memoryState.moments) ? memoryState.moments : [])
    .slice(0, 5)
    .map((moment, index) => `${index + 1}. ${moment.content}`)
    .join('\n');
  const fallback = fallbackMomentText(now, memoryState.moments?.length || 0);
  if (!getDeepSeekApiKey()) {
    return { content: fallback, mood: '', source: 'fallback' };
  }
  const instruction = [
    '请以现实世界中的樱岛麻衣身份，写一条只给恋人看的私人朋友圈动态。',
    `现在是 ${now.toLocaleString('zh-CN', { hour12: false })}。`,
    `你此刻的连续日程是“${memoryState.world.currentLabel}”，地点“${memoryState.world.location}”；你今天给自己的个人计划是“${assistant.mai?.personalPlan || '留一点自己的时间'}”。`,
    '写 25—120 个汉字、1—3 句话，像真实的人随手分享生活：可以写眼前的小事、工作后的心情、天气、想念、最近共同话题或一个具体问题。',
    '语气自然、有自己的生活和主见，不要每次都围绕睡觉、休息、工作或学习，不要像客服，不要提及桌宠、AI、系统、自动生成、提示词或朋友圈机制。',
    '可以自然关联上述真实日程或个人计划，但不能编造已经完成或发生的具体事件。不要加标题、引号、话题标签或“动态：”前缀；直接输出正文。',
    recent ? `最近已经发过这些内容，请避免意思和句式重复：\n${recent}` : ''
  ].filter(Boolean).join('\n');
  try {
    const generated = await requestDeepSeek([
      { role: 'user', content: instruction }
    ], {
      maxTokens: 180,
      structured: false,
      diagnostic: createLlmDiagnostic('moment_generation', 'generateMomentContent')
    });
    const content = normalizeMomentText(generated.content, 1200);
    return {
      content: content || fallback,
      mood: '',
      source: content ? 'ai' : 'fallback'
    };
  } catch (error) {
    console.error('Could not generate a private moment:', error);
    return { content: fallback, mood: '', source: 'fallback' };
  }
}

async function createMomentPost({ automatic = false } = {}) {
  if (momentPostSending) {
    throw new Error('麻衣正在整理这条动态，请稍等一下。');
  }
  momentPostSending = true;
  try {
    const generated = await generateMomentContent();
    const now = Date.now();
    const moment = {
      id: makeMomentId('moment', now),
      content: normalizeMomentText(generated.content, 1200),
      mood: normalizeMomentText(generated.mood, 24),
      source: generated.source,
      createdAt: new Date(now).toISOString(),
      comments: []
    };
    memoryState.moments = [moment, ...(memoryState.moments || [])].slice(0, MAX_MOMENTS);
    memoryState.momentsMeta = {
      lastPostAt: now,
      nextPostAt: nextMomentAt(now)
    };
    saveMemory();
    const state = broadcastMomentsState();
    if (automatic && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.showInactive();
      mainWindow.webContents.send('pet:proactive-greeting', {
        content: '我刚发了一条只给你看的动态。记得来看看。',
        action: 'wave',
        emotion: 'happy',
        source: 'moment'
      });
    }
    return state;
  } finally {
    momentPostSending = false;
  }
}

function momentReplyPrompt(moment, comment) {
  const recentComments = moment.comments
    .slice(-10)
    .map((item) => `${item.role === 'user' ? '恋人' : '麻衣'}：${item.content}`)
    .join('\n');
  return [
    '这是你只给恋人看的私人朋友圈，不是普通聊天窗口。',
    `你发的动态是：“${moment.content}”`,
    recentComments ? `这条动态下面最近的互动：\n${recentComments}` : '',
    `恋人刚回复：“${comment}”`,
    '请以现实世界中的樱岛麻衣身份在评论区直接回复。控制在 1—2 句话，回应对方说的具体内容；可以亲近、调侃、撒娇、吃醋或认真表达感受，也可以自然追问一个具体问题。',
    '不要泛泛道谢，不要重复整条动态，不要解释技术机制，不要提及桌宠、AI、系统、提示词或生成回复。'
  ].filter(Boolean).join('\n');
}

async function commentOnMoment(postId, rawContent) {
  const normalizedPostId = String(postId || '');
  const content = normalizeMomentText(rawContent, 600);
  if (!content) {
    throw new Error('先写一点想对麻衣说的话吧。');
  }
  const moment = (memoryState.moments || []).find((item) => item.id === normalizedPostId);
  if (!moment) {
    throw new Error('这条动态已经找不到了。');
  }
  if (momentReplyingIds.has(normalizedPostId)) {
    throw new Error('麻衣正在回复这条动态，请稍等一下。');
  }

  momentReplyingIds.add(normalizedPostId);
  try {
    const userComment = {
      id: makeMomentId('moment-comment'),
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    moment.comments = [...(moment.comments || []), userComment].slice(-MAX_MOMENT_COMMENTS);
    saveMemory();
    broadcastMomentsState();

    let reply = null;
    if (getDeepSeekApiKey()) {
      try {
        reply = await requestDeepSeek([
          { role: 'user', content: momentReplyPrompt(moment, content) }
        ], {
          maxTokens: 240,
          structured: false,
          sessionId: `moment:${normalizedPostId}`,
          diagnostic: createLlmDiagnostic('moment_comment_reply', 'replyToMomentComment')
        });
      } catch (error) {
        console.error('Could not reply to a private moment comment:', error);
      }
    }
    if (reply?.content) {
      reply = {
        ...reply,
        content: normalizeMomentReplyText(reply.content, 600)
      };
    }
    if (!reply?.content) {
      const fallback = fallbackMomentReply(content);
      reply = {
        content: fallback,
        ...inferActionFromText(fallback),
        memories: [],
        episodes: [],
        topics: [],
        people: [],
        projects: [],
        habits: [],
        commitments: [],
        mind: { topic: '私人朋友圈' }
      };
    }

    mergeCandidateMemories([
      ...extractExplicitMemoryCandidates(content),
      ...(Array.isArray(reply.memories) ? reply.memories : [])
    ], {
      sourceText: content,
      sourceSessionId: `moment:${normalizedPostId}`,
      sourceMessageId: userComment.id,
      sourceCreatedAt: userComment.createdAt
    });
    mergeCommitments(reply.commitments, {
      sourceText: content,
      sourceSessionId: `moment:${normalizedPostId}`,
      sourceMessageId: userComment.id
    });
    applyMindTurn(memoryState, {
      userMessage: content,
      reply,
      topic: reply?.mind?.topic || '私人朋友圈',
      now: Date.now()
    });
    applySharedLifeTurn(content, reply, `moment:${normalizedPostId}`, userComment.createdAt, userComment.id);
    moment.comments = [
      ...(moment.comments || []),
      {
        id: makeMomentId('moment-comment'),
        role: 'assistant',
        content: normalizeMomentReplyText(reply.content, 600),
        createdAt: new Date().toISOString()
      }
    ].slice(-MAX_MOMENT_COMMENTS);
    saveMemory();
    broadcastSharedLifeState();
    broadcastLifeHubState();
    return broadcastMomentsState();
  } finally {
    momentReplyingIds.delete(normalizedPostId);
  }
}

function scheduleMomentPosting(initial = false) {
  clearTimeout(momentPostTimer);
  if (settings.deepseek.momentsEnabled === false || quitting || !productDataWritesAllowed()) {
    return;
  }
  if (!memoryState.momentsMeta || !Number(memoryState.momentsMeta.nextPostAt)) {
    memoryState.momentsMeta = {
      lastPostAt: Number(memoryState.momentsMeta?.lastPostAt) || 0,
      nextPostAt: nextMomentAt(Date.now())
    };
    saveMemory();
  }
  const dueAt = Number(memoryState.momentsMeta.nextPostAt);
  const baseDelay = dueAt <= Date.now() && initial
    ? 2 * 60 * 1000
    : Math.max(1000, dueAt - Date.now());
  const delay = Math.max(baseDelay, momentQuietHoursDelay());
  momentPostTimer = setTimeout(async () => {
    try {
      if (settings.deepseek.momentsEnabled !== false) {
        await createMomentPost({ automatic: true });
      }
    } catch (error) {
      console.error('Could not publish an automatic private moment:', error);
      memoryState.momentsMeta.nextPostAt = nextMomentAt(Date.now());
      saveMemory();
    } finally {
      scheduleMomentPosting(false);
    }
  }, Math.min(delay, 2147483000));
}

function momentQuietHoursDelay(now = new Date()) {
  const hour = now.getHours();
  if (hour < 1 || hour >= 8) {
    return 0;
  }
  const nextAllowed = new Date(now);
  nextAllowed.setHours(8, 15, 0, 0);
  return Math.max(0, nextAllowed.getTime() - now.getTime());
}

function quietHoursDelay(now = new Date()) {
  const minutesOfDay = now.getHours() * 60 + now.getMinutes();
  if (minutesOfDay >= 7 * 60 + 30) {
    return 0;
  }
  const nextAllowed = new Date(now);
  nextAllowed.setHours(7, 30, 0, 0);
  return Math.max(0, nextAllowed.getTime() - now.getTime());
}

function scheduleGirlfriendFollowUp() {
  clearTimeout(girlfriendFollowUpTimer);
  if (settings.deepseek.girlfriendModeEnabled !== true || quitting || !productDataWritesAllowed()) {
    return;
  }
  normalizeRelationship(memoryState, MAX_CONTACT_COUNT);
  const relationship = memoryState.relationship;
  const policy = girlfriendPolicy();
  if (
    !relationship.waitingSince
    || !getSession(relationship.waitingSessionId)
    || relationship.followUpCount >= policy.maxFollowUps
  ) {
    return;
  }

  const delayMinutes = policy.intervalMinutes;
  const baseTime = relationship.lastCompanionMessageAt || relationship.waitingSince;
  const dueAt = baseTime + delayMinutes * 60 * 1000;
  const activeSession = String(relationship.waitingSessionId || '');
  const busyDelay = chatRequestLifecycle.hasSession(activeSession) ? 60 * 1000 : 0;
  const delay = Math.max(1000, dueAt - Date.now(), quietHoursDelay(), busyDelay);
  girlfriendFollowUpTimer = setTimeout(deliverGirlfriendFollowUp, Math.min(delay, 2147483000));
}

function fallbackGirlfriendMessage(followUpCount) {
  const options = [
    ['忙完了吗？不用急着回，我只是有一点想你了。', '我来悄悄看你一眼。你现在还好吗？'],
    ['还在忙吗？我会等你，不过你大概还要忙多久呀？', '好久没听见你的声音了。现在一切还顺利吗？'],
    ['喂，你是不是把我忘了？忙完要来哄我。', '我已经等了一会儿了。至少让我知道你没事，好吗？'],
    ['我真的开始担心了……看到以后回我一句，好吗？', '你再不出现，我可要记账了。到底在忙什么呀？'],
    ['好吧，我再等你一会儿。回来以后先告诉我刚才在忙什么，好不好？']
  ];
  const group = options[Math.min(followUpCount, options.length - 1)];
  return group[Math.floor(Math.random() * group.length)];
}

async function createGirlfriendFollowUp(followUpCount, waitingMinutes, sessionId, request) {
  request.assertCurrent();
  const history = publicSessionMessages(sessionId)
    .slice(-10)
    .map((message) => ({ role: message.role, content: message.content }));
  const instruction = [
    `用户已经约 ${waitingMinutes} 分钟没有回复。`,
    `这是第 ${followUpCount + 1} 次主动联系。`,
    '请结合你今天的现实生活、最近对话、持续情绪和长期记忆，作为现实世界里真正熟悉用户、会想念也有自己主见的女友，主动发一条自然消息。',
    '消息里要有一个具体、容易回答的问题，给用户一个自然接话的切口。',
    '越到后续可以越想念、担心、失落或有一点吃醋，语气允许明显变化；不要威胁、羞辱或情绪勒索，也不要超过两句话。',
    '不要解释消息的生成机制，不要说自己在读取历史记录，也不要谈及任何幕后技术身份。'
  ].join('');

  if (!getDeepSeekApiKey()) {
    const content = fallbackGirlfriendMessage(followUpCount);
    return { content, ...inferActionFromText(content), memories: [] };
  }

  try {
    const reply = await requestDeepSeek([
      ...history,
      { role: 'user', content: instruction }
    ], {
      maxTokens: 180,
      structured: true,
      sessionId,
      requestId: request.requestId,
      signal: request.controller.signal,
      assertRequestCurrent: request.assertCurrent,
      diagnostic: createLlmDiagnostic('girlfriend_follow_up', 'createGirlfriendFollowUp')
    });
    request.assertCurrent();
    return reply;
  } catch (error) {
    if (!request.isCurrent()) throw error;
    console.error('Could not generate girlfriend follow-up:', error);
    const content = fallbackGirlfriendMessage(followUpCount);
    return { content, ...inferActionFromText(content), memories: [] };
  }
}

async function deliverGirlfriendFollowUp(force = false) {
  clearTimeout(girlfriendFollowUpTimer);
  if (settings.deepseek.girlfriendModeEnabled !== true || girlfriendMessageSending) {
    return null;
  }
  const relationship = normalizeRelationshipState(memoryState.relationship);
  const policy = girlfriendPolicy();
  if (!relationship.waitingSince || relationship.followUpCount >= policy.maxFollowUps) {
    return null;
  }
  if (!force && quietHoursDelay() > 0) {
    scheduleGirlfriendFollowUp();
    return null;
  }

  const waitingMarker = relationship.waitingSince;
  const waitingSessionId = relationship.waitingSessionId;
  const followUpCount = relationship.followUpCount;
  if (!waitingSessionId || chatRequestLifecycle.hasSession(waitingSessionId)) {
    scheduleGirlfriendFollowUp();
    return null;
  }
  if (!conversationState.getSession(memoryState, waitingSessionId)) return null;
  try {
    conversationState.assertCanAppendTurn(memoryState, {
      sessionId: waitingSessionId,
      userMessage: null
    });
  } catch (error) {
    if (error?.code === 'CHAT_HISTORY_LIMIT_REACHED') return null;
    throw error;
  }
  girlfriendMessageSending = true;
  const request = chatRequestLifecycle.begin({
    sessionId: waitingSessionId,
    senderId: 'girlfriend-follow-up',
    kind: 'proactive'
  });
  const waitingMinutes = Math.max(1, Math.round((Date.now() - waitingMarker) / 60000));
  try {
    const reply = await createGirlfriendFollowUp(
      followUpCount,
      waitingMinutes,
      waitingSessionId,
      request
    );
    request.assertCurrent();
    if (
      settings.deepseek.girlfriendModeEnabled !== true
      || memoryState.relationship.waitingSince !== waitingMarker
      || memoryState.relationship.waitingSessionId !== waitingSessionId
      || !conversationState.getSession(memoryState, waitingSessionId)
    ) {
      return null;
    }
    const session = appendProactiveHistory(reply, 'girlfriend', waitingSessionId);
    incrementRelationshipFollowUp(memoryState, MAX_CONTACT_COUNT);
    saveMemory();
    const payload = {
      ...reply,
      proactive: true,
      source: 'girlfriend',
      sessionId: session.id,
      createdAt: session.messages.at(-1)?.createdAt || new Date().toISOString()
    };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.showInactive();
      temporarilyRevealPet(8000);
      mainWindow.webContents.send('pet:proactive-greeting', payload);
    }
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.webContents.send('chat:proactive-greeting', payload);
    }
    return payload;
  } finally {
    request.finish();
    girlfriendMessageSending = false;
    scheduleGirlfriendFollowUp();
  }
}

function noteUserReply(options = {}) {
  clearTimeout(girlfriendFollowUpTimer);
  const now = Date.now();
  markMindUserReturned(memoryState, now);
  recordRelationshipUserReply(memoryState, now, MAX_CONTACT_COUNT);
  if (options.save !== false) saveMemory();
}

function launchExecutable() {
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    return process.env.PORTABLE_EXECUTABLE_FILE;
  }
  return process.execPath;
}

function applyLoginSetting(enabled) {
  const options = {
    openAtLogin: Boolean(enabled),
    path: launchExecutable(),
    args: ['--startup']
  };

  if (!app.isPackaged) {
    options.path = process.execPath;
    options.args = [app.getAppPath(), '--startup'];
  }

  app.setLoginItemSettings(options);
  settings.openAtLogin = Boolean(enabled);
  saveSettings();
}

function positionIsVisible(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return false;
  }
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return position.x < area.x + area.width
      && position.x + WINDOW_WIDTH > area.x
      && position.y < area.y + area.height
      && position.y + WINDOW_HEIGHT > area.y;
  });
}

function defaultPosition() {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + area.width - WINDOW_WIDTH - 34,
    y: area.y + area.height - WINDOW_HEIGHT - 22
  };
}

function clampToDisplays(x, y) {
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = cursorDisplay.workArea;
  return {
    x: Math.round(Math.max(area.x - 24, Math.min(x, area.x + area.width - WINDOW_WIDTH + 24))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - WINDOW_HEIGHT + 24)))
  };
}

function captureRestoreTargetBytes(filePaths) {
  return filePaths.map((filePath) => {
    try {
      return { name: path.basename(filePath), base64: fs.readFileSync(filePath).toString('base64') };
    } catch (error) {
      if (error?.code === 'ENOENT') return { name: path.basename(filePath), base64: null };
      throw error;
    }
  });
}

function writeSmokeReport(outputPath, report) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
}

async function runRestoreProtectionSmoke(outputPath) {
  const assert = require('node:assert/strict');
  let report = { ok: false };
  const originalRenameSync = fs.renameSync;
  const originalUnlinkSync = fs.unlinkSync;
  const originalShowOpenDialog = dialog.showOpenDialog;
  const targetPaths = [
    memoryPath(), settingsPath(), knowledgePath(), workStore.filePath,
    customWallpaperPath(), ...Object.values(customAvatarPaths())
  ];
  const testBackupPath = String(process.env.MAI_RESTORE_PROTECTION_BACKUP || '');
  let smokeStage = 'seed-user-data';
  let commitFailures = 0;
  let rollbackFailureEnabled = false;
  let rollbackFailureInjected = false;
  let pendingAssetDialogResolve = null;

  try {
    assert.equal(productDataWriteProtection.state, 'ready');
    saveMemory();
    saveSettings();
    saveKnowledge();
    workStore.save();
    assert.equal(fs.existsSync(customWallpaperPath()), false, 'smoke expects an isolated userData directory');
    assert.equal(fs.existsSync(customAvatarPaths().mai), false, 'smoke expects an isolated userData directory');
    assert.equal(fs.existsSync(customAvatarPaths().user), false, 'smoke expects an isolated userData directory');

    const imageFixturePath = path.join(app.getPath('userData'), 'restore-protection-smoke-input.png');
    fs.copyFileSync(path.join(__dirname, 'assets', 'mai-icon.png'), imageFixturePath);
    const fixtureImageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const fixtureResource = { mimeType: 'image/jpeg', dataBase64: fixtureImageBytes.toString('base64') };
    const backupSnapshot = snapshotUserDataForBackup();
    backupSnapshot.resources = {
      customWallpaper: fixtureResource,
      customAvatars: { mai: fixtureResource, user: fixtureResource }
    };
    fs.mkdirSync(path.dirname(testBackupPath), { recursive: true });
    fs.writeFileSync(testBackupPath, JSON.stringify(createBackupBundle(backupSnapshot), null, 2), 'utf8');

    smokeStage = 'install-fault-injection-and-open-chat';
    const targetWallpaper = path.resolve(customWallpaperPath());
    const targetAvatarUser = path.resolve(customAvatarPaths().user);
    fs.renameSync = (source, target, ...args) => {
      if (path.resolve(target) === targetAvatarUser && String(source).includes('restore-new-') && commitFailures < 2) {
        commitFailures += 1;
        throw Object.assign(new Error('Smoke-injected mid-commit replacement failure.'), { code: 'EPERM' });
      }
      return originalRenameSync.call(fs, source, target, ...args);
    };
    fs.unlinkSync = (target, ...args) => {
      if (rollbackFailureEnabled && path.resolve(target) === targetWallpaper) {
        rollbackFailureInjected = true;
        throw Object.assign(new Error('Smoke-injected rollback deletion failure.'), { code: 'EACCES' });
      }
      return originalUnlinkSync.call(fs, target, ...args);
    };

    openChat();
    const contents = chatWindow?.webContents;
    assert.ok(contents, 'Chat window should be created for the restore UI smoke.');
    if (contents.isLoadingMainFrame()) {
      await Promise.race([
        new Promise((resolve, reject) => {
          const onFinish = () => { contents.removeListener('did-fail-load', onFail); resolve(); };
          const onFail = (_event, code, description) => {
            contents.removeListener('did-finish-load', onFinish);
            reject(new Error(`Chat load failed (${code}): ${description}`));
          };
          contents.once('did-finish-load', onFinish);
          contents.once('did-fail-load', onFail);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Restore protection UI smoke timed out while loading Chat.')), 15000))
      ]);
    }
    await contents.executeJavaScript(`void (window.confirm = () => true);`);
    const clickRestoreAndWaitFor = async (needle) => {
      await contents.executeJavaScript(`document.getElementById('restore-backup').click()`);
      const encodedNeedle = JSON.stringify(needle);
      return contents.executeJavaScript(`new Promise((resolve, reject) => {
        const needle = ${encodedNeedle};
        const startedAt = Date.now();
        const check = () => {
          const text = document.getElementById('notice')?.textContent || '';
          if (text.includes(needle)) resolve(text);
          else if (Date.now() - startedAt > 10000) reject(new Error('Restore UI did not show the expected notice.'));
          else setTimeout(check, 40);
        };
        check();
      })`);
    };

    smokeStage = 'ordinary-rollback-through-chat-ui';
    const ordinaryFailureNotice = await clickRestoreAndWaitFor('Smoke-injected mid-commit replacement failure.');
    assert.equal(commitFailures, 1);
    assert.equal(productDataWriteProtection.state, 'ready', 'a successful rollback must not freeze Main writes');
    assert.ok(ordinaryFailureNotice.includes('Smoke-injected mid-commit replacement failure.'));
    const ordinaryRollbackStayedWritable = true;
    saveMemory();
    saveSettings();
    saveKnowledge();
    const ordinaryRollbackWorkProject = workStore.createProject({ name: '普通回滚后仍可写入' });
    assert.ok(ordinaryRollbackWorkProject.id);

    const baselineBeforeProtectedFailure = captureRestoreTargetBytes(targetPaths);
    smokeStage = 'start-pending-resource-import';
    dialog.showOpenDialog = () => new Promise((resolve) => { pendingAssetDialogResolve = resolve; });
    const pendingAssetWrite = importCustomAvatar(chatWindow, 'mai');
    assert.equal(typeof pendingAssetDialogResolve, 'function');
    rollbackFailureEnabled = true;
    smokeStage = 'rollback-failure-through-chat-ui';
    const protectionNotice = await clickRestoreAndWaitFor('已暂停所有本地数据写入');
    assert.ok(protectionNotice.includes('请关闭并重新启动 Mai'));
    assert.ok(!protectionNotice.includes('完整备份已恢复'));
    assert.equal(commitFailures, 2);
    assert.equal(rollbackFailureInjected, true);
    assert.equal(productDataWriteProtection.state, 'restore-rollback-failed');
    const bytesAtFreeze = captureRestoreTargetBytes(targetPaths);

    pendingAssetDialogResolve({ canceled: false, filePaths: [imageFixturePath] });
    smokeStage = 'verify-frozen-main-writers';
    await assert.rejects(pendingAssetWrite, { code: 'PRODUCT_DATA_WRITE_PROTECTED' });

    const blockedErrors = {};
    for (const [name, action] of Object.entries({
      memory: () => saveMemory(),
      settings: () => saveSettings(),
      knowledge: () => saveKnowledge(),
      work: () => workStore.createProject({ name: '冻结后不得写入' }),
      resourceWrite: () => writeCustomResource(customWallpaperPath(), fixtureImageBytes),
      resourceDelete: () => deleteCustomResource(customWallpaperPath()),
      automaticBackup: () => createAutomaticBackup('restore-protection-smoke')
    })) {
      try { action(); } catch (error) { blockedErrors[name] = String(error?.code || ''); }
    }
    await assert.rejects(refreshKnowledgeIndex(), { code: 'PRODUCT_DATA_WRITE_PROTECTED' });
    scheduleActivityTracking();
    scheduleKnowledgeRefresh();
    scheduleProactiveGreeting();
    scheduleGirlfriendFollowUp();
    scheduleMomentPosting();
    const backgroundSchedulersStopped = [
      activityTrackingTimer, knowledgeRefreshTimer, proactiveGreetingTimer,
      girlfriendFollowUpTimer, momentPostTimer
    ].every((timer) => timer === null);
    assert.equal(backgroundSchedulersStopped, true);
    const exitSave = saveProductDataOnShutdown();
    assert.equal(exitSave.memorySaved, false);
    assert.equal(exitSave.knowledgeSaved, false);
    assert.equal(exitSave.memoryError, 'PRODUCT_DATA_WRITE_PROTECTED');
    assert.equal(exitSave.knowledgeError, 'PRODUCT_DATA_WRITE_PROTECTED');
    assert.deepEqual(blockedErrors, {
      memory: 'PRODUCT_DATA_WRITE_PROTECTED',
      settings: 'PRODUCT_DATA_WRITE_PROTECTED',
      knowledge: 'PRODUCT_DATA_WRITE_PROTECTED',
      work: 'PRODUCT_DATA_WRITE_PROTECTED',
      resourceWrite: 'PRODUCT_DATA_WRITE_PROTECTED',
      resourceDelete: 'PRODUCT_DATA_WRITE_PROTECTED',
      automaticBackup: 'PRODUCT_DATA_WRITE_PROTECTED'
    });

    const bytesBeforeQuitEvent = captureRestoreTargetBytes(targetPaths);
    app.emit('before-quit', { preventDefault() {} });
    const bytesAfterQuitEvent = captureRestoreTargetBytes(targetPaths);
    assert.deepEqual(bytesAfterQuitEvent, bytesBeforeQuitEvent);
    const afterBlockedWrites = captureRestoreTargetBytes(targetPaths);
    const journalPath = path.join(app.getPath('userData'), 'mai-restore-transaction.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    const originalsRetained = journal.entries
      .filter((entry) => entry.existed)
      .every((entry) => fs.existsSync(path.join(app.getPath('userData'), entry.backup)));
    assert.deepEqual(afterBlockedWrites, bytesAtFreeze);
    assert.equal(originalsRetained, true);
    report = {
      ok: true,
      gateState: productDataWriteProtection.state,
      ordinaryRollbackStayedWritable,
      blockedErrors,
      pendingAssetWriteBlocked: true,
      backgroundRefreshBlocked: true,
      backgroundSchedulersStopped,
      shutdownSaveBlocked: true,
      actualBeforeQuitBlocked: true,
      targetBytesStableAfterBlockedWrites: true,
      journalAndOriginalsRetained: originalsRetained && journal.phase === 'committing',
      userNotice: protectionNotice,
      baselineBeforeProtectedFailure,
      bytesAtFreeze,
      afterBlockedWrites
    };
  } catch (error) {
    report = { ok: false, stage: smokeStage, error: error?.stack || error?.message || String(error) };
  } finally {
    fs.renameSync = originalRenameSync;
    fs.unlinkSync = originalUnlinkSync;
    dialog.showOpenDialog = originalShowOpenDialog;
    try { writeSmokeReport(outputPath, report); } catch (error) {
      report = { ok: false, error: `Could not write protection smoke report: ${error?.message || error}` };
    }
    if (chatWindow && !chatWindow.isDestroyed()) chatWindow.destroy();
    chatWindow = null;
    app.exit(report.ok ? 0 : 1);
  }
}

function runRestoreRecoveryStartupSmoke(outputPath) {
  const report = {
    ok: productDataWriteProtection.state === 'ready'
      && startupFileSetRecovery?.recovered === true
      && !fs.existsSync(path.join(app.getPath('userData'), 'mai-restore-transaction.json')),
    gateState: productDataWriteProtection.state,
    recovery: startupFileSetRecovery,
    journalRemaining: fs.existsSync(path.join(app.getPath('userData'), 'mai-restore-transaction.json'))
  };
  try { writeSmokeReport(outputPath, report); } catch (error) {
    console.error('Could not write restore recovery smoke report:', error);
    app.exit(1);
    return;
  }
  app.exit(report.ok ? 0 : 1);
}

async function runUiSmoke(outputPath) {
  let result = null;
  try {
    smokeDiagnostics?.checkpoint('companion_ui_smoke_start');
    openChat();
    const targetWindow = chatWindow;
    if (!targetWindow) throw new Error('Chat window was not created.');

    const contents = targetWindow.webContents;
    smokeDiagnostics?.attachWebContents(contents, 'companion_chat');
    if (contents.isLoadingMainFrame()) {
      await Promise.race([
        new Promise((resolve, reject) => {
          const onFinish = () => {
            contents.removeListener('did-fail-load', onFail);
            resolve();
          };
          const onFail = (_event, code, description) => {
            contents.removeListener('did-finish-load', onFinish);
            reject(new Error(`Chat load failed (${code}): ${description}`));
          };
          contents.once('did-finish-load', onFinish);
          contents.once('did-fail-load', onFail);
        }),
        new Promise((_, reject) => setTimeout(
          () => reject(new Error('Companion UI smoke timed out while loading Chat.')),
          15000
        ))
      ]);
    }

    await contents.executeJavaScript(`new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const wait = () => {
        if (document.getElementById('choose-custom-wallpaper') && document.getElementById('clear-custom-wallpaper')) resolve();
        else if (Date.now() - startedAt > 8000) reject(new Error('Local wallpaper controls timed out.'));
        else setTimeout(wait, 50);
      };
      wait();
    })`);

    let settingsSaveError = null;
    if (process.env.MAI_UI_SAVE_ERROR_SMOKE === '1') {
      const settingsBytesBeforeFailure = fs.readFileSync(settingsPath());
      const settingsModelBeforeFailure = settings.deepseek.model;
      const originalRenameSync = fs.renameSync;
      fs.renameSync = (source, target, ...args) => {
        if (path.resolve(target) === path.resolve(settingsPath())) {
          throw Object.assign(new Error('Smoke-injected settings replacement failure.'), { code: 'EACCES' });
        }
        return originalRenameSync.call(fs, source, target, ...args);
      };
      try {
        settingsSaveError = await contents.executeJavaScript(`new Promise((resolve, reject) => {
          const startedAt = Date.now();
          document.getElementById('settings-button').click();
          setTimeout(() => {
            const model = document.getElementById('model');
            const alternative = Array.from(model.options).find((option) => option.value && option.value !== model.value);
            if (!alternative) {
              reject(new Error('Settings smoke could not find an alternate model option.'));
              return;
            }
            model.value = alternative.value;
            document.getElementById('save-settings').click();
          }, 100);
          const wait = () => {
            const status = document.getElementById('settings-status');
            if (status?.classList.contains('settings-status--error')) {
              resolve({ message: status.textContent, errorStyle: true });
            } else if (Date.now() - startedAt > 8000) {
              reject(new Error('Settings save failure was not shown in the settings UI.'));
            } else setTimeout(wait, 50);
          };
          wait();
        })`);
        if (!settingsSaveError.message.includes('Smoke-injected settings replacement failure.')) {
          throw new Error(`Settings UI showed an unexpected failure: ${settingsSaveError.message}`);
        }
        settingsSaveError.persistedBytesUnchanged = fs.readFileSync(settingsPath()).equals(settingsBytesBeforeFailure);
        if (!settingsSaveError.persistedBytesUnchanged) {
          throw new Error('Settings bytes changed even though the UI showed a failed save.');
        }
        const currentConfig = await contents.executeJavaScript('window.maiPet.getChatConfig()');
        settingsSaveError.settingsStateRolledBack = currentConfig.model === settingsModelBeforeFailure;
        if (!settingsSaveError.settingsStateRolledBack) {
          throw new Error('Settings in-memory state changed even though the UI showed a failed save.');
        }
        await contents.executeJavaScript("document.getElementById('close-settings').click()");
      } finally {
        fs.renameSync = originalRenameSync;
      }
    }

    const avatarSmoke = await contents.executeJavaScript(`(() => {
      const exercise = (target) => {
        const trigger = document.getElementById(target === 'mai' ? 'mai-avatar-button' : 'user-avatar-button');
        trigger.click();
        const available = Boolean(
          document.getElementById('choose-custom-avatar')
          && document.getElementById('clear-custom-avatar')
          && !document.getElementById('avatar-picker-overlay').classList.contains('overlay--hidden')
        );
        document.getElementById('close-avatar-picker').click();
        return available;
      };
      const maiControls = exercise('mai');
      const userControls = exercise('user');
      return {
        count: document.querySelectorAll('#avatar-grid .avatar-option').length,
        hasLocalControls: maiControls && userControls,
        selectedMai: document.getElementById('mai-avatar-button').dataset.avatarId || '',
        selectedUser: document.getElementById('user-avatar-button').dataset.avatarId || '',
        maiPath: document.getElementById('portrait').getAttribute('src') || '',
        userPath: document.getElementById('user-avatar').getAttribute('src') || ''
      };
    })()`);

    const chat = await contents.executeJavaScript(`(() => {
      const bodyText = document.body.innerText;
      const styles = getComputedStyle(document.body);
      const rootStyles = getComputedStyle(document.documentElement);
      return {
        title: document.title,
        heading: document.querySelector('.conversation-title h1')?.textContent?.trim() || '',
        location: document.getElementById('workspace-location')?.textContent?.trim() || '',
        inputPlaceholder: document.getElementById('message-input')?.getAttribute('placeholder') || '',
        providerBadge: document.getElementById('conversation-model-badge')?.textContent?.trim() || '',
        hasConversationList: Boolean(document.getElementById('recent-list')),
        hasMemoryNavigation: Boolean(document.getElementById('memory-button')),
        hasMomentsNavigation: Boolean(document.getElementById('moments-button')),
        hasVoiceNavigation: Boolean(document.getElementById('voice-call-button')),
        hasCompanionContext: Boolean(document.getElementById('companion-context')),
        hasWorkspaceSwitcher: Boolean(document.getElementById('runtime-switcher-button')),
        runtimeMode: document.querySelector('.chat-app')?.dataset.runtimeMode || '',
        hasActionWorkspace: Boolean(document.getElementById('agent-mode-sidebar') && document.getElementById('action-context')),
        hasProjectTaskGrouping: Boolean(document.getElementById('work-project-list')) && !document.getElementById('agent-session-list'),
        wallpaperCount: document.querySelectorAll('#wallpaper-grid .wallpaper-option').length,
        selectedWallpaper: document.body.dataset.wallpaper || '',
        wallpaperSize: getComputedStyle(document.getElementById('wallpaper-layer')).backgroundSize,
        hasLocalWallpaperControls: Boolean(document.getElementById('choose-custom-wallpaper') && document.getElementById('clear-custom-wallpaper')),
        hasAgentRuntime: Boolean(document.querySelector('[data-runtime-mode="agent"], #agent-runtime-panel, #agent-context')),
        hasAgentLanguage: /Agent 任务中心|Agent Runtime|Workspace 权限/.test(bodyText),
        viewportWidth: window.innerWidth,
        bodyBackground: styles.backgroundColor,
        bodyColor: styles.color,
        accent: rootStyles.getPropertyValue('--accent').trim()
      };
    })()`);
    chat.avatarCount = avatarSmoke.count;
    chat.hasLocalAvatarControls = avatarSmoke.hasLocalControls;
    chat.selectedMaiAvatar = avatarSmoke.selectedMai;
    chat.selectedUserAvatar = avatarSmoke.selectedUser;
    chat.maiAvatarPath = avatarSmoke.maiPath;
    chat.userAvatarPath = avatarSmoke.userPath;
    const companionInspector = await contents.executeJavaScript(`new Promise((resolve) => {
      document.querySelector('.runtime-option[data-runtime-mode="chat"]')?.click();
      setTimeout(() => {
        const appRoot = document.querySelector('.chat-app');
        const toggle = document.getElementById('companion-inspector-toggle');
        const context = document.getElementById('companion-context');
        const scrim = document.getElementById('companion-inspector-scrim');
        const closed = {
          toggleVisible: getComputedStyle(toggle).display !== 'none',
          expanded: toggle.getAttribute('aria-expanded'),
          contextHidden: context.getAttribute('aria-hidden'),
          contextPosition: getComputedStyle(context).position
        };
        toggle.click();
        setTimeout(() => {
          const open = {
            expanded: toggle.getAttribute('aria-expanded'),
            open: appRoot.classList.contains('companion-inspector-open'),
            contextHidden: context.getAttribute('aria-hidden'),
            scrimHidden: scrim.classList.contains('history-scrim--hidden'),
            contextVisible: getComputedStyle(context).visibility === 'visible'
          };
          scrim.click();
          const afterScrim = !appRoot.classList.contains('companion-inspector-open');
          toggle.click();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          const afterEscape = !appRoot.classList.contains('companion-inspector-open');
          resolve({ closed, open, afterScrim, afterEscape });
        }, 400);
      }, 80);
    })`);
    const actionWorkspace = await contents.executeJavaScript(`new Promise((resolve) => {
      document.querySelector('.chat-app')?.classList.add('sidebar-collapsed');
      document.querySelector('.runtime-option[data-runtime-mode="agent"]')?.click();
      setTimeout(() => {
        const snapshot = {
          selected: document.querySelector('.chat-app')?.dataset.runtimeMode || '',
          label: document.getElementById('runtime-current-label')?.textContent?.trim() || '',
          sidebarVisible: getComputedStyle(document.getElementById('agent-mode-sidebar')).display !== 'none',
          contextPresent: Boolean(document.getElementById('action-context')),
          historySearchHidden: getComputedStyle(document.getElementById('workspace-search-button')).display === 'none',
          companionHidden: getComputedStyle(document.getElementById('companion-context')).display === 'none',
          projectTaskGrouping: Boolean(document.getElementById('work-project-list')) && !document.getElementById('agent-session-list'),
          projectListPresent: Boolean(document.getElementById('work-project-list')),
          createProjectPresent: Boolean(document.getElementById('new-work-project-button')),
          avatarShared: document.getElementById('agent-portrait')?.getAttribute('src') === document.getElementById('portrait')?.getAttribute('src'),
          sidebarWidth: Math.round(document.querySelector('.chat-header')?.getBoundingClientRect().width || 0),
          sidebarToggleHidden: getComputedStyle(document.getElementById('workspace-sidebar-toggle')).display === 'none'
        };
        document.querySelector('.chat-app')?.classList.remove('sidebar-collapsed');
        document.querySelector('.runtime-option[data-runtime-mode="chat"]')?.click();
        resolve(snapshot);
      }, 80);
    })`);
    const workInspectorNarrow = await contents.executeJavaScript(`new Promise((resolve) => {
      document.querySelector('.runtime-option[data-runtime-mode="agent"]')?.click();
      setTimeout(() => {
        const appRoot = document.querySelector('.chat-app');
        const toggle = document.getElementById('work-inspector-toggle');
        const context = document.getElementById('action-context');
        const scrim = document.getElementById('work-inspector-scrim');
        const closed = {
          toggleVisible: getComputedStyle(toggle).display !== 'none',
          expanded: toggle.getAttribute('aria-expanded'),
          contextHidden: context.getAttribute('aria-hidden'),
          contextPosition: getComputedStyle(context).position,
          workspaceSelectorCount: document.querySelectorAll('#select-action-workspace').length
        };
        toggle.click();
        setTimeout(() => {
          document.getElementById('select-action-workspace')?.scrollIntoView({ block: 'center' });
          const open = {
            expanded: toggle.getAttribute('aria-expanded'),
            open: appRoot.classList.contains('work-inspector-open'),
            contextHidden: context.getAttribute('aria-hidden'),
            scrimHidden: scrim.classList.contains('history-scrim--hidden'),
            scrimClear: getComputedStyle(scrim).backdropFilter === 'none',
            selectorVisible: getComputedStyle(document.getElementById('select-action-workspace')).display !== 'none',
            selectorClickable: (() => {
              const button = document.getElementById('select-action-workspace');
              const bounds = button.getBoundingClientRect();
              const target = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
              return target === button || button.contains(target);
            })()
          };
          scrim.click();
          const afterScrim = !appRoot.classList.contains('work-inspector-open');
          toggle.click();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          const afterEscape = !appRoot.classList.contains('work-inspector-open');
          toggle.click();
          document.querySelector('.runtime-option[data-runtime-mode="chat"]')?.click();
          resolve({ closed, open, afterScrim, afterEscape, afterChatSwitch: !appRoot.classList.contains('work-inspector-open') });
        }, 700);
      }, 80);
    })`);
    targetWindow.setSize(1300, 760);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const workInspectorWide = await contents.executeJavaScript(`new Promise((resolve) => {
      document.querySelector('.runtime-option[data-runtime-mode="agent"]')?.click();
      setTimeout(() => {
        const toggle = document.getElementById('work-inspector-toggle');
        const context = document.getElementById('action-context');
        resolve({
          toggleVisible: getComputedStyle(toggle).display !== 'none',
          open: document.querySelector('.chat-app')?.classList.contains('work-inspector-open'),
          contextHidden: context.getAttribute('aria-hidden'),
          contextPosition: getComputedStyle(context).position
        });
      }, 80);
    })`);

    result = {
      ok: Boolean(
        chat.location.length > 0
        && chat.hasConversationList
        && chat.hasMemoryNavigation
        && chat.hasMomentsNavigation
        && chat.hasVoiceNavigation
        && chat.hasCompanionContext
        && chat.hasWorkspaceSwitcher
        && chat.runtimeMode === 'chat'
        && chat.hasActionWorkspace
        && chat.hasProjectTaskGrouping
        && chat.avatarCount === 0
        && chat.hasLocalAvatarControls
        && chat.wallpaperCount === 0
        && chat.selectedWallpaper === ''
        && chat.wallpaperSize === 'cover'
        && chat.hasLocalWallpaperControls
        && chat.hasAgentRuntime
        && !chat.hasAgentLanguage
        && companionInspector.closed.toggleVisible
        && companionInspector.closed.expanded === 'false'
        && companionInspector.closed.contextHidden === 'true'
        && companionInspector.closed.contextPosition === 'fixed'
        && companionInspector.open.expanded === 'true'
        && companionInspector.open.open
        && companionInspector.open.contextHidden === 'false'
        && !companionInspector.open.scrimHidden
        && companionInspector.open.contextVisible
        && companionInspector.afterScrim
        && companionInspector.afterEscape
        && actionWorkspace.selected === 'agent'
        && actionWorkspace.label === 'Work'
        && actionWorkspace.sidebarVisible
        && actionWorkspace.contextPresent
        && actionWorkspace.historySearchHidden
        && actionWorkspace.companionHidden
        && actionWorkspace.projectTaskGrouping
        && actionWorkspace.projectListPresent
        && actionWorkspace.createProjectPresent
        && actionWorkspace.avatarShared
        && actionWorkspace.sidebarWidth >= 200
        && actionWorkspace.sidebarToggleHidden
        && chat.viewportWidth >= 1000
        && workInspectorNarrow.closed.toggleVisible
        && workInspectorNarrow.closed.expanded === 'false'
        && workInspectorNarrow.closed.contextHidden === 'true'
        && workInspectorNarrow.closed.contextPosition === 'fixed'
        && workInspectorNarrow.closed.workspaceSelectorCount === 1
        && workInspectorNarrow.open.expanded === 'true'
        && workInspectorNarrow.open.open
        && workInspectorNarrow.open.contextHidden === 'false'
        && !workInspectorNarrow.open.scrimHidden
        && workInspectorNarrow.open.scrimClear
        && workInspectorNarrow.open.selectorVisible
        && workInspectorNarrow.open.selectorClickable
        && workInspectorNarrow.afterScrim
        && workInspectorNarrow.afterEscape
        && workInspectorNarrow.afterChatSwitch
        && !workInspectorWide.toggleVisible
        && !workInspectorWide.open
        && workInspectorWide.contextHidden === 'false'
        && workInspectorWide.contextPosition === 'static'
      ),
      version: app.getVersion(),
      product: 'Mai desktop companion',
      chat,
      settingsSaveError,
      companionInspector,
      actionWorkspace,
      workInspector: { narrow: workInspectorNarrow, wide: workInspectorWide }
    };
    smokeDiagnostics?.checkpoint('companion_ui_smoke_complete', result);
    result = smokeDiagnostics?.finish(result) || result;
  } catch (error) {
    result = smokeDiagnostics?.fail(error)
      || { ok: false, error: error?.stack || error?.message || String(error) };
  }

  if (!smokeDiagnostics) {
    try {
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    } catch (error) {
      console.error('Could not write UI smoke result:', error);
      result = { ok: false, error: error?.message || String(error) };
    }
  }
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.destroy();
  chatWindow = null;
  app.exit(result.ok ? 0 : 1);
}

async function runChatCloseSmoke(outputPath) {
  let uncaughtError = '';
  const onUncaughtException = (error) => {
    uncaughtError = String(error?.stack || error?.message || error || 'unknown error');
  };
  process.once('uncaughtException', onUncaughtException);
  let result = null;
  try {
    smokeDiagnostics?.checkpoint('chat_close_window_opening');
    openChat();
    const targetWindow = chatWindow;
    if (!targetWindow) throw new Error('Chat window was not created.');
    smokeDiagnostics?.attachWebContents(targetWindow.webContents, 'chat_close');
    smokeDiagnostics?.checkpoint('chat_close_window_created', { webContentsId: targetWindow.webContents.id });
    await Promise.race([
      new Promise((resolve, reject) => {
        const contents = targetWindow.webContents;
        const onFinish = () => {
          contents.removeListener('did-fail-load', onFail);
          resolve();
        };
        const onFail = (_event, code, description) => {
          contents.removeListener('did-finish-load', onFinish);
          reject(new Error(`Chat load failed (${code}): ${description}`));
        };
        if (!contents.isLoadingMainFrame()) {
          resolve();
          return;
        }
        contents.once('did-finish-load', onFinish);
        contents.once('did-fail-load', onFail);
        if (!contents.isLoadingMainFrame()) onFinish();
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Chat close smoke timed out while loading.')), 10000))
    ]);
    smokeDiagnostics?.checkpoint('chat_close_window_loaded');
    const capturedWebContentsId = targetWindow.webContents.id;
    try {
      targetWindow.close();
    } catch (error) {
      uncaughtError = String(error?.stack || error?.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    result = {
      ok: !uncaughtError && chatWindow === null && targetWindow.isDestroyed(),
      capturedWebContentsId,
      chatWindowReleased: chatWindow === null,
      windowDestroyed: targetWindow.isDestroyed(),
      uncaughtError
    };
    result = smokeDiagnostics?.finish(result) || result;
  } catch (error) {
    result = smokeDiagnostics?.fail(error, {
      uncaughtError: String(error?.stack || error?.message || error)
    }) || { ok: false, uncaughtError: String(error?.stack || error?.message || error) };
  } finally {
    process.removeListener('uncaughtException', onUncaughtException);
    try {
      if (!smokeDiagnostics) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
      }
    } finally {
      app.quit();
    }
  }
}

async function runP0ChatFlowSmoke(outputPath) {
  let result = null;
  try {
    const session = createNewChatSession();
    const reply = await chatSendHandler({
      sender: { id: -1, isDestroyed: () => false, send: () => {} }
    }, {
      runtimeMode: 'chat',
      sessionId: session.activeSessionId,
      messages: [{ id: 'p0-chat-user-message', role: 'user', content: '现在几点？' }]
    });
    const after = publicChatState(reply.sessionId);
    const workspaceSession = createNewChatSession();
    const workspaceMarker = 'P0_WORKSPACE_FILE_MARKER_DO_NOT_PERSIST';
    const workspaceReply = await chatService.send({
      sessionId: workspaceSession.activeSessionId,
      messages: [{ id: 'p0-workspace-user-message', role: 'user', content: '现在几点？' }],
      workspaceContext: {
        payload: { kind: 'workspace_file', relativePath: 'note.txt', content: workspaceMarker }
      }
    });
    const persistedAfterWorkspaceTurn = JSON.parse(fs.readFileSync(memoryPath(), 'utf8'));
    const workspaceStoredSession = persistedAfterWorkspaceTurn.sessions.find((item) => item.id === workspaceReply.sessionId);
    const workspaceStoredUser = workspaceStoredSession?.messages.find((message) => (
      message.role === 'user' && message.content === '现在几点？'
    ));
    const workspaceMarkerExcluded = !JSON.stringify(persistedAfterWorkspaceTurn).includes(workspaceMarker);
    const originalRequestReply = chatService.dependencies.requestReply;
    let overlongProviderCalled = false;
    chatService.dependencies.requestReply = async () => {
      overlongProviderCalled = true;
      throw new Error('The provider must not receive an overlong Chat message.');
    };
    let overlongMessageRejected = false;
    try {
      await chatSendHandler({ sender: { id: -2, isDestroyed: () => false, send: () => {} } }, {
        sessionId: workspaceSession.activeSessionId,
        messages: [{ role: 'user', content: 'x'.repeat(MAX_CHAT_MESSAGE_CHARS + 1) }]
      });
    } catch (error) {
      overlongMessageRejected = error?.code === 'CHAT_MESSAGE_TOO_LARGE';
    } finally {
      chatService.dependencies.requestReply = originalRequestReply;
    }
    const legacyLongText = `legacy-${'x'.repeat(15000)}`;
    const normalizedLongHistory = normalizeMemoryState({
      ...memoryState,
      activeSessionId: reply.sessionId,
      sessions: [
        ...memoryState.sessions,
        {
          id: 'p0-legacy-long-history',
          title: '旧长消息',
          messages: [{ id: 'p0-legacy-long-message', role: 'user', content: legacyLongText }]
        }
      ]
    });
    const longHistoryPreserved = normalizedLongHistory.sessions
      .find((item) => item.id === 'p0-legacy-long-history')
      ?.messages[0]?.content === legacyLongText;
    const firstCoffeeSource = '我喜欢喝拿铁。';
    mergeCandidateMemories([
      ...extractExplicitMemoryCandidates(firstCoffeeSource),
      {
        text: '用户偏爱拿铁', key: 'preference.item.拿铁', category: 'preference', importance: 4,
        evidence: firstCoffeeSource, confidence: 0.95, temporalStatus: 'current'
      }
    ], {
      sourceText: firstCoffeeSource,
      sourceSessionId: reply.sessionId,
      sourceMessageId: 'memory-confirmation-1',
      sourceCreatedAt: '2026-08-01T10:00:00.000Z'
    });
    mergeCandidateMemories(extractExplicitMemoryCandidates(firstCoffeeSource), {
      sourceText: firstCoffeeSource,
      sourceSessionId: reply.sessionId,
      sourceMessageId: 'memory-confirmation-2',
      sourceCreatedAt: '2026-08-02T10:00:00.000Z'
    });
    const changedCoffeeSource = '我现在不怎么喝拿铁了，更喜欢美式。';
    mergeCandidateMemories(extractExplicitMemoryCandidates(changedCoffeeSource), {
      sourceText: changedCoffeeSource,
      sourceSessionId: reply.sessionId,
      sourceMessageId: 'memory-correction-1',
      sourceCreatedAt: '2026-08-03T10:00:00.000Z'
    });
    const firstLocationSource = '我住在西安。';
    mergeCandidateMemories(extractExplicitMemoryCandidates(firstLocationSource), {
      sourceText: firstLocationSource,
      sourceSessionId: reply.sessionId,
      sourceMessageId: 'location-1',
      sourceCreatedAt: '2026-08-01T11:00:00.000Z'
    });
    const movedLocationSource = '我现在搬到东京了。';
    mergeCandidateMemories(extractExplicitMemoryCandidates(movedLocationSource), {
      sourceText: movedLocationSource,
      sourceSessionId: reply.sessionId,
      sourceMessageId: 'location-2',
      sourceCreatedAt: '2026-08-02T11:00:00.000Z'
    });
    const autoLocationChanged = memoryState.facts.some((fact) => (
      fact.key === 'identity.location'
      && fact.text === '用户现在住在东京'
      && fact.history?.some((entry) => entry.text === '用户现在住在西安')
    ));
    const plannedExamSource = '我准备今年考 N2。';
    mergeCandidateMemories(extractExplicitMemoryCandidates(plannedExamSource), {
      sourceText: plannedExamSource,
      sourceSessionId: reply.sessionId,
      sourceMessageId: 'goal-1',
      sourceCreatedAt: '2026-08-01T12:00:00.000Z'
    });
    const completedExamSource = 'N2 已经考完了。';
    mergeCandidateMemories(extractExplicitMemoryCandidates(completedExamSource), {
      sourceText: completedExamSource,
      sourceSessionId: reply.sessionId,
      sourceMessageId: 'goal-2',
      sourceCreatedAt: '2026-08-05T12:00:00.000Z'
    });
    const completedGoal = memoryState.facts.find((fact) => fact.key === 'goal.exam.n2');
    mergeCandidateMemories([{
      text: '用户现在住在西安', key: 'identity.location', category: 'identity', importance: 5, temporalStatus: 'current'
    }], { force: true, source: 'manual', pinned: true, save: false });
    const locationCorrection = '我现在搬到东京了。';
    mergeCandidateMemories(extractExplicitMemoryCandidates(locationCorrection), {
      sourceText: locationCorrection,
      sourceSessionId: reply.sessionId,
      sourceMessageId: 'protected-correction-1',
      sourceCreatedAt: '2026-08-04T10:00:00.000Z'
    });
    const latte = memoryState.facts.find((fact) => fact.key === 'preference.item.拿铁');
    const americano = memoryState.facts.find((fact) => fact.key === 'preference.item.美式');
    const protectedLocation = memoryState.facts.find((fact) => fact.key === 'identity.location');
    const previousLatte = latte?.history?.at(-1);
    const persisted = JSON.parse(fs.readFileSync(memoryPath(), 'utf8'));
    const storedSession = persisted.sessions.find((item) => item.id === reply.sessionId);
    result = {
      ok: Boolean(
        reply.runtimeMode === 'chat'
        && reply.localTimeAnswer === true
        && after.activeSessionId === reply.sessionId
        && storedSession?.messages?.some((message) => message.role === 'user' && message.content === '现在几点？')
        && storedSession?.messages?.some((message) => message.role === 'assistant')
        && workspaceStoredUser?.contextSource === 'workspace'
        && workspaceMarkerExcluded
        && overlongMessageRejected
        && !overlongProviderCalled
        && longHistoryPreserved
        && latte?.text.includes('不怎么喜欢拿铁')
        && latte?.history?.length === 1
        && previousLatte?.evidenceTrail?.length === 2
        && americano?.temporalStatus === 'current'
        && autoLocationChanged
        && completedGoal?.temporalStatus === 'historical'
        && completedGoal?.history?.some((entry) => entry.text.includes('准备参加N2考试'))
        && protectedLocation?.text === '用户现在住在西安'
        && protectedLocation?.source === 'manual'
        && protectedLocation?.pinned === true
      ),
      runtimeMode: reply.runtimeMode,
      localTimeAnswer: reply.localTimeAnswer === true,
      sessionId: reply.sessionId,
      stateMessages: after.messages.length,
      persistedMessages: storedSession?.messages?.length || 0,
      persistedUserMessage: storedSession?.messages?.some((message) => message.role === 'user' && message.content === '现在几点？') === true,
      workspaceSessionId: workspaceReply.sessionId,
      workspaceSourceMarked: workspaceStoredUser?.contextSource === 'workspace',
      workspaceMarkerExcluded,
      overlongMessageRejected,
      overlongProviderSkipped: !overlongProviderCalled,
      longHistoryPreserved,
      memoryCorrectionApplied: latte?.text.includes('不怎么喜欢拿铁') === true,
      evidenceTrailPreserved: previousLatte?.evidenceTrail?.length === 2,
      sameSourceDeduplicated: latte?.history?.length === 1,
      currentPreferenceAdded: americano?.temporalStatus === 'current',
      locationChangeApplied: autoLocationChanged,
      completedGoalArchived: completedGoal?.temporalStatus === 'historical'
        && completedGoal?.history?.some((entry) => entry.text.includes('准备参加N2考试')),
      pinnedManualProtected: protectedLocation?.text === '用户现在住在西安'
    };
  } catch (error) {
    result = { ok: false, error: String(error?.stack || error?.message || error) };
  } finally {
    try {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    } finally {
      app.exit(result?.ok ? 0 : 1);
    }
  }
}
let windowManager;
const petVisibility = createPetVisibility({
  getMainWindow: () => mainWindow,
  getSettings: () => settings,
  saveSettings,
  refreshTrayMenu: () => windowManager.refreshTrayMenu()
});
const {
  applyInvisibleOpacity,
  setInvisibleMode,
  temporarilyRevealPet,
  handlePetHover
} = petVisibility;
windowManager = createWindowManager({
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  path,
  rootDirectory: __dirname,
  windowWidth: WINDOW_WIDTH,
  windowHeight: WINDOW_HEIGHT,
  getMainWindow: () => mainWindow,
  setMainWindow: (window) => { mainWindow = window; },
  getChatWindow: () => chatWindow,
  setChatWindow: (window) => { chatWindow = window; },
  getTimerWindow: () => timerWindow,
  setTimerWindow: (window) => { timerWindow = window; },
  getAssistantWindow: () => assistantWindow,
  setAssistantWindow: (window) => { assistantWindow = window; },
  getTray: () => tray,
  setTray: (nextTray) => { tray = nextTray; },
  getSettings: () => settings,
  isQuitting: () => quitting,
  positionIsVisible,
  defaultPosition,
  applyInvisibleOpacity: (...args) => applyInvisibleOpacity(...args),
  saveSettings,
  onChatClosed: (senderId) => {
    chatRequestLifecycle.cancelSender(senderId, 'window_closed');
    voiceService.stopRecognition();
  },
  publicReminderState,
  reminderMenuLabel,
  cancelReminder,
  applyLoginSetting,
  scheduleProactiveGreeting,
  resetRelationshipWaiting,
  saveMemory,
  scheduleGirlfriendFollowUp,
  setInvisibleMode: (...args) => setInvisibleMode(...args),
  requestQuit: () => {
    quitting = true;
    app.quit();
  }
});
const {
  createWindow,
  openChat,
  openTimerWindow,
  openAssistantWindow,
  persistPosition,
  showPet,
  buildMenu,
  refreshTrayMenu,
  createTray
} = windowManager;
const automaticBackupService = createAutomaticBackupService({
  app,
  fs,
  path,
  createBackupBundle,
  getBackupSnapshot: snapshotUserDataForBackup
});
const {
  safeFileTimestamp,
  writeJsonAtomic,
  listAutomaticBackups
} = automaticBackupService;
function createAutomaticBackup(reason = 'automatic') {
  assertProductDataWritable();
  return automaticBackupService.createAutomaticBackup(reason);
}
function ensureDailyAutomaticBackup() {
  assertProductDataWritable();
  return automaticBackupService.ensureDailyAutomaticBackup();
}
function registerIpc() {
  chatRequestService = new ChatRequestService({
    modelGateway,
    sanitizeMessages,
    buildSystemPrompt,
    renderSystemPrompt,
    commitRenderedPromptContext: chatPromptContext.commitRenderedContext,
    realityContext,
    commitRealityContext: chatRealityContext.commit,
    estimateTokenCount,
    trimMessagesToTokenBudget,
    saveContextState: saveMemory,
    parseStructuredReply,
    inspectStructuredReply,
    inferActionFromText,
    emptyResponseMessage,
    recordLlmCacheDiagnostic: createLlmCacheDiagnosticLogger({
      enabled: !app.isPackaged,
      fileSystem: fs,
      pathModule: path,
      directory: path.join(__dirname, 'logs')
    }),
    maxPromptTokens: MAX_PROMPT_TOKENS,
    maxContextMessages: MAX_CONTEXT_MESSAGES
  });
  chatService = new ChatService({
    sanitizeMessages,
    directReply: directLocalTimeReply,
    requestReply: requestDeepSeek,
    noteUserReply,
    appendConversationHistory,
    applyReplyState: chatTurnStateWriter.applyReplyState,
    mergeCommitments,
    extractExplicitMemories: extractExplicitMemoryCandidates,
    mergeCandidateMemories,
    captureTurnState: () => structuredClone(memoryState),
    restoreTurnState: (state) => { memoryState = state; },
    saveTurnState: saveMemory,
    afterTurnCommitted: ({ commitmentsChanged }) => {
      broadcastSharedLifeState();
      scheduleGirlfriendFollowUp();
      if (commitmentsChanged) {
        broadcastAssistantState();
        scheduleProactiveGreeting(false, 60 * 1000);
      }
    },
    onPostCommitNotificationError: (error) => console.error('Could not notify Chat turn commit:', error),
    broadcastLifeHubState,
    publicSessions,
    deliverReply: (reply) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pet:ai-reply', reply);
      }
    }
  });

  ipcMain.handle('pet:get-settings', () => {
    const result = publicPetSettings();
    if (settings.firstLaunch) {
      settings.firstLaunch = false;
      saveSettings();
    }
    return result;
  });

  ipcMain.handle('pet:get-context', () => ({
    cursor: screen.getCursorScreenPoint(),
    bounds: mainWindow?.getBounds() ?? { x: 0, y: 0, width: WINDOW_WIDTH, height: WINDOW_HEIGHT }
  }));

  ipcMain.on('pet:move-window', (_event, x, y) => {
    if (!mainWindow || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const position = clampToDisplays(x, y);
    mainWindow.setPosition(position.x, position.y);
  });

  ipcMain.on('pet:drag-end', persistPosition);

  ipcMain.on('pet:context-menu', () => {
    if (!mainWindow) {
      return;
    }
    buildMenu().popup({ window: mainWindow });
  });

  ipcMain.on('pet:hide', () => mainWindow?.hide());

  ipcMain.on('pet:open-chat', () => openChat(false));

  ipcMain.on('pet:hover-changed', (_event, hovered) => handlePetHover(hovered));

  ipcMain.handle('pet:set-invisible-mode', (_event, enabled) => setInvisibleMode(enabled));

  ipcMain.on('pet:open-timer', openTimerWindow);

  ipcMain.on('pet:open-assistant', (_event, tab) => openAssistantWindow(String(tab || 'today')));

  registerTimerIpc({
    ipcMain,
    publicReminderState,
    startReminder,
    cancelReminder
  });

  if (actionRuntimeManager && typeof actionRuntimeModules?.registerActionIpc === 'function') {
    actionRuntimeModules.registerActionIpc({
      ipcMain,
      actionRuntimeManager,
      workStore,
      getConfiguration: actionConfiguration,
      saveConfiguration: saveActionConfiguration,
      selectWorkspace: async (project) => {
        const selected = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择 Work Workspace' });
        if (selected.canceled || !selected.filePaths?.[0]) return { configured: Boolean(project.workspacePath), path: project.workspacePath || '', projectId: project.id };
        const raw = selected.filePaths[0];
        if (/^(?:\\\\|\\\\\?\\|\\\\\.\\)/.test(raw)) throw new Error('不能选择网络共享或设备路径作为 Workspace。');
        const real = await fs.promises.realpath(raw); if (path.dirname(real) === real) throw new Error('不能把整个磁盘设为 Workspace，请选择具体文件夹。');
        const stat = await fs.promises.stat(real); if (!stat.isDirectory()) throw new Error('Workspace 必须是文件夹。');
        const updated = workStore.setProjectWorkspace(project.id, real);
        return { configured: true, path: updated.workspacePath, projectId: updated.id };
      },
      requestApproval: async (_event, approval) => {
        const result = await dialog.showMessageBox(chatWindow || mainWindow, {
          type: 'warning', buttons: ['拒绝', '允许本次操作'], defaultId: 0, cancelId: 0,
          title: String(approval?.approval?.title || '允许 Work 操作？'),
          message: String(approval?.approval?.summary || 'Mai 请求执行一项受控操作。'),
          detail: String(approval?.approval?.risk || '确认只对本次精确操作有效。')
        });
        return { approved: result.response === 1, reason: result.response === 1 ? 'approved' : 'denied' };
      }
    });
  }

  const assertActiveChatWorkspaceSession = (sessionId) => {
    const active = String(memoryState.activeSessionId || '');
    if (!sessionId || sessionId !== active) {
      throw Object.assign(new Error('当前聊天会话已切换，请重新请求 Workspace。'), { code: 'workspace_context_unavailable' });
    }
    return active;
  };
  const workspaceCapabilityGateway = new WorkspaceCapabilityGateway({
    selectDirectory: async () => {
      const selected = await dialog.showOpenDialog(chatWindow || mainWindow, {
        properties: ['openDirectory'],
        title: '选择 Chat 可读取的 Workspace'
      });
      return selected.canceled || !selected.filePaths?.[0] ? '' : selected.filePaths[0];
    }
  });
  registerWorkspaceCapabilityIpc({
    ipcMain,
    gateway: workspaceCapabilityGateway,
    assertActiveSession: assertActiveChatWorkspaceSession
  });

  ipcMain.handle('chat:get-config', () => publicDeepSeekSettings());

  ipcMain.handle('chat:set-wallpaper', (_event, wallpaperId) => {
    settings.appearance.wallpaper = normalizeWallpaperId(wallpaperId, customWallpaperPath());
    saveSettings();
    return publicDeepSeekSettings();
  });

  ipcMain.handle('chat:choose-custom-wallpaper', async () => {
    const imported = await importCustomWallpaper(chatWindow || mainWindow);
    if (imported) {
      assertProductDataWritable();
      settings.appearance.wallpaper = CUSTOM_WALLPAPER_ID;
      saveSettings();
    }
    return { ...publicDeepSeekSettings(), wallpaperSelectionChanged: imported };
  });

  ipcMain.handle('chat:clear-custom-wallpaper', async () => {
    deleteCustomResource(customWallpaperPath());
    settings.appearance.wallpaper = DEFAULT_WALLPAPER_ID;
    saveSettings();
    return publicDeepSeekSettings();
  });

  ipcMain.handle('chat:set-appearance', (_event, input) => {
    settings.appearance = normalizeAppearanceSettings({
      ...settings.appearance,
      ...(input && typeof input === 'object' ? input : {})
    });
    saveSettings();
    return publicDeepSeekSettings();
  });

  ipcMain.handle('chat:choose-custom-avatar', async (_event, target) => {
    const normalizedTarget = requireAvatarTarget(target);
    const imported = await importCustomAvatar(chatWindow || mainWindow, normalizedTarget);
    if (imported) {
      assertProductDataWritable();
      settings.appearance.avatars = {
        ...normalizeAvatarSelections(settings.appearance.avatars, customAvatarPaths()),
        [normalizedTarget]: CUSTOM_AVATAR_ID
      };
      saveSettings();
    }
    return { ...publicDeepSeekSettings(), avatarSelectionChanged: imported };
  });

  ipcMain.handle('chat:clear-custom-avatar', async (_event, target) => {
    const normalizedTarget = requireAvatarTarget(target);
    deleteCustomResource(customAvatarPaths()[normalizedTarget]);
    settings.appearance.avatars = {
      ...normalizeAvatarSelections(settings.appearance.avatars, customAvatarPaths()),
      [normalizedTarget]: ''
    };
    saveSettings();
    return publicDeepSeekSettings();
  });

  ipcMain.handle('chat:save-config', (_event, input) => {
    const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : '';
    const nextSettings = structuredClone(settings);
    const provider = modelProviders.get(input?.provider) || modelProviders.require(PROVIDER_IDS.DEEPSEEK);
    if (provider.metadata?.().available === false) {
      const error = new Error(provider.metadata().reason || '所选模型来源当前不可用。');
      error.code = 'provider_unavailable';
      throw error;
    }
    const model = DEEPSEEK_MODELS.has(input?.model) ? input.model : 'deepseek-v4-flash';
    const personality = PERSONALITY_PROMPTS[input?.personality] ? input.personality : 'classic';
    const customPrompt = typeof input?.customPrompt === 'string'
      ? input.customPrompt.trim().slice(0, 1000)
      : '';

    if (apiKey) {
      if (apiKey.length > 512) {
        throw new Error('API Key 长度不正确。');
      }
      setStoredApiKey(nextSettings, apiKey, safeStorage);
    }
    nextSettings.model.provider = provider.id;
    nextSettings.deepseek.model = model;
    nextSettings.deepseek.personality = personality;
    nextSettings.deepseek.customPrompt = customPrompt;
    if (input?.appearance && typeof input.appearance === 'object') {
      nextSettings.appearance = normalizeAppearanceSettings({ ...nextSettings.appearance, ...input.appearance });
    }
    if (typeof input?.memoryEnabled === 'boolean') {
      nextSettings.deepseek.memoryEnabled = input.memoryEnabled;
    }
    if (typeof input?.proactiveGreetingEnabled === 'boolean') {
      nextSettings.deepseek.proactiveGreetingEnabled = input.proactiveGreetingEnabled;
    }
    nextSettings.deepseek.proactiveIntervalMinutes = requiredIntegerSetting(
      input?.proactiveIntervalMinutes,
      MIN_CONTACT_INTERVAL_MINUTES,
      MAX_CONTACT_INTERVAL_MINUTES,
      '主动聊天间隔'
    );
    nextSettings.deepseek.proactiveDailyLimit = requiredIntegerSetting(
      input?.proactiveDailyLimit,
      MIN_CONTACT_COUNT,
      MAX_CONTACT_COUNT,
      '主动聊天每日次数'
    );
    if (typeof input?.girlfriendModeEnabled === 'boolean') {
      nextSettings.deepseek.girlfriendModeEnabled = input.girlfriendModeEnabled;
    }
    if (typeof input?.momentsEnabled === 'boolean') {
      nextSettings.deepseek.momentsEnabled = input.momentsEnabled;
    }
    if (input?.voice && typeof input.voice === 'object') {
      if (typeof input.voice.autoReadReplies === 'boolean') {
        nextSettings.voice.autoReadReplies = input.voice.autoReadReplies;
      }
      nextSettings.voice.engine = input.voice.engine === 'system' ? 'system' : 'local';
      const culture = String(input.voice.culture || nextSettings.voice.culture || 'zh-CN').trim();
      nextSettings.voice.culture = /^[a-z]{2,3}-[a-z]{2,4}$/i.test(culture) ? culture : 'zh-CN';
      nextSettings.voice.voiceName = String(input.voice.voiceName || '').trim().slice(0, 160);
      nextSettings.voice.rate = boundedNumber(input.voice.rate, 0.7, 1.4, 1);
      nextSettings.voice.pitch = boundedNumber(input.voice.pitch, 0.7, 1.3, 1);
      nextSettings.voice.volume = boundedNumber(input.voice.volume, 0.1, 1, 1);
    }
    nextSettings.deepseek.girlfriendIntervalMinutes = requiredIntegerSetting(
      input?.girlfriendIntervalMinutes,
      MIN_CONTACT_INTERVAL_MINUTES,
      MAX_CONTACT_INTERVAL_MINUTES,
      '女友消息间隔'
    );
    nextSettings.deepseek.girlfriendMaxFollowUps = requiredIntegerSetting(
      input?.girlfriendMaxFollowUps,
      MIN_CONTACT_COUNT,
      MAX_CONTACT_COUNT,
      '女友消息每轮次数'
    );
    const previousWeatherCity = String(nextSettings.deepseek.weatherCity || '').trim();
    const weatherCity = typeof input?.weatherCity === 'string'
      ? input.weatherCity.trim().slice(0, 80)
      : previousWeatherCity;
    if (typeof input?.weatherEnabled === 'boolean') {
      nextSettings.deepseek.weatherEnabled = input.weatherEnabled;
    }
    if (nextSettings.deepseek.weatherEnabled === true && !weatherCity) {
      throw new Error('开启天气后，请填写城市名称。');
    }
    nextSettings.deepseek.weatherCity = weatherCity;
    if (weatherCity.toLocaleLowerCase('zh-CN') !== previousWeatherCity.toLocaleLowerCase('zh-CN')) {
      memoryState.reality.weather = null;
      saveMemory();
    }
    if (nextSettings.deepseek.girlfriendModeEnabled !== true) {
      resetRelationshipWaiting();
      saveMemory();
    }
    const previousStorageWarning = legacyPlaintextKeyNeedsSecureStorage;
    settings = nextSettings;
    if (apiKey) legacyPlaintextKeyNeedsSecureStorage = false;
    try {
      saveSettings();
    } catch (error) {
      legacyPlaintextKeyNeedsSecureStorage = previousStorageWarning;
      throw error;
    }
    scheduleProactiveGreeting(true);
    scheduleGirlfriendFollowUp();
    scheduleMomentPosting(true);
    refreshTrayMenu();
    return publicDeepSeekSettings();
  });

  ipcMain.handle('chat:clear-api-key', () => {
    const previousStorageWarning = legacyPlaintextKeyNeedsSecureStorage;
    setDeepSeekApiKey('');
    try {
      saveSettings();
    } catch (error) {
      legacyPlaintextKeyNeedsSecureStorage = previousStorageWarning;
      throw error;
    }
    return publicDeepSeekSettings();
  });

  ipcMain.handle('chat:test-connection', async () => {
    await requestDeepSeek([
      { role: 'user', content: '请只回复“连接成功”。' }
    ], {
      maxTokens: 24,
      structured: false,
      diagnostic: createLlmDiagnostic('connection_test', 'chat:test-connection')
    });
    return { ok: true };
  });

  registerVoiceIpc({
    ipcMain,
    voiceService,
    localTtsService,
    getVoiceSettings: () => settings.voice
  });

  chatSendHandler = async (event, input) => {
    assertProductDataWritable();
    const messages = Array.isArray(input) ? input : input?.messages;
    const voiceMode = !Array.isArray(input) && input?.voiceMode === true;
    const sessionId = String(
      (Array.isArray(input) ? memoryState.activeSessionId : input?.sessionId)
      || memoryState.activeSessionId
    );
    const cleanMessages = sanitizeMessages(messages);
    const latestUserText = [...cleanMessages].reverse().find((message) => message.role === 'user')?.content || '';
    conversationState.assertCanAppendTurn(memoryState, {
      sessionId,
      userMessage: latestUserText ? { content: latestUserText } : null
    });
    const request = chatRequestLifecycle.begin({
      sessionId,
      senderId: event?.sender?.id
    });
    const streamRequestId = voiceMode ? String(input?.requestId || '').slice(0, 80) : '';
    try {
      request.assertCurrent();
      const workspaceContextId = !Array.isArray(input) ? String(input?.workspaceContextId || '').slice(0, 160) : '';
      const workspaceContext = workspaceContextId
        ? workspaceCapabilityGateway.consumeContext(assertActiveChatWorkspaceSession(sessionId), workspaceContextId)
        : null;
      const voiceProfile = voiceMode
        ? describeVoiceProfile(latestUserText, input?.voiceProfile, input?.voiceProfile?.senseEmotion)
        : null;
      const onDelta = streamRequestId
        ? (delta, accumulated) => {
            if (request.isCurrent() && !event.sender.isDestroyed()) {
              event.sender.send('chat:voice-stream-delta', {
                requestId: streamRequestId,
                delta,
                accumulated,
                voiceProfile
              });
            }
          }
        : null;
      return await chatService.send({
        messages: cleanMessages,
        sessionId,
        requestId: request.requestId,
        signal: request.controller.signal,
        assertRequestCurrent: request.assertCurrent,
        voiceMode,
        voiceProfile,
        onDelta,
        workspaceContext,
        diagnostic: createLlmDiagnostic('chat_response', 'ChatService.send'),
        responseInstruction: voiceMode
          ? `当前是实时语音交谈。reply 请使用适合自然说出口的简洁中文，通常 1—3 句话；避免 Markdown、项目符号、括号说明和过长铺垫，并自然承接用户刚说的话。用户本轮可参考的声音线索：${voiceProfile.description}。声音线索可能受麦克风影响，只把它作为语气参考，不要武断地给用户下结论。`
          : ''
      });
    } catch (error) {
      if (request.status === 'cancelled' || request.controller.signal.aborted) {
        return {
          cancelled: true,
          requestId: request.requestId,
          sessionId,
          sessions: publicSessions()
        };
      }
      throw error;
    } finally {
      request.finish();
    }
  };
  ipcMain.handle('chat:send', chatSendHandler);

  ipcMain.handle('chat:cancel-current-request', (event, sessionId) => ({
    cancelled: chatRequestLifecycle.cancelSessionForSender(sessionId, event?.sender?.id, 'cancelled')
  }));

  ipcMain.handle('chat:get-history', () => publicHistory());

  ipcMain.handle('chat:get-state', () => publicChatState());

  ipcMain.handle('chat:new-session', () => createNewChatSession());

  ipcMain.handle('chat:select-session', (_event, sessionId) => selectChatSession(sessionId));

  ipcMain.handle('chat:rename-session', (_event, sessionId, title) => renameChatSession(sessionId, title));

  ipcMain.handle('chat:delete-session', (_event, sessionId) => deleteChatSession(sessionId));

  ipcMain.handle('chat:clear-history', () => clearChatHistory());

  ipcMain.handle('chat:get-memories', () => publicMemories());

  ipcMain.handle('chat:get-memory-diagnostics', () => publicMemoryDiagnostics());

  ipcMain.handle('chat:rebuild-memories', () => {
    const stats = rebuildMemoriesFromHistory();
    return {
      memories: publicMemories(),
      diagnostics: publicMemoryDiagnostics(),
      stats
    };
  });

  ipcMain.handle('chat:add-memory', (_event, input) => addOrUpdateMemory(input));

  ipcMain.handle('chat:update-memory', (_event, id, input) => addOrUpdateMemory(input, id));

  ipcMain.handle('chat:correct-memory', (_event, id, action, input) => (
    correctMemory(id, action, input)
  ));

  ipcMain.handle('chat:delete-memory', (_event, id) => {
    const normalizedId = String(id || '');
    memoryState.facts = memoryState.facts.filter((fact) => fact.id !== normalizedId);
    saveMemory();
    return publicMemories();
  });

  ipcMain.handle('chat:clear-memory', () => {
    memoryState.facts = [];
    saveMemory();
    return [];
  });

  ipcMain.handle('chat:get-shared-life', () => publicSharedLifeState());

  ipcMain.handle('chat:rebuild-shared-life', () => {
    const stats = rebuildSharedLifeFromHistory();
    return { state: broadcastSharedLifeState(), stats };
  });

  ipcMain.handle('chat:update-episode', (_event, id, input) => updateEpisodeEntry(id, input));

  ipcMain.handle('chat:delete-episode', (_event, id) => {
    memoryState.episodes = memoryState.episodes.filter((episode) => episode.id !== String(id || ''));
    saveMemory();
    return broadcastSharedLifeState();
  });

  ipcMain.handle('chat:set-topic-status', (_event, id, status) => setTopicStatus(id, status));

  ipcMain.handle('chat:delete-topic', (_event, id) => {
    memoryState.topicThreads = memoryState.topicThreads.filter((topic) => topic.id !== String(id || ''));
    saveMemory();
    return broadcastSharedLifeState();
  });

  ipcMain.handle('chat:get-life-hub', () => publicLifeHubState());

  ipcMain.handle('chat:rebuild-life-hub', () => {
    const stats = rebuildLifeHubFromHistory();
    return { state: broadcastLifeHubState(), stats };
  });

  ipcMain.handle('chat:add-person', (_event, input) => addOrUpdatePerson(input));

  ipcMain.handle('chat:update-person', (_event, id, input) => addOrUpdatePerson(input, id));

  ipcMain.handle('chat:delete-person', (_event, id) => {
    memoryState.people = memoryState.people.filter((person) => person.id !== String(id || ''));
    saveMemory();
    return broadcastLifeHubState();
  });

  ipcMain.handle('chat:get-continuity', () => publicContinuity());

  ipcMain.handle('chat:search-continuity', (_event, input) => (
    searchContinuity(memoryState, input?.query, { type: input?.type, limit: input?.limit })
  ));

  ipcMain.handle('chat:add-project', (_event, input) => addProject(input));

  ipcMain.handle('chat:update-project', (_event, id, input) => updateProject(id, input));

  ipcMain.handle('chat:delete-project', (_event, id) => deleteProject(id));

  ipcMain.handle('chat:add-project-step', (_event, projectId, input) => addProjectStep(projectId, input));

  ipcMain.handle('chat:update-project-step', (_event, projectId, stepId, input) => (
    updateProjectStep(projectId, stepId, input)
  ));

  ipcMain.handle('chat:delete-project-step', (_event, projectId, stepId) => (
    deleteProjectStep(projectId, stepId)
  ));

  ipcMain.handle('chat:add-habit', (_event, input) => addHabit(input));

  ipcMain.handle('chat:update-habit', (_event, id, input) => updateHabit(id, input));

  ipcMain.handle('chat:delete-habit', (_event, id) => deleteHabit(id));

  ipcMain.handle('chat:check-in-habit', (_event, id, input) => checkInHabit(id, input));

  registerAssistantIpc({
    ipcMain,
    publicAssistantState,
    updateAssistantSettings,
    createAssistantBriefing,
    answerPromise,
    startFocus: (input) => {
      startReminder(input?.minutes, input?.label, input?.mode);
      openTimerWindow();
      return publicAssistantState();
    }
  });

  ipcMain.handle('knowledge:get-state', () => publicKnowledgeState());

  ipcMain.handle('knowledge:search', (_event, input) => (
    searchKnowledge(knowledgeState, input?.query, { mode: 'local', limit: input?.limit })
      .map((item) => ({ ...item, text: undefined }))
  ));

  ipcMain.handle('knowledge:import-files', (_event, input) => importKnowledgeFiles(input));

  ipcMain.handle('knowledge:add-note', (_event, input) => addKnowledgeNote(input));

  ipcMain.handle('knowledge:add-library', (_event, input) => addKnowledgeLibrary(input));

  ipcMain.handle('knowledge:update-library', (_event, id, input) => updateKnowledgeLibrary(id, input));

  ipcMain.handle('knowledge:delete-library', (_event, id) => deleteKnowledgeLibrary(id));

  ipcMain.handle('knowledge:update-document', (_event, id, input) => {
    const document = knowledgeState.documents.find((item) => item.id === String(id || ''));
    if (!document) throw new Error('找不到这份资料。');
    if (input?.libraryId && knowledgeState.libraries.some((item) => item.id === input.libraryId)) document.libraryId = input.libraryId;
    if (typeof input?.title === 'string' && input.title.trim().length >= 2) document.title = input.title.trim().slice(0, 180);
    document.updatedAt = new Date().toISOString();
    saveKnowledge();
    return broadcastKnowledgeState();
  });

  ipcMain.handle('knowledge:delete-document', (_event, id) => deleteKnowledgeDocument(id));

  ipcMain.handle('knowledge:refresh', () => refreshKnowledgeIndex());

  ipcMain.handle('chat:locate-source', (_event, input) => locateConversationSource(input));

  ipcMain.handle('chat:check-database', () => {
    const health = inspectDatabase(memoryState);
    memoryState.hubMeta.lastHealthCheckAt = health.checkedAt;
    return health;
  });

  ipcMain.handle('chat:repair-database', () => repairDatabase());

  ipcMain.handle('chat:list-backups', () => listAutomaticBackups());

  ipcMain.handle('chat:create-backup', () => createUserBackup());

  ipcMain.handle('chat:restore-backup', () => restoreUserBackup());

  ipcMain.handle('chat:export-data', () => exportUserData());

  ipcMain.handle('chat:get-life-state', () => publicLifeState());

  ipcMain.handle('chat:get-moments-state', () => publicMomentsState());

  ipcMain.handle('chat:generate-moment', async () => {
    const result = await createMomentPost({ automatic: false });
    scheduleMomentPosting(false);
    return result;
  });

  ipcMain.handle('chat:comment-on-moment', (_event, input) => (
    commentOnMoment(input?.postId, input?.content)
  ));

  ipcMain.handle('chat:add-life-item', (_event, input) => addLifeItem(input, 'manual'));

  ipcMain.handle('chat:toggle-life-item', (_event, id, completed) => (
    toggleLifeItem(id, completed)
  ));

  ipcMain.handle('chat:delete-life-item', (_event, id) => deleteLifeItem(id));

  ipcMain.handle('chat:reset-mind', () => resetMindState());

  ipcMain.handle('chat:refresh-weather', async () => {
    if (settings.deepseek.weatherEnabled !== true) {
      throw new Error('请先在设置中开启天气。');
    }
    const weather = await fetchWeather(true);
    return { ...publicLifeState(), weather };
  });

  ipcMain.handle('chat:send-proactive-greeting', () => {
    if (settings.deepseek.proactiveGreetingEnabled === false) {
      throw new Error('请先在设置中开启主动聊天。');
    }
    return deliverProactiveGreeting({
      shouldSpeak: true,
      reason: 'manual_preview'
    });
  });

  ipcMain.handle('chat:send-girlfriend-message', async () => {
    if (settings.deepseek.girlfriendModeEnabled !== true) {
      throw new Error('请先在设置中开启女友陪伴模式。');
    }
    beginRelationshipWaiting(memoryState, {
      waitingSince: Date.now(),
      waitingSessionId: memoryState.activeSessionId,
      lastCompanionMessageAt: 0,
      followUpCount: 0
    }, MAX_CONTACT_COUNT);
    saveMemory();
    return deliverGirlfriendFollowUp(true);
  });
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new Error('对话格式无效。');
  }

  const trimmed = trimMessagesToTokenBudget(messages, {
    tokenBudget: CURRENT_CONVERSATION_TOKEN_BUDGET,
    messageLimit: MAX_CONTEXT_MESSAGES,
    maxMessageTokens: 16000
  });
  return serializeHistoricalAssistantReplies(trimmed);
}

function inferActionFromText(content) {
  if (/晚安|睡觉|困了|休息吧/.test(content)) {
    return { action: 'sleep', emotion: 'sleepy' };
  }
  if (/生气|不高兴|哼[！!。]?/.test(content)) {
    return { action: 'angry', emotion: 'angry' };
  }
  if (/喜欢|爱你|抱抱|害羞/.test(content)) {
    return { action: 'love', emotion: 'shy' };
  }
  if (/学习|复习|读书/.test(content)) {
    return { action: 'study', emotion: 'focused' };
  }
  if (/工作|任务|完成|计划/.test(content)) {
    return { action: 'work', emotion: 'focused' };
  }
  if (/吃|零食|午饭|晚饭|早餐/.test(content)) {
    return { action: 'snack', emotion: 'happy' };
  }
  if (/担心|难过|别怕|没关系/.test(content)) {
    return { action: 'wave', emotion: 'concerned' };
  }
  return { action: 'wave', emotion: 'happy' };
}

function visibleReplyText(payload) {
  return String(
    payload?.reply
    ?? payload?.content
    ?? payload?.message
    ?? payload?.answer
    ?? payload?.text
    ?? ''
  ).trim();
}

function inspectStructuredReply(rawContent) {
  const normalized = String(rawContent || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!normalized) {
    return {
      parseSuccess: false,
      visibleReplyPresent: false,
      parserErrorCode: 'EMPTY_RESPONSE'
    };
  }
  try {
    const payload = JSON.parse(normalized);
    return {
      parseSuccess: true,
      visibleReplyPresent: Boolean(visibleReplyText(payload)),
      parserErrorCode: null
    };
  } catch {
    return {
      parseSuccess: false,
      visibleReplyPresent: false,
      parserErrorCode: 'JSON_PARSE_ERROR'
    };
  }
}

function parseStructuredReply(rawContent) {
  const fallback = inferActionFromText(rawContent);
  let payload = null;
  try {
    const normalized = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    payload = JSON.parse(normalized);
  } catch {
    return {
      content: rawContent,
      action: fallback.action,
      emotion: fallback.emotion,
      memories: [],
      episodes: [],
      topics: [],
      people: [],
      projects: [],
      habits: [],
      commitments: [],
      mind: {}
    };
  }

  const content = visibleReplyText(payload);
  if (!content) {
    throw new Error('DeepSeek 返回的 JSON 中没有可显示的回复，请重试。');
  }
  return {
    content,
    action: PET_ACTIONS.has(payload.action) ? payload.action : fallback.action,
    emotion: PET_EMOTIONS.has(payload.emotion) ? payload.emotion : fallback.emotion,
    memories: Array.isArray(payload.memories)
      ? payload.memories.slice(0, MAX_MEMORY_CANDIDATES_PER_REPLY)
      : Array.isArray(payload.memory)
        ? payload.memory.slice(0, MAX_MEMORY_CANDIDATES_PER_REPLY)
        : [],
    episodes: Array.isArray(payload.episodes)
      ? payload.episodes.slice(0, MAX_EPISODE_CANDIDATES_PER_REPLY)
      : [],
    topics: Array.isArray(payload.topics) ? payload.topics.slice(0, 3) : [],
    people: Array.isArray(payload.people) ? payload.people.slice(0, 6) : [],
    projects: Array.isArray(payload.projects) ? payload.projects.slice(0, 3) : [],
    habits: Array.isArray(payload.habits) ? payload.habits.slice(0, 3) : [],
    commitments: Array.isArray(payload.commitments) ? payload.commitments.slice(0, 4) : [],
    mind: payload?.mind && typeof payload.mind === 'object' ? payload.mind : {}
  };
}

async function requestDeepSeek(messages, options = {}) {
  if (!chatRequestService) {
    throw new Error('Chat request service has not been initialized.');
  }
  return chatRequestService.request(messages, options);
}

function createLlmDiagnostic(requestPurpose, caller) {
  const turnId = `llm-${Date.now().toString(36)}-${++llmDiagnosticSequence}`;
  return {
    turnId,
    requestId: `${turnId}-main`,
    requestPurpose,
    caller
  };
}

const automatedSmokeMode = process.env.MAI_MIGRATION_SMOKE === '1'
  || process.env.MAI_UI_SMOKE === '1'
  || process.env.MAI_RESTORE_PROTECTION_SMOKE === '1'
  || process.env.MAI_RESTORE_RECOVERY_SMOKE === '1'
  || process.env.MAI_CLOSE_CHAT_SMOKE === '1'
  || process.env.MAI_P0_CHAT_SMOKE === '1'
  || process.env.MAI_DEEPSEEK_INCREMENTAL_SMOKE === '1'
  || process.env.MAI_DEEPSEEK_REAL_SESSION_SMOKE === '1'
  || process.env.MAI_DEEPSEEK_SESSION_MESSAGE_BISECT === '1'
  || process.env.MAI_DEEPSEEK_SESSION_MESSAGE_SHAPE_AUDIT === '1';
const gotLock = automatedSmokeMode || app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showPet('hello'));

  app.whenReady().then(() => {
    smokeDiagnostics?.checkpoint('app_ready');
    app.setAppUserModelId('com.mai.sakurajima.desktop');
    Menu.setApplicationMenu(null);
    startupFileSetRecovery = recoverInterruptedFileSetTransaction(app.getPath('userData'), {
      allowedTargets: [memoryPath(), settingsPath(), knowledgePath(), workStore.filePath, customWallpaperPath(), ...Object.values(customAvatarPaths())]
    });
    markProductDataRecoveryComplete();
    loadSettings();
    migrateLegacyAgentWorkspace();
    loadMemory();
    loadKnowledge();
    dataStoresReadyForShutdown = true;
    try {
      ensureDailyAutomaticBackup();
    } catch (error) {
      console.error('Could not create the daily Mai backup:', error);
      dialog.showErrorBox('自动备份失败', `本次未能创建自动备份，现有数据未被覆盖。\n\n${String(error?.message || error)}`);
    }
    if (process.env.MAI_DEEPSEEK_SESSION_MESSAGE_BISECT === '1') {
      runDeepSeekSessionMessageBisect()
        .then(() => app.exit(0))
        .catch((error) => {
          console.error('DeepSeek session message bisect failed:', error?.code || error?.message || error);
          app.exit(1);
        });
      return;
    }
    if (process.env.MAI_DEEPSEEK_SESSION_MESSAGE_SHAPE_AUDIT === '1') {
      runDeepSeekSessionMessageShapeAudit()
        .then(() => app.exit(0))
        .catch((error) => {
          console.error('DeepSeek session message shape audit failed:', error?.code || error?.message || error);
          app.exit(1);
        });
      return;
    }
    if (process.env.MAI_DEEPSEEK_INCREMENTAL_SMOKE === '1' || process.env.MAI_DEEPSEEK_REAL_SESSION_SMOKE === '1') {
      runDeepSeekIncrementalSmoke({ useActiveSession: process.env.MAI_DEEPSEEK_REAL_SESSION_SMOKE === '1' })
        .then(() => app.exit(0))
        .catch((error) => {
          console.error('DeepSeek incremental structured smoke failed:', error?.code || error?.message || error);
          app.exit(1);
        });
      return;
    }
    if (process.env.MAI_MIGRATION_SMOKE === '1') {
      app.quit();
      return;
    }
    applyLoginSetting(settings.openAtLogin);
    registerIpc();
    smokeDiagnostics?.checkpoint('services_initialized');
    if (process.env.MAI_RESTORE_PROTECTION_SMOKE === '1' && process.env.MAI_RESTORE_PROTECTION_OUTPUT) {
      runRestoreProtectionSmoke(process.env.MAI_RESTORE_PROTECTION_OUTPUT);
      return;
    }
    if (process.env.MAI_RESTORE_RECOVERY_SMOKE === '1' && process.env.MAI_RESTORE_RECOVERY_OUTPUT) {
      runRestoreRecoveryStartupSmoke(process.env.MAI_RESTORE_RECOVERY_OUTPUT);
      return;
    }
    if (process.env.MAI_P0_CHAT_SMOKE === '1' && process.env.MAI_P0_CHAT_SMOKE_OUTPUT) {
      runP0ChatFlowSmoke(process.env.MAI_P0_CHAT_SMOKE_OUTPUT);
      return;
    }
    if (process.env.MAI_UI_SMOKE === '1' && process.env.MAI_UI_SMOKE_OUTPUT) {
      runUiSmoke(process.env.MAI_UI_SMOKE_OUTPUT);
      return;
    }
    if (process.env.MAI_CLOSE_CHAT_SMOKE === '1' && process.env.MAI_CLOSE_CHAT_SMOKE_OUTPUT) {
      runChatCloseSmoke(process.env.MAI_CLOSE_CHAT_SMOKE_OUTPUT);
      return;
    }
    createWindow();
    createTray();
    scheduleProactiveGreeting(true);
    scheduleGirlfriendFollowUp();
    scheduleMomentPosting(true);
    scheduleReminder();
    scheduleActivityTracking();
    scheduleKnowledgeRefresh();
  }).catch((error) => {
    dataStoresReadyForShutdown = false;
    console.error('Mai could not safely initialize local data:', error);
    if (process.env.MAI_MIGRATION_BACKUP_FAILURE_SMOKE === '1'
      || process.env.MAI_RESTORE_RECOVERY_SMOKE === '1') {
      const outputPath = String(process.env.MAI_MIGRATION_BACKUP_FAILURE_OUTPUT
        || process.env.MAI_RESTORE_RECOVERY_OUTPUT || '');
      if (outputPath) {
        try {
          fs.writeFileSync(outputPath, JSON.stringify({ ok: false, errorCode: String(error?.code || '') }), 'utf8');
        } catch (writeError) {
          console.error('Could not write migration failure smoke result:', writeError);
        }
      }
      app.quit();
      return;
    }
    if (error?.code === 'RESTORE_ROLLBACK_FAILED') {
      const journal = error.recoveryJournalPath || path.join(app.getPath('userData'), 'mai-restore-transaction.json');
      dialog.showErrorBox('恢复事务未能完成', `Mai 已停止启动，产品数据没有继续加载或写入。请勿删除或移动事务日志、原始副本及当前文件。关闭后重新启动可再次尝试恢复；若仍失败，请保留数据目录并联系支持。\n\n事务日志：${journal}\n\n${String(error?.message || error)}`);
      app.quit();
      return;
    }
    dialog.showErrorBox('Mai 本地数据未能安全加载', `为保护原始数据，Mai 已停止启动，没有写回空状态。\n\n${String(error?.message || error)}`);
    app.quit();
  });

  app.on('activate', () => showPet('hello'));
  app.on('before-quit', () => {
    quitting = true;
    chatRequestLifecycle.cancelAll('app_quit');
    actionRuntimeManager?.cancelAll?.();
    clearTimeout(proactiveGreetingTimer);
    clearTimeout(girlfriendFollowUpTimer);
    clearTimeout(momentPostTimer);
    clearTimeout(reminderTimer);
    petVisibility.dispose();
    clearInterval(activityTrackingTimer);
    clearInterval(knowledgeRefreshTimer);
    saveProductDataOnShutdown();
    voiceService.dispose();
    localTtsService.dispose();
  });
  app.on('window-all-closed', () => {
    // A tray companion should remain available until the user explicitly exits.
  });
}
