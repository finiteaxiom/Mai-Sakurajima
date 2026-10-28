const api = window.maiPet;
const messagesElement = document.getElementById('messages');
const composer = document.getElementById('composer');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const notice = document.getElementById('notice');
const settingsButton = document.getElementById('settings-button');
const memoryButton = document.getElementById('memory-button');
const assistantButton = document.getElementById('assistant-button');
const lifeButton = document.getElementById('life-button');
const sharedLifeButton = document.getElementById('shared-life-button');
const momentsButton = document.getElementById('moments-button');
const voiceCallButton = document.getElementById('voice-call-button');
const voiceInputButton = document.getElementById('voice-input-button');
const historyButton = document.getElementById('history-button');
const newChatButton = document.getElementById('new-chat-button');
const knowledgeButton = document.getElementById('knowledge-button');
const workspaceSidebarToggle = document.getElementById('workspace-sidebar-toggle');
const workspaceSearchButton = document.getElementById('workspace-search-button');
const companionInspectorToggle = document.getElementById('companion-inspector-toggle');
const companionInspectorScrim = document.getElementById('companion-inspector-scrim');
const workInspectorToggle = document.getElementById('work-inspector-toggle');
const workInspectorScrim = document.getElementById('work-inspector-scrim');
const runtimeSwitcher = document.getElementById('runtime-switcher');
const runtimeSwitcherButton = document.getElementById('runtime-switcher-button');
const runtimeSwitcherMenu = document.getElementById('runtime-switcher-menu');
const runtimeCurrentLabel = document.getElementById('runtime-current-label');
const runtimeOptions = Array.from(document.querySelectorAll('.runtime-option[data-runtime-mode]'));
const workspaceLocation = document.getElementById('workspace-location');
const chatApp = document.querySelector('.chat-app');
const wallpaperLayer = document.getElementById('wallpaper-layer');
const wallpaperGrid = document.getElementById('wallpaper-grid');
const wallpaperSelectionLabel = document.getElementById('wallpaper-selection-label');
const chooseCustomWallpaperButton = document.getElementById('choose-custom-wallpaper');
const clearCustomWallpaperButton = document.getElementById('clear-custom-wallpaper');
let wallpaperLoadGeneration = 0;
let workInspectorOpen = false;
let companionInspectorOpen = false;
const maiAvatarButton = document.getElementById('mai-avatar-button');
const agentAvatarButton = document.getElementById('agent-avatar-button');
const userAvatarButton = document.getElementById('user-avatar-button');
const userAvatar = document.getElementById('user-avatar');
const avatarPickerOverlay = document.getElementById('avatar-picker-overlay');
const avatarPickerTitle = document.getElementById('avatar-picker-title');
const avatarPickerDescription = document.getElementById('avatar-picker-description');
const avatarGrid = document.getElementById('avatar-grid');
const chooseCustomAvatarButton = document.getElementById('choose-custom-avatar');
const clearCustomAvatarButton = document.getElementById('clear-custom-avatar');
const closeAvatarPickerButton = document.getElementById('close-avatar-picker');
const activeSessionTitle = document.getElementById('active-session-title');
const conversationRuntimeEyebrow = document.getElementById('conversation-runtime-eyebrow');
const conversationModelBadge = document.getElementById('conversation-model-badge');
const conversationMemoryBadge = document.getElementById('conversation-memory-badge');
const runtimePrivacyNote = document.getElementById('runtime-privacy-note');
const chatWorkspaceCapability = document.getElementById('chat-workspace-capability');
const agentRuntimePanel = document.getElementById('agent-runtime-panel');
const agentRuntimeStatus = document.getElementById('agent-runtime-status');
const agentEnableButton = document.getElementById('agent-enable-button');
const agentCancelButton = document.getElementById('agent-cancel-button');
const agentEventLog = document.getElementById('agent-event-log');
const agentEventEmpty = document.getElementById('agent-event-empty');
const newActionButton = document.getElementById('new-action-button');
const newWorkProjectButton = document.getElementById('new-work-project-button');
const renameWorkProjectButton = document.getElementById('rename-work-project-button');
const workProjectList = document.getElementById('work-project-list');
const workProjectEmpty = document.getElementById('work-project-empty');
const refreshWorkDataButton = document.getElementById('refresh-work-data-button');
const agentSettingsButton = document.getElementById('agent-settings-button');
const actionContextStatus = document.getElementById('action-context-status');
const actionContextRuntime = document.getElementById('action-context-runtime');
const actionProjectStatus = document.getElementById('action-project-status');
const actionWorkspaceStatus = document.getElementById('action-workspace-status');
const actionWorkspacePath = document.getElementById('action-workspace-path');
const selectActionWorkspaceButton = document.getElementById('select-action-workspace');
const refreshActionWorkspaceButton = document.getElementById('refresh-action-workspace');
const actionWorkspaceTree = document.getElementById('action-workspace-tree');
const actionWorkspaceEmpty = document.getElementById('action-workspace-empty');
const actionWorkspaceStale = document.getElementById('action-workspace-stale');
const workspacePreviewOverlay = document.getElementById('workspace-preview-overlay');
const workspacePreviewName = document.getElementById('workspace-preview-name');
const workspacePreviewPath = document.getElementById('workspace-preview-path');
const workspacePreviewStatus = document.getElementById('workspace-preview-status');
const workspacePreviewContent = document.getElementById('workspace-preview-content');
const closeWorkspacePreviewButton = document.getElementById('close-workspace-preview');
const actionContext = document.getElementById('action-context');
const companionContext = document.getElementById('companion-context');
const companionPlanList = document.getElementById('companion-plan-list');
const companionPlanEmpty = document.getElementById('companion-plan-empty');
const recentList = document.getElementById('recent-list');
const recentEmpty = document.getElementById('recent-empty');
const contextMessageCount = document.getElementById('context-message-count');
const contextMemoryCount = document.getElementById('context-memory-count');
const contextPlanCount = document.getElementById('context-plan-count');
const contextCapabilityGrid = document.getElementById('context-capability-grid');
const contextPlanList = document.getElementById('context-plan-list');
const contextPlanEmpty = document.getElementById('context-plan-empty');
const contextTodayList = document.getElementById('context-today-list');
const contextTodayEmpty = document.getElementById('context-today-empty');
const contextOpenPlans = document.getElementById('context-open-plans');
const contextOpenSchedule = document.getElementById('context-open-schedule');
const openCompanionCenterButton = document.getElementById('open-companion-center-button');
const historySidebar = document.getElementById('history-sidebar');
const historyScrim = document.getElementById('history-scrim');
const closeHistoryButton = document.getElementById('close-history');
const sidebarNewChatButton = document.getElementById('sidebar-new-chat');
const clearHistoryButton = document.getElementById('clear-history');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const historyTitle = document.getElementById('history-title');
const historyDescription = document.getElementById('history-description');
const settingsOverlay = document.getElementById('settings-overlay');
const memoryOverlay = document.getElementById('memory-overlay');
const lifeOverlay = document.getElementById('life-overlay');
const sharedLifeOverlay = document.getElementById('shared-life-overlay');
const momentsOverlay = document.getElementById('moments-overlay');
const closeSettingsButton = document.getElementById('close-settings');
const closeMemoryButton = document.getElementById('close-memory');
const doneMemoryButton = document.getElementById('done-memory');
const closeSharedLifeButton = document.getElementById('close-shared-life');
const doneSharedLifeButton = document.getElementById('done-shared-life');
const closeLifeButton = document.getElementById('close-life');
const doneLifeButton = document.getElementById('done-life');
const closeMomentsButton = document.getElementById('close-moments');
const apiKeyInput = document.getElementById('api-key');
const keyHint = document.getElementById('key-hint');
const modelProviderSelect = document.getElementById('model-provider');
const modelProviderHint = document.getElementById('model-provider-hint');
const modelSelect = document.getElementById('model');
const personalitySelect = document.getElementById('personality');
const customPromptInput = document.getElementById('custom-prompt');
const memoryEnabledInput = document.getElementById('memory-enabled');
const proactiveEnabledInput = document.getElementById('proactive-enabled');
const proactiveIntervalMinutesInput = document.getElementById('proactive-interval-minutes');
const proactiveDailyLimitInput = document.getElementById('proactive-daily-limit');
const girlfriendEnabledInput = document.getElementById('girlfriend-enabled');
const momentsEnabledInput = document.getElementById('moments-enabled');
const voiceAutoReadInput = document.getElementById('voice-auto-read');
const voiceEngineSelect = document.getElementById('voice-engine');
const voiceNameSelect = document.getElementById('voice-name');
const voiceCultureSelect = document.getElementById('voice-culture');
const voiceRateInput = document.getElementById('voice-rate');
const voicePitchInput = document.getElementById('voice-pitch');
const voiceVolumeInput = document.getElementById('voice-volume');
const voiceRateValue = document.getElementById('voice-rate-value');
const voicePitchValue = document.getElementById('voice-pitch-value');
const voiceVolumeValue = document.getElementById('voice-volume-value');
const voiceCapabilityStatus = document.getElementById('voice-capability-status');
const testVoiceButton = document.getElementById('test-voice');
const installLocalVoiceButton = document.getElementById('install-local-voice');
const localVoiceTitle = document.getElementById('local-voice-title');
const localVoiceDetail = document.getElementById('local-voice-detail');
const localVoiceProgress = document.getElementById('local-voice-progress');
const localVoiceProgressBar = document.getElementById('local-voice-progress-bar');
const girlfriendIntervalMinutesInput = document.getElementById('girlfriend-interval-minutes');
const girlfriendMaxFollowUpsInput = document.getElementById('girlfriend-max-follow-ups');
const weatherEnabledInput = document.getElementById('weather-enabled');
const weatherCityInput = document.getElementById('weather-city');
const appearanceThemeInput = document.getElementById('appearance-theme');
const appearanceGlassInput = document.getElementById('appearance-glass');
const appearanceDensityInput = document.getElementById('appearance-density');
const appearanceTransparencyInput = document.getElementById('appearance-transparency');
const appearanceTransparencyValue = document.getElementById('appearance-transparency-value');
const appearanceScaleInput = document.getElementById('appearance-scale');
const appearanceScaleValue = document.getElementById('appearance-scale-value');
const appearanceMotionInput = document.getElementById('appearance-motion');
const appearancePreview = document.getElementById('appearance-preview');
const settingsStatus = document.getElementById('settings-status');
const saveSettingsButton = document.getElementById('save-settings');
const testConnectionButton = document.getElementById('test-connection');
const clearKeyButton = document.getElementById('clear-key');
const previewGreetingButton = document.getElementById('preview-greeting');
const previewGirlfriendButton = document.getElementById('preview-girlfriend');
const clearMemoryButton = document.getElementById('clear-memory');
const rebuildMemoryButton = document.getElementById('rebuild-memory');
const addMemoryButton = document.getElementById('add-memory');
const memoryTextInput = document.getElementById('memory-text');
const memoryCategorySelect = document.getElementById('memory-category');
const memoryImportanceSelect = document.getElementById('memory-importance');
const memoryList = document.getElementById('memory-list');
const memoryEmpty = document.getElementById('memory-empty');
const memorySummary = document.getElementById('memory-summary');
const sharedLifeSummary = document.getElementById('shared-life-summary');
const worldLocation = document.getElementById('world-location');
const worldActivity = document.getElementById('world-activity');
const worldDetail = document.getElementById('world-detail');
const worldNext = document.getElementById('world-next');
const timelineTab = document.getElementById('timeline-tab');
const searchTab = document.getElementById('search-tab');
const projectsTab = document.getElementById('projects-tab');
const habitsTab = document.getElementById('habits-tab');
const reviewTab = document.getElementById('review-tab');
const peopleTab = document.getElementById('people-tab');
const digestsTab = document.getElementById('digests-tab');
const episodesTab = document.getElementById('episodes-tab');
const topicsTab = document.getElementById('topics-tab');
const maintenanceTab = document.getElementById('maintenance-tab');
const timelinePanel = document.getElementById('timeline-panel');
const searchPanel = document.getElementById('search-panel');
const projectsPanel = document.getElementById('projects-panel');
const habitsPanel = document.getElementById('habits-panel');
const reviewPanel = document.getElementById('review-panel');
const peoplePanel = document.getElementById('people-panel');
const digestsPanel = document.getElementById('digests-panel');
const episodesPanel = document.getElementById('episodes-panel');
const topicsPanel = document.getElementById('topics-panel');
const maintenancePanel = document.getElementById('maintenance-panel');
const timelineList = document.getElementById('timeline-list');
const continuitySearchInput = document.getElementById('continuity-search-input');
const continuitySearchType = document.getElementById('continuity-search-type');
const runContinuitySearchButton = document.getElementById('run-continuity-search');
const continuitySearchSummary = document.getElementById('continuity-search-summary');
const continuitySearchList = document.getElementById('continuity-search-list');
const continuitySearchEmpty = document.getElementById('continuity-search-empty');
const projectTitleInput = document.getElementById('project-title');
const projectOutcomeInput = document.getElementById('project-outcome');
const projectTargetInput = document.getElementById('project-target');
const projectPrioritySelect = document.getElementById('project-priority');
const addProjectButton = document.getElementById('add-project');
const projectsSummary = document.getElementById('projects-summary');
const projectsList = document.getElementById('projects-list');
const projectsEmpty = document.getElementById('projects-empty');
const habitTitleInput = document.getElementById('habit-title');
const habitFrequencySelect = document.getElementById('habit-frequency');
const habitTargetInput = document.getElementById('habit-target');
const habitReminderTimeInput = document.getElementById('habit-reminder-time');
const addHabitButton = document.getElementById('add-habit');
const habitsSummary = document.getElementById('habits-summary');
const habitsList = document.getElementById('habits-list');
const habitsEmpty = document.getElementById('habits-empty');
const reviewSummary = document.getElementById('review-summary');
const reviewList = document.getElementById('review-list');
const reviewEmpty = document.getElementById('review-empty');
const peopleList = document.getElementById('people-list');
const digestsList = document.getElementById('digests-list');
const episodesList = document.getElementById('episodes-list');
const topicsList = document.getElementById('topics-list');
const timelineEmpty = document.getElementById('timeline-empty');
const peopleEmpty = document.getElementById('people-empty');
const digestsEmpty = document.getElementById('digests-empty');
const episodesEmpty = document.getElementById('episodes-empty');
const topicsEmpty = document.getElementById('topics-empty');
const rebuildSharedLifeButton = document.getElementById('rebuild-shared-life');
const personNameInput = document.getElementById('person-name');
const personRelationInput = document.getElementById('person-relation');
const personNotesInput = document.getElementById('person-notes');
const addPersonButton = document.getElementById('add-person');
const healthTitle = document.getElementById('health-title');
const healthSummary = document.getElementById('health-summary');
const healthDetails = document.getElementById('health-details');
const checkDatabaseButton = document.getElementById('check-database');
const createBackupButton = document.getElementById('create-backup');
const restoreBackupButton = document.getElementById('restore-backup');
const exportDataButton = document.getElementById('export-data');
const repairDatabaseButton = document.getElementById('repair-database');
const connectionDot = document.getElementById('connection-dot');
const connectionLabel = document.getElementById('connection-label');
const moodLabel = document.getElementById('mood-label');
const relationshipStage = document.getElementById('relationship-stage');
const mindMood = document.getElementById('mind-mood');
const intimacyBar = document.getElementById('intimacy-bar');
const trustBar = document.getElementById('trust-bar');
const energyBar = document.getElementById('energy-bar');
const intimacyValue = document.getElementById('intimacy-value');
const trustValue = document.getElementById('trust-value');
const energyValue = document.getElementById('energy-value');
const activeTopic = document.getElementById('active-topic');
const pendingQuestion = document.getElementById('pending-question');
const weatherSummary = document.getElementById('weather-summary');
const weatherDetail = document.getElementById('weather-detail');
const refreshWeatherButton = document.getElementById('refresh-weather');
const lifeTitleInput = document.getElementById('life-title-input');
const lifeKindSelect = document.getElementById('life-kind');
const lifeDueAtInput = document.getElementById('life-due-at');
const lifeRecurringSelect = document.getElementById('life-recurring');
const addLifeItemButton = document.getElementById('add-life-item');
const lifeList = document.getElementById('life-list');
const lifeEmpty = document.getElementById('life-empty');
const resetMindButton = document.getElementById('reset-mind');
const momentsList = document.getElementById('moments-list');
const momentsEmpty = document.getElementById('moments-empty');
const momentsAutoStatus = document.getElementById('moments-auto-status');
const momentsStatus = document.getElementById('moments-status');
const generateMomentButton = document.getElementById('generate-moment');
const voiceCallOverlay = document.getElementById('voice-call-overlay');
const voiceCallDuration = document.getElementById('voice-call-duration');
const voiceCallAvatar = document.getElementById('voice-call-avatar');
const voiceCallStatus = document.getElementById('voice-call-status');
const voiceCallTranscript = document.getElementById('voice-call-transcript');
const voiceCallMicButton = document.getElementById('voice-call-mic');
const voiceCallSpeakerButton = document.getElementById('voice-call-speaker');
const endVoiceCallButton = document.getElementById('end-voice-call');
const portrait = document.getElementById('portrait');
const agentPortrait = document.getElementById('agent-portrait');
const inputDialogOverlay = document.getElementById('input-dialog-overlay');
const inputDialogTitle = document.getElementById('input-dialog-title');
const inputDialogDescription = document.getElementById('input-dialog-description');
const inputDialogForm = document.getElementById('input-dialog-form');
const inputDialogFields = document.getElementById('input-dialog-fields');
const inputDialogError = document.getElementById('input-dialog-error');
const inputDialogClose = document.getElementById('input-dialog-close');
const inputDialogCancel = document.getElementById('input-dialog-cancel');
const inputDialogSubmit = document.getElementById('input-dialog-submit');
const conversationContextMenu = document.getElementById('conversation-context-menu');
const conversationContextRename = document.getElementById('conversation-context-rename');
const conversationContextDelete = document.getElementById('conversation-context-delete');
const conversationContextDeleteLabel = document.getElementById('conversation-context-delete-label');

const PERSONALITY_LABELS = {
  classic: '经典麻衣',
  gentle: '温柔陪伴',
  playful: '活泼爱逗',
  focused: '专注搭档',
  open: '坦率开放'
};

const MOOD_LABELS = {
  neutral: '安静陪伴',
  happy: '心情很好',
  curious: '对你很好奇',
  shy: '有点害羞',
  concerned: '认真关心你',
  angry: '有一点生气',
  sleepy: '开始犯困',
  focused: '专注模式'
};

const MIND_MOOD_LABELS = {
  calm: '平静',
  happy: '开心',
  curious: '好奇',
  shy: '害羞',
  concerned: '担心你',
  playful: '想逗你',
  focused: '专注',
  sleepy: '困倦',
  upset: '有点不高兴'
};

const LIFE_KIND_LABELS = {
  todo: '待办',
  appointment: '约定',
  anniversary: '纪念日'
};

const LOCAL_VOICE_STAGE_LABELS = {
  prepare: '准备安装',
  'download-runtime': '下载运行环境',
  'install-runtime': '安装运行环境',
  'install-dependencies': '安装语音组件',
  'download-model': '下载情绪语音模型',
  verify: '验证模型',
  complete: '安装完成'
};

const LOCAL_VOICE_DETAIL_LABELS = {
  'checking-runtime': '正在检查 Python 3.10 本地运行环境…',
  'downloading-python': '正在从 Python.org 下载 Python 3.10（约 28 MB）…',
  'installing-private-python': '正在安装独立运行环境，不会改动系统 Python…',
  'upgrading-pip': '正在升级本地安装工具…',
  'downloading-pytorch': '正在下载 PyTorch 与 CUDA 推理组件；这个文件最大，请耐心等待…',
  'installing-gpu-runtime': '正在安装 GPU 推理组件；下载时间取决于网络速度…',
  'installing-sensevoice-runtime': '正在安装本地语气感知组件…',
  'checking-cosyvoice-base-model': '正在检查并复用旧版 CosyVoice 女声模型…',
  'downloading-cosyvoice-model': '正在下载基础 CosyVoice 女声模型（约 2.62 GB，可断点续传）…',
  'downloading-emotion-voice-model': '正在下载 CosyVoice 情绪女声模型（约 2.3 GB，可断点续传）…',
  'downloading-sensevoice-model': '正在下载 SenseVoice 语气感知模型（约 1 GB，可断点续传）…',
  'verifying-model': '正在验证模型文件与 CUDA 支持…',
  'local-voice-ready': '本地情绪女声与语气感知已经就绪。'
};

const PORTRAIT_ACTIONS = new Set(['idle', 'wave', 'jump', 'love', 'angry', 'sleep', 'lazy', 'study', 'work', 'snack']);

const MAX_RENDER_CONTEXT_MESSAGES = 1600;

let chatConfig = {
  configured: false,
  model: 'deepseek-v4-flash',
  personality: 'classic',
  customPrompt: '',
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
  weatherCity: ''
};
let conversation = [];
let memories = [];
let memoryDiagnostics = null;
let sharedLifeState = { world: null, episodes: [], topics: [], meta: {} };
let lifeHubState = { world: null, timeline: [], people: [], digests: [], health: null, meta: {} };
let continuityState = { projects: [], habits: [], reviews: [], summary: {}, meta: {} };
let lifeState = {
  mind: null,
  items: [],
  weather: null,
  weatherEnabled: false,
  weatherCity: ''
};
let momentsState = {
  moments: [],
  meta: {},
  automaticEnabled: true
};
const momentRepliesInFlight = new Set();
let runtimeSessions = [];
let chatWorkspaceStatus = { granted: false, operations: [] };
let pendingWorkspaceRequest = null;
let activeAvatarTarget = null;
let portraitReactionTimer = null;
let voiceCapabilities = {
  available: false,
  recognizers: [],
  defaultCulture: 'zh-CN',
  localTts: { installed: false, ready: false, state: 'stopped' }
};
let speechVoices = [];
let activeSpeechAudio = null;
let activeSpeechCancel = null;
let speechGeneration = 0;
let voiceInputListening = false;
let voiceCallActive = false;
let voiceCallGeneration = 0;
let voiceCallMicPaused = false;
let voiceCallSpeakerMuted = false;
let voiceCallStartedAt = 0;
let voiceCallDurationTimer = null;
let voiceCallLoopPromise = null;
let callMicrophoneMonitor = null;
let inputDialogState = null;
let conversationContextSessionId = '';
let conversationContextKind = 'chat';
let conversationContextWorkIdentity = null;
let conversationContextWorkProjectId = '';
let selectedRuntimeMode = 'chat';
let runtimeModeGeneration = 0;
let actionRuntimeStatus = { enabled: false, available: false, reason: '' };
let activeActionSessionId = '';
let actionEvents = [];
let workProjects = [];
let allWorkSessions = [];
let workSessions = [];
let activeWorkProjectId = '';
let activeWorkSessionId = '';
let workspaceExplorerProjectId = '';
let workspaceExplorerListings = new Map();
let workspaceExplorerExpanded = new Set(['']);
let workspaceExplorerSelection = null;
let workspaceExplorerLoading = false;
let workspaceExplorerMayBeStale = false;
let workspacePreview = null;

function activeChatSessionId() {
  return chatTurnCoordinator.getState().sessionId;
}

function updateChatTurnControls(state) {
  if (!state || state.disposed || selectedRuntimeMode === 'agent') return;
  messageInput.disabled = state.busy;
  sendButton.disabled = state.cancellationPending;
  sendButton.textContent = state.cancellationPending ? '取消中…' : state.activeTurnToken ? '停止' : '发送';
  sendButton.setAttribute('aria-label', state.cancellationPending
    ? '正在取消当前回复'
    : state.activeTurnToken ? '停止当前回复' : '发送');
}

const chatTurnCoordinator = window.MaiChatTurnCoordinator.createChatTurnCoordinator({
  api,
  onStateChange: updateChatTurnControls,
  onApplyChatState: projectChatState,
  onApplySessionMetadata: (state) => {
    runtimeSessions = Array.isArray(state?.sessions) ? state.sessions : runtimeSessions;
    renderHistory();
    renderCompanionWorkspace();
  }
});

const workRendererBindings = window.MaiWorkRendererBindings.createWorkRendererBindings({
  api,
  onWorkStateChange: (state) => {
    actionRuntimeStatus = state.runtimeStatus;
    activeActionSessionId = state.activeActionSessionId;
    actionEvents = state.events;
    workProjects = state.projects;
    allWorkSessions = state.sessions;
    activeWorkProjectId = state.projectId;
    activeWorkSessionId = state.workSessionId;
    workSessions = state.sessions.filter((session) => session.projectId === state.projectId);
    if (selectedRuntimeMode === 'agent' && state.mode === 'agent') renderActionWorkspace();
  },
  onExplorerStateChange: (state) => {
    workspaceExplorerProjectId = state.identity?.projectId || '';
    workspaceExplorerListings = state.listings;
    workspaceExplorerExpanded = state.expanded;
    workspaceExplorerSelection = state.selection;
    workspaceExplorerLoading = state.loading;
    workspaceExplorerMayBeStale = state.mayBeStale;
    workspacePreview = state.preview;
    if (selectedRuntimeMode === 'agent' && state.identity?.mode === 'agent') renderWorkspaceExplorer();
  },
  onNotice: (error) => showNotice(errorText(error)),
  onBusySelection: () => showNotice('请等待当前行动结束。'),
  onActionResult: (response) => showNotice(response?.presentation?.content || '这次行动没有完成。')
});

function setCapabilityChips(labels) {
  contextCapabilityGrid.replaceChildren();
  for (const label of labels) {
    const chip = document.createElement('span');
    chip.textContent = label;
    contextCapabilityGrid.appendChild(chip);
  }
}

function errorText(error) {
  return (error?.message || String(error) || '发生了未知错误。')
    .replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
}

function workspaceErrorText(result) {
  return result?.error?.userMessage || result?.error?.developerMessage || '无法完成这次 Workspace 读取。';
}

function workspaceIntentFromChat(content) {
  const text = String(content || '').trim();
  if (!text || text.length > 3000) return null;
  const readMatch = text.match(/(?:看看|读取|读一下|打开|解释|分析)\s*[“"']?([\w./\\-]+\.(?:md|markdown|txt|json|ya?ml|toml|ini|js|mjs|cjs|ts|tsx|jsx|css|html|py|java|go|rs|sql|xml|csv))[”"']?/i);
  if (readMatch) return { operation: 'read', relativePath: readMatch[1].replace(/\\/g, '/') };
  if (/\bREADME\b/i.test(text)) return { operation: 'read', relativePath: 'README.md' };
  if (/(?:docs|文档)\s*(?:目录|文件夹)?\s*(?:里|中)?\s*(?:有什么|哪些|列出|看看)/i.test(text)) return { operation: 'list', relativePath: 'docs' };
  const listMatch = text.match(/(?:列出|看看|浏览|有哪些)\s*[“"']?([\w./\\-]+(?:目录|文件夹)?)[”"']?\s*(?:里|中)?\s*(?:有什么|哪些|文件|内容)?/i);
  if (listMatch && /(?:目录|文件夹|文件|有哪些|列出|浏览)/.test(text)) {
    return { operation: 'list', relativePath: listMatch[1].replace(/(?:目录|文件夹)$/u, '').replace(/\\/g, '/') || '.' };
  }
  if (/(?:配置文件|项目文件|工作区文件)/.test(text)) return { operation: 'list', relativePath: '.' };
  return null;
}

function renderChatWorkspaceCapability() {
  if (!chatWorkspaceCapability) return;
  chatWorkspaceCapability.replaceChildren();
  const chip = document.createElement('span');
  chip.className = 'chat-workspace-capability__chip';
  chip.textContent = chatWorkspaceStatus?.granted
    ? `只读 Workspace：${chatWorkspaceStatus.displayName || '已授权'}（本聊天）`
    : '未授权 Workspace 读取';
  chatWorkspaceCapability.appendChild(chip);
  const select = document.createElement('button');
  select.type = 'button';
  select.textContent = chatWorkspaceStatus?.granted ? '切换' : '选择 Workspace';
  select.addEventListener('click', () => selectChatWorkspaceCapability());
  chatWorkspaceCapability.appendChild(select);
  if (chatWorkspaceStatus?.granted) {
    const revoke = document.createElement('button');
    revoke.type = 'button';
    revoke.textContent = '撤销';
    revoke.addEventListener('click', () => revokeChatWorkspaceCapability());
    chatWorkspaceCapability.appendChild(revoke);
  }
}

async function refreshChatWorkspaceCapability() {
  const sessionId = activeChatSessionId();
  if (typeof api.getChatWorkspaceCapability !== 'function' || !sessionId || chatTurnCoordinator.getState().disposed) return;
  const result = await api.getChatWorkspaceCapability({ sessionId });
  if (chatTurnCoordinator.getState().disposed || activeChatSessionId() !== sessionId) return;
  if (result?.ok) chatWorkspaceStatus = result.status || { granted: false, operations: [] };
  renderChatWorkspaceCapability();
}

async function selectChatWorkspaceCapability() {
  const sessionId = activeChatSessionId();
  const modeGeneration = runtimeModeGeneration;
  const chatView = chatTurnCoordinator.getState();
  try {
    const result = await api.selectChatWorkspaceCapability({ sessionId });
    if (chatTurnCoordinator.getState().disposed || activeChatSessionId() !== sessionId
      || selectedRuntimeMode !== 'chat' || runtimeModeGeneration !== modeGeneration
      || !chatTurnCoordinator.isViewCurrent(chatView)) return;
    if (!result?.ok) throw new Error(workspaceErrorText(result));
    chatWorkspaceStatus = result.status || chatWorkspaceStatus;
    renderChatWorkspaceCapability();
    if (pendingWorkspaceRequest && chatWorkspaceStatus.granted) {
      const pending = pendingWorkspaceRequest;
      pendingWorkspaceRequest = null;
      pending.card?.remove();
      await sendWorkspaceIntent(pending.content, pending.intent);
    }
  } catch (error) {
    if (!chatTurnCoordinator.getState().disposed && activeChatSessionId() === sessionId
      && selectedRuntimeMode === 'chat' && runtimeModeGeneration === modeGeneration
      && chatTurnCoordinator.isViewCurrent(chatView)) showNotice(errorText(error));
  }
}

async function revokeChatWorkspaceCapability() {
  const sessionId = activeChatSessionId();
  try {
    const result = await api.revokeChatWorkspaceCapability({ sessionId });
    if (chatTurnCoordinator.getState().disposed || activeChatSessionId() !== sessionId) return;
    if (!result?.ok) throw new Error(workspaceErrorText(result));
    chatWorkspaceStatus = result.status || { granted: false, operations: [] };
    renderChatWorkspaceCapability();
  } catch (error) {
    if (!chatTurnCoordinator.getState().disposed && activeChatSessionId() === sessionId) showNotice(errorText(error));
  }
}

function renderWorkspaceRequestCard(content, intent) {
  pendingWorkspaceRequest?.card?.remove();
  const card = document.createElement('section');
  card.className = 'workspace-capability-request';
  const title = document.createElement('strong');
  title.textContent = '允许麻衣读取当前聊天中的 Workspace？';
  const detail = document.createElement('p');
  const target = intent.operation === 'read' ? `读取“${intent.relativePath}”` : `列出“${intent.relativePath}”目录`;
  detail.textContent = `你刚才希望她${target}。请先明确选择一个本地文件夹；授权只限当前聊天，只允许列目录和读取受支持的文本文件。`;
  const actions = document.createElement('div');
  actions.className = 'workspace-capability-request__actions';
  const allow = document.createElement('button');
  allow.type = 'button';
  allow.textContent = '选择并授权';
  allow.addEventListener('click', () => selectChatWorkspaceCapability());
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => {
    pendingWorkspaceRequest = null;
    card.remove();
    messageInput.value = content;
    resizeInput();
    messageInput.focus();
  });
  actions.append(allow, cancel);
  card.append(title, detail, actions);
  messagesElement.appendChild(card);
  scrollToLatest();
  return card;
}

function closeInputDialog(result = null) {
  const state = inputDialogState;
  inputDialogState = null;
  inputDialogOverlay.classList.add('input-dialog-overlay--hidden');
  inputDialogFields.innerHTML = '';
  inputDialogError.textContent = '';
  if (state?.resolve) {
    state.resolve(result);
  }
}

function openInputDialog({ title = '编辑', description = '', submitLabel = '保存', fields = [] } = {}) {
  if (inputDialogState) {
    closeInputDialog(null);
  }
  inputDialogTitle.textContent = title;
  inputDialogDescription.textContent = description;
  inputDialogDescription.hidden = !description;
  inputDialogSubmit.textContent = submitLabel;
  inputDialogFields.innerHTML = '';
  inputDialogError.textContent = '';

  const normalizedFields = fields.map((field, index) => ({
    name: String(field.name || `field-${index}`),
    label: String(field.label || '内容'),
    value: field.value ?? '',
    type: String(field.type || 'text'),
    placeholder: String(field.placeholder || ''),
    required: field.required !== false,
    maxLength: Number(field.maxLength) || 0,
    min: field.min,
    max: field.max,
    step: field.step,
    rows: Number(field.rows) || 4,
    options: Array.isArray(field.options) ? field.options : []
  }));

  for (const field of normalizedFields) {
    const label = document.createElement('label');
    label.className = 'input-dialog-field';
    const caption = document.createElement('span');
    caption.textContent = field.label;
    let control;
    if (field.type === 'textarea') {
      control = document.createElement('textarea');
      control.rows = field.rows;
    } else if (field.type === 'select') {
      control = document.createElement('select');
      for (const optionValue of field.options) {
        const option = document.createElement('option');
        option.value = String(optionValue.value ?? optionValue);
        option.textContent = String(optionValue.label ?? optionValue.value ?? optionValue);
        control.appendChild(option);
      }
    } else {
      control = document.createElement('input');
      control.type = field.type;
    }
    control.dataset.dialogField = field.name;
    control.value = String(field.value);
    control.placeholder = field.placeholder;
    control.required = field.required;
    if (field.maxLength > 0) control.maxLength = field.maxLength;
    if (field.min !== undefined) control.min = String(field.min);
    if (field.max !== undefined) control.max = String(field.max);
    if (field.step !== undefined) control.step = String(field.step);
    label.append(caption, control);
    inputDialogFields.appendChild(label);
  }

  inputDialogOverlay.classList.remove('input-dialog-overlay--hidden');
  requestAnimationFrame(() => inputDialogFields.querySelector('input, textarea, select')?.focus());
  return new Promise((resolve) => {
    inputDialogState = { resolve, fields: normalizedFields };
  });
}

function submitInputDialog() {
  if (!inputDialogState) return;
  const values = {};
  for (const field of inputDialogState.fields) {
    const control = inputDialogFields.querySelector(`[data-dialog-field="${CSS.escape(field.name)}"]`);
    const value = String(control?.value ?? '').trim();
    if (field.required && !value) {
      inputDialogError.textContent = `请填写“${field.label}”。`;
      control?.focus();
      return;
    }
    if (control && !control.checkValidity()) {
      inputDialogError.textContent = control.validationMessage || `请检查“${field.label}”。`;
      control.focus();
      return;
    }
    values[field.name] = value;
  }
  closeInputDialog(values);
}

function closeConversationContextMenu() {
  conversationContextSessionId = '';
  conversationContextWorkIdentity = null;
  conversationContextWorkProjectId = '';
  conversationContextMenu.classList.add('conversation-context-menu--hidden');
}

function openConversationContextMenu(event, session, kind = 'chat') {
  event.preventDefault();
  event.stopPropagation();
  conversationContextSessionId = String(session?.id || '');
  conversationContextKind = kind === 'work' ? 'work' : 'chat';
  conversationContextWorkIdentity = conversationContextKind === 'work' ? workRendererBindings.getIdentity() : null;
  conversationContextWorkProjectId = conversationContextKind === 'work' ? String(session?.projectId || '') : '';
  if (!conversationContextSessionId) return;

  const fallback = '这段对话';
  conversationContextRename.setAttribute('aria-label', `重命名“${session.title || fallback}”`);
  conversationContextDelete.setAttribute('aria-label', `删除“${session.title || fallback}”`);
  conversationContextMenu.classList.remove('conversation-context-menu--hidden');
  conversationContextMenu.style.left = '0px';
  conversationContextMenu.style.top = '0px';

  const triggerRect = event.currentTarget?.getBoundingClientRect?.();
  const menuRect = conversationContextMenu.getBoundingClientRect();
  const requestedX = event.clientX > 0 ? event.clientX : (triggerRect?.left || 12) + 24;
  const requestedY = event.clientY > 0 ? event.clientY : (triggerRect?.top || 12) + 18;
  const left = Math.max(8, Math.min(requestedX, window.innerWidth - menuRect.width - 8));
  const top = Math.max(8, Math.min(requestedY, window.innerHeight - menuRect.height - 8));
  conversationContextMenu.style.left = `${Math.round(left)}px`;
  conversationContextMenu.style.top = `${Math.round(top)}px`;
  requestAnimationFrame(() => conversationContextRename.focus());
}

function conversationContextSession() {
  const sessions = conversationContextKind === 'work' ? allWorkSessions : runtimeSessions;
  return sessions.find((session) => session.id === conversationContextSessionId) || null;
}

async function renameConversationSession(session, kind = 'chat', workIdentity = null, targetWorkProjectId = '') {
  if (!session) return false;
  const workSession = kind === 'work';
  const workProjectId = workSession ? String(targetWorkProjectId || session.projectId || '') : '';
  if (workSession && (!workProjectId || !workIdentity || !workRendererBindings.isViewCurrent(workIdentity))) return false;
  const values = await openInputDialog({
    title: workSession ? '重命名 Work 对话' : '重命名对话',
    description: workSession ? '名称会显示在当前项目的工作记录中。' : '名称会同步显示在最近对话与聊天历史中。',
    submitLabel: '重命名',
    fields: [{
      name: 'title',
      label: '对话名称',
      value: session.title || '新对话',
      maxLength: 80
    }]
  });
  if (!values || values.title === session.title) return false;
  try {
    if (workSession) {
      if (!workRendererBindings.isViewCurrent(workIdentity)) return false;
      const renamed = await workRendererBindings.renameSession(workProjectId, session.id, values.title, workIdentity);
      if (!renamed || !workRendererBindings.isViewCurrent(workIdentity)) return false;
    } else {
      applyChatState(await api.renameChatSession(session.id, values.title));
    }
    if (workSession && !workRendererBindings.isViewCurrent(workIdentity)) return false;
    showNotice('对话名称已更新。');
    return true;
  } catch (error) {
    if (workSession && !workRendererBindings.isViewCurrent(workIdentity)) return false;
    showNotice(errorText(error));
    return false;
  }
}

async function deleteConversationSession(session, kind = 'chat', workIdentity = null, targetWorkProjectId = '') {
  if (!session) return false;
  const workSession = kind === 'work';
  const workProjectId = workSession ? String(targetWorkProjectId || session.projectId || '') : '';
  if (workSession && (!workProjectId || !workIdentity || !workRendererBindings.isViewCurrent(workIdentity))) return false;
  const detail = workSession ? '此操作只删除当前项目中的工作记录，不会删除项目或 Workspace。' : '长期记忆不会受影响。';
  if (!window.confirm(`确定删除“${session.title || '这段对话'}”吗？${detail}`)) {
    return false;
  }
  try {
    if (workSession) {
      if (!workRendererBindings.isViewCurrent(workIdentity)) return false;
      const deleted = await workRendererBindings.deleteSession(workProjectId, session.id, workIdentity);
      const current = workRendererBindings.getIdentity();
      if (!deleted || current.mode !== 'agent' || current.projectId !== workIdentity.projectId) return false;
      showNotice('这条 Work 记录已删除。');
    } else {
      applyChatState(await api.deleteChatSession(session.id));
      showNotice('这段历史对话已删除，长期记忆仍然保留。');
    }
    return true;
  } catch (error) {
    if (workSession && !workRendererBindings.isViewCurrent(workIdentity)) return false;
    showNotice(errorText(error));
    return false;
  }
}

function voiceConfig() {
  return {
    autoReadReplies: chatConfig.voice?.autoReadReplies === true,
    engine: chatConfig.voice?.engine === 'system' ? 'system' : 'local',
    culture: String(chatConfig.voice?.culture || 'zh-CN'),
    voiceName: String(chatConfig.voice?.voiceName || ''),
    rate: Math.max(0.7, Math.min(1.4, Number(chatConfig.voice?.rate) || 1)),
    pitch: Math.max(0.7, Math.min(1.3, Number(chatConfig.voice?.pitch) || 1)),
    volume: Math.max(0.1, Math.min(1, Number(chatConfig.voice?.volume) || 1))
  };
}

function cleanSpeechText(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_>#~]/g, '')
    .replace(/https?:\/\/\S+/g, '链接')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);
}

const RENDER_VOICE_STYLES = {
  neutral: {
    action: 'wave',
    rate: 1,
    instruction: '请用自然、亲近、像面对面聊天一样的中文女声表达，避免播音腔和机械朗读感。'
  },
  happy: {
    action: 'jump',
    rate: 1.04,
    instruction: '请用开心、明亮、带一点自然笑意的中文女声表达，语气轻快但不要夸张。'
  },
  curious: {
    action: 'wave',
    rate: 1.02,
    instruction: '请用好奇、灵动、略微上扬的中文女声表达，像正在认真等对方继续说。'
  },
  shy: {
    action: 'love',
    rate: 0.96,
    instruction: '请用略带害羞、轻柔、亲近的中文女声表达，停顿自然，不要故意卖萌。'
  },
  concerned: {
    action: 'wave',
    rate: 0.93,
    instruction: '请用温柔、关心、稍慢一点的中文女声表达，像在认真安慰亲近的人。'
  },
  angry: {
    action: 'angry',
    rate: 1.03,
    instruction: '请用克制但能听出不满的中文女声表达，语气坚定，不要吼叫或戏剧化。'
  },
  sleepy: {
    action: 'lazy',
    rate: 0.9,
    instruction: '请用轻柔、慵懒、略带困意的中文女声表达，音量稍低，停顿放松。'
  },
  focused: {
    action: 'work',
    rate: 0.98,
    instruction: '请用清晰、沉稳、认真但不疏离的中文女声表达，重点词稍微加强。'
  }
};

function rendererTextEmotion(text, fallback = 'neutral') {
  const content = String(text || '');
  if (/(笨蛋|不许|生气|不高兴|讨厌|哼[。！!]?)/.test(content)) return 'angry';
  if (/(抱抱|别怕|没关系|我陪你|辛苦了|担心|难过|好好休息)/.test(content)) return 'concerned';
  if (/(喜欢你|爱你|亲一下|才没有|害羞|想你)/.test(content)) return 'shy';
  if (/(哈哈|太好啦|真棒|开心|好呀|当然可以)/.test(content)) return 'happy';
  if (/(工作|学习|复习|考试|代码|项目|计划|专注)/.test(content)) return 'focused';
  if (/(困了|晚安|睡觉|好困)/.test(content)) return 'sleepy';
  if (/[？?]/.test(content)) return 'curious';
  return RENDER_VOICE_STYLES[fallback] ? fallback : 'neutral';
}

function planRendererSpeechStyle(text, options = {}) {
  const aliases = { playful: 'happy', upset: 'angry', love: 'shy' };
  const requested = aliases[options.emotion] || options.emotion;
  const senseEmotion = aliases[options.voiceProfile?.senseEmotion]
    || options.voiceProfile?.senseEmotion;
  const acousticFallback = options.voiceProfile?.vocalTone === 'urgent'
    ? 'concerned'
    : options.voiceProfile?.vocalTone === 'energetic'
      ? 'happy'
      : options.voiceProfile?.vocalTone === 'soft'
        ? 'shy'
        : 'neutral';
  const fallback = RENDER_VOICE_STYLES[senseEmotion] ? senseEmotion : acousticFallback;
  const emotion = RENDER_VOICE_STYLES[requested]
    ? requested
    : rendererTextEmotion(text, fallback);
  const style = RENDER_VOICE_STYLES[emotion] || RENDER_VOICE_STYLES.neutral;
  const baseRate = Number(options.baseRate) || 1;
  return {
    emotion,
    action: style.action,
    instruction: style.instruction,
    rate: Math.max(0.75, Math.min(1.3, baseRate * style.rate))
  };
}

function splitSpeakableSegments(value, flush = false) {
  let buffer = String(value || '').replace(/\s+/g, ' ').trimStart();
  const segments = [];
  while (buffer) {
    const punctuation = buffer.search(/[。！？!?；;…\n]/);
    const softLimit = buffer.length >= 30
      ? Math.max(buffer.lastIndexOf('，', 30), buffer.lastIndexOf(',', 30))
      : -1;
    let end = punctuation >= 0 ? punctuation + 1 : softLimit >= 10 ? softLimit + 1 : -1;
    if (end < 0 && buffer.length >= 46) end = 46;
    if (end < 0) break;
    const segment = buffer.slice(0, end).trim();
    if (segment) segments.push(segment);
    buffer = buffer.slice(end).trimStart();
  }
  if (flush && buffer.trim()) {
    segments.push(buffer.trim());
    buffer = '';
  }
  return { segments, remainder: buffer };
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function floatSamplesToWavBase64(chunks, inputSampleRate) {
  const sourceLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (!sourceLength) return '';
  const source = new Float32Array(sourceLength);
  let sourceOffset = 0;
  for (const chunk of chunks) {
    source.set(chunk, sourceOffset);
    sourceOffset += chunk.length;
  }
  const outputRate = 16000;
  const ratio = Math.max(1, inputSampleRate / outputRate);
  const outputLength = Math.floor(source.length / ratio);
  const wav = new ArrayBuffer(44 + outputLength * 2);
  const view = new DataView(wav);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + outputLength * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outputRate, true);
  view.setUint32(28, outputRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, outputLength * 2, true);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(source.length, Math.floor((index + 1) * ratio));
    let total = 0;
    for (let cursor = start; cursor < end; cursor += 1) total += source[cursor];
    const sample = Math.max(-1, Math.min(1, total / Math.max(1, end - start)));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  const bytes = new Uint8Array(wav);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return window.btoa(binary);
}

async function ensureCallMicrophoneMonitor() {
  if (callMicrophoneMonitor) return callMicrophoneMonitor;
  if (!navigator.mediaDevices?.getUserMedia) return null;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1
    },
    video: false
  });
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  await context.resume();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(2048, 1, 1);
  const silentOutput = context.createGain();
  silentOutput.gain.value = 0;
  const monitor = {
    stream,
    context,
    processor,
    capturing: false,
    chunks: [],
    energyTotal: 0,
    energySquareTotal: 0,
    energyPeak: 0,
    energyFrames: 0,
    speechFrames: 0,
    captureStartedAt: 0,
    interruptStartedAt: 0,
    lastInterruptAt: 0
  };
  processor.onaudioprocess = (event) => {
    const samples = event.inputBuffer.getChannelData(0);
    let squareTotal = 0;
    let peak = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const absolute = Math.abs(samples[index]);
      squareTotal += samples[index] * samples[index];
      if (absolute > peak) peak = absolute;
    }
    const rms = Math.sqrt(squareTotal / Math.max(1, samples.length));
    if (monitor.capturing) {
      monitor.chunks.push(new Float32Array(samples));
      monitor.energyTotal += rms;
      monitor.energySquareTotal += rms * rms;
      monitor.energyPeak = Math.max(monitor.energyPeak, peak);
      monitor.energyFrames += 1;
      if (rms >= 0.015) monitor.speechFrames += 1;
    }
    const activeStream = chatTurnCoordinator.getVoiceStream();
    if (activeStream?.canInterrupt && rms >= 0.07) {
      if (!monitor.interruptStartedAt) monitor.interruptStartedAt = Date.now();
      if (Date.now() - monitor.interruptStartedAt >= 320
        && Date.now() - monitor.lastInterruptAt >= 1200) {
        monitor.lastInterruptAt = Date.now();
        monitor.interruptStartedAt = 0;
        activeStream.interrupt();
      }
    } else if (rms < 0.045) {
      monitor.interruptStartedAt = 0;
    }
  };
  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(context.destination);
  callMicrophoneMonitor = monitor;
  return monitor;
}

function beginVoiceCapture() {
  const monitor = callMicrophoneMonitor;
  if (!monitor) return false;
  monitor.chunks = [];
  monitor.energyTotal = 0;
  monitor.energySquareTotal = 0;
  monitor.energyPeak = 0;
  monitor.energyFrames = 0;
  monitor.speechFrames = 0;
  monitor.captureStartedAt = Date.now();
  monitor.capturing = true;
  return true;
}

function finishVoiceCapture() {
  const monitor = callMicrophoneMonitor;
  if (!monitor || !monitor.capturing) return null;
  monitor.capturing = false;
  const frames = Math.max(1, monitor.energyFrames);
  const averageEnergy = monitor.energyTotal / frames;
  const variance = Math.max(0, monitor.energySquareTotal / frames - averageEnergy * averageEnergy);
  const durationMs = Math.max(0, Date.now() - monitor.captureStartedAt);
  const vocalTone = averageEnergy >= 0.075 || Math.sqrt(variance) >= 0.055
    ? 'urgent'
    : averageEnergy >= 0.04
      ? 'energetic'
      : averageEnergy <= 0.018
        ? 'soft'
        : 'calm';
  const capture = {
    averageEnergy,
    peakEnergy: monitor.energyPeak,
    variability: Math.sqrt(variance),
    speechRatio: monitor.speechFrames / frames,
    durationMs,
    vocalTone,
    audioBase64: ''
  };
  if (durationMs >= 250 && monitor.chunks.length) {
    capture.audioBase64 = floatSamplesToWavBase64(monitor.chunks, monitor.context.sampleRate);
  }
  monitor.chunks = [];
  return capture;
}

async function enrichVoiceProfile(capture) {
  if (!capture) return {};
  const profile = { ...capture };
  delete profile.audioBase64;
  if (!capture.audioBase64 || !voiceCapabilities.localTts?.enhanced) return profile;
  try {
    const result = await Promise.race([
      api.analyzeVoiceAudio({ audioBase64: capture.audioBase64, mimeType: 'audio/wav' }),
      waitFor(4000).then(() => null)
    ]);
    if (result?.available) {
      profile.senseEmotion = result.emotion || '';
      profile.senseText = result.text || '';
      profile.voiceEvents = result.events || [];
    }
  } catch {
    // Acoustic cues still work when the optional semantic analysis cannot finish in time.
  }
  return profile;
}

async function disposeCallMicrophoneMonitor() {
  const monitor = callMicrophoneMonitor;
  callMicrophoneMonitor = null;
  if (!monitor) return;
  monitor.capturing = false;
  monitor.processor.onaudioprocess = null;
  monitor.stream.getTracks().forEach((track) => track.stop());
  await monitor.context.close().catch(() => {});
}

function updateVoiceSliderLabels() {
  voiceRateValue.textContent = `${Number(voiceRateInput.value || 1).toFixed(2)}×`;
  voicePitchValue.textContent = `${Number(voicePitchInput.value || 1).toFixed(2)}×`;
  voiceVolumeValue.textContent = `${Math.round(Number(voiceVolumeInput.value || 1) * 100)}%`;
}

function refreshSpeechVoices() {
  if (!('speechSynthesis' in window)) {
    speechVoices = [];
    voiceNameSelect.innerHTML = '<option value="">系统不支持朗读</option>';
    voiceNameSelect.disabled = true;
    return;
  }
  speechVoices = window.speechSynthesis.getVoices();
  const preferredName = voiceNameSelect.value || voiceConfig().voiceName;
  voiceNameSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '系统默认声音';
  voiceNameSelect.appendChild(defaultOption);
  for (const voice of speechVoices
    .slice()
    .sort((left, right) => {
      const leftChinese = /^zh/i.test(left.lang) ? 0 : 1;
      const rightChinese = /^zh/i.test(right.lang) ? 0 : 1;
      return leftChinese - rightChinese || left.name.localeCompare(right.name, 'zh-CN');
    })) {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} · ${voice.lang}`;
    voiceNameSelect.appendChild(option);
  }
  voiceNameSelect.disabled = false;
  voiceNameSelect.value = speechVoices.some((voice) => voice.name === preferredName)
    ? preferredName
    : '';
  updateVoiceEngineControls();
}

function selectedSpeechVoice() {
  const name = voiceNameSelect.value || voiceConfig().voiceName;
  if (name) {
    const selected = speechVoices.find((voice) => voice.name === name);
    if (selected) return selected;
  }
  return speechVoices.find((voice) => /^zh[-_]/i.test(voice.lang)) || null;
}

function stopSpeaking() {
  speechGeneration += 1;
  const cancel = activeSpeechCancel;
  activeSpeechCancel = null;
  if (cancel) cancel();
  if (activeSpeechAudio) {
    activeSpeechAudio.pause();
    activeSpeechAudio.removeAttribute('src');
    activeSpeechAudio.load();
    activeSpeechAudio = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function speakSystemText(content, config, generation) {
  if (!('speechSynthesis' in window)) {
    return Promise.resolve(false);
  }
  const utterance = new SpeechSynthesisUtterance(content);
  const selected = selectedSpeechVoice();
  if (selected) {
    utterance.voice = selected;
    utterance.lang = selected.lang;
  } else {
    utterance.lang = config.culture;
  }
  utterance.rate = config.rate;
  utterance.pitch = config.pitch;
  utterance.volume = config.volume;
  return new Promise((resolve, reject) => {
    let settled = false;
    let speechTimeout = null;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(speechTimeout);
      if (activeSpeechCancel === cancelSpeech) activeSpeechCancel = null;
      callback(value);
    };
    const cancelSpeech = () => finish(resolve, false);
    activeSpeechCancel = cancelSpeech;
    utterance.onend = () => finish(resolve, generation === speechGeneration);
    utterance.onerror = (event) => {
      if (['interrupted', 'canceled'].includes(event.error)) {
        finish(resolve, false);
      } else {
        finish(reject, new Error('Windows 没能朗读这条回复，请在语音设置中换一个声音。'));
      }
    };
    window.speechSynthesis.speak(utterance);
    speechTimeout = setTimeout(() => {
      stopSpeaking();
      finish(resolve, false);
    }, Math.max(15000, Math.min(90000, content.length * 450)));
  });
}

function playLocalSpeech(result, config, generation) {
  if (!result?.ok || !result.audioBase64 || generation !== speechGeneration) {
    return Promise.resolve(false);
  }
  const audio = new Audio(`data:${result.mimeType || 'audio/wav'};base64,${result.audioBase64}`);
  activeSpeechAudio = audio;
  audio.volume = config.volume;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (activeSpeechAudio === audio) activeSpeechAudio = null;
      if (activeSpeechCancel === cancelSpeech) activeSpeechCancel = null;
      callback(value);
    };
    const cancelSpeech = () => finish(resolve, false);
    activeSpeechCancel = cancelSpeech;
    audio.addEventListener('ended', () => finish(resolve, generation === speechGeneration), { once: true });
    audio.addEventListener('error', () => finish(reject, new Error('本地女声音频无法播放。')), { once: true });
    audio.play().catch((error) => finish(reject, error));
  });
}

async function speakText(text, options = {}) {
  const content = cleanSpeechText(text);
  if (!content || (options.call && voiceCallSpeakerMuted)) {
    return false;
  }
  stopSpeaking();
  const generation = speechGeneration;
  const config = options.config || voiceConfig();
  const style = planRendererSpeechStyle(content, {
    emotion: options.emotion,
    voiceProfile: options.voiceProfile,
    baseRate: config.rate
  });
  setMood({ emotion: style.emotion, action: style.action });
  if (config.engine !== 'system') {
    try {
      const result = await api.synthesizeLocalVoice({
        text: content,
        rate: style.rate,
        emotion: style.emotion,
        instruction: style.instruction
      });
      return await playLocalSpeech(result, config, generation);
    } catch (error) {
      if (generation !== speechGeneration) return false;
      const message = errorText(error);
      if (!/尚未安装/.test(message)) {
        showNotice(`${message} 已临时改用系统备用声音。`);
      }
    }
  }
  if (generation !== speechGeneration) return false;
  return speakSystemText(content, config, generation);
}

function createVoiceStreamController(requestId, callGeneration, voiceProfile = {}) {
  stopSpeaking();
  const controller = {
    requestId,
    callGeneration,
    voiceProfile,
    speechGeneration,
    buffer: '',
    queue: [],
    receivedDelta: false,
    closed: false,
    canceled: false,
    canInterrupt: false,
    wake: null,
    finalEmotion: '',
    async consume() {
      const config = voiceConfig();
      while (!controller.canceled
        && controller.callGeneration === voiceCallGeneration
        && voiceCallActive) {
        if (!controller.queue.length) {
          if (controller.closed) break;
          await new Promise((resolve) => { controller.wake = resolve; });
          controller.wake = null;
          continue;
        }
        const item = controller.queue.shift();
        if (!item || voiceCallSpeakerMuted) continue;
        if (controller.speechGeneration !== speechGeneration) break;
        setVoiceCallState('麻衣正在说话…你可以直接打断', true);
        setMood({ emotion: item.style.emotion, action: item.style.action });
        controller.canInterrupt = true;
        try {
          if (config.engine !== 'system') {
            const prepared = await item.prepared;
            if (prepared?.error) throw prepared.error;
            const result = prepared?.result;
            if (controller.canceled || controller.speechGeneration !== speechGeneration) break;
            await playLocalSpeech(result, config, controller.speechGeneration);
          } else {
            await speakSystemText(item.text, {
              ...config,
              rate: item.style.rate
            }, controller.speechGeneration);
          }
        } catch (error) {
          if (!controller.canceled && controller.speechGeneration === speechGeneration) {
            addVoiceCallLine('system', `${errorText(error)} 已跳过这一句。`);
          }
        } finally {
          controller.canInterrupt = false;
        }
      }
      controller.canInterrupt = false;
      chatTurnCoordinator.clearVoiceStream(controller);
      return !controller.canceled;
    },
    enqueue(text, emotion = '') {
      const content = cleanSpeechText(text);
      if (!content || controller.canceled || voiceCallSpeakerMuted) return;
      const config = voiceConfig();
      const style = planRendererSpeechStyle(content, {
        emotion: emotion || controller.finalEmotion,
        voiceProfile: controller.voiceProfile,
        baseRate: config.rate
      });
      const prepared = config.engine === 'system'
        ? Promise.resolve(null)
        : api.synthesizeLocalVoice({
            text: content,
            rate: style.rate,
            emotion: style.emotion,
            instruction: style.instruction
          }).then((result) => ({ result }), (error) => ({ error }));
      controller.queue.push({ text: content, style, prepared });
      controller.wake?.();
    },
    push(delta) {
      if (controller.canceled || !delta) return;
      controller.receivedDelta = true;
      const parsed = splitSpeakableSegments(`${controller.buffer}${delta}`);
      controller.buffer = parsed.remainder;
      parsed.segments.forEach((segment) => controller.enqueue(segment));
    },
    finish(finalText, emotion = '') {
      controller.finalEmotion = emotion;
      if (!controller.receivedDelta) {
        controller.enqueue(finalText, emotion);
      } else {
        const parsed = splitSpeakableSegments(controller.buffer, true);
        controller.buffer = '';
        parsed.segments.forEach((segment) => controller.enqueue(segment, emotion));
      }
      controller.closed = true;
      controller.wake?.();
    },
    cancel() {
      controller.canceled = true;
      controller.closed = true;
      controller.queue = [];
      controller.wake?.();
      if (controller.speechGeneration === speechGeneration) stopSpeaking();
    },
    interrupt() {
      if (!controller.canInterrupt || controller.canceled) return;
      controller.cancel();
      setVoiceCallState('听到你了，请继续说…', true);
    }
  };
  controller.done = controller.consume();
  return controller;
}

function handleVoiceStreamDelta(payload = {}) {
  chatTurnCoordinator.handleVoiceStreamDelta(payload);
}

function renderLocalVoiceStatus(status = {}) {
  voiceCapabilities.localTts = status;
  const progress = status.installProgress || {};
  const installing = status.state === 'installing';
  localVoiceProgress.classList.toggle('local-voice-progress--hidden', !installing);
  localVoiceProgressBar.style.width = `${Math.max(0, Math.min(100, Number(progress.percent) || 0))}%`;
  installLocalVoiceButton.disabled = installing || (status.enhanced && !status.error);

  if (installing) {
    const stage = LOCAL_VOICE_STAGE_LABELS[progress.stage] || '正在安装';
    const detail = LOCAL_VOICE_DETAIL_LABELS[progress.detail]
      || progress.detail
      || '请保持程序开启；已下载内容会保留。';
    localVoiceTitle.textContent = `${stage} · ${Math.round(Number(progress.percent) || 0)}%`;
    localVoiceDetail.textContent = detail;
    installLocalVoiceButton.textContent = '安装中…';
  } else if (status.needsUpgrade) {
    localVoiceTitle.textContent = '可以升级为情绪通话';
    localVoiceDetail.textContent = status.error
      || '会保留并复用现有女声，只需补充约 3.3 GB 的情绪语音与语气感知模型。';
    installLocalVoiceButton.textContent = '升级情绪语音';
    installLocalVoiceButton.disabled = false;
  } else if (status.ready && status.enhanced) {
    localVoiceTitle.textContent = 'CosyVoice 情绪女声与 SenseVoice 已就绪';
    localVoiceDetail.textContent = `${status.runtime?.device || '本地设备'} · 支持语气感知、分句流式朗读和说话打断；音频不会上传。`;
    installLocalVoiceButton.textContent = '已安装';
  } else if (status.installed && status.state === 'starting') {
    localVoiceTitle.textContent = '正在加载本地女声模型…';
    localVoiceDetail.textContent = '首次发声需要等待模型载入显卡，之后会明显更快。';
    installLocalVoiceButton.textContent = '已安装';
  } else if (status.installed) {
    localVoiceTitle.textContent = status.error ? '本地情绪语音需要重新加载' : '本地情绪语音已安装';
    localVoiceDetail.textContent = status.error || '第一次朗读时会自动载入模型，通常需要十几秒。';
    installLocalVoiceButton.textContent = status.error ? '重试加载' : '已安装';
    installLocalVoiceButton.disabled = !status.error;
  } else {
    localVoiceTitle.textContent = status.error ? '本地情绪语音安装未完成' : '尚未安装本地情绪语音';
    localVoiceDetail.textContent = status.error || '全新安装约下载 11 GB，请预留至少 16 GB；完成后可断网使用。';
    installLocalVoiceButton.textContent = status.error ? '重试安装' : '安装情绪语音';
    installLocalVoiceButton.disabled = false;
  }
}

function updateVoiceEngineControls() {
  const local = voiceEngineSelect.value !== 'system';
  voiceNameSelect.disabled = local;
  voicePitchInput.disabled = local;
}

async function installLocalVoice() {
  const status = voiceCapabilities.localTts || {};
  installLocalVoiceButton.disabled = true;
  if (status.installed && !status.needsUpgrade) {
    try {
      voiceEngineSelect.value = 'local';
      updateVoiceEngineControls();
      await testVoice();
      await refreshVoiceCapabilities(true);
    } finally {
      renderLocalVoiceStatus(voiceCapabilities.localTts);
    }
    return;
  }
  setSettingsStatus(status.needsUpgrade
    ? '正在补充情绪语音与语气感知模型，已有女声会保留并复用。'
    : '正在安装高质量本地情绪语音，请保持程序开启。');
  try {
    const installedStatus = await api.installLocalVoice();
    renderLocalVoiceStatus(installedStatus);
    voiceEngineSelect.value = 'local';
    updateVoiceEngineControls();
    setSettingsStatus('本地情绪语音安装完成。以后覆盖升级会自动保留并复用。');
  } catch (error) {
    setSettingsStatus(errorText(error), true);
    const latest = await api.getLocalVoiceStatus().catch(() => null);
    if (latest) renderLocalVoiceStatus(latest);
  }
}

async function refreshVoiceCapabilities(force = false) {
  if (force) {
    voiceCapabilityStatus.textContent = '正在重新检查本地语音组件…';
  }
  try {
    voiceCapabilities = await api.getVoiceCapabilities();
    renderLocalVoiceStatus(voiceCapabilities.localTts || {});
    voiceCultureSelect.innerHTML = '';
    const recognizers = Array.isArray(voiceCapabilities.recognizers)
      ? voiceCapabilities.recognizers
      : [];
    for (const recognizer of recognizers) {
      const option = document.createElement('option');
      option.value = recognizer.culture;
      option.textContent = `${recognizer.culture === 'zh-CN' ? '普通话（简体中文）' : recognizer.culture} · ${recognizer.name}`;
      voiceCultureSelect.appendChild(option);
    }
    if (!recognizers.length) {
      const option = document.createElement('option');
      option.value = 'zh-CN';
      option.textContent = '未找到语音识别器';
      voiceCultureSelect.appendChild(option);
    }
    const wanted = voiceConfig().culture;
    voiceCultureSelect.value = recognizers.some((item) => item.culture === wanted)
      ? wanted
      : voiceCapabilities.defaultCulture || recognizers[0]?.culture || 'zh-CN';
    voiceCultureSelect.disabled = !voiceCapabilities.available;
    const localStatus = voiceCapabilities.localTts || {};
    const ttsLabel = localStatus.enhanced && localStatus.ready
      ? `CosyVoice 情绪女声已就绪（${localStatus.runtime?.device || '本地'}）`
      : localStatus.needsUpgrade
        ? '旧版女声可用，可升级情绪通话'
        : localStatus.installed
          ? 'CosyVoice 已安装，将在首次朗读时载入'
          : 'CosyVoice 尚未安装，暂用系统备用声音';
    voiceCapabilityStatus.textContent = voiceCapabilities.available
      ? `本地语音识别已就绪 · ${recognizers.length} 个语言组件；${ttsLabel}。`
      : `${voiceCapabilities.error || '当前 Windows 语音识别不可用。'}；${ttsLabel}。`;
    voiceCapabilityStatus.classList.toggle('voice-capability-status--error', !voiceCapabilities.available);
  } catch (error) {
    voiceCapabilities = { available: false, recognizers: [] };
    voiceCapabilityStatus.textContent = errorText(error);
    voiceCapabilityStatus.classList.add('voice-capability-status--error');
  }
}

async function testVoice() {
  testVoiceButton.disabled = true;
  try {
    await speakText('听得到吗？以后就可以这样和我说话了。', {
      config: {
        ...voiceConfig(),
        engine: voiceEngineSelect.value === 'system' ? 'system' : 'local',
        rate: Number(voiceRateInput.value) || 1,
        pitch: Number(voicePitchInput.value) || 1,
        volume: Number(voiceVolumeInput.value) || 1
      }
    });
    setSettingsStatus('语音试听完成。');
  } catch (error) {
    setSettingsStatus(errorText(error), true);
  } finally {
    testVoiceButton.disabled = false;
  }
}

function setConnection(config) {
  chatConfig = config;
  if (config.credentialStorageWarning) setSettingsStatus(config.credentialStorageWarning, true);
  window.maiAppearance?.apply(config.appearance);
  applyWallpaper(config.wallpaper);
  renderWallpaperOptions();
  applyAvatarSelections();
  const activeProvider = Array.isArray(config.providers)
    ? config.providers.find((provider) => provider.id === config.provider)
    : null;
  const providerAvailable = activeProvider?.available !== false;
  connectionDot.classList.toggle('connection-dot--online', config.configured && providerAvailable);
  const modelLabel = config.model === 'deepseek-v4-pro' ? 'V4 Pro' : 'V4 Flash';
  connectionLabel.textContent = config.configured && providerAvailable
    ? `已配置 · ${modelLabel} · ${PERSONALITY_LABELS[config.personality] || PERSONALITY_LABELS.classic}`
    : activeProvider?.reason || '尚未设置 DeepSeek API Key';
  clearKeyButton.disabled = !config.configured;
  renderCompanionWorkspace();
}

function availableWallpapers() {
  return Array.isArray(chatConfig.wallpapers)
    ? chatConfig.wallpapers.filter((wallpaper) => wallpaper && wallpaper.id && wallpaper.available !== false)
    : [];
}

function selectedWallpaper(wallpaperId = chatConfig.wallpaper) {
  const catalog = availableWallpapers();
  return catalog.find((wallpaper) => wallpaper.id === wallpaperId)
    || catalog.find((wallpaper) => wallpaper.id === chatConfig.wallpaperDefault)
    || catalog[0]
    || null;
}

function applyWallpaper(wallpaperId) {
  const generation = ++wallpaperLoadGeneration;
  const wallpaper = selectedWallpaper(wallpaperId);
  if (!wallpaperLayer) return;
  if (!wallpaper) {
    wallpaperLayer.style.backgroundImage = 'none';
    document.body.dataset.wallpaper = '';
    return;
  }
  const probe = new Image();
  probe.onload = () => {
    if (generation !== wallpaperLoadGeneration) return;
    wallpaperLayer.style.backgroundImage = `url("${wallpaper.path}")`;
    document.body.dataset.wallpaper = wallpaper.id;
  };
  probe.onerror = () => {
    if (generation !== wallpaperLoadGeneration) return;
    const fallback = selectedWallpaper(chatConfig.wallpaperDefault);
    if (fallback && fallback.id !== wallpaper.id) {
      applyWallpaper(fallback.id);
      return;
    }
    wallpaperLayer.style.backgroundImage = 'none';
    document.body.dataset.wallpaper = '';
  };
  probe.src = wallpaper.path;
}

function renderWallpaperOptions() {
  if (!wallpaperGrid) return;
  wallpaperGrid.innerHTML = '';
  const catalog = Array.isArray(chatConfig.wallpapers) ? chatConfig.wallpapers : [];
  const selected = selectedWallpaper();
  wallpaperSelectionLabel.textContent = selected?.name || '默认背景';
  clearCustomWallpaperButton.disabled = catalog.length === 0;
  for (const wallpaper of catalog) {
    const button = document.createElement('button');
    button.className = 'wallpaper-option';
    button.type = 'button';
    button.dataset.wallpaperId = wallpaper.id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(wallpaper.id === selected?.id));
    button.setAttribute('aria-label', `${wallpaper.name}${wallpaper.available === false ? '（资源不可用）' : ''}`);
    button.disabled = wallpaper.available === false;
    const image = document.createElement('img');
    image.src = wallpaper.thumbnail;
    image.alt = '';
    image.loading = 'eager';
    image.decoding = 'async';
    const label = document.createElement('span');
    label.textContent = wallpaper.name;
    button.append(image, label);
    button.addEventListener('click', () => selectWallpaper(wallpaper.id));
    wallpaperGrid.appendChild(button);
  }
}

async function selectWallpaper(wallpaperId) {
  const previous = chatConfig.wallpaper;
  chatConfig = { ...chatConfig, wallpaper: wallpaperId };
  applyWallpaper(wallpaperId);
  renderWallpaperOptions();
  try {
    const config = await api.setWallpaper(wallpaperId);
    setConnection(config);
    setSettingsStatus(`壁纸已切换为“${selectedWallpaper()?.name || '默认壁纸'}”。`);
  } catch (error) {
    chatConfig = { ...chatConfig, wallpaper: previous };
    applyWallpaper(previous);
    renderWallpaperOptions();
    setSettingsStatus(errorText(error), true);
  }
}

async function chooseCustomWallpaper() {
  chooseCustomWallpaperButton.disabled = true;
  try {
    const config = await api.chooseCustomWallpaper();
    setConnection(config);
    setSettingsStatus(config.wallpaperSelectionChanged ? '本地壁纸已应用。' : '未选择新壁纸。');
  } catch (error) {
    setSettingsStatus(errorText(error), true);
  } finally {
    chooseCustomWallpaperButton.disabled = false;
  }
}

async function clearCustomWallpaper() {
  clearCustomWallpaperButton.disabled = true;
  try {
    setConnection(await api.clearCustomWallpaper());
    setSettingsStatus('已恢复默认背景，并删除应用保存的壁纸副本。');
  } catch (error) {
    setSettingsStatus(errorText(error), true);
  } finally {
    clearCustomWallpaperButton.disabled = false;
  }
}

function avatarPath(target) {
  return chatConfig.avatarPaths?.[target] || chatConfig.avatarDefaults?.[target]
    || (target === 'user' ? '../assets/mai-icon.png' : '../assets/mai-profile.png');
}

function applyAvatarSelections() {
  const maiAvatarPath = avatarPath('mai');
  portrait.src = maiAvatarPath;
  agentPortrait.src = maiAvatarPath;
  document.querySelectorAll('.message-avatar, .companion-presence-card img').forEach((image) => { image.src = maiAvatarPath; });
  userAvatar.src = avatarPath('user');
  maiAvatarButton.dataset.avatarId = chatConfig.avatarSelections?.mai || '';
  agentAvatarButton.dataset.avatarId = chatConfig.avatarSelections?.mai || '';
  userAvatarButton.dataset.avatarId = chatConfig.avatarSelections?.user || '';
}

function openAvatarPicker(target) {
  if (!['mai', 'user'].includes(target)) return;
  endVoiceCall();
  for (const overlay of [settingsOverlay, memoryOverlay, sharedLifeOverlay, lifeOverlay, momentsOverlay]) {
    overlay.classList.add('overlay--hidden');
  }
  closeHistory();
  activeAvatarTarget = target;
  avatarPickerTitle.textContent = target === 'mai' ? '更换麻衣头像' : '更换用户头像';
  avatarPickerDescription.textContent = '项目不内置头像素材。选择自己的 JPG/PNG 后，应用只保存一份本地副本。';
  clearCustomAvatarButton.disabled = !chatConfig.avatarSelections?.[target];
  avatarPickerOverlay.classList.remove('overlay--hidden');
  setTimeout(() => chooseCustomAvatarButton.focus(), 30);
}

function closeAvatarPicker() {
  avatarPickerOverlay.classList.add('overlay--hidden');
  activeAvatarTarget = null;
  messageInput.focus();
}

async function chooseCustomAvatar() {
  if (!activeAvatarTarget) return;
  const target = activeAvatarTarget;
  chooseCustomAvatarButton.disabled = true;
  try {
    const config = await api.chooseCustomAvatar(target);
    setConnection(config);
    if (config.avatarSelectionChanged) closeAvatarPicker();
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    chooseCustomAvatarButton.disabled = false;
  }
}

async function clearCustomAvatar() {
  if (!activeAvatarTarget) return;
  const target = activeAvatarTarget;
  clearCustomAvatarButton.disabled = true;
  try {
    setConnection(await api.clearCustomAvatar(target));
    closeAvatarPicker();
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    clearCustomAvatarButton.disabled = false;
  }
}

function setMood(payload = {}) {
  const emotion = MOOD_LABELS[payload.emotion] ? payload.emotion : 'neutral';
  moodLabel.textContent = MOOD_LABELS[emotion];
  setPortraitAction(payload.action);
}

function setPortraitAction(action) {
  const normalizedAction = PORTRAIT_ACTIONS.has(action) ? action : 'wave';
  portrait.dataset.action = normalizedAction;
  portrait.classList.remove('portrait--reacting');
  void portrait.offsetWidth;
  portrait.classList.add('portrait--reacting');
  clearTimeout(portraitReactionTimer);
  portraitReactionTimer = setTimeout(() => portrait.classList.remove('portrait--reacting'), 700);
}

function setSettingsStatus(message, isError = false) {
  settingsStatus.textContent = message;
  settingsStatus.classList.toggle('settings-status--error', isError);
}

function showNotice(message) {
  notice.textContent = message;
  notice.classList.remove('notice--hidden');
}

function hideNotice() {
  notice.classList.add('notice--hidden');
}

function populateSettings() {
  window.maiSettingsView?.clean();
  apiKeyInput.value = '';
  modelProviderSelect.value = chatConfig.provider || 'deepseek';
  const activeProvider = Array.isArray(chatConfig.providers)
    ? chatConfig.providers.find((provider) => provider.id === modelProviderSelect.value)
    : null;
  modelProviderHint.textContent = activeProvider?.reason
    || '当前版本使用 DeepSeek；本地模型接入后才会开放。';
  modelSelect.value = chatConfig.model;
  personalitySelect.value = chatConfig.personality || 'classic';
  customPromptInput.value = chatConfig.customPrompt || '';
  memoryEnabledInput.checked = chatConfig.memoryEnabled !== false;
  proactiveEnabledInput.checked = chatConfig.proactiveGreetingEnabled !== false;
  proactiveIntervalMinutesInput.value = String(chatConfig.proactiveIntervalMinutes || 45);
  proactiveDailyLimitInput.value = String(chatConfig.proactiveDailyLimit || 5);
  proactiveIntervalMinutesInput.disabled = !proactiveEnabledInput.checked;
  proactiveDailyLimitInput.disabled = !proactiveEnabledInput.checked;
  girlfriendEnabledInput.checked = chatConfig.girlfriendModeEnabled === true;
  girlfriendIntervalMinutesInput.value = String(chatConfig.girlfriendIntervalMinutes || 20);
  girlfriendMaxFollowUpsInput.value = String(chatConfig.girlfriendMaxFollowUps || 4);
  girlfriendIntervalMinutesInput.disabled = !girlfriendEnabledInput.checked;
  girlfriendMaxFollowUpsInput.disabled = !girlfriendEnabledInput.checked;
  previewGirlfriendButton.disabled = !girlfriendEnabledInput.checked;
  momentsEnabledInput.checked = chatConfig.momentsEnabled !== false;
  const currentVoice = voiceConfig();
  voiceAutoReadInput.checked = currentVoice.autoReadReplies;
  voiceEngineSelect.value = currentVoice.engine;
  voiceRateInput.value = String(currentVoice.rate);
  voicePitchInput.value = String(currentVoice.pitch);
  voiceVolumeInput.value = String(currentVoice.volume);
  updateVoiceSliderLabels();
  refreshSpeechVoices();
  voiceNameSelect.value = speechVoices.some((voice) => voice.name === currentVoice.voiceName)
    ? currentVoice.voiceName
    : '';
  if (Array.from(voiceCultureSelect.options).some((option) => option.value === currentVoice.culture)) {
    voiceCultureSelect.value = currentVoice.culture;
  }
  updateVoiceEngineControls();
  weatherEnabledInput.checked = chatConfig.weatherEnabled === true;
  weatherCityInput.value = chatConfig.weatherCity || '';
  weatherCityInput.disabled = !weatherEnabledInput.checked;
  const appearance = window.maiAppearance?.normalize(chatConfig.appearance) || chatConfig.appearance || {};
  appearanceThemeInput.value = appearance.theme || 'auto';
  appearanceGlassInput.value = appearance.glassIntensity || 'balanced';
  appearanceDensityInput.value = appearance.chatDensity || 'comfortable';
  appearanceTransparencyInput.value = String(appearance.transparency || 72);
  appearanceScaleInput.value = String(appearance.uiScale || 100);
  appearanceMotionInput.value = appearance.motion || 'full';
  updateAppearancePreview();
  keyHint.textContent = chatConfig.configured
    ? '已安全保存一个 Key；留空保存不会覆盖它。'
    : 'Key 会使用 Windows 系统加密并仅保存在本机。';
}

function appearancePayload() {
  return {
    theme: appearanceThemeInput.value,
    glassIntensity: appearanceGlassInput.value,
    chatDensity: appearanceDensityInput.value,
    transparency: Number(appearanceTransparencyInput.value),
    uiScale: Number(appearanceScaleInput.value),
    motion: appearanceMotionInput.value
  };
}

function updateAppearancePreview() {
  const appearance = appearancePayload();
  appearanceTransparencyValue.value = `${appearance.transparency}%`;
  appearanceTransparencyValue.textContent = `${appearance.transparency}%`;
  appearanceScaleValue.value = `${appearance.uiScale}%`;
  appearanceScaleValue.textContent = `${appearance.uiScale}%`;
  appearancePreview.dataset.density = appearance.chatDensity;
  appearancePreview.dataset.motion = appearance.motion;
  appearancePreview.style.setProperty('--appearance-preview-scale', String(appearance.uiScale / 100));
  window.maiAppearance?.apply(appearance);
}

function openSettings(section) {
  endVoiceCall();
  memoryOverlay.classList.add('overlay--hidden');
  lifeOverlay.classList.add('overlay--hidden');
  sharedLifeOverlay.classList.add('overlay--hidden');
  momentsOverlay.classList.add('overlay--hidden');
  closeHistory();
  if (!window.maiSettingsView?.isDirty()) populateSettings();
  else updateAppearancePreview();
  setSettingsStatus('');
  window.maiSettingsView?.open(typeof section === 'string' ? section : !chatConfig.configured ? 'model' : undefined);
  settingsOverlay.classList.remove('overlay--hidden');
  setTimeout(() => {
    if (!settingsOverlay.classList.contains('overlay--hidden')) window.maiSettingsView?.focus();
  }, 50);
}

function closeSettings() {
  settingsOverlay.classList.add('overlay--hidden');
  window.maiAppearance?.apply(chatConfig.appearance);
  messageInput.focus();
}

async function openMemory() {
  endVoiceCall();
  settingsOverlay.classList.add('overlay--hidden');
  lifeOverlay.classList.add('overlay--hidden');
  sharedLifeOverlay.classList.add('overlay--hidden');
  momentsOverlay.classList.add('overlay--hidden');
  closeHistory();
  memoryOverlay.classList.remove('overlay--hidden');
  await refreshMemories();
}

function closeMemory() {
  memoryOverlay.classList.add('overlay--hidden');
  messageInput.focus();
}

async function openSharedLife() {
  endVoiceCall();
  settingsOverlay.classList.add('overlay--hidden');
  memoryOverlay.classList.add('overlay--hidden');
  lifeOverlay.classList.add('overlay--hidden');
  sharedLifeOverlay.classList.add('overlay--hidden');
  momentsOverlay.classList.add('overlay--hidden');
  closeHistory();
  sharedLifeOverlay.classList.remove('overlay--hidden');
  await refreshSharedLife();
}

function closeSharedLife() {
  sharedLifeOverlay.classList.add('overlay--hidden');
  messageInput.focus();
}

function localDateTimeInputValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  ].join('T');
}

function prepareLifeForm() {
  if (!lifeDueAtInput.value) {
    const defaultDate = new Date(Date.now() + 60 * 60 * 1000);
    defaultDate.setSeconds(0, 0);
    lifeDueAtInput.value = localDateTimeInputValue(defaultDate);
  }
}

async function openLife() {
  endVoiceCall();
  settingsOverlay.classList.add('overlay--hidden');
  memoryOverlay.classList.add('overlay--hidden');
  sharedLifeOverlay.classList.add('overlay--hidden');
  momentsOverlay.classList.add('overlay--hidden');
  closeHistory();
  lifeOverlay.classList.remove('overlay--hidden');
  prepareLifeForm();
  await refreshLifeState();
}

function closeLife() {
  lifeOverlay.classList.add('overlay--hidden');
  messageInput.focus();
}

function setMomentsStatus(message, isError = false) {
  momentsStatus.textContent = message;
  momentsStatus.classList.toggle('settings-status--error', isError);
}

function momentTimestamp(value) {
  const timestamp = messageTimestamp(value);
  return timestamp.label || '刚刚';
}

function visibleMomentCommentText(comment) {
  const original = String(comment?.content || '').trim();
  if (comment?.role !== 'assistant' || !original) return original;
  let normalized = original
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const parsed = JSON.parse(normalized);
      if (typeof parsed === 'string') {
        normalized = parsed.trim();
        continue;
      }
      const candidate = parsed?.reply ?? parsed?.content ?? parsed?.message ?? parsed?.answer ?? parsed?.text;
      if (candidate !== undefined) {
        normalized = String(candidate).trim();
        continue;
      }
    } catch {
      // The backend repairs persisted data; this is a final display guard for partial JSON.
    }
    break;
  }
  const replyField = normalized.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/s);
  if (!replyField) return normalized;
  try {
    return JSON.parse(`"${replyField[1]}"`);
  } catch {
    return replyField[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

function renderMoments() {
  const moments = Array.isArray(momentsState.moments) ? momentsState.moments : [];
  momentsList.innerHTML = '';
  momentsEmpty.classList.toggle('memory-empty--hidden', moments.length > 0);
  const enabled = momentsState.automaticEnabled !== false;
  const nextAt = Number(momentsState.meta?.nextPostAt) || 0;
  momentsAutoStatus.textContent = enabled
    ? `自动更新已开启${nextAt ? ` · 下次约 ${momentTimestamp(nextAt)}` : ''}`
    : '自动更新已关闭 · 仍可手动发布';
  momentsAutoStatus.classList.toggle('moments-auto-status--off', !enabled);

  for (const moment of moments) {
    const article = document.createElement('article');
    article.className = 'moment-card';

    const header = document.createElement('header');
    header.className = 'moment-card__header';
    const avatar = document.createElement('img');
    avatar.src = '../assets/mai-profile.png';
    avatar.alt = '';
    avatar.className = 'moment-avatar';
    const author = document.createElement('div');
    author.className = 'moment-author';
    const authorName = document.createElement('strong');
    authorName.textContent = '樱岛麻衣';
    const postedAt = document.createElement('time');
    postedAt.textContent = momentTimestamp(moment.createdAt);
    postedAt.dateTime = moment.createdAt || '';
    author.append(authorName, postedAt);
    header.append(avatar, author);

    const body = document.createElement('p');
    body.className = 'moment-card__content';
    body.textContent = moment.content;

    const comments = document.createElement('div');
    comments.className = 'moment-comments';
    for (const comment of Array.isArray(moment.comments) ? moment.comments : []) {
      const row = document.createElement('div');
      row.className = `moment-comment moment-comment--${comment.role}`;
      const commentMain = document.createElement('p');
      const name = document.createElement('strong');
      name.textContent = comment.role === 'user' ? '你：' : '麻衣：';
      const text = document.createElement('span');
      text.textContent = visibleMomentCommentText(comment);
      commentMain.append(name, text);
      const time = document.createElement('time');
      time.textContent = momentTimestamp(comment.createdAt);
      time.dateTime = comment.createdAt || '';
      row.append(commentMain, time);
      comments.appendChild(row);
    }

    const form = document.createElement('form');
    form.className = 'moment-reply-form';
    const input = document.createElement('textarea');
    input.rows = 1;
    input.maxLength = 600;
    input.placeholder = '回复麻衣…';
    input.setAttribute('aria-label', '回复这条动态');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'moment-reply-button';
    submit.textContent = momentRepliesInFlight.has(moment.id) ? '回复中…' : '回复';
    input.disabled = momentRepliesInFlight.has(moment.id);
    submit.disabled = momentRepliesInFlight.has(moment.id);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      sendMomentComment(moment.id, input.value);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    form.append(input, submit);

    article.append(header, body);
    if (comments.childElementCount) {
      article.appendChild(comments);
    }
    article.appendChild(form);
    momentsList.appendChild(article);
  }
}

async function refreshMoments() {
  try {
    momentsState = await api.getMomentsState();
    renderMoments();
  } catch (error) {
    setMomentsStatus(errorText(error), true);
  }
}

async function openMoments() {
  endVoiceCall();
  settingsOverlay.classList.add('overlay--hidden');
  memoryOverlay.classList.add('overlay--hidden');
  lifeOverlay.classList.add('overlay--hidden');
  sharedLifeOverlay.classList.add('overlay--hidden');
  closeHistory();
  setMomentsStatus('');
  momentsOverlay.classList.remove('overlay--hidden');
  await refreshMoments();
}

function closeMoments() {
  momentsOverlay.classList.add('overlay--hidden');
  messageInput.focus();
}

async function generateMoment() {
  generateMomentButton.disabled = true;
  setMomentsStatus('麻衣正在想写点什么…');
  try {
    momentsState = await api.generateMoment();
    renderMoments();
    setMomentsStatus('新动态已经发好了。');
  } catch (error) {
    setMomentsStatus(errorText(error), true);
  } finally {
    generateMomentButton.disabled = false;
  }
}

async function sendMomentComment(postId, rawContent) {
  const content = String(rawContent || '').trim();
  if (!content || momentRepliesInFlight.has(postId)) {
    return;
  }
  momentRepliesInFlight.add(postId);
  renderMoments();
  setMomentsStatus('麻衣正在回复你…');
  try {
    momentsState = await api.commentOnMoment({ postId, content });
    setMomentsStatus('麻衣回复了你的评论。');
  } catch (error) {
    setMomentsStatus(errorText(error), true);
  } finally {
    momentRepliesInFlight.delete(postId);
    renderMoments();
  }
}

function waitFor(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatCallDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function updateCallDuration() {
  voiceCallDuration.textContent = formatCallDuration(Date.now() - voiceCallStartedAt);
}

function setVoiceCallState(status, active = false) {
  voiceCallStatus.textContent = status;
  voiceCallAvatar.classList.toggle('voice-call-avatar--active', active);
}

function addVoiceCallLine(role, content) {
  const hint = voiceCallTranscript.querySelector('.voice-call-hint');
  hint?.remove();
  const line = document.createElement('p');
  line.className = `voice-call-line voice-call-line--${role}`;
  const name = document.createElement('strong');
  name.textContent = role === 'user' ? '你：' : role === 'assistant' ? '麻衣：' : '提示：';
  const text = document.createElement('span');
  text.textContent = content;
  line.append(name, text);
  voiceCallTranscript.appendChild(line);
  voiceCallTranscript.scrollTop = voiceCallTranscript.scrollHeight;
}

async function startVoiceInput() {
  if (voiceCallActive) {
    return;
  }
  if (voiceInputListening) {
    await api.stopVoiceListening();
    return;
  }
  if (chatTurnCoordinator.getState().busy) {
    showNotice('请先等待当前回复结束。');
    return;
  }
  if (!chatConfig.configured) {
    showNotice('请先设置 DeepSeek API Key，再使用语音聊天。');
    openSettings();
    return;
  }
  if (!voiceCapabilities.available) {
    await refreshVoiceCapabilities(true);
    if (!voiceCapabilities.available) {
      showNotice(voiceCapabilityStatus.textContent);
      return;
    }
  }

  voiceInputListening = true;
  voiceInputButton.classList.add('voice-input-button--listening');
  voiceInputButton.title = '点击停止聆听';
  showNotice('正在听你说话…说完后停顿一下即可发送。');
  let capture = null;
  try {
    await ensureCallMicrophoneMonitor().catch(() => null);
    beginVoiceCapture();
    const result = await api.listenVoice({
      culture: voiceConfig().culture,
      timeoutSeconds: 28
    });
    capture = finishVoiceCapture();
    if (result?.canceled) {
      hideNotice();
      return;
    }
    const voiceProfile = await enrichVoiceProfile(capture);
    const recognizedText = String(result?.text || voiceProfile.senseText || '').trim();
    if (!recognizedText) {
      showNotice('这次没有听清。靠近麦克风，再试一次吧。');
      return;
    }
    messageInput.value = recognizedText;
    resizeInput();
    await sendMessage({ voiceMode: true, voiceProfile });
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    if (!capture) finishVoiceCapture();
    if (!voiceCallActive) disposeCallMicrophoneMonitor();
    voiceInputListening = false;
    voiceInputButton.classList.remove('voice-input-button--listening');
    voiceInputButton.title = '说一句话';
    voiceInputButton.disabled = false;
  }
}

async function sendVoiceCallTurn(content, generation, voiceProfile = {}) {
  const normalized = String(content || '').trim();
  if (!normalized) return null;
  const requestId = `voice-${generation}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = new Date().toISOString();
  const requestSessionId = activeChatSessionId();
  const turnConversation = conversation;
  const optimisticUserMessage = { role: 'user', content: normalized };
  turnConversation.push(optimisticUserMessage);
  const optimisticUserElement = addMessage('user', normalized, { createdAt });
  const pending = addPendingMessage();
  const turn = chatTurnCoordinator.beginTurn({
    sessionId: requestSessionId,
    requestId,
    voiceIsCurrent: () => (
      activeChatSessionId() === requestSessionId
      && conversation === turnConversation
      && voiceCallActive
      && generation === voiceCallGeneration
    ),
    removeOptimistic: () => {
      optimisticUserElement.remove();
      removeOptimisticMessage(turnConversation, optimisticUserMessage);
    },
    removePending: () => pending.remove()
  });
  if (!turn) {
    pending.remove();
    optimisticUserElement.remove();
    removeOptimisticMessage(turnConversation, optimisticUserMessage);
    return null;
  }

  if (!voiceCallSpeakerMuted) {
    try {
      turn.setVoiceStream(createVoiceStreamController(requestId, generation, voiceProfile));
    } catch (error) {
      return chatTurnCoordinator.runTurn(turn, {
        send: async () => { throw error; },
        onError: (failure, currentTurn) => {
          if (currentTurn.isCurrent()) addVoiceCallLine('system', errorText(failure));
        }
      });
    }
  }

  return chatTurnCoordinator.runTurn(turn, {
    send: () => api.sendChat({
      sessionId: requestSessionId,
      messages: turnConversation,
      voiceMode: true,
      requestId,
      voiceProfile
    }),
    onReply: (result, currentTurn) => {
      if (!currentTurn.isCurrent()) return;
      addMessage('assistant', result.content, { createdAt: result.createdAt, voiceMode: true });
      turnConversation.push({ role: 'assistant', content: result.content });
      conversation = turnConversation.slice(-MAX_RENDER_CONTEXT_MESSAGES);
      if (Array.isArray(result.sessions)) {
        runtimeSessions = result.sessions;
        renderHistory();
      }
      setMood(result);
      const replyView = chatTurnCoordinator.getState();
      if (chatConfig.memoryEnabled) refreshMemories(() => chatTurnCoordinator.isViewCurrent(replyView));
      refreshLifeState(() => chatTurnCoordinator.isViewCurrent(replyView));
      if (voiceCallActive && generation === voiceCallGeneration) addVoiceCallLine('assistant', result.content);
      return result;
    },
    onError: (error, currentTurn) => {
      if (currentTurn.isCurrent()) addVoiceCallLine('system', errorText(error));
    }
  });
}

async function runVoiceCall(generation) {
  try {
    setVoiceCallState('已经接通', true);
    await speakText('我在。想和我聊什么？', { call: true, emotion: 'curious' });
    while (voiceCallActive && generation === voiceCallGeneration) {
      if (voiceCallMicPaused) {
        setVoiceCallState('麦克风已暂停', false);
        await waitFor(350);
        continue;
      }
      setVoiceCallState('正在听你说话…', true);
      let recognized = null;
      let capture = null;
      try {
        beginVoiceCapture();
        recognized = await api.listenVoice({
          culture: voiceConfig().culture,
          timeoutSeconds: 30
        });
        capture = finishVoiceCapture();
      } catch (error) {
        capture = finishVoiceCapture();
        if (!voiceCallActive || generation !== voiceCallGeneration) break;
        addVoiceCallLine('system', errorText(error));
        voiceCallMicPaused = true;
        voiceCallMicButton.classList.add('call-control--off');
        voiceCallMicButton.querySelector('span').textContent = '继续收听';
        continue;
      }
      if (!voiceCallActive || generation !== voiceCallGeneration) {
        break;
      }
      if (recognized?.canceled) {
        await waitFor(200);
        continue;
      }
      setVoiceCallState('正在理解你的语气…', true);
      const voiceProfile = await enrichVoiceProfile(capture);
      const content = String(recognized?.text || voiceProfile.senseText || '').trim();
      if (!content) {
        setVoiceCallState('没有听清，再说一次吧', false);
        await waitFor(750);
        continue;
      }
      addVoiceCallLine('user', content);
      setVoiceCallState('麻衣正在回答…', true);
      const result = await sendVoiceCallTurn(content, generation, voiceProfile);
      if (!result || !voiceCallActive || generation !== voiceCallGeneration) {
        if (!result) {
          setVoiceCallState('回复失败，调整后再试一次吧', false);
          await waitFor(900);
        }
        continue;
      }
      setVoiceCallState(voiceCallSpeakerMuted ? '回答已显示，继续听你说' : '继续听你说…', true);
      if (/^(?:先挂了|挂断|拜拜|再见|先这样)/.test(content)) {
        endVoiceCall();
        break;
      }
    }
  } finally {
    if (generation === voiceCallGeneration) {
      voiceCallLoopPromise = null;
    }
  }
}

async function startVoiceCall() {
  if (voiceCallActive || chatTurnCoordinator.getState().busy) {
    return;
  }
  if (!chatConfig.configured) {
    showNotice('请先设置 DeepSeek API Key，再和麻衣语音通话。');
    openSettings();
    return;
  }
  if (!voiceCapabilities.available) {
    await refreshVoiceCapabilities(true);
    if (!voiceCapabilities.available) {
      showNotice(voiceCapabilityStatus.textContent);
      return;
    }
  }
  if (voiceInputListening) {
    await api.stopVoiceListening();
    voiceInputListening = false;
  }
  settingsOverlay.classList.add('overlay--hidden');
  memoryOverlay.classList.add('overlay--hidden');
  lifeOverlay.classList.add('overlay--hidden');
  sharedLifeOverlay.classList.add('overlay--hidden');
  momentsOverlay.classList.add('overlay--hidden');
  closeHistory();
  voiceCallTranscript.innerHTML = '<p class="voice-call-hint">接通后直接说话就好。麻衣会边想边说，你开口时也可以打断她。</p>';
  voiceCallActive = true;
  voiceCallGeneration += 1;
  const generation = voiceCallGeneration;
  voiceCallMicPaused = false;
  voiceCallSpeakerMuted = false;
  voiceCallStartedAt = Date.now();
  updateCallDuration();
  clearInterval(voiceCallDurationTimer);
  voiceCallDurationTimer = setInterval(updateCallDuration, 1000);
  voiceCallMicButton.classList.remove('call-control--off');
  voiceCallSpeakerButton.classList.remove('call-control--off');
  voiceCallMicButton.querySelector('span').textContent = '麦克风';
  voiceCallSpeakerButton.querySelector('span').textContent = '扬声器';
  voiceCallOverlay.classList.remove('overlay--hidden');
  try {
    await ensureCallMicrophoneMonitor();
  } catch (error) {
    addVoiceCallLine('system', '没有取得浏览器麦克风分析权限，将继续使用 Windows 本地识别，但暂时无法判断语气或检测打断。');
  }
  if (!voiceCallActive || generation !== voiceCallGeneration) return;
  voiceCallLoopPromise = runVoiceCall(generation);
}

function endVoiceCall() {
  if (!voiceCallActive && voiceCallOverlay.classList.contains('overlay--hidden')) {
    return;
  }
  if (chatTurnCoordinator.getState().activeTurnToken) {
    chatTurnCoordinator.cancelCurrentTurn({ onError: (error) => showNotice(errorText(error)) }).catch(() => {});
  }
  voiceCallActive = false;
  voiceCallGeneration += 1;
  clearInterval(voiceCallDurationTimer);
  voiceCallDurationTimer = null;
  api.stopVoiceListening().catch(() => {});
  stopSpeaking();
  disposeCallMicrophoneMonitor();
  setVoiceCallState('通话已结束', false);
  voiceCallOverlay.classList.add('overlay--hidden');
  messageInput.focus();
}

async function toggleVoiceCallMic() {
  voiceCallMicPaused = !voiceCallMicPaused;
  voiceCallMicButton.classList.toggle('call-control--off', voiceCallMicPaused);
  voiceCallMicButton.querySelector('span').textContent = voiceCallMicPaused ? '继续收听' : '麦克风';
  if (voiceCallMicPaused) {
    await api.stopVoiceListening();
  }
}

function toggleVoiceCallSpeaker() {
  voiceCallSpeakerMuted = !voiceCallSpeakerMuted;
  voiceCallSpeakerButton.classList.toggle('call-control--off', voiceCallSpeakerMuted);
  voiceCallSpeakerButton.querySelector('span').textContent = voiceCallSpeakerMuted ? '已静音' : '扬声器';
  if (voiceCallSpeakerMuted) {
    chatTurnCoordinator.getVoiceStream()?.cancel();
    stopSpeaking();
  }
}

function setMindMeter(bar, valueElement, value) {
  const normalized = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  bar.style.width = `${normalized}%`;
  valueElement.textContent = String(normalized);
}

function lifeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
}

function renderLifeState() {
  const mind = lifeState.mind || {};
  relationshipStage.textContent = mind.relationshipStageLabel || '熟悉';
  mindMood.textContent = MIND_MOOD_LABELS[mind.mood] || '平静';
  setMindMeter(intimacyBar, intimacyValue, mind.intimacy);
  setMindMeter(trustBar, trustValue, mind.trust);
  setMindMeter(energyBar, energyValue, mind.energy);
  activeTopic.textContent = mind.activeTopic
    ? `正在关注：${mind.activeTopic}`
    : '当前没有持续关注的话题。';
  pendingQuestion.textContent = mind.pendingQuestion
    ? `等待回答：${mind.pendingQuestion}`
    : '没有等待回答的问题。';

  const weather = lifeState.weather;
  if (weather) {
    weatherSummary.textContent = `${weather.locationName || weather.city} · ${weather.description} · ${weather.temperature}℃`;
    weatherDetail.textContent = `体感 ${weather.apparentTemperature}℃ · 风速 ${weather.windSpeed} km/h${weather.stale ? ' · 缓存数据' : ''}`;
  } else if (lifeState.weatherEnabled) {
    weatherSummary.textContent = `${lifeState.weatherCity || '所选城市'} · 等待刷新`;
    weatherDetail.textContent = '点击“刷新”获取当前天气。';
  } else {
    weatherSummary.textContent = '未开启';
    weatherDetail.textContent = '可以在 DeepSeek 设置中填写城市并开启。';
  }
  refreshWeatherButton.disabled = !lifeState.weatherEnabled;

  const items = Array.isArray(lifeState.items) ? lifeState.items : [];
  lifeList.innerHTML = '';
  lifeEmpty.classList.toggle('memory-empty--hidden', items.length > 0);
  for (const item of items) {
    const article = document.createElement('article');
    article.className = 'life-item';
    if (item.completed) {
      article.classList.add('life-item--completed');
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.completed === true;
    checkbox.title = item.completed ? '标记为未完成' : '标记为已完成';
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      try {
        lifeState = await api.toggleLifeItem(item.id, checkbox.checked);
        renderLifeState();
      } catch (error) {
        showNotice(errorText(error));
      }
    });

    const content = document.createElement('div');
    content.className = 'life-item__content';
    const title = document.createElement('p');
    title.textContent = item.title;
    const meta = document.createElement('small');
    meta.textContent = `${LIFE_KIND_LABELS[item.kind] || '待办'} · ${lifeDate(item.effectiveDueAt || item.dueAt)}${item.recurring === 'yearly' ? ' · 每年' : ''}${item.source === 'conversation' ? ' · 聊天识别' : ''}`;
    content.append(title, meta);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'life-item__delete';
    deleteButton.type = 'button';
    deleteButton.textContent = '×';
    deleteButton.title = '删除';
    deleteButton.addEventListener('click', async () => {
      deleteButton.disabled = true;
      try {
        lifeState = await api.deleteLifeItem(item.id);
        renderLifeState();
      } catch (error) {
        showNotice(errorText(error));
      }
    });
    article.append(checkbox, content, deleteButton);
    lifeList.appendChild(article);
  }
  renderCompanionContext();
}

async function refreshLifeState(isCurrent = () => true) {
  try {
    const nextState = await api.getLifeState();
    if (chatTurnCoordinator.getState().disposed || !isCurrent()) return false;
    lifeState = nextState;
    renderLifeState();
  } catch (error) {
    if (!chatTurnCoordinator.getState().disposed && isCurrent()) showNotice(errorText(error));
  }
}

async function addLifeItem() {
  const title = lifeTitleInput.value.trim();
  if (!title) {
    lifeTitleInput.focus();
    return;
  }
  addLifeItemButton.disabled = true;
  try {
    lifeState = await api.addLifeItem({
      title,
      kind: lifeKindSelect.value,
      dueAt: lifeDueAtInput.value,
      recurring: lifeRecurringSelect.value
    });
    lifeTitleInput.value = '';
    lifeDueAtInput.value = '';
    prepareLifeForm();
    renderLifeState();
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    addLifeItemButton.disabled = false;
  }
}

async function refreshWeather() {
  refreshWeatherButton.disabled = true;
  weatherDetail.textContent = '正在获取天气…';
  try {
    lifeState = await api.refreshWeather();
    renderLifeState();
  } catch (error) {
    weatherDetail.textContent = errorText(error);
  } finally {
    refreshWeatherButton.disabled = !lifeState.weatherEnabled;
  }
}

async function resetMind() {
  if (!window.confirm('确定重置麻衣的情绪、关系阶段和未完成话题吗？长期记忆、历史和生活事项不会删除。')) {
    return;
  }
  resetMindButton.disabled = true;
  try {
    lifeState = await api.resetMind();
    renderLifeState();
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    resetMindButton.disabled = false;
  }
}

function openHistory() {
  setCompanionInspectorOpen(false);
  endVoiceCall();
  settingsOverlay.classList.add('overlay--hidden');
  memoryOverlay.classList.add('overlay--hidden');
  lifeOverlay.classList.add('overlay--hidden');
  momentsOverlay.classList.add('overlay--hidden');
  renderHistory();
  historySidebar.classList.remove('history-sidebar--closed');
  historyScrim.classList.remove('history-scrim--hidden');
}

function closeHistory() {
  historySidebar.classList.add('history-sidebar--closed');
  historyScrim.classList.add('history-scrim--hidden');
}

function historyDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function collectionIcon(kind) {
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = kind === 'plan' ? '◇' : '○';
  return icon;
}

function renderCompanionPlans() {
  const projects = (Array.isArray(continuityState?.projects) ? continuityState.projects : [])
    .filter((project) => project.status === 'active')
    .slice(0, 4);
  companionPlanList.replaceChildren();
  companionPlanEmpty.hidden = projects.length > 0;
  for (const project of projects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sidebar-collection-item';
    button.title = project.outcome || project.title;
    const body = document.createElement('span');
    body.className = 'sidebar-collection-item__body';
    const title = document.createElement('span');
    title.className = 'sidebar-collection-item__title';
    title.textContent = project.title;
    const meta = document.createElement('span');
    meta.className = 'sidebar-collection-item__meta';
    const nextStep = project.steps?.find((step) => step.status !== 'done');
    meta.textContent = nextStep ? `下一步：${nextStep.title}` : (project.outcome || '等待补充下一步');
    const badge = document.createElement('span');
    badge.className = 'sidebar-collection-item__badge';
    badge.textContent = `${Number(project.progress) || 0}%`;
    body.append(title, meta);
    button.append(collectionIcon('plan'), body, badge);
    button.addEventListener('click', async () => {
      await openSharedLife();
      selectSharedLifeTab('projects');
      document.querySelector(`[data-project-id="${CSS.escape(project.id)}"]`)?.scrollIntoView({ block: 'center' });
    });
    companionPlanList.appendChild(button);
  }
}

function renderRecentConversations() {
  const sessions = runtimeSessions.filter((session) => session.messageCount > 0).slice(0, 6);
  recentList.replaceChildren();
  recentEmpty.hidden = sessions.length > 0;
  for (const session of sessions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sidebar-collection-item${session.id === activeChatSessionId() ? ' sidebar-collection-item--active' : ''}`;
    button.dataset.chatSessionId = session.id;
    button.title = session.preview || session.title;
    const body = document.createElement('span');
    body.className = 'sidebar-collection-item__body';
    const title = document.createElement('span');
    title.className = 'sidebar-collection-item__title';
    title.textContent = session.title || '新对话';
    const meta = document.createElement('span');
    meta.className = 'sidebar-collection-item__meta';
    meta.textContent = `${historyDate(session.updatedAt)} · ${session.messageCount} 条`;
    body.append(title, meta);
    button.append(collectionIcon('chat'), body);
    button.addEventListener('click', async () => {
      if (session.id === activeChatSessionId()) return;
      try {
        applyChatState(await api.selectChatSession(session.id));
      } catch (error) {
        showNotice(errorText(error));
      }
    });
    button.addEventListener('contextmenu', (event) => openConversationContextMenu(event, session));
    recentList.appendChild(button);
  }
}

function renderCompanionContext() {
  const activePlans = (Array.isArray(continuityState?.projects) ? continuityState.projects : [])
    .filter((project) => project.status === 'active');
  const activeSession = runtimeSessions.find((session) => session.id === activeChatSessionId());
  contextMessageCount.textContent = String(activeSession?.messageCount || conversation.length || 0);
  contextMemoryCount.textContent = String(memories.length);
  contextPlanCount.textContent = String(activePlans.length);

  contextPlanList.replaceChildren();
  const visiblePlans = activePlans.slice(0, 3);
  contextPlanEmpty.hidden = visiblePlans.length > 0;
  for (const project of visiblePlans) {
    const item = document.createElement('article');
    item.className = 'context-list-item';
    const title = document.createElement('strong');
    title.textContent = project.title;
    const nextStep = project.steps?.find((step) => step.status !== 'done');
    const meta = document.createElement('small');
    meta.textContent = nextStep ? `下一步 · ${nextStep.title}` : `${Number(project.progress) || 0}% 已完成`;
    const progress = document.createElement('div');
    progress.className = 'context-mini-progress';
    const bar = document.createElement('i');
    bar.style.width = `${Math.max(0, Math.min(100, Number(project.progress) || 0))}%`;
    progress.appendChild(bar);
    item.append(title, meta, progress);
    contextPlanList.appendChild(item);
  }

  const todayItems = (Array.isArray(lifeState?.items) ? lifeState.items : [])
    .filter((item) => item.completed !== true)
    .sort((left, right) => String(left.effectiveDueAt || left.dueAt || '9999').localeCompare(String(right.effectiveDueAt || right.dueAt || '9999')))
    .slice(0, 3);
  contextTodayList.replaceChildren();
  contextTodayEmpty.hidden = todayItems.length > 0;
  for (const lifeItem of todayItems) {
    const item = document.createElement('article');
    item.className = 'context-list-item';
    const title = document.createElement('strong');
    title.textContent = lifeItem.title;
    const meta = document.createElement('small');
    meta.textContent = `${LIFE_KIND_LABELS[lifeItem.kind] || '待办'} · ${lifeDate(lifeItem.effectiveDueAt || lifeItem.dueAt) || '未设置时间'}`;
    item.append(title, meta);
    contextTodayList.appendChild(item);
  }
}

function renderCompanionWorkspace() {
  if (selectedRuntimeMode === 'agent') {
    renderActionWorkspace();
    return;
  }
  conversationRuntimeEyebrow.textContent = '陪你聊聊';
  runtimePrivacyNote.textContent = 'Mai 会在本地保存对话与记忆；模型请求仅发送到你选择的 Provider。';
  messageInput.placeholder = '想和麻衣聊些什么？';
  const turnState = chatTurnCoordinator.getState();
  const chatTurnPending = Boolean(turnState.activeTurnToken);
  sendButton.textContent = turnState.cancellationPending ? '取消中…' : chatTurnPending ? '停止' : '发送';
  sendButton.setAttribute('aria-label', turnState.cancellationPending ? '正在取消当前回复' : chatTurnPending ? '停止当前回复' : '发送');
  voiceInputButton.hidden = false;
  messageInput.disabled = turnState.busy;
  sendButton.disabled = turnState.cancellationPending;
  const activeSession = runtimeSessions.find((session) => session.id === activeChatSessionId());
  const title = activeSession?.title || '新对话';
  activeSessionTitle.textContent = title;
  workspaceLocation.textContent = title;
  conversationModelBadge.textContent = chatConfig.provider === 'local'
    ? '本地模型'
    : (chatConfig.model === 'deepseek-v4-pro' ? 'DeepSeek V4 Pro' : 'DeepSeek V4 Flash');
  conversationMemoryBadge.textContent = chatConfig.memoryEnabled === false ? '记忆已关闭' : '记忆已开启';
  setCapabilityChips(['长期记忆', '现实时间', '主动关心', '语音陪伴']);
  renderCompanionPlans();
  renderRecentConversations();
  renderCompanionContext();
}

function setRuntimeMode(mode) {
  if (workRendererBindings.isCurrentModeBusy(selectedRuntimeMode, chatTurnCoordinator.getState())) {
    showNotice('请等待当前回复或行动结束。');
    return;
  }
  setWorkInspectorOpen(false);
  setCompanionInspectorOpen(false);
  const nextMode = mode === 'agent' ? 'agent' : 'chat';
  const modeChanged = nextMode !== selectedRuntimeMode;
  if (nextMode !== selectedRuntimeMode) runtimeModeGeneration += 1;
  selectedRuntimeMode = nextMode;
  workRendererBindings.activateMode(selectedRuntimeMode);
  const agentMode = selectedRuntimeMode === 'agent';
  chatApp.classList.toggle('runtime-mode--chat', !agentMode);
  chatApp.classList.toggle('runtime-mode--agent', agentMode);
  chatApp.dataset.runtimeMode = selectedRuntimeMode;
  syncWorkInspectorDrawer();
  syncCompanionInspectorDrawer();
  runtimeCurrentLabel.textContent = agentMode ? 'Work' : 'Chat';
  document.querySelectorAll('[data-mode-tab]').forEach((tab) => tab.setAttribute('aria-pressed', String(tab.dataset.modeTab === selectedRuntimeMode)));
  for (const option of runtimeOptions) {
    option.setAttribute('aria-checked', String(option.dataset.runtimeMode === selectedRuntimeMode));
  }
  runtimeSwitcherMenu.hidden = true;
  runtimeSwitcherButton.setAttribute('aria-expanded', 'false');
  agentRuntimePanel.hidden = !agentMode;
  if (agentMode) {
    closeHistory();
    refreshActionRuntimeStatus();
    refreshWorkData();
  } else {
    loadHistory(conversation);
  }
  renderCompanionWorkspace();
  if (modeChanged) globalThis.window?.maiPresentation?.animateView(messagesElement);
}

function isWorkInspectorDrawer() {
  return selectedRuntimeMode === 'agent' && window.matchMedia('(max-width: 1319px)').matches;
}

function isCompanionInspectorDrawer() {
  return selectedRuntimeMode === 'chat';
}

function syncCompanionInspectorDrawer() {
  const drawer = isCompanionInspectorDrawer();
  if (!drawer) companionInspectorOpen = false;
  const open = drawer && companionInspectorOpen;
  chatApp.classList.toggle('companion-inspector-open', open);
  companionInspectorToggle.setAttribute('aria-expanded', String(open));
  companionContext.setAttribute('aria-hidden', String(drawer && !open));
  companionInspectorScrim.classList.toggle('history-scrim--hidden', !open);
  companionInspectorScrim.setAttribute('aria-hidden', String(!open));
}

function setCompanionInspectorOpen(open) {
  companionInspectorOpen = open === true && isCompanionInspectorDrawer();
  syncCompanionInspectorDrawer();
}

function syncWorkInspectorDrawer() {
  const drawer = isWorkInspectorDrawer();
  if (!drawer) workInspectorOpen = false;
  const open = drawer && workInspectorOpen;
  chatApp.classList.toggle('work-inspector-open', open);
  workInspectorToggle.setAttribute('aria-expanded', String(open));
  actionContext.setAttribute('aria-hidden', String(drawer && !open));
  workInspectorScrim.classList.toggle('history-scrim--hidden', !open);
  workInspectorScrim.setAttribute('aria-hidden', String(!open));
}

function setWorkInspectorOpen(open) {
  workInspectorOpen = open === true && isWorkInspectorDrawer();
  syncWorkInspectorDrawer();
}

function activeWorkProject() {
  return workProjects.find((project) => project.id === activeWorkProjectId) || null;
}

function activeWorkSession() {
  return workSessions.find((session) => session.id === activeWorkSessionId) || null;
}

function isUngroupedWorkProject(project) {
  return project?.name === '默认项目';
}

function workProjectLabel(project) {
  return isUngroupedWorkProject(project) ? '未归类任务' : (project?.name || 'Work');
}

function renderWorkProjects() {
  workProjectList.replaceChildren();
  const projects = workProjects.filter((project) => !isUngroupedWorkProject(project));
  const ungroupedProject = workProjects.find(isUngroupedWorkProject);
  workProjectEmpty.hidden = projects.length > 0;
  const appendTasks = (project, list) => {
    for (const session of allWorkSessions.filter((item) => item.projectId === project.id)) {
      const task = document.createElement('button');
      task.type = 'button';
      task.className = `agent-session-item agent-session-item--nested${session.id === activeWorkSessionId ? ' agent-session-item--active' : ''}`;
      const title = document.createElement('strong'); title.textContent = session.title || '新任务';
      const meta = document.createElement('small');
      meta.textContent = `${session.messages?.length || 0} 条消息 · ${new Date(session.updatedAt || session.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      task.append(title, meta);
      const viewIdentity = workRendererBindings.getIdentity();
      task.addEventListener('click', async () => {
        await workRendererBindings.selectSession(project.id, session.id, viewIdentity);
      });
      task.addEventListener('contextmenu', (event) => openConversationContextMenu(event, session, 'work'));
      list.appendChild(task);
    }
  };
  for (const project of projects) {
    const group = document.createElement('section');
    group.className = 'agent-project-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `agent-session-item${project.id === activeWorkProjectId ? ' agent-session-item--active' : ''}`;
    const title = document.createElement('strong'); title.textContent = project.name;
    const meta = document.createElement('small'); meta.textContent = project.workspacePath ? 'Workspace 已连接' : '尚未选择 Workspace';
    button.append(title, meta);
    const viewIdentity = workRendererBindings.getIdentity();
    button.addEventListener('click', async () => {
      await workRendererBindings.selectProject(project.id, viewIdentity);
    });
    group.appendChild(button);
    if (allWorkSessions.some((session) => session.projectId === project.id)) {
      const list = document.createElement('div');
      list.className = 'agent-project-group__tasks';
      appendTasks(project, list);
      group.appendChild(list);
    }
    workProjectList.appendChild(group);
  }
  if (ungroupedProject && allWorkSessions.some((session) => session.projectId === ungroupedProject.id)) {
    const group = document.createElement('section');
    group.className = 'agent-project-group agent-project-group--recent';
    const heading = document.createElement('span');
    heading.className = 'agent-project-group__heading';
    heading.textContent = '最近';
    const list = document.createElement('div');
    list.className = 'agent-project-group__tasks agent-project-group__tasks--recent';
    appendTasks(ungroupedProject, list);
    group.append(heading, list);
    workProjectList.appendChild(group);
  }
}

function workspaceRelativeLabel(relativePath) {
  return relativePath ? `Workspace/${relativePath}` : 'Workspace';
}

function renderWorkspacePreview() {
  const state = workspacePreview;
  workspacePreviewOverlay.hidden = !state?.entry;
  if (!state?.entry) return;
  workspacePreviewName.textContent = state.entry.name;
  workspacePreviewPath.textContent = workspaceRelativeLabel(state.entry.relativePath);
  workspacePreviewContent.hidden = state.status !== 'ready';
  workspacePreviewContent.textContent = state.status === 'ready' ? state.content : '';
  workspacePreviewStatus.textContent = state.status === 'loading'
    ? '正在安全读取本地文本文件…'
    : state.status === 'ready'
      ? '只读预览；不会发送给 Agent 或模型。'
      : (state.message || '此文件暂不支持文本预览。');
}

function renderWorkspaceExplorer() {
  const project = activeWorkProject();
  const viewIdentity = workRendererBindings.getExplorerIdentity();
  const configured = Boolean(project?.workspacePath);
  refreshActionWorkspaceButton.disabled = !configured || workspaceExplorerLoading;
  actionWorkspacePath.textContent = configured ? project.workspacePath : '选择后将在这里显示文件结构。';
  actionWorkspacePath.title = configured ? project.workspacePath : '';
  actionWorkspaceTree.replaceChildren();
  actionWorkspaceStale.hidden = !configured || !workspaceExplorerMayBeStale;
  if (!configured) {
    actionWorkspaceEmpty.hidden = false;
    actionWorkspaceEmpty.textContent = '选择 Workspace 后可查看其中的文件和文件夹。';
    return;
  }
  const root = workspaceExplorerListings.get('');
  if (!root) {
    actionWorkspaceEmpty.hidden = false;
    actionWorkspaceEmpty.textContent = workspaceExplorerLoading ? '正在读取 Workspace…' : '暂时无法读取此 Workspace。你可以刷新或重新选择。';
    return;
  }
  actionWorkspaceEmpty.hidden = root.entries?.length > 0;
  actionWorkspaceEmpty.textContent = root.entries?.length ? '' : '此文件夹为空。';
  const appendDirectory = (listing, depth, label) => {
    if (label) {
      const rootItem = document.createElement('div');
      rootItem.className = 'workspace-explorer__root';
      rootItem.style.setProperty('--workspace-depth', String(depth));
      rootItem.setAttribute('role', 'treeitem');
      rootItem.setAttribute('aria-level', String(depth + 1));
      rootItem.setAttribute('aria-expanded', 'true');
      const rootName = document.createElement('strong'); rootName.textContent = label;
      rootItem.append(rootName);
      actionWorkspaceTree.appendChild(rootItem);
    }
    if (listing.truncated) {
      const notice = document.createElement('p');
      notice.className = 'workspace-explorer__truncated';
      notice.textContent = `仅显示 ${listing.entries.length} 项；此目录还有更多内容。`;
      actionWorkspaceTree.appendChild(notice);
    }
    if (!listing.entries?.length && depth > 0) {
      const empty = document.createElement('p');
      empty.className = 'workspace-explorer__child-empty';
      empty.style.setProperty('--workspace-depth', String(depth + 1));
      empty.textContent = '此文件夹为空。';
      actionWorkspaceTree.appendChild(empty);
    }
    for (const entry of listing.entries || []) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `workspace-explorer__entry${workspaceExplorerSelection?.relativePath === entry.relativePath ? ' workspace-explorer__entry--selected' : ''}`;
      row.style.setProperty('--workspace-depth', String(depth + 1));
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-level', String(depth + 2));
      const expanded = entry.type === 'folder' && workspaceExplorerExpanded.has(entry.relativePath);
      if (entry.type === 'folder') row.setAttribute('aria-expanded', String(expanded));
      row.dataset.workspacePath = entry.relativePath;
      row.dataset.workspaceKind = entry.type;
      const icon = document.createElement('span');
      icon.className = 'workspace-explorer__icon';
      icon.textContent = entry.type === 'folder' ? (expanded ? '▾' : '▸') : '•';
      const name = document.createElement('span'); name.className = 'workspace-explorer__name'; name.textContent = entry.name;
      row.append(icon, name);
      row.title = workspaceRelativeLabel(entry.relativePath);
      row.addEventListener('click', () => {
        workRendererBindings.selectWorkspaceEntry(entry, viewIdentity);
      });
      row.addEventListener('keydown', async (event) => {
        if (entry.type !== 'folder') return;
        if (event.key === 'ArrowRight' && !workspaceExplorerExpanded.has(entry.relativePath)) { event.preventDefault(); row.click(); }
        if (event.key === 'ArrowLeft' && workspaceExplorerExpanded.has(entry.relativePath)) { event.preventDefault(); row.click(); }
      });
      actionWorkspaceTree.appendChild(row);
      if (entry.type === 'folder' && expanded) {
        const child = workspaceExplorerListings.get(entry.relativePath);
        if (child) appendDirectory(child, depth + 1, '');
      }
    }
  };
  appendDirectory(root, 0, project ? `${workProjectLabel(project)} · ${root.name || 'Workspace'}` : (root.name || 'Workspace'));
  renderWorkspacePreview();
}

function loadWorkspaceDirectory(relativePath = '') {
  return workRendererBindings.loadWorkspaceDirectory(relativePath, workRendererBindings.getExplorerIdentity());
}

function refreshWorkspaceExplorer() {
  return workRendererBindings.refreshWorkspace(workRendererBindings.getExplorerIdentity());
}

let lastWorkViewKey = '';
function renderActionWorkspace() {
  const workViewKey = `${selectedRuntimeMode}:${activeWorkProjectId}:${activeWorkSessionId}`;
  const preserveScroll = workViewKey === lastWorkViewKey;
  const oldScroll = messagesElement.scrollTop;
  const wasFollowing = globalThis.window?.maiPresentation?.isFollowing() !== false;
  lastWorkViewKey = workViewKey;
  globalThis.window?.maiPresentation?.beginHistory();
  const workState = workRendererBindings.getState();
  const workBusy = workState.busy;
  const available = actionRuntimeStatus?.available === true;
  const project = activeWorkProject();
  const selectedSession = activeWorkSession();
  workspaceLocation.textContent = '工作空间';
  activeSessionTitle.textContent = selectedSession?.title || workProjectLabel(project);
  conversationRuntimeEyebrow.textContent = '专注于此刻的工作';
  conversationModelBadge.textContent = available ? 'Work 已就绪' : 'Work 未启用';
  conversationMemoryBadge.textContent = '工作记录独立';
  runtimePrivacyNote.textContent = 'Work 的任务记录与陪伴聊天、长期记忆完全分开；完成内容不会自动写入记忆。';
  messageInput.placeholder = available ? '描述需要完成的工作…' : '先启用 Work 后再开始…';
  sendButton.textContent = '执行';
  sendButton.setAttribute('aria-label', '执行工作任务');
  voiceInputButton.hidden = true;
  agentRuntimeStatus.textContent = available
    ? 'Work 已就绪。把明确的任务交给我吧。'
    : (actionRuntimeStatus?.reason || 'Work 尚未启用。');
  actionContextStatus.textContent = project ? (available ? 'Work 运行时已准备就绪，可处理明确提交的任务。' : (actionRuntimeStatus?.reason || 'Work 运行时尚未启用。')) : '先创建或选择一个 Work Project。';
  actionContextRuntime.textContent = available ? 'Mai Work · DeepSeek 独立工具调用' : '未启用 · Mai 聊天不受影响';
  actionProjectStatus.textContent = project ? workProjectLabel(project) : '尚未选择项目。';
  actionWorkspaceStatus.textContent = project?.workspacePath
    ? `已选择：${project.workspacePath}`
    : '未选择；仅可使用安全本地工具。读取或修改文件会先要求单次确认。';
  renameWorkProjectButton.disabled = !project || isUngroupedWorkProject(project);
  renderWorkspaceExplorer();
  agentEnableButton.hidden = available;
  agentCancelButton.hidden = !workBusy || !(activeActionSessionId || actionRuntimeStatus?.activeSessionId);
  agentEventLog.replaceChildren();
  for (const agentEvent of actionEvents.slice(-8)) {
    const item = document.createElement('li');
    item.textContent = `${agentEvent.type}${agentEvent.payload?.toolName ? ` · ${agentEvent.payload.toolName}` : ''}`;
    agentEventLog.appendChild(item);
  }
  agentEventEmpty.hidden = actionEvents.length > 0;
  messageInput.disabled = !available || !project || workBusy;
  sendButton.disabled = !available || !project || workBusy;
  messagesElement.innerHTML = '';
  if (selectedSession) {
    for (const item of selectedSession.messages || []) addMessage(item.role, item.content, { history: true, createdAt: item.createdAt, operationResults: item.operationResults });
  } else if (!project) {
    addMessage('assistant', '还没有 Work Project。创建一个项目，把相关任务和 Workspace 放在一起。');
  } else if (!project.workspacePath) {
    addMessage('assistant', '先为这个项目选择 Workspace，随后就可以浏览和读取其中的文件。');
  } else {
    addMessage('assistant', available ? '新任务已经准备好了。要我帮你完成什么工作？' : 'Work 现在还没有启用。你可以随时开启它，Chat 不会受影响。');
  }
  if (workState.executionPending) addPendingMessage();
  renderWorkProjects();
  globalThis.window?.maiPresentation?.endHistory({ preserve: preserveScroll, top: oldScroll, follow: wasFollowing });
}

function refreshWorkData() {
  return workRendererBindings.refreshWorkData();
}

async function beginNewAction() {
  const identity = workRendererBindings.getIdentity();
  if (workRendererBindings.isCurrentModeBusy('agent')) { showNotice('请等待当前行动结束。'); return; }
  if (!identity.projectId) { showNotice('请先创建一个 Work Project。'); return; }
  try {
    const session = await workRendererBindings.createWorkSession(identity);
    if (session && workRendererBindings.isViewCurrent(session.rendererViewIdentity)
      && session.rendererViewIdentity.projectId === session.projectId
      && session.rendererViewIdentity.workSessionId === session.id) messageInput.focus();
  } catch (error) {
    if (workRendererBindings.isViewCurrent(identity)) showNotice(errorText(error));
  }
}

async function createWorkProject() {
  const identity = workRendererBindings.getIdentity();
  if (workRendererBindings.isCurrentModeBusy('agent')) return;
  const values = await openInputDialog({
    title: '新建 Work Project', description: '项目会拥有自己的 Workspace 和独立工作记录。', submitLabel: '创建项目',
    fields: [{ name: 'name', label: '项目名称', placeholder: '例如：课程资料', maxLength: 120 }]
  });
  if (!values?.name?.trim() || !workRendererBindings.isViewCurrent(identity)) return;
  try {
    const project = await workRendererBindings.createProject(values.name, identity);
    const current = workRendererBindings.getIdentity();
    if (!project || current.mode !== 'agent' || current.projectId !== project.id) return;
    showNotice('项目已创建。请为它选择一个 Workspace。');
    const selectedIdentity = await selectActionWorkspace();
    if (selectedIdentity && workRendererBindings.isViewCurrent(selectedIdentity)) messageInput.focus();
  } catch (error) {
    if (workRendererBindings.isViewCurrent(identity)) showNotice(errorText(error));
  }
}

async function renameCurrentWorkProject() {
  const identity = workRendererBindings.getIdentity();
  const project = activeWorkProject();
  if (!project) { showNotice('请先选择一个 Work Project。'); return; }
  const values = await openInputDialog({ title: '重命名 Work Project', submitLabel: '保存', fields: [{ name: 'name', label: '项目名称', value: project.name, maxLength: 120 }] });
  if (!values?.name?.trim() || !workRendererBindings.isViewCurrent(identity)) return;
  try { await workRendererBindings.renameProject(project.id, values.name, identity); }
  catch (error) { if (workRendererBindings.isViewCurrent(identity)) showNotice(errorText(error)); }
}

function renderActionSteps(steps) {
  const list = document.createElement('ol');
  list.className = 'action-result-steps';
  for (const step of steps) {
    const item = document.createElement('li');
    item.textContent = step.title || '已完成';
    list.appendChild(item);
  }
  messagesElement.appendChild(list);
}

function refreshActionRuntimeStatus() {
  return workRendererBindings.refreshRuntimeStatus();
}

async function selectActionWorkspace() {
  const identity = workRendererBindings.getIdentity();
  if (workRendererBindings.isCurrentModeBusy('agent')) { showNotice('请等待当前行动结束。'); return false; }
  if (!identity.projectId) { showNotice('请先创建一个 Work Project。'); return false; }
  const selected = await workRendererBindings.selectWorkspace(identity);
  if (!selected) return null;
  const selectedIdentity = workRendererBindings.getIdentity();
  return selectedIdentity.mode === 'agent' && selectedIdentity.projectId === identity.projectId
    ? selectedIdentity
    : null;
}

async function enableActionRuntime() {
  const identity = workRendererBindings.getIdentity();
  try {
    await workRendererBindings.configureEnabled(identity);
    if (!workRendererBindings.isViewCurrent(identity)) return;
    hideNotice();
    messageInput.focus();
  } catch (error) {
    if (workRendererBindings.isViewCurrent(identity)) showNotice(errorText(error));
  }
}

async function sendActionMessage() {
  const content = messageInput.value.trim();
  const identity = workRendererBindings.getIdentity();
  if (!content || workRendererBindings.isCurrentModeBusy('agent') || actionRuntimeStatus?.available !== true || !identity.projectId) return;
  const project = activeWorkProject();
  if (!project?.workspacePath && /(?:文件|文件夹|目录|workspace|readme|读取|查看|浏览|打开)/i.test(content)) {
    showNotice('请先选择这个项目的 Workspace；选择后即可浏览和读取其中的文件。');
    await selectActionWorkspace();
    return;
  }
  if (!workRendererBindings.isViewCurrent(identity)) return;
  hideNotice();
  messageInput.value = '';
  const selectedPath = workspaceExplorerSelection?.relativePath || '';
  const response = await workRendererBindings.executeAction(content, selectedPath, identity);
  if (response && workRendererBindings.isViewCurrent(response.rendererViewIdentity)) messageInput.focus();
}

async function cancelAction() {
  return workRendererBindings.cancelAction(workRendererBindings.getIdentity());
}

function renderHistory() {
  historyList.replaceChildren();
  const visibleSessions = runtimeSessions;
  historyEmpty.classList.toggle('history-empty--hidden', visibleSessions.length > 0);
  clearHistoryButton.disabled = visibleSessions.length === 0;
  for (const session of visibleSessions) {
    const item = document.createElement('article');
    item.className = `history-item${session.id === activeChatSessionId() ? ' history-item--active' : ''}`;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.dataset.chatSessionId = session.id;
    const main = document.createElement('div');
    main.className = 'history-item__main';
    const title = document.createElement('p');
    title.className = 'history-item__title';
    title.textContent = session.title || '新对话';
    const preview = document.createElement('p');
    preview.className = 'history-item__preview';
    preview.textContent = session.preview || '还没有消息';
    const meta = document.createElement('span');
    meta.className = 'history-item__meta';
    meta.textContent = `${historyDate(session.updatedAt)} · ${session.messageCount} 条`;
    main.append(title, preview, meta);
    const actions = document.createElement('div');
    actions.className = 'history-item__actions';
    const renameButton = document.createElement('button');
    renameButton.className = 'history-item__control history-item__rename';
    renameButton.type = 'button';
    renameButton.textContent = '✎';
    renameButton.title = '重命名这段对话';
    renameButton.setAttribute('aria-label', `重命名“${session.title || '这段对话'}”`);
    renameButton.addEventListener('click', async (event) => { event.stopPropagation(); await renameConversationSession(session, 'chat'); });
    const deleteButton = document.createElement('button');
    deleteButton.className = 'history-item__control history-item__delete';
    deleteButton.type = 'button';
    deleteButton.textContent = '×';
    deleteButton.title = '删除这段历史';
    deleteButton.setAttribute('aria-label', `删除“${session.title || '这段对话'}”`);
    deleteButton.addEventListener('click', async (event) => { event.stopPropagation(); await deleteConversationSession(session, 'chat'); });
    actions.append(renameButton, deleteButton);
    const selectSession = async () => {
      if (session.id === activeChatSessionId()) { closeHistory(); return; }
      try { applyChatState(await api.selectChatSession(session.id)); closeHistory(); }
      catch (error) { showNotice(errorText(error)); }
    };
    item.addEventListener('click', selectSession);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSession(); }
    });
    item.addEventListener('contextmenu', (event) => openConversationContextMenu(event, session));
    item.append(main, actions);
    historyList.appendChild(item);
  }
}

function projectChatState(state) {
  closeConversationContextMenu();
  chatWorkspaceStatus = { granted: false, operations: [] };
  renderChatWorkspaceCapability();
  runtimeSessions = Array.isArray(state?.sessions) ? state.sessions : [];
  loadHistory(Array.isArray(state?.messages) ? state.messages : []);
  renderHistory();
  renderCompanionWorkspace();
  refreshChatWorkspaceCapability().catch(() => {
    if (!chatTurnCoordinator.getState().disposed) renderChatWorkspaceCapability();
  });
}

function applyChatState(state) {
  return chatTurnCoordinator.applyChatState(state);
}

async function beginNewChat() {
  if (chatTurnCoordinator.getState().busy) { showNotice('请等麻衣回复完这一条消息。'); return; }
  try {
    applyChatState(await api.newChatSession());
    closeHistory();
    hideNotice();
    showNotice('已开始一段新的对话，旧对话和长期记忆都还在。');
    messageInput.focus();
  } catch (error) { showNotice(errorText(error)); }
}

async function clearAllHistory() {
  if (!window.confirm('确定清空全部聊天历史吗？长期记忆会保留，此操作无法撤销。')) return;
  clearHistoryButton.disabled = true;
  try {
    applyChatState(await api.clearChatHistory());
    closeHistory();
    showNotice('聊天历史已清空，长期记忆仍然保留。');
  } catch (error) { showNotice(errorText(error)); }
  finally { clearHistoryButton.disabled = false; }
}

function scrollToLatest() {
  globalThis.window?.maiPresentation?.scrollLatest();
}

function messageTimestamp(value = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { label: '', iso: '' };
  }
  return {
    label: date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }),
    iso: date.toISOString()
  };
}

function addMessage(role, content, options = {}) {
  if (role === 'assistant' && selectedRuntimeMode === 'chat' && window.MaiStructuredReply) {
    content = window.MaiStructuredReply.visibleHistoryText(content);
  }
  messagesElement.querySelector('.runtime-welcome')?.remove();
  const article = document.createElement('article');
  article.className = `message message--${role}${options.history ? "" : " message--new"}`;
  if (role === 'assistant') {
    const avatar = document.createElement('img');
    avatar.className = 'message-avatar';
    avatar.alt = '';
    avatar.src = avatarPath('mai');
    article.appendChild(avatar);
  }
  if (options.messageId) {
    article.dataset.messageId = String(options.messageId);
  }
  if (options.proactive) {
    article.classList.add('message--proactive');
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = content;
  const timestamp = messageTimestamp(options.createdAt);
  const time = document.createElement('time');
  time.className = 'message-time';
  time.textContent = timestamp.label;
  if (timestamp.iso) {
    time.dateTime = timestamp.iso;
  }
  article.append(bubble);
  const operationCards = renderOperationResultCards(options.operationResults);
  if (operationCards) article.append(operationCards);
  article.append(time);
  messagesElement.appendChild(article);
  scrollToLatest();
  return article;
}

function renderOperationResultCards(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const container = document.createElement('section');
  container.className = 'work-operation-results';
  container.setAttribute('aria-label', 'Workspace 操作结果');
  for (const result of results) {
    const card = document.createElement('article');
    card.className = `work-operation-result${result?.ok === true ? ' work-operation-result--success' : ' work-operation-result--failure'}`;
    const title = document.createElement('strong');
    title.textContent = result?.title || (result?.ok === true ? '操作完成' : '操作未完成');
    const path = document.createElement('p');
    const source = String(result?.sourcePath || '');
    const destination = String(result?.destinationPath || result?.path || '');
    path.textContent = source && destination ? `${source}  →  ${destination}` : (destination || source || '当前 Workspace');
    card.append(title, path);
    if (result?.ok !== true) {
      const detail = document.createElement('small');
      detail.textContent = result?.error?.userMessage || '无法完成这项 Workspace 操作。';
      card.append(detail);
    }
    container.appendChild(card);
  }
  return container;
}

function showWelcomeMessage() {
  messagesElement.innerHTML = '';
  conversation = [];
  const welcome = document.createElement('section');
  welcome.className = 'runtime-welcome runtime-welcome--chat';
  const mark = document.createElement('div');
  mark.className = 'runtime-welcome__mark';
  mark.textContent = 'M';
  const title = document.createElement('h2');
  title.textContent = chatConfig.configured ? '今天，想聊些什么？' : '让我们的第一段对话开始';
  const description = document.createElement('p');
  description.textContent = chatConfig.configured
    ? '不必想好开场白，从此刻的心情开始就好。'
    : '先连接模型。对话保存在本机，回复所需上下文会发送至你选择的模型服务。';
  const suggestions = document.createElement('div');
  suggestions.className = 'runtime-welcome__suggestions';
  if (!chatConfig.configured) {
    const connect = document.createElement('button');
    connect.type = 'button';
    connect.id = 'welcome-connect-model';
    connect.textContent = '连接模型';
    connect.addEventListener('click', () => openSettings('model'));
    suggestions.appendChild(connect);
  }
  const prompts = ['今天发生了一件事，想先告诉你', '陪我安静地聊一会儿', '帮我记住一个重要的约定'];
  for (const prompt of chatConfig.configured ? prompts : []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = prompt;
    button.addEventListener('click', () => {
      messageInput.value = prompt;
      resizeInput();
      messageInput.focus();
    });
    suggestions.appendChild(button);
  }
  welcome.append(mark, title, description, suggestions);
  messagesElement.appendChild(welcome);
}

function addPendingMessage() {
  const article = document.createElement('article');
  article.className = 'message message--assistant message--pending';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement('span');
    dot.className = 'typing-dot';
    bubble.appendChild(dot);
  }
  article.appendChild(bubble);
  messagesElement.appendChild(article);
  scrollToLatest();
  return article;
}

function resizeInput() {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
}

function configPayload() {
  return {
    apiKey: apiKeyInput.value,
    provider: modelProviderSelect.value,
    model: modelSelect.value,
    personality: personalitySelect.value,
    customPrompt: customPromptInput.value,
    memoryEnabled: memoryEnabledInput.checked,
    proactiveGreetingEnabled: proactiveEnabledInput.checked,
    proactiveIntervalMinutes: Number(proactiveIntervalMinutesInput.value),
    proactiveDailyLimit: Number(proactiveDailyLimitInput.value),
    girlfriendModeEnabled: girlfriendEnabledInput.checked,
    girlfriendIntervalMinutes: Number(girlfriendIntervalMinutesInput.value),
    girlfriendMaxFollowUps: Number(girlfriendMaxFollowUpsInput.value),
    momentsEnabled: momentsEnabledInput.checked,
    voice: {
      autoReadReplies: voiceAutoReadInput.checked,
      engine: voiceEngineSelect.value === 'system' ? 'system' : 'local',
      culture: voiceCultureSelect.value || 'zh-CN',
      voiceName: voiceNameSelect.value,
      rate: Number(voiceRateInput.value),
      pitch: Number(voicePitchInput.value),
      volume: Number(voiceVolumeInput.value)
    },
    weatherEnabled: weatherEnabledInput.checked,
    weatherCity: weatherCityInput.value,
    appearance: appearancePayload()
  };
}

async function sendWorkspaceIntent(content, intent) {
  const sessionId = activeChatSessionId();
  const modeGeneration = runtimeModeGeneration;
  const chatView = chatTurnCoordinator.getState();
  const isCurrentChatView = () => !chatTurnCoordinator.getState().disposed
    && selectedRuntimeMode === 'chat'
    && runtimeModeGeneration === modeGeneration
    && activeChatSessionId() === sessionId
    && chatTurnCoordinator.isViewCurrent(chatView);
  try {
    const result = await api.executeChatWorkspaceCapability({
      sessionId,
      operation: intent.operation,
      relativePath: intent.relativePath
    });
    if (!isCurrentChatView()) return null;
    if (!result?.ok || !result.execution?.contextId) throw new Error(workspaceErrorText(result));
    return sendMessage({ content, skipWorkspaceIntent: true, workspaceContextId: result.execution.contextId });
  } catch (error) {
    if (isCurrentChatView()) {
      showNotice(errorText(error));
      refreshChatWorkspaceCapability().catch(() => {});
    }
    return null;
  }
}

function removeOptimisticMessage(targetConversation, message) {
  const index = targetConversation.indexOf(message);
  if (index >= 0) targetConversation.splice(index, 1);
}

async function cancelChatUiTurn() {
  await chatTurnCoordinator.cancelCurrentTurn({ onError: (error) => showNotice(errorText(error)) });
}

async function sendMessage(options = {}) {
  if (selectedRuntimeMode !== 'chat') return null;
  const content = String(options.content ?? messageInput.value).trim();
  if (!content || chatTurnCoordinator.getState().busy) return;
  if (!chatConfig.configured) {
    showNotice('请先设置 DeepSeek API Key。');
    openSettings();
    return;
  }

  if (options.voiceMode !== true && options.skipWorkspaceIntent !== true) {
    const intent = workspaceIntentFromChat(content);
    if (intent) {
      if (!chatWorkspaceStatus?.granted) {
        messageInput.value = '';
        resizeInput();
        pendingWorkspaceRequest = { content, intent };
        pendingWorkspaceRequest.card = renderWorkspaceRequestCard(content, intent);
        return;
      }
      return sendWorkspaceIntent(content, intent);
    }
  }

  hideNotice();
  messageInput.value = '';
  resizeInput();
  const requestSessionId = activeChatSessionId();
  const turnConversation = conversation;
  const optimisticUserMessage = { role: 'user', content };
  const optimisticUserElement = addMessage('user', content, { createdAt: new Date().toISOString() });
  turnConversation.push(optimisticUserMessage);
  const pending = addPendingMessage();
  const turn = chatTurnCoordinator.beginTurn({
    sessionId: requestSessionId,
    removeOptimistic: () => {
      optimisticUserElement.remove();
      removeOptimisticMessage(turnConversation, optimisticUserMessage);
    },
    removePending: () => pending.remove()
  });
  if (!turn) {
    pending.remove();
    optimisticUserElement.remove();
    removeOptimisticMessage(turnConversation, optimisticUserMessage);
    messageInput.value = content;
    resizeInput();
    return null;
  }

  return chatTurnCoordinator.runTurn(turn, {
    send: () => api.sendChat({
      sessionId: requestSessionId,
      messages: turnConversation,
      voiceMode: options.voiceMode === true,
      voiceProfile: options.voiceProfile || {},
      workspaceContextId: options.workspaceContextId || ''
    }),
    onReply: async (result, currentTurn) => {
      if (!currentTurn.isCurrent()
        || activeChatSessionId() !== requestSessionId
        || conversation !== turnConversation) return;
      addMessage('assistant', result.content, { createdAt: result.createdAt });
      turnConversation.push({ role: 'assistant', content: result.content });
      conversation = turnConversation.slice(-MAX_RENDER_CONTEXT_MESSAGES);
      if (!currentTurn.isCurrent()) return;
      if (Array.isArray(result.sessions)) runtimeSessions = result.sessions;
      setMood(result);
      const replyView = chatTurnCoordinator.getState();
      if (options.voiceMode === true || voiceConfig().autoReadReplies) {
        speakText(result.content, {
          emotion: result.emotion,
          voiceProfile: options.voiceProfile
        }).catch((error) => {
          if (chatTurnCoordinator.isViewCurrent(replyView)) showNotice(errorText(error));
        });
      }
      if (chatConfig.memoryEnabled) refreshMemories(() => chatTurnCoordinator.isViewCurrent(replyView));
      refreshLifeState(() => chatTurnCoordinator.isViewCurrent(replyView));
      renderHistory();
      renderCompanionWorkspace();
    },
    onError: (error, currentTurn) => {
      if (!currentTurn.isCurrent()) return;
      showNotice(errorText(error));
      // Keep the user's draft available. Retrying is an explicit edit/send, never an automatic request.
      if (!messageInput.value.trim()) messageInput.value = content;
      resizeInput();
      const recover = document.createElement('button');
      recover.type = 'button';
      recover.className = 'notice-recover';
      recover.textContent = '编辑后重试';
      recover.addEventListener('click', () => messageInput.focus());
      notice.appendChild(recover);
    }
  });
}

async function saveSettings() {
  saveSettingsButton.disabled = true;
  setSettingsStatus('正在保存…');
  try {
    const config = await api.saveChatConfig(configPayload());
    setConnection(config);
    populateSettings();
    setSettingsStatus('设置已保存。');
    hideNotice();
    refreshLifeState();
  } catch (error) {
    setSettingsStatus(errorText(error), true);
  } finally {
    saveSettingsButton.disabled = false;
  }
}

async function testConnection() {
  testConnectionButton.disabled = true;
  setSettingsStatus('正在连接 DeepSeek…');
  try {
    const config = await api.saveChatConfig(configPayload());
    setConnection(config);
    populateSettings();
    await api.testChatConnection();
    setSettingsStatus('连接成功，麻衣已经可以和你聊天了。');
    hideNotice();
  } catch (error) {
    setSettingsStatus(errorText(error), true);
  } finally {
    testConnectionButton.disabled = false;
  }
}

async function previewGreeting() {
  previewGreetingButton.disabled = true;
  try {
    const config = await api.saveChatConfig(configPayload());
    setConnection(config);
    populateSettings();
    const greeting = await api.sendProactiveGreeting();
    setMood(greeting);
    setSettingsStatus('已主动发起一个新话题。');
  } catch (error) {
    setSettingsStatus(errorText(error), true);
  } finally {
    previewGreetingButton.disabled = false;
  }
}

async function previewGirlfriendMessage() {
  previewGirlfriendButton.disabled = true;
  try {
    const config = await api.saveChatConfig(configPayload());
    setConnection(config);
    populateSettings();
    const message = await api.sendGirlfriendMessage();
    if (message) {
      setMood(message);
    }
    setSettingsStatus('已发送一条女友模式主动消息。');
  } catch (error) {
    setSettingsStatus(errorText(error), true);
  } finally {
    previewGirlfriendButton.disabled = !girlfriendEnabledInput.checked;
  }
}

async function clearApiKey() {
  clearKeyButton.disabled = true;
  try {
    const config = await api.clearApiKey();
    setConnection(config);
    apiKeyInput.value = '';
    keyHint.textContent = 'Key 会使用 Windows 系统加密并仅保存在本机。';
    if (window.maiSettingsView?.isDirty()) updateAppearancePreview();
    setSettingsStatus('本机保存的 API Key 已清除。');
  } catch (error) {
    setSettingsStatus(errorText(error), true);
  } finally {
    clearKeyButton.disabled = !chatConfig.configured;
  }
}

const EPISODE_CATEGORY_LABELS = {
  milestone: '重要节点',
  emotion: '情绪时刻',
  relationship: '关系回忆',
  achievement: '值得庆祝',
  setback: '困难时刻',
  health: '健康经历',
  daily: '生活片段',
  other: '共同回忆'
};

const TOPIC_STATUS_LABELS = {
  active: '继续关注',
  waiting: '等待回答',
  resolved: '已经完成',
  paused: '暂时搁置'
};

function sharedLifeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function miniAction(label, title, onClick, danger = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `mini-action${danger ? ' mini-action--danger' : ''}`;
  button.textContent = label;
  button.title = title;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await onClick();
    } catch (error) {
      showNotice(errorText(error));
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

const TIMELINE_TYPE_LABELS = {
  episode: '共同事件',
  memory: '长期记忆',
  moment: '私人动态',
  task: '生活事项',
  relationship: '人物关系',
  project: '项目目标',
  habit: '持续习惯',
  manual: '手动记录'
};

async function locateOriginalSource(source = {}) {
  const result = await api.locateSource({
    sessionId: source.sessionId || source.sourceSessionId,
    messageId: source.messageId || source.sourceMessageId,
    evidence: source.evidence
  });
  if (!result?.found) {
    showNotice('这条内容对应的历史对话可能已经被删除，暂时无法定位原话。');
    return;
  }
  applyChatState(result);
  closeSharedLife();
  closeMemory();
  setTimeout(() => {
    const target = messagesElement.querySelector(`[data-message-id="${CSS.escape(result.targetMessageId)}"]`);
    if (!target) return;
    target.classList.add('message--source-highlight');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => target.classList.remove('message--source-highlight'), 2200);
  }, 80);
}

function renderLifeHubCollections() {
  const timeline = Array.isArray(lifeHubState?.timeline) ? lifeHubState.timeline : [];
  const people = Array.isArray(lifeHubState?.people) ? lifeHubState.people : [];
  const digests = Array.isArray(lifeHubState?.digests) ? lifeHubState.digests : [];
  timelineList.innerHTML = '';
  peopleList.innerHTML = '';
  digestsList.innerHTML = '';
  timelineEmpty.classList.toggle('memory-empty--hidden', timeline.length > 0);
  peopleEmpty.classList.toggle('memory-empty--hidden', people.length > 0);
  digestsEmpty.classList.toggle('memory-empty--hidden', digests.length > 0);

  for (const entry of timeline) {
    const article = document.createElement('article');
    article.className = `hub-item${entry.pinned ? ' hub-item--pinned' : ''}`;
    const content = document.createElement('div');
    content.className = 'hub-item__content';
    const title = document.createElement('strong');
    title.textContent = entry.title;
    const summary = document.createElement('p');
    summary.textContent = entry.summary;
    const meta = document.createElement('small');
    meta.textContent = `${sharedLifeDate(entry.occurredAt)} · ${TIMELINE_TYPE_LABELS[entry.type] || entry.type} · 重要度 ${entry.importance || 1}/5`;
    content.append(title, summary, meta);
    const actions = document.createElement('div');
    actions.className = 'hub-item__actions';
    if (entry.source?.messageId || entry.source?.evidence) {
      actions.append(miniAction('查看原话', '回到产生这条记录的历史消息', () => locateOriginalSource(entry.source)));
    }
    article.append(content, actions);
    timelineList.appendChild(article);
  }

  for (const person of people) {
    const article = document.createElement('article');
    article.className = 'hub-item';
    const content = document.createElement('div');
    content.className = 'hub-item__content';
    const title = document.createElement('strong');
    title.textContent = `${person.name} · ${person.relation}`;
    const notes = document.createElement('p');
    notes.textContent = person.notes || (person.manual ? '手动确认的人物关系' : '来自对话中的明确关系');
    const meta = document.createElement('small');
    meta.textContent = `${person.manual ? '手动确认' : `可信度 ${Math.round((person.confidence || 0) * 100)}%`} · 最近提及 ${sharedLifeDate(person.lastSeenAt)}`;
    content.append(title, notes, meta);
    const actions = document.createElement('div');
    actions.className = 'hub-item__actions';
    const evidence = person.evidence?.at(-1);
    if (evidence) actions.append(miniAction('查看原话', '回到最初提及这个人的消息', () => locateOriginalSource(evidence)));
    actions.append(
      miniAction('修正', '修改姓名、关系或备注', async () => {
        const values = await openInputDialog({
          title: '修正人物关系',
          description: '修改后的内容会作为今后理解你们关系的依据。',
          fields: [
            { name: 'name', label: '姓名或称呼', value: person.name, maxLength: 80 },
            { name: 'relation', label: '与你的关系', value: person.relation, maxLength: 80 },
            { name: 'notes', label: '备注', value: person.notes || '', type: 'textarea', required: false, maxLength: 800 }
          ]
        });
        if (!values) return;
        lifeHubState = await api.updatePerson(person.id, values);
        renderSharedLife();
      }),
      miniAction('删除', '删除这条人物关系', async () => {
        if (!window.confirm(`确定删除“${person.name}”的人物关系记录吗？`)) return;
        lifeHubState = await api.deletePerson(person.id);
        renderSharedLife();
      }, true)
    );
    article.append(content, actions);
    peopleList.appendChild(article);
  }

  for (const digest of digests) {
    const article = document.createElement('article');
    article.className = 'hub-item';
    const content = document.createElement('div');
    content.className = 'hub-item__content';
    const title = document.createElement('strong');
    title.textContent = `${digest.period === 'week' ? '周记' : '日记'} · ${digest.title}`;
    const summary = document.createElement('p');
    summary.textContent = digest.content;
    const meta = document.createElement('small');
    meta.textContent = `关联 ${digest.entryIds?.length || 0} 条时间线记录 · 本地自动整理`;
    content.append(title, summary, meta);
    article.appendChild(content);
    digestsList.appendChild(article);
  }

  renderDatabaseHealth(lifeHubState?.health);
}

function renderDatabaseHealth(health) {
  if (!health) {
    healthTitle.textContent = '尚未检查数据库';
    healthSummary.textContent = '';
    healthDetails.innerHTML = '';
    return;
  }
  const labels = { healthy: '数据库状态良好', warning: '数据库有可处理的提醒', error: '数据库需要修复' };
  healthTitle.textContent = labels[health.status] || '数据库检查完成';
  healthSummary.textContent = `${health.counts?.messages || 0} 条消息 · ${health.counts?.facts || 0} 条记忆 · ${health.counts?.projects || 0} 个项目 · ${health.counts?.habits || 0} 个习惯 · ${health.counts?.timeline || 0} 条时间线`;
  healthDetails.innerHTML = '';
  const messages = [...(health.errors || []), ...(health.warnings || [])];
  const detail = document.createElement('p');
  detail.textContent = messages.length ? messages.join('；') : `未发现结构错误；数据库大小约 ${(Number(health.bytes || 0) / 1024).toFixed(1)} KB。`;
  healthDetails.appendChild(detail);
}

const CONTINUITY_TYPE_LABELS = {
  conversation: '历史对话',
  memory: '长期记忆',
  timeline: '时间线',
  person: '人物',
  project: '项目',
  habit: '习惯',
  moment: '朋友圈',
  episode: '共同日记',
  topic: '未完话题'
};

const PROJECT_STATUS_LABELS = {
  active: '进行中',
  paused: '已暂停',
  completed: '已完成',
  archived: '已归档'
};

const HABIT_FREQUENCY_LABELS = {
  daily: '每天',
  weekdays: '工作日',
  weekly: '每周'
};

function renderContinuityCollections() {
  const projects = Array.isArray(continuityState?.projects) ? continuityState.projects : [];
  const habits = Array.isArray(continuityState?.habits) ? continuityState.habits : [];
  const reviews = Array.isArray(continuityState?.reviews) ? continuityState.reviews : [];
  projectsList.innerHTML = '';
  habitsList.innerHTML = '';
  reviewList.innerHTML = '';
  projectsEmpty.classList.toggle('memory-empty--hidden', projects.length > 0);
  habitsEmpty.classList.toggle('memory-empty--hidden', habits.length > 0);
  reviewEmpty.classList.toggle('memory-empty--hidden', reviews.length > 0);
  projectsSummary.textContent = `${projects.filter((item) => item.status === 'active').length} 个进行中项目 · 所有步骤和进度只保存在本机。`;
  habitsSummary.textContent = `${habits.filter((item) => item.active).length} 个启用习惯 · 今天还有 ${continuityState.summary?.dueHabits || 0} 项待完成。`;
  reviewSummary.textContent = reviews.length
    ? `${reviews.length} 条记忆建议核验。确认、修正或标记误会后会立即更新记忆账本。`
    : '没有需要核验的记忆，当前记忆账本很干净。';

  for (const project of projects) {
    const article = document.createElement('article');
    article.className = `hub-item${project.status === 'active' ? ' hub-item--pinned' : ''}`;
    article.dataset.projectId = project.id;
    const content = document.createElement('div');
    content.className = 'hub-item__content';
    const title = document.createElement('strong');
    title.textContent = project.title;
    const outcome = document.createElement('p');
    outcome.textContent = project.outcome || '还没有填写最终目标。';
    const meta = document.createElement('small');
    meta.textContent = `${PROJECT_STATUS_LABELS[project.status] || project.status} · 优先级 ${project.priority}/5 · 进度 ${project.progress || 0}%${project.targetAt ? ` · 目标 ${sharedLifeDate(project.targetAt)}` : ''}`;
    const progress = document.createElement('div');
    progress.className = 'continuity-progress';
    const progressBar = document.createElement('i');
    progressBar.style.width = `${Math.max(0, Math.min(100, Number(project.progress) || 0))}%`;
    progress.appendChild(progressBar);
    content.append(title, outcome, meta, progress);
    if (project.steps?.length) {
      const steps = document.createElement('div');
      steps.className = 'project-steps';
      for (const step of project.steps) {
        const row = document.createElement('label');
        row.className = `project-step${step.status === 'done' ? ' project-step--done' : ''}`;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = step.status === 'done';
        checkbox.addEventListener('change', async () => {
          checkbox.disabled = true;
          try {
            continuityState = await api.updateProjectStep(project.id, step.id, { status: checkbox.checked ? 'done' : 'todo' });
            renderSharedLife();
          } catch (error) {
            checkbox.checked = !checkbox.checked;
            checkbox.disabled = false;
            showNotice(errorText(error));
          }
        });
        const stepTitle = document.createElement('span');
        stepTitle.textContent = step.title;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = '删除步骤';
        remove.addEventListener('click', async (event) => {
          event.preventDefault();
          continuityState = await api.deleteProjectStep(project.id, step.id);
          renderSharedLife();
        });
        row.append(checkbox, stepTitle, remove);
        steps.appendChild(row);
      }
      content.appendChild(steps);
    }
    const actions = document.createElement('div');
    actions.className = 'hub-item__actions';
    if (project.source?.messageId || project.source?.evidence) {
      actions.append(miniAction('查看原话', '回到项目来源消息', () => locateOriginalSource(project.source)));
    }
    actions.append(miniAction('加步骤', '为项目添加一个可执行步骤', async () => {
      const values = await openInputDialog({
        title: '添加项目步骤',
        description: `项目：${project.title}`,
        submitLabel: '添加',
        fields: [{ name: 'title', label: '下一步要做什么', maxLength: 160 }]
      });
      if (!values) return;
      continuityState = await api.addProjectStep(project.id, { title: values.title });
      renderSharedLife();
    }));
    if (project.status === 'active') {
      actions.append(
        miniAction('完成', '标记整个项目已完成', async () => {
          continuityState = await api.updateProject(project.id, { status: 'completed' });
          renderSharedLife();
        }),
        miniAction('暂停', '暂时停止主动跟进', async () => {
          continuityState = await api.updateProject(project.id, { status: 'paused' });
          renderSharedLife();
        })
      );
    } else {
      actions.append(miniAction('继续', '重新开始项目', async () => {
        continuityState = await api.updateProject(project.id, { status: 'active' });
        renderSharedLife();
      }));
    }
    actions.append(
      miniAction('编辑', '修改项目名称与结果', async () => {
        const values = await openInputDialog({
          title: '编辑项目',
          description: '让麻衣继续围绕清晰的目标陪你推进。',
          fields: [
            { name: 'title', label: '项目名称', value: project.title, maxLength: 160 },
            { name: 'outcome', label: '想达到的结果', value: project.outcome || '', type: 'textarea', required: false, maxLength: 1000 }
          ]
        });
        if (!values) return;
        continuityState = await api.updateProject(project.id, values);
        renderSharedLife();
      }),
      miniAction('删除', '删除项目及其步骤', async () => {
        if (!window.confirm(`确定删除项目“${project.title}”吗？`)) return;
        continuityState = await api.deleteProject(project.id);
        renderSharedLife();
      }, true)
    );
    article.append(content, actions);
    projectsList.appendChild(article);
  }

  for (const habit of habits) {
    const article = document.createElement('article');
    article.className = `hub-item${habit.active && !habit.completedToday ? ' hub-item--pinned' : ''}`;
    article.dataset.habitId = habit.id;
    const content = document.createElement('div');
    content.className = 'hub-item__content';
    const title = document.createElement('strong');
    title.textContent = habit.title;
    const detail = document.createElement('p');
    detail.textContent = `${HABIT_FREQUENCY_LABELS[habit.frequency] || habit.frequency}目标 ${habit.targetPerPeriod} 次${habit.reminderTime ? ` · 希望 ${habit.reminderTime} 前完成` : ''}${habit.notes ? ` · ${habit.notes}` : ''}`;
    const meta = document.createElement('small');
    meta.textContent = `${habit.active ? '追踪中' : '已暂停'} · 本期 ${habit.currentCount || 0}/${habit.targetPerPeriod} · 连续 ${habit.streak || 0} 期${habit.completedToday ? ' · 今天已完成' : ''}`;
    content.append(title, detail, meta);
    const actions = document.createElement('div');
    actions.className = 'hub-item__actions';
    if (habit.source?.messageId || habit.source?.evidence) {
      actions.append(miniAction('查看原话', '回到习惯来源消息', () => locateOriginalSource(habit.source)));
    }
    if (habit.active && habit.dueToday) {
      actions.append(miniAction(habit.completedToday ? '撤销一次' : '今天打卡', '更新今天的完成次数', async () => {
        continuityState = await api.checkInHabit(habit.id, { undo: habit.completedToday });
        renderSharedLife();
      }));
    }
    actions.append(
      miniAction(habit.active ? '暂停' : '恢复', habit.active ? '暂停追踪与主动询问' : '恢复追踪', async () => {
        continuityState = await api.updateHabit(habit.id, { active: !habit.active });
        renderSharedLife();
      }),
      miniAction('编辑', '修改名称、目标或提醒时间', async () => {
        const values = await openInputDialog({
          title: '编辑习惯',
          description: '调整习惯名称与每期目标次数。',
          fields: [
            { name: 'title', label: '习惯名称', value: habit.title, maxLength: 120 },
            { name: 'targetPerPeriod', label: '每期目标次数', value: String(habit.targetPerPeriod), type: 'number', min: 1, max: 999, step: 1 }
          ]
        });
        if (!values) return;
        continuityState = await api.updateHabit(habit.id, { title: values.title, targetPerPeriod: Number(values.targetPerPeriod) });
        renderSharedLife();
      }),
      miniAction('删除', '删除习惯与打卡记录', async () => {
        if (!window.confirm(`确定删除习惯“${habit.title}”吗？`)) return;
        continuityState = await api.deleteHabit(habit.id);
        renderSharedLife();
      }, true)
    );
    article.append(content, actions);
    habitsList.appendChild(article);
  }

  for (const review of reviews) {
    const memory = review.fact;
    const article = document.createElement('article');
    article.className = 'hub-item';
    const content = document.createElement('div');
    content.className = 'hub-item__content';
    const title = document.createElement('strong');
    title.textContent = memory.text;
    const reason = document.createElement('p');
    reason.textContent = review.reason;
    const meta = document.createElement('small');
    meta.textContent = `${MEMORY_CATEGORY_LABELS[memory.category] || '其他'} · 可信度 ${Math.round((Number(memory.confidence) || 0) * 100)}% · ${memory.updatedAt ? memoryDate(memory.updatedAt) : '时间未知'}`;
    content.append(title, reason, meta);
    const actions = document.createElement('div');
    actions.className = 'hub-item__actions';
    if (memory.sourceMessageId || memory.evidence) {
      actions.append(miniAction('查看原话', '回到这条记忆的来源', () => locateOriginalSource({
        sessionId: memory.sourceSessionId, messageId: memory.sourceMessageId, evidence: memory.evidence
      })));
    }
    actions.append(
      miniAction('确认正确', '提高可信度并刷新确认时间', async () => {
        memories = await api.correctMemory(memory.id, 'confirm', {});
        continuityState = await api.getContinuity();
        renderMemories();
        renderSharedLife();
      }),
      miniAction('修正', '用当前正确说法替换', async () => {
        const values = await openInputDialog({
          title: '修正长期记忆',
          description: '请写下这件事现在准确的说法。',
          fields: [{ name: 'text', label: '正确内容', value: memory.text, type: 'textarea', maxLength: 360 }]
        });
        if (!values || values.text === memory.text) return;
        memories = await api.correctMemory(memory.id, 'update', { text: values.text });
        continuityState = await api.getContinuity();
        renderMemories();
        renderSharedLife();
      }),
      miniAction('误会', '删除并阻止相同错误再次写入', async () => {
        if (!window.confirm('确定把这条记忆标记为误会吗？')) return;
        memories = await api.correctMemory(memory.id, 'reject', {});
        continuityState = await api.getContinuity();
        renderMemories();
        renderSharedLife();
      }, true)
    );
    article.append(content, actions);
    reviewList.appendChild(article);
  }
}

async function runContinuitySearch() {
  const query = continuitySearchInput.value.trim();
  if (!query) {
    continuitySearchList.innerHTML = '';
    continuitySearchEmpty.classList.remove('memory-empty--hidden');
    continuitySearchSummary.textContent = '输入关键词即可搜索全部本地生活记录。';
    continuitySearchInput.focus();
    return;
  }
  runContinuitySearchButton.disabled = true;
  try {
    const results = await api.searchContinuity({ query, type: continuitySearchType.value, limit: 80 });
    continuitySearchList.innerHTML = '';
    continuitySearchEmpty.classList.toggle('memory-empty--hidden', results.length > 0);
    continuitySearchEmpty.textContent = results.length ? '' : '没有找到相关内容。可以换一个更具体的关键词。';
    continuitySearchSummary.textContent = `在本机找到 ${results.length} 条结果，没有调用 DeepSeek API。`;
    for (const result of results) {
      const article = document.createElement('article');
      article.className = 'hub-item';
      const content = document.createElement('div');
      content.className = 'hub-item__content';
      const title = document.createElement('strong');
      title.textContent = `${CONTINUITY_TYPE_LABELS[result.type] || result.type} · ${result.title}`;
      const snippet = document.createElement('p');
      snippet.textContent = result.snippet || '无补充内容';
      const meta = document.createElement('small');
      meta.textContent = `${result.updatedAt ? sharedLifeDate(result.updatedAt) : '时间未知'} · 匹配度 ${Math.round(result.score || 0)}`;
      content.append(title, snippet, meta);
      const actions = document.createElement('div');
      actions.className = 'hub-item__actions';
      if (result.source?.messageId || result.source?.evidence) {
        actions.append(miniAction('查看原处', '定位到原始聊天消息', () => locateOriginalSource(result.source)));
      }
      if (result.type === 'project') actions.append(miniAction('打开项目', '切换到项目页', () => selectSharedLifeTab('projects')));
      if (result.type === 'habit') actions.append(miniAction('打开习惯', '切换到习惯页', () => selectSharedLifeTab('habits')));
      article.append(content, actions);
      continuitySearchList.appendChild(article);
    }
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    runContinuitySearchButton.disabled = false;
  }
}

async function addManualProject() {
  const title = projectTitleInput.value.trim();
  if (!title) return projectTitleInput.focus();
  addProjectButton.disabled = true;
  try {
    continuityState = await api.addProject({
      title,
      outcome: projectOutcomeInput.value.trim(),
      targetAt: projectTargetInput.value ? new Date(projectTargetInput.value).toISOString() : '',
      priority: Number(projectPrioritySelect.value),
      status: 'active'
    });
    projectTitleInput.value = '';
    projectOutcomeInput.value = '';
    projectTargetInput.value = '';
    renderSharedLife();
    showNotice(`项目“${title}”已经建立。`);
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    addProjectButton.disabled = false;
  }
}

async function addManualHabit() {
  const title = habitTitleInput.value.trim();
  if (!title) return habitTitleInput.focus();
  addHabitButton.disabled = true;
  try {
    continuityState = await api.addHabit({
      title,
      frequency: habitFrequencySelect.value,
      targetPerPeriod: Number(habitTargetInput.value),
      reminderTime: habitReminderTimeInput.value,
      active: true
    });
    habitTitleInput.value = '';
    habitTargetInput.value = '1';
    habitReminderTimeInput.value = '';
    renderSharedLife();
    showNotice(`习惯“${title}”已经开始追踪。`);
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    addHabitButton.disabled = false;
  }
}

function renderSharedLife() {
  const world = lifeHubState?.world || sharedLifeState?.world || {};
  const episodes = Array.isArray(sharedLifeState?.episodes) ? sharedLifeState.episodes : [];
  const topics = Array.isArray(sharedLifeState?.topics) ? sharedLifeState.topics : [];
  const timeline = Array.isArray(lifeHubState?.timeline) ? lifeHubState.timeline : [];
  const people = Array.isArray(lifeHubState?.people) ? lifeHubState.people : [];
  const continuitySummary = continuityState?.summary || {};
  const openTopics = topics.filter((topic) => ['active', 'waiting'].includes(topic.status));
  worldLocation.textContent = world.location || '现实生活中';
  worldActivity.textContent = world.currentLabel || '正在过自己的生活';
  worldDetail.textContent = world.detail || '';
  const nextTime = world.nextAt ? sharedLifeDate(world.nextAt).split(' ').at(-1) : '';
  worldNext.textContent = world.nextLabel ? `${nextTime ? `${nextTime} · ` : ''}${world.nextLabel}` : '暂时没有安排';
  sharedLifeSummary.textContent = `${timeline.length} 条时间线 · ${continuitySummary.activeProjects || 0} 个项目 · ${continuityState.habits?.filter((item) => item.active).length || 0} 个习惯 · ${continuitySummary.reviewItems || 0} 条待核验记忆。`;
  episodesEmpty.classList.toggle('memory-empty--hidden', episodes.length > 0);
  topicsEmpty.classList.toggle('memory-empty--hidden', topics.length > 0);
  episodesList.innerHTML = '';
  topicsList.innerHTML = '';
  renderLifeHubCollections();
  renderContinuityCollections();

  for (const episode of episodes) {
    const article = document.createElement('article');
    article.className = `episode-item${episode.pinned ? ' episode-item--pinned' : ''}`;
    const marker = document.createElement('span');
    marker.className = `episode-item__marker episode-item__marker--${episode.emotion || 'neutral'}`;
    const content = document.createElement('div');
    content.className = 'episode-item__content';
    const title = document.createElement('strong');
    title.textContent = episode.title;
    const summary = document.createElement('p');
    summary.textContent = episode.summary;
    const meta = document.createElement('small');
    meta.textContent = `${sharedLifeDate(episode.sourceCreatedAt || episode.createdAt)} · ${EPISODE_CATEGORY_LABELS[episode.category] || '共同回忆'} · 重要度 ${episode.importance || 1}/5`;
    if (episode.evidence) article.title = `你的原话：${episode.evidence}`;
    content.append(title, summary, meta);
    const actions = document.createElement('div');
    actions.className = 'episode-item__actions';
    if (episode.sourceMessageId || episode.evidence) {
      actions.append(miniAction('查看原话', '回到记录这段回忆的历史消息', () => locateOriginalSource({
        sessionId: episode.sourceSessionId,
        messageId: episode.sourceMessageId,
        evidence: episode.evidence
      })));
    }
    actions.append(
      miniAction(episode.pinned ? '★' : '☆', episode.pinned ? '取消置顶' : '设为重要回忆', async () => {
        sharedLifeState = await api.updateEpisode(episode.id, { pinned: !episode.pinned });
        renderSharedLife();
      }),
      miniAction('修正', '修正这段共同回忆的描述', async () => {
        const values = await openInputDialog({
          title: '修正共同回忆',
          description: '修改后的描述会替换当前记录。',
          fields: [{ name: 'summary', label: '回忆描述', value: episode.summary, type: 'textarea', maxLength: 1200 }]
        });
        if (!values || values.summary === episode.summary) return;
        sharedLifeState = await api.updateEpisode(episode.id, { summary: values.summary });
        renderSharedLife();
      }),
      miniAction('删除', '删除这段共同回忆', async () => {
        if (!window.confirm(`确定删除“${episode.title}”吗？`)) return;
        sharedLifeState = await api.deleteEpisode(episode.id);
        renderSharedLife();
      }, true)
    );
    article.append(marker, content, actions);
    episodesList.appendChild(article);
  }

  for (const topic of topics) {
    const article = document.createElement('article');
    article.className = 'topic-item';
    const status = document.createElement('span');
    status.className = 'topic-status';
    status.textContent = TOPIC_STATUS_LABELS[topic.status] || topic.status;
    const content = document.createElement('div');
    content.className = 'topic-item__content';
    const title = document.createElement('strong');
    title.textContent = topic.title;
    const summary = document.createElement('p');
    summary.textContent = topic.pendingQuestion
      ? `${topic.summary}　等待回答：${topic.pendingQuestion}`
      : topic.summary;
    const meta = document.createElement('small');
    meta.textContent = `最近更新：${sharedLifeDate(topic.updatedAt)}`;
    content.append(title, summary, meta);
    const actions = document.createElement('div');
    actions.className = 'topic-item__actions';
    if (['active', 'waiting'].includes(topic.status)) {
      actions.append(
        miniAction('完成', '标记为已经结束', async () => {
          sharedLifeState = await api.setTopicStatus(topic.id, 'resolved');
          renderSharedLife();
        }),
        miniAction('暂停', '暂时不要主动追问', async () => {
          sharedLifeState = await api.setTopicStatus(topic.id, 'paused');
          renderSharedLife();
        })
      );
    } else {
      actions.append(miniAction('重启', '重新开始关注这个话题', async () => {
        sharedLifeState = await api.setTopicStatus(topic.id, 'active');
        renderSharedLife();
      }));
    }
    actions.append(miniAction('删除', '彻底删除这个话题', async () => {
      if (!window.confirm(`确定删除话题“${topic.title}”吗？`)) return;
      sharedLifeState = await api.deleteTopic(topic.id);
      renderSharedLife();
    }, true));
    article.append(status, content, actions);
    topicsList.appendChild(article);
  }
  renderCompanionWorkspace();
}

function selectSharedLifeTab(tab = 'timeline') {
  const entries = [
    ['timeline', timelineTab, timelinePanel],
    ['search', searchTab, searchPanel],
    ['projects', projectsTab, projectsPanel],
    ['habits', habitsTab, habitsPanel],
    ['review', reviewTab, reviewPanel],
    ['people', peopleTab, peoplePanel],
    ['digests', digestsTab, digestsPanel],
    ['episodes', episodesTab, episodesPanel],
    ['topics', topicsTab, topicsPanel],
    ['maintenance', maintenanceTab, maintenancePanel]
  ];
  for (const [name, button, panel] of entries) {
    const active = name === tab;
    button.classList.toggle('shared-life-tab--active', active);
    panel.classList.toggle('shared-life-panel--hidden', !active);
  }
}

async function refreshSharedLife() {
  try {
    [sharedLifeState, lifeHubState, continuityState] = await Promise.all([
      api.getSharedLife(), api.getLifeHub(), api.getContinuity()
    ]);
    renderSharedLife();
  } catch (error) {
    showNotice(errorText(error));
  }
}

async function rebuildSharedLifeFromHistory() {
  if (!window.confirm('将重新扫描历史对话，在本机补全共同事件、人物关系、统一时间线和每日/每周整理。不会额外调用 API，也不会先删除已有内容。继续吗？')) return;
  rebuildSharedLifeButton.disabled = true;
  try {
    const [sharedResult, hubResult] = await Promise.all([api.rebuildSharedLife(), api.rebuildLifeHub()]);
    sharedLifeState = sharedResult?.state || sharedLifeState;
    lifeHubState = hubResult?.state || lifeHubState;
    continuityState = await api.getContinuity();
    renderSharedLife();
    showNotice(`生活中枢整理完成：扫描 ${hubResult?.stats?.messages || 0} 条用户消息，现有 ${hubResult?.stats?.timeline || 0} 条时间线和 ${lifeHubState.people?.length || 0} 个人物关系。`);
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    rebuildSharedLifeButton.disabled = false;
  }
}

async function addManualPerson() {
  const name = personNameInput.value.trim();
  const relation = personRelationInput.value.trim();
  if (!name || !relation) {
    showNotice('请把人物姓名和与你的关系都写上。');
    (name ? personRelationInput : personNameInput).focus();
    return;
  }
  addPersonButton.disabled = true;
  try {
    lifeHubState = await api.addPerson({ name, relation, notes: personNotesInput.value.trim() });
    personNameInput.value = '';
    personRelationInput.value = '';
    personNotesInput.value = '';
    renderSharedLife();
    showNotice(`已经记住“${name}”与你的关系。`);
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    addPersonButton.disabled = false;
  }
}

async function refreshDatabaseHealth() {
  checkDatabaseButton.disabled = true;
  try {
    const health = await api.checkDatabase();
    lifeHubState = { ...lifeHubState, health };
    renderDatabaseHealth(health);
    showNotice(health.status === 'healthy' ? '数据库检查完成，没有发现结构错误。' : '数据库检查完成，请查看体检详情。');
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    checkDatabaseButton.disabled = false;
  }
}

async function createFullBackup() {
  createBackupButton.disabled = true;
  try {
    const result = await api.createBackup();
    if (!result?.canceled) showNotice(`完整备份已保存：${result.name}`);
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    createBackupButton.disabled = false;
  }
}

async function exportPortableData() {
  exportDataButton.disabled = true;
  try {
    const result = await api.exportData();
    if (!result?.canceled) showNotice(`个人数据已导出：${result.name}（不含 API Key）`);
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    exportDataButton.disabled = false;
  }
}

async function restoreFullBackup() {
  if (!window.confirm('恢复会替换备份覆盖的聊天、记忆、设置、知识索引、Work 记录和自定义图片。知识资料的原始文件仅保留路径引用。Mai 会先创建包含当前数据的恢复前备份。继续吗？')) return;
  restoreBackupButton.disabled = true;
  try {
    const result = await api.restoreBackup();
    if (result?.canceled) return;
    if (result?.writeProtectionActive) {
      showNotice(result.message || '备份恢复失败，Mai 已暂停本地数据写入。请重新启动以重试事务恢复。');
      return;
    }
    setConnection(result.config);
    memories = result.memories || [];
    memoryDiagnostics = result.diagnostics || memoryDiagnostics;
    lifeHubState = result.hub || lifeHubState;
    continuityState = result.continuity || continuityState;
    applyChatState(await api.getChatState());
    [sharedLifeState, lifeState, momentsState] = await Promise.all([
      api.getSharedLife(), api.getLifeState(), api.getMomentsState()
    ]);
    await refreshWorkData();
    renderMemories();
    renderSharedLife();
    renderLifeState();
    renderMoments();
    const notes = [];
    if (result.credentialsMissing) notes.push('本机没有可用 API Key，请在设置中重新配置');
    if (result.missingResources?.length) notes.push(`备份缺少：${result.missingResources.join('、')}`);
    if (result.unavailableKnowledgeSources?.length) notes.push(`${result.unavailableKnowledgeSources.length} 个知识资料源路径当前不可访问，已保留备份中的索引内容`);
    if (result.cleanupWarnings?.length) notes.push('恢复事务清理将在下次启动时继续');
    showNotice(`完整备份已恢复；恢复前的数据也已自动备份。${notes.length ? ` ${notes.join('；')}。` : ''}`);
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    restoreBackupButton.disabled = false;
  }
}

async function repairLocalDatabase() {
  if (!window.confirm('修复会重新规范化本地数据并重建人物、时间线和摘要；开始前会自动备份。继续吗？')) return;
  repairDatabaseButton.disabled = true;
  try {
    const result = await api.repairDatabase();
    lifeHubState = result.hub || { ...lifeHubState, health: result.after };
    renderSharedLife();
    showNotice(result.after?.status === 'healthy' ? '数据库修复完成，现在状态良好。' : '数据库已完成整理，请查看剩余提醒。');
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    repairDatabaseButton.disabled = false;
  }
}

function memoryDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN');
}

const MEMORY_CATEGORY_LABELS = {
  identity: '身份资料',
  preference: '喜好',
  relationship: '关系与称呼',
  goal: '长期目标',
  routine: '习惯',
  experience: '重要经历',
  boundary: '边界',
  other: '其他'
};

const MEMORY_TEMPORAL_LABELS = {
  historical: '过去',
  current: '当前',
  future: '未来',
  uncertain: '时间待确认'
};

function renderMemories() {
  memoryList.innerHTML = '';
  const factLimit = memoryDiagnostics?.maxStoredFacts || 10000;
  const contextLimit = memoryDiagnostics?.maxMemoryFactsPerRequest || 320;
  const modelContext = memoryDiagnostics?.contextWindowTokens === 1000000 ? '100 万 token' : '大上下文';
  memorySummary.textContent = memories.length
    ? `共 ${memories.length}/${factLimit} 条长期记忆；模型上下文 ${modelContext}，每轮按话题最多召回 ${contextLimit} 条。`
    : `长期记忆只保存在这台电脑上，最多可保存 ${factLimit} 条；可从历史对话重新提取。`;
  memoryEmpty.classList.toggle('memory-empty--hidden', memories.length > 0);
  clearMemoryButton.disabled = memories.length === 0;

  for (const memory of memories) {
    const item = document.createElement('article');
    item.className = `memory-item${memory.pinned ? ' memory-item--pinned' : ''}`;
    const content = document.createElement('div');
    content.className = 'memory-item__content';
    const text = document.createElement('p');
    text.textContent = memory.text;
    const meta = document.createElement('small');
    const confidence = Math.round(Math.max(0, Math.min(1, Number(memory.confidence) || 0)) * 100);
    const sourceLabel = memory.source === 'manual' ? '手动确认' : `聊天提取 · 可信度 ${confidence}%`;
    const temporalLabel = MEMORY_TEMPORAL_LABELS[memory.temporalStatus] || '';
    meta.textContent = `${memory.pinned ? '核心记忆 · ' : ''}${MEMORY_CATEGORY_LABELS[memory.category] || '其他'}${temporalLabel ? ` · ${temporalLabel}` : ''} · 重要度 ${memory.importance || 1}/5 · ${sourceLabel}${memory.confirmationCount > 1 ? ` · 确认 ${memory.confirmationCount} 次` : ''}${memory.updatedAt ? ` · ${memoryDate(memory.updatedAt)}` : ''}`;
    if (memory.evidence) {
      item.title = `用户原话：${memory.evidence}`;
    }
    content.append(text, meta);
    if (memory.cause || memory.effect) {
      const causal = document.createElement('small');
      causal.className = 'memory-item__causal';
      causal.textContent = [memory.cause ? `原因：${memory.cause}` : '', memory.effect ? `结果：${memory.effect}` : ''].filter(Boolean).join(' · ');
      content.appendChild(causal);
    }
    const correctionActions = document.createElement('div');
    correctionActions.className = 'memory-correction-actions';
    if (memory.sourceMessageId || memory.evidence) {
      correctionActions.append(miniAction('查看原话', '回到产生这条记忆的历史消息', () => locateOriginalSource({
        sessionId: memory.sourceSessionId,
        messageId: memory.sourceMessageId,
        evidence: memory.evidence
      })));
    }
    if (memory.source !== 'manual' || confidence < 100) {
      correctionActions.append(miniAction('✓ 正确', '确认这条记忆真实有效', async () => {
        memories = await api.correctMemory(memory.id, 'confirm', {});
        renderMemories();
      }));
    }
    correctionActions.append(
      miniAction('修正', '告诉麻衣这件事现在的正确说法', async () => {
        const values = await openInputDialog({
          title: '修正长期记忆',
          description: '请写下这件事现在准确的说法。',
          fields: [{ name: 'text', label: '正确内容', value: memory.text, type: 'textarea', maxLength: 360 }]
        });
        if (!values || values.text === memory.text) return;
        memories = await api.correctMemory(memory.id, 'update', { text: values.text });
        renderMemories();
      }),
      miniAction('这是误会', '删除并禁止再次自动记住同一错误', async () => {
        if (!window.confirm('确定这是麻衣的误会吗？这条记忆会被删除，并阻止相同错误再次被自动写入。')) return;
        memories = await api.correctMemory(memory.id, 'reject', {});
        renderMemories();
        showNotice('已经记下这是误会，以后不会再把同一内容当成事实。');
      }, true)
    );
    content.appendChild(correctionActions);
    const actions = document.createElement('div');
    actions.className = 'memory-item__actions';
    const pinButton = document.createElement('button');
    pinButton.className = `memory-pin${memory.pinned ? ' memory-pin--active' : ''}`;
    pinButton.type = 'button';
    pinButton.textContent = memory.pinned ? '★' : '☆';
    pinButton.title = memory.pinned ? '取消核心记忆' : '设为核心记忆';
    pinButton.addEventListener('click', async () => {
      pinButton.disabled = true;
      try {
        memories = await api.updateMemory(memory.id, {
          text: memory.text,
          key: memory.key,
          category: memory.category,
          importance: memory.importance,
          pinned: !memory.pinned
        });
        renderMemories();
      } catch (error) {
        pinButton.disabled = false;
        showNotice(errorText(error));
      }
    });
    const deleteButton = document.createElement('button');
    deleteButton.className = 'memory-delete';
    deleteButton.type = 'button';
    deleteButton.textContent = '×';
    deleteButton.title = '删除这条记忆';
    deleteButton.addEventListener('click', async () => {
      deleteButton.disabled = true;
      try {
        memories = await api.deleteMemory(memory.id);
        renderMemories();
      } catch (error) {
        showNotice(errorText(error));
      }
    });
    actions.append(pinButton, deleteButton);
    item.append(content, actions);
    memoryList.appendChild(item);
  }
  renderCompanionContext();
}

async function addManualMemory() {
  const text = memoryTextInput.value.trim();
  if (!text) {
    memoryTextInput.focus();
    return;
  }
  addMemoryButton.disabled = true;
  try {
    memories = await api.addMemory({
      text,
      category: memoryCategorySelect.value,
      importance: Number(memoryImportanceSelect.value)
    });
    memoryTextInput.value = '';
    renderMemories();
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    addMemoryButton.disabled = false;
  }
}

async function refreshMemories(isCurrent = () => true) {
  try {
    const [nextMemories, nextDiagnostics] = await Promise.all([
      api.getMemories(),
      api.getMemoryDiagnostics()
    ]);
    if (chatTurnCoordinator.getState().disposed || !isCurrent()) return false;
    memories = nextMemories;
    memoryDiagnostics = nextDiagnostics;
    renderMemories();
  } catch (error) {
    if (!chatTurnCoordinator.getState().disposed && isCurrent()) showNotice(errorText(error));
  }
}

async function rebuildMemoriesFromHistory() {
  if (!window.confirm('将重新扫描已保留的历史对话，只从你的原话中提取可验证事实。现有记忆不会被清空，冲突内容会保留修订记录。继续吗？')) {
    return;
  }
  rebuildMemoryButton.disabled = true;
  try {
    const result = await api.rebuildMemories();
    memories = Array.isArray(result?.memories) ? result.memories : memories;
    memoryDiagnostics = result?.diagnostics || memoryDiagnostics;
    renderMemories();
    const stats = result?.stats || {};
    showNotice(`历史记忆修复完成：扫描 ${stats.messages || 0} 条用户消息，新增 ${stats.added || 0} 条，更新 ${stats.updated || 0} 条。`);
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    rebuildMemoryButton.disabled = false;
  }
}

async function clearAllMemory() {
  if (!window.confirm('确定仅清空全部长期记忆吗？历史对话会保留，此操作无法撤销。')) {
    return;
  }
  clearMemoryButton.disabled = true;
  try {
    await api.clearMemory();
    memories = [];
    renderMemories();
    showNotice('长期记忆已清空，历史对话和当前上下文仍然保留。');
  } catch (error) {
    showNotice(errorText(error));
  } finally {
    clearMemoryButton.disabled = memories.length === 0;
  }
}

function loadHistory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    showWelcomeMessage();
    return;
  }
  globalThis.window?.maiPresentation?.beginHistory();
  messagesElement.innerHTML = '';
  conversation = history
    .filter((message) => ['user', 'assistant'].includes(message.role) && message.content)
    .map((message) => ({ role: message.role, content: message.content }))
    .slice(-MAX_RENDER_CONTEXT_MESSAGES);
  for (const message of history) {
    if (!['user', 'assistant'].includes(message.role) || !message.content) {
      continue;
    }
    addMessage(message.role, message.content, {
      history: true,
      proactive: message.proactive === true,
      createdAt: message.createdAt,
      messageId: message.id
    });
  }
  globalThis.window?.maiPresentation?.endHistory();
  const latestAssistant = history.slice().reverse().find((message) => message.role === 'assistant');
  if (latestAssistant) {
    setMood(latestAssistant);
  }
}

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  if (selectedRuntimeMode === 'agent') sendActionMessage();
  else if (chatTurnCoordinator.getState().activeTurnToken) cancelChatUiTurn();
  else sendMessage();
});
messageInput.addEventListener('input', resizeInput);
messageInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (selectedRuntimeMode === 'agent') sendActionMessage();
  else if (chatTurnCoordinator.getState().activeTurnToken) cancelChatUiTurn();
  else sendMessage();
});
runtimeSwitcherButton.addEventListener('click', () => {
  const willOpen = runtimeSwitcherMenu.hidden;
  runtimeSwitcherMenu.hidden = !willOpen;
  runtimeSwitcherButton.setAttribute('aria-expanded', String(willOpen));
});
document.querySelectorAll('[data-mode-tab]').forEach((tab) => tab.addEventListener('click', () => setRuntimeMode(tab.dataset.modeTab)));
document.getElementById('close-companion-inspector').addEventListener('click', () => setCompanionInspectorOpen(false));
document.getElementById('close-work-inspector').addEventListener('click', () => setWorkInspectorOpen(false));
for (const name of ['files', 'details']) {
  const tab = document.getElementById(`work-${name}-tab`);
  const select = () => {
    for (const other of ['files', 'details']) {
      const active = name === other;
      const button = document.getElementById(`work-${other}-tab`);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      document.getElementById(`work-${other}-panel`).hidden = !active;
    }
  };
  tab.addEventListener('click', select);
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'files' : event.key === 'End' ? 'details' : name === 'files' ? 'details' : 'files';
    const target = document.getElementById(`work-${next}-tab`);
    target.click(); target.focus();
  });
}
runtimeOptions.forEach((option) => option.addEventListener('click', () => setRuntimeMode(option.dataset.runtimeMode)));
workInspectorToggle.addEventListener('click', () => setWorkInspectorOpen(!workInspectorOpen));
workInspectorScrim.addEventListener('click', () => setWorkInspectorOpen(false));
companionInspectorToggle.addEventListener('click', () => setCompanionInspectorOpen(!companionInspectorOpen));
companionInspectorScrim.addEventListener('click', () => setCompanionInspectorOpen(false));
agentEnableButton.addEventListener('click', enableActionRuntime);
agentCancelButton.addEventListener('click', cancelAction);
newActionButton.addEventListener('click', beginNewAction);
newWorkProjectButton.addEventListener('click', createWorkProject);
renameWorkProjectButton.addEventListener('click', renameCurrentWorkProject);
refreshWorkDataButton.addEventListener('click', refreshWorkData);
agentSettingsButton.addEventListener('click', openSettings);
chooseCustomWallpaperButton.addEventListener('click', chooseCustomWallpaper);
clearCustomWallpaperButton.addEventListener('click', clearCustomWallpaper);
selectActionWorkspaceButton.addEventListener('click', selectActionWorkspace);
refreshActionWorkspaceButton.addEventListener('click', () => { refreshWorkspaceExplorer().catch((error) => showNotice(errorText(error))); });
closeWorkspacePreviewButton.addEventListener('click', () => {
  workRendererBindings.closeWorkspacePreview(workRendererBindings.getExplorerIdentity());
});
workspacePreviewOverlay.addEventListener('pointerdown', (event) => {
  if (event.target === workspacePreviewOverlay) closeWorkspacePreviewButton.click();
});
settingsButton.addEventListener('click', openSettings);
maiAvatarButton.addEventListener('click', () => openAvatarPicker('mai'));
agentAvatarButton.addEventListener('click', () => openAvatarPicker('mai'));
userAvatarButton.addEventListener('click', () => openAvatarPicker('user'));
memoryButton.addEventListener('click', openMemory);
assistantButton.addEventListener('click', () => api.openAssistant('today'));
knowledgeButton.addEventListener('click', () => api.openAssistant('knowledge'));
lifeButton.addEventListener('click', openLife);
sharedLifeButton.addEventListener('click', async () => { await openSharedLife(); selectSharedLifeTab('projects'); });
momentsButton.addEventListener('click', openMoments);
voiceCallButton.addEventListener('click', startVoiceCall);
voiceInputButton.addEventListener('click', startVoiceInput);
historyButton.addEventListener('click', openHistory);
workspaceSearchButton.addEventListener('click', openHistory);
workspaceSidebarToggle.addEventListener('click', () => {
  if (matchMedia('(max-width: 780px)').matches) {
    workspaceSidebarToggle.setAttribute('aria-expanded', String(chatApp.classList.toggle('small-sidebar-open')));
    return;
  }
  const collapsed = chatApp.classList.toggle('sidebar-collapsed');
  localStorage.setItem('mai-companion-sidebar-collapsed', collapsed ? '1' : '0');
});
document.querySelector('.chat-header').addEventListener('click', (event) => {
  if (event.target.closest('button') && chatApp.classList.contains('small-sidebar-open')) {
    chatApp.classList.remove('small-sidebar-open');
    workspaceSidebarToggle.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && chatApp.classList.contains('small-sidebar-open')) {
    chatApp.classList.remove('small-sidebar-open');
    workspaceSidebarToggle.setAttribute('aria-expanded', 'false');
    workspaceSidebarToggle.focus();
  }
});
contextOpenPlans.addEventListener('click', async () => { await openSharedLife(); selectSharedLifeTab('projects'); });
contextOpenSchedule.addEventListener('click', openLife);
openCompanionCenterButton.addEventListener('click', () => api.openAssistant('today'));
newChatButton.addEventListener('click', beginNewChat);
closeHistoryButton.addEventListener('click', closeHistory);
historyScrim.addEventListener('click', closeHistory);
sidebarNewChatButton.addEventListener('click', beginNewChat);
clearHistoryButton.addEventListener('click', clearAllHistory);
closeSettingsButton.addEventListener('click', closeSettings);
closeAvatarPickerButton.addEventListener('click', closeAvatarPicker);
chooseCustomAvatarButton.addEventListener('click', chooseCustomAvatar);
clearCustomAvatarButton.addEventListener('click', clearCustomAvatar);
closeMemoryButton.addEventListener('click', closeMemory);
doneMemoryButton.addEventListener('click', closeMemory);
closeSharedLifeButton.addEventListener('click', closeSharedLife);
doneSharedLifeButton.addEventListener('click', closeSharedLife);
closeLifeButton.addEventListener('click', closeLife);
doneLifeButton.addEventListener('click', closeLife);
closeMomentsButton.addEventListener('click', closeMoments);
endVoiceCallButton.addEventListener('click', endVoiceCall);
voiceCallMicButton.addEventListener('click', toggleVoiceCallMic);
voiceCallSpeakerButton.addEventListener('click', toggleVoiceCallSpeaker);
for (const [overlay, close] of [[avatarPickerOverlay, closeAvatarPicker], [settingsOverlay, closeSettings], [memoryOverlay, closeMemory], [sharedLifeOverlay, closeSharedLife], [lifeOverlay, closeLife], [momentsOverlay, closeMoments]]) overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) close(); });
inputDialogForm.addEventListener('submit', (event) => { event.preventDefault(); submitInputDialog(); });
inputDialogClose.addEventListener('click', () => closeInputDialog(null));
inputDialogCancel.addEventListener('click', () => closeInputDialog(null));
inputDialogOverlay.addEventListener('pointerdown', (event) => { if (event.target === inputDialogOverlay) closeInputDialog(null); });
conversationContextRename.addEventListener('click', async () => {
  const session = conversationContextSession();
  const kind = conversationContextKind;
  const workIdentity = conversationContextKind === 'work' ? conversationContextWorkIdentity : null;
  const workProjectId = conversationContextWorkProjectId;
  closeConversationContextMenu();
  await renameConversationSession(session, kind, workIdentity, workProjectId);
});
conversationContextDelete.addEventListener('click', async () => {
  const session = conversationContextSession();
  const kind = conversationContextKind;
  const workIdentity = conversationContextKind === 'work' ? conversationContextWorkIdentity : null;
  const workProjectId = conversationContextWorkProjectId;
  closeConversationContextMenu();
  await deleteConversationSession(session, kind, workIdentity, workProjectId);
});
document.addEventListener('pointerdown', (event) => {
  if (!conversationContextMenu.classList.contains('conversation-context-menu--hidden') && !conversationContextMenu.contains(event.target)) closeConversationContextMenu();
  if (!runtimeSwitcher.contains(event.target)) {
    runtimeSwitcherMenu.hidden = true;
    runtimeSwitcherButton.setAttribute('aria-expanded', 'false');
  }
});
window.addEventListener('blur', closeConversationContextMenu);
window.addEventListener('resize', () => { closeConversationContextMenu(); syncWorkInspectorDrawer(); syncCompanionInspectorDrawer(); });
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!runtimeSwitcherMenu.hidden) { runtimeSwitcherMenu.hidden = true; runtimeSwitcherButton.setAttribute('aria-expanded', 'false'); }
  else if (!workspacePreviewOverlay.hidden) closeWorkspacePreviewButton.click();
  else if (!inputDialogOverlay.classList.contains('input-dialog-overlay--hidden')) closeInputDialog(null);
  else if (!conversationContextMenu.classList.contains('conversation-context-menu--hidden')) closeConversationContextMenu();
  else if (!voiceCallOverlay.classList.contains('overlay--hidden')) endVoiceCall();
  else if (!avatarPickerOverlay.classList.contains('overlay--hidden')) closeAvatarPicker();
  else if (!settingsOverlay.classList.contains('overlay--hidden')) closeSettings();
  else if (!memoryOverlay.classList.contains('overlay--hidden')) closeMemory();
  else if (!sharedLifeOverlay.classList.contains('overlay--hidden')) closeSharedLife();
  else if (!lifeOverlay.classList.contains('overlay--hidden')) closeLife();
  else if (!momentsOverlay.classList.contains('overlay--hidden')) closeMoments();
  else if (workInspectorOpen) setWorkInspectorOpen(false);
  else if (companionInspectorOpen) setCompanionInspectorOpen(false);
  else if (!historySidebar.classList.contains('history-sidebar--closed')) closeHistory();
});
saveSettingsButton.addEventListener('click', saveSettings);
testConnectionButton.addEventListener('click', testConnection);
clearKeyButton.addEventListener('click', clearApiKey);
previewGreetingButton.addEventListener('click', previewGreeting);
previewGirlfriendButton.addEventListener('click', previewGirlfriendMessage);
clearMemoryButton.addEventListener('click', clearAllMemory);
rebuildMemoryButton.addEventListener('click', rebuildMemoriesFromHistory);
rebuildSharedLifeButton.addEventListener('click', rebuildSharedLifeFromHistory);
timelineTab.addEventListener('click', () => selectSharedLifeTab('timeline'));
searchTab.addEventListener('click', () => { selectSharedLifeTab('search'); setTimeout(() => continuitySearchInput.focus(), 30); });
projectsTab.addEventListener('click', () => selectSharedLifeTab('projects'));
habitsTab.addEventListener('click', () => selectSharedLifeTab('habits'));
reviewTab.addEventListener('click', () => selectSharedLifeTab('review'));
peopleTab.addEventListener('click', () => selectSharedLifeTab('people'));
digestsTab.addEventListener('click', () => selectSharedLifeTab('digests'));
episodesTab.addEventListener('click', () => selectSharedLifeTab('episodes'));
topicsTab.addEventListener('click', () => selectSharedLifeTab('topics'));
maintenanceTab.addEventListener('click', () => selectSharedLifeTab('maintenance'));
addPersonButton.addEventListener('click', addManualPerson);
runContinuitySearchButton.addEventListener('click', runContinuitySearch);
addProjectButton.addEventListener('click', addManualProject);
addHabitButton.addEventListener('click', addManualHabit);
checkDatabaseButton.addEventListener('click', refreshDatabaseHealth);
createBackupButton.addEventListener('click', createFullBackup);
restoreBackupButton.addEventListener('click', restoreFullBackup);
exportDataButton.addEventListener('click', exportPortableData);
repairDatabaseButton.addEventListener('click', repairLocalDatabase);
addMemoryButton.addEventListener('click', addManualMemory);
addLifeItemButton.addEventListener('click', addLifeItem);
refreshWeatherButton.addEventListener('click', refreshWeather);
resetMindButton.addEventListener('click', resetMind);
generateMomentButton.addEventListener('click', generateMoment);
testVoiceButton.addEventListener('click', testVoice);
installLocalVoiceButton.addEventListener('click', installLocalVoice);
voiceEngineSelect.addEventListener('change', updateVoiceEngineControls);
for (const slider of [voiceRateInput, voicePitchInput, voiceVolumeInput]) slider.addEventListener('input', updateVoiceSliderLabels);
for (const input of [appearanceThemeInput, appearanceGlassInput, appearanceDensityInput, appearanceTransparencyInput, appearanceScaleInput, appearanceMotionInput]) {
  input.addEventListener(input.type === 'range' ? 'input' : 'change', updateAppearancePreview);
}
lifeTitleInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); addLifeItem(); } });
memoryTextInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); addManualMemory(); } });
for (const input of [personNameInput, personRelationInput, personNotesInput]) input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); addManualPerson(); } });
continuitySearchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); runContinuitySearch(); } });
for (const input of [projectTitleInput, projectOutcomeInput]) input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); addManualProject(); } });
habitTitleInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); addManualHabit(); } });
girlfriendEnabledInput.addEventListener('change', () => { girlfriendIntervalMinutesInput.disabled = !girlfriendEnabledInput.checked; girlfriendMaxFollowUpsInput.disabled = !girlfriendEnabledInput.checked; previewGirlfriendButton.disabled = !girlfriendEnabledInput.checked; });
proactiveEnabledInput.addEventListener('change', () => { proactiveIntervalMinutesInput.disabled = !proactiveEnabledInput.checked; proactiveDailyLimitInput.disabled = !proactiveEnabledInput.checked; });
weatherEnabledInput.addEventListener('change', () => { weatherCityInput.disabled = !weatherEnabledInput.checked; if (weatherEnabledInput.checked) weatherCityInput.focus(); });
if ('speechSynthesis' in window) { window.speechSynthesis.addEventListener('voiceschanged', refreshSpeechVoices); refreshSpeechVoices(); }
try {
  chatApp.classList.toggle('sidebar-collapsed', localStorage.getItem('mai-companion-sidebar-collapsed') === '1');
} catch {
  // Local layout preferences are optional and never affect user data.
}
window.addEventListener('beforeunload', () => {
  chatTurnCoordinator.dispose();
  workRendererBindings.dispose();
  voiceCallActive = false;
  api.stopVoiceListening().catch(() => {});
  stopSpeaking();
  disposeCallMicrophoneMonitor();
  clearTimeout(portraitReactionTimer);
  clearInterval(voiceCallDurationTimer);
});

Promise.all([
  api.getChatConfig(), api.getChatState(), api.getMemories(), api.getMemoryDiagnostics(),
  api.getSharedLife(), api.getLifeHub(), api.getContinuity(), api.getLifeState(), api.getMomentsState(),
  api.getActionStatus().catch((error) => ({ enabled: false, available: false, reason: errorText(error) })), api.getWorkData().catch(() => ({ projects: [], sessions: [], lastOpenedProjectId: '' }))
]).then(([config, chatState, storedMemories, storedMemoryDiagnostics, storedSharedLife, storedLifeHub, storedContinuity, storedLifeState, storedMomentsState, storedActionRuntimeStatus, storedWorkData]) => {
  if (chatTurnCoordinator.getState().disposed) return;
  setConnection(config);
  memories = storedMemories;
  memoryDiagnostics = storedMemoryDiagnostics;
  sharedLifeState = storedSharedLife;
  lifeHubState = storedLifeHub;
  continuityState = storedContinuity;
  lifeState = storedLifeState;
  momentsState = storedMomentsState;
  workRendererBindings.setInitialRuntimeStatus(storedActionRuntimeStatus);
  workRendererBindings.setInitialData(storedWorkData);
  renderMemories(); renderSharedLife(); renderLifeState(); renderMoments(); applyChatState(chatState);
  setRuntimeMode('chat');
  refreshSpeechVoices(); refreshVoiceCapabilities();
  if (!config.configured) openSettings(); else messageInput.focus();
}).catch((error) => {
  if (!chatTurnCoordinator.getState().disposed) showNotice(errorText(error));
});

api.onShowChatSettings(openSettings);
api.onShowLifePanel(openLife);
chatTurnCoordinator.addDisposer(api.onVoiceStreamDelta(handleVoiceStreamDelta));
api.onLocalVoiceStatus((status) => {
  const current = voiceCapabilities.localTts || {};
  renderLocalVoiceStatus(status);
  if (status.ready && status.enhanced && (!current.ready || !current.enhanced)) setSettingsStatus('本地情绪女声与语气感知已经就绪。');
});
api.onMomentsUpdated((state) => { momentsState = state; renderMoments(); });
api.onSharedLifeUpdated((state) => { sharedLifeState = state; renderSharedLife(); });
api.onLifeHubUpdated((state) => { lifeHubState = state; renderSharedLife(); });
api.onContinuityUpdated((state) => { continuityState = state; renderSharedLife(); renderCompanionWorkspace(); });
window.addEventListener('focus', () => {
  if (selectedRuntimeMode !== 'agent') return;
  workRendererBindings.markWorkspaceStale(workRendererBindings.getExplorerIdentity());
});
api.onChatProactiveGreeting(async (payload) => {
  if (chatTurnCoordinator.getState().disposed) return;
  const eventView = chatTurnCoordinator.getState();
  if (!payload?.sessionId || payload.sessionId === eventView.sessionId) {
    const renderInChat = selectedRuntimeMode === 'chat';
    if (renderInChat) addMessage('assistant', payload.content, { proactive: true, createdAt: payload.createdAt, messageId: payload.id });
    conversation.push({ role: 'assistant', content: payload.content });
    conversation = conversation.slice(-MAX_RENDER_CONTEXT_MESSAGES);
    if (renderInChat) {
      setMood(payload);
      if (voiceConfig().autoReadReplies && !voiceCallActive) speakText(payload.content, { emotion: payload.emotion }).catch(() => {});
    }
  }
  try {
    const refreshed = await chatTurnCoordinator.refreshSessionMetadata(() => api.getChatState());
    if (refreshed) await refreshLifeState(() => chatTurnCoordinator.isViewCurrent(eventView));
  } catch {
    // The delivered message is still visible even if refreshing the sidebar fails.
  }
});

// Discard only the presentation draft; saved settings remain Main-owned.
document.getElementById('discard-settings').addEventListener('click', () => {
  populateSettings();
  setSettingsStatus('已还原为保存的设置。');
});

// Other feature entries can close Settings too; a temporary preview must not leak out.
let settingsWasVisible = false;
const settingsVisibilityObserver = new MutationObserver(() => {
  const visible = !settingsOverlay.classList.contains('overlay--hidden');
  if (settingsWasVisible && !visible) window.maiAppearance?.apply(chatConfig.appearance);
  settingsWasVisible = visible;
});
settingsVisibilityObserver.observe(settingsOverlay, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('pagehide', () => settingsVisibilityObserver.disconnect(), { once: true });
