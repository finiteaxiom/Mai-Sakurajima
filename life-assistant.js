const ASSISTANT_STATE_VERSION = 1;
const MAX_FOCUS_SESSIONS = 1500;
const MAX_USAGE_DAYS = 180;
const MAX_BRIEFINGS = 180;
const MAX_PROMISES = 800;
const FOCUS_MODES = new Set(['study', 'work', 'reading', 'creative', 'rest', 'custom']);

function cleanText(value, limit = 300) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function clamp(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? number : fallback));
}

function validIso(value, fallback = '') {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : fallback;
}

function localDateKey(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function minuteOfDay(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function parseClock(value, fallback) {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

function stableId(prefix, ...parts) {
  let hash = 2166136261;
  const text = parts.map((part) => String(part || '')).join('|');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function defaultAssistantState() {
  return {
    version: ASSISTANT_STATE_VERSION,
    promises: [],
    focusSessions: [],
    currentFocus: null,
    appUsage: {
      current: null,
      days: [],
      lastSampleAt: 0
    },
    briefings: [],
    eveningReviews: [],
    maiPlans: [],
    eventLedger: [],
    lastUpdatedAt: ''
  };
}

function normalizePromise(value = {}) {
  const now = new Date().toISOString();
  const title = cleanText(value.title, 140);
  const createdAt = validIso(value.createdAt, now);
  const status = ['open', 'completed', 'paused', 'missed'].includes(value.status)
    ? value.status
    : value.completed === true ? 'completed' : 'open';
  return {
    id: cleanText(value.id, 120) || stableId('promise', title, value.dueAt, createdAt),
    title,
    dueAt: validIso(value.dueAt),
    status,
    sourceItemId: cleanText(value.sourceItemId || value.id, 120),
    sourceSessionId: cleanText(value.sourceSessionId, 120),
    sourceMessageId: cleanText(value.sourceMessageId, 120),
    evidence: cleanText(value.evidence, 300),
    followUpCount: Math.max(0, Math.min(20, Math.round(Number(value.followUpCount) || 0))),
    lastFollowUpAt: Math.max(0, Number(value.lastFollowUpAt) || 0),
    lastResponse: ['done', 'later', 'cancel', ''].includes(value.lastResponse) ? value.lastResponse : '',
    createdAt,
    updatedAt: validIso(value.updatedAt, createdAt)
  };
}

function normalizeFocusSession(value = {}) {
  const startedAt = validIso(value.startedAt);
  const endedAt = validIso(value.endedAt);
  const mode = FOCUS_MODES.has(value.mode) ? value.mode : 'custom';
  return {
    id: cleanText(value.id, 120) || stableId('focus', startedAt, value.label),
    mode,
    label: cleanText(value.label, 80) || '专注',
    plannedMinutes: Math.round(clamp(value.plannedMinutes, 1, 720, 25)),
    actualMinutes: Math.round(clamp(value.actualMinutes, 0, 720, 0)),
    status: ['active', 'completed', 'cancelled'].includes(value.status) ? value.status : 'completed',
    startedAt,
    endedAt,
    reflection: cleanText(value.reflection, 500)
  };
}

function normalizeUsageDay(value = {}) {
  const apps = (Array.isArray(value.apps) ? value.apps : [])
    .map((item) => ({
      app: cleanText(item.app, 100).toLowerCase(),
      label: cleanText(item.label || item.app, 100),
      category: ['work', 'study', 'communication', 'browser', 'entertainment', 'system', 'other'].includes(item.category)
        ? item.category
        : 'other',
      seconds: Math.max(0, Math.min(86400, Math.round(Number(item.seconds) || 0)))
    }))
    .filter((item) => item.app && item.seconds > 0)
    .sort((left, right) => right.seconds - left.seconds)
    .slice(0, 200);
  return { date: /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || '')) ? String(value.date) : '', apps };
}

function normalizeBrief(value = {}, type = 'morning') {
  const createdAt = validIso(value.createdAt, new Date().toISOString());
  return {
    id: cleanText(value.id, 120) || stableId(type, value.date, createdAt),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || '')) ? String(value.date) : localDateKey(createdAt),
    title: cleanText(value.title, 120),
    content: cleanText(value.content, 6000),
    highlights: (Array.isArray(value.highlights) ? value.highlights : []).map((item) => cleanText(item, 240)).filter(Boolean).slice(0, 30),
    createdAt,
    deliveredAt: validIso(value.deliveredAt)
  };
}

function normalizeMaiPlan(value = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || '')) ? String(value.date) : localDateKey();
  return {
    id: cleanText(value.id, 120) || stableId('mai-plan', date),
    date,
    personalPlan: cleanText(value.personalPlan, 240),
    mood: cleanText(value.mood, 40) || 'calm',
    energy: Math.round(clamp(value.energy, 0, 100, 72)),
    completed: value.completed === true,
    createdAt: validIso(value.createdAt, new Date().toISOString()),
    updatedAt: validIso(value.updatedAt, new Date().toISOString())
  };
}

function syncPromises(promises, lifeItems) {
  const next = (Array.isArray(promises) ? promises : []).map(normalizePromise).filter((item) => item.title);
  const bySource = new Map(next.filter((item) => item.sourceItemId).map((item) => [item.sourceItemId, item]));
  for (const item of Array.isArray(lifeItems) ? lifeItems : []) {
    if (!item?.title || (!item.promise && item.source !== 'conversation')) continue;
    const existing = bySource.get(String(item.id));
    if (existing) {
      existing.title = cleanText(item.title, 140);
      existing.dueAt = validIso(item.dueAt);
      existing.status = item.completed ? 'completed' : existing.status === 'completed' ? 'open' : existing.status;
      existing.sourceSessionId = cleanText(item.sourceSessionId, 120) || existing.sourceSessionId;
      existing.sourceMessageId = cleanText(item.sourceMessageId, 120) || existing.sourceMessageId;
      existing.evidence = cleanText(item.evidence, 300) || existing.evidence;
      continue;
    }
    const promise = normalizePromise({
      id: stableId('promise', 'life', item.id),
      title: item.title,
      dueAt: item.dueAt,
      status: item.completed ? 'completed' : 'open',
      sourceItemId: item.id,
      sourceSessionId: item.sourceSessionId,
      sourceMessageId: item.sourceMessageId,
      evidence: item.evidence,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    });
    next.push(promise);
    bySource.set(promise.sourceItemId, promise);
  }
  const sourceIds = new Set((Array.isArray(lifeItems) ? lifeItems : []).map((item) => String(item.id)));
  return next
    .filter((item) => !item.sourceItemId || sourceIds.has(item.sourceItemId))
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, MAX_PROMISES);
}

function normalizeAssistantState(value = {}, options = {}) {
  const defaults = defaultAssistantState();
  const currentFocus = value.currentFocus ? normalizeFocusSession(value.currentFocus) : null;
  return {
    version: ASSISTANT_STATE_VERSION,
    promises: syncPromises(value.promises, options.lifeItems),
    focusSessions: (Array.isArray(value.focusSessions) ? value.focusSessions : [])
      .map(normalizeFocusSession).filter((item) => item.startedAt).slice(-MAX_FOCUS_SESSIONS),
    currentFocus: currentFocus?.status === 'active' ? currentFocus : null,
    appUsage: {
      current: value.appUsage?.current && value.appUsage.current.app
        ? {
            app: cleanText(value.appUsage.current.app, 100).toLowerCase(),
            label: cleanText(value.appUsage.current.label, 100),
            category: cleanText(value.appUsage.current.category, 30),
            startedAt: validIso(value.appUsage.current.startedAt)
          }
        : null,
      days: (Array.isArray(value.appUsage?.days) ? value.appUsage.days : [])
        .map(normalizeUsageDay).filter((item) => item.date).slice(-MAX_USAGE_DAYS),
      lastSampleAt: Math.max(0, Number(value.appUsage?.lastSampleAt) || 0)
    },
    briefings: (Array.isArray(value.briefings) ? value.briefings : [])
      .map((item) => normalizeBrief(item, 'morning')).filter((item) => item.content).slice(-MAX_BRIEFINGS),
    eveningReviews: (Array.isArray(value.eveningReviews) ? value.eveningReviews : [])
      .map((item) => normalizeBrief(item, 'review')).filter((item) => item.content).slice(-MAX_BRIEFINGS),
    maiPlans: (Array.isArray(value.maiPlans) ? value.maiPlans : [])
      .map(normalizeMaiPlan).slice(-MAX_BRIEFINGS),
    eventLedger: (Array.isArray(value.eventLedger) ? value.eventLedger : [])
      .map((item) => ({
        key: cleanText(item.key, 160),
        count: Math.max(0, Math.round(Number(item.count) || 0)),
        lastAt: Math.max(0, Number(item.lastAt) || 0),
        status: cleanText(item.status, 30)
      })).filter((item) => item.key).slice(-2000),
    lastUpdatedAt: validIso(value.lastUpdatedAt, defaults.lastUpdatedAt)
  };
}

function classifyApplication(processName) {
  const app = cleanText(processName, 100).toLowerCase().replace(/\.exe$/, '');
  const labels = {
    code: ['Visual Studio Code', 'work'], devenv: ['Visual Studio', 'work'], idea64: ['IntelliJ IDEA', 'work'],
    pycharm64: ['PyCharm', 'work'], webstorm64: ['WebStorm', 'work'], rider64: ['Rider', 'work'],
    winword: ['Microsoft Word', 'work'], excel: ['Microsoft Excel', 'work'], powerpnt: ['Microsoft PowerPoint', 'work'],
    notepad: ['记事本', 'work'], notepadplusplus: ['Notepad++', 'work'], obsidian: ['Obsidian', 'study'],
    notion: ['Notion', 'work'], acrobat: ['Adobe Acrobat', 'study'], sumatrapdf: ['SumatraPDF', 'study'],
    msedge: ['Microsoft Edge', 'browser'], chrome: ['Google Chrome', 'browser'], firefox: ['Firefox', 'browser'],
    qq: ['QQ', 'communication'], wechat: ['微信', 'communication'], weixin: ['微信', 'communication'],
    discord: ['Discord', 'communication'], steam: ['Steam', 'entertainment'], explorer: ['文件资源管理器', 'system']
  };
  const found = labels[app];
  return { app, label: found?.[0] || cleanText(processName, 100) || '未知应用', category: found?.[1] || 'other' };
}

function applyActivitySample(value, sample = {}, now = Date.now()) {
  const state = normalizeAssistantState(value);
  const appUsage = state.appUsage;
  const classified = classifyApplication(sample.processName || sample.app);
  if (!classified.app) return state;
  const previousAt = appUsage.lastSampleAt;
  if (appUsage.current?.app && previousAt > 0) {
    const elapsedSeconds = Math.max(0, Math.min(60, Math.round((now - previousAt) / 1000)));
    if (elapsedSeconds > 0) {
      const date = localDateKey(previousAt);
      let day = appUsage.days.find((item) => item.date === date);
      if (!day) {
        day = { date, apps: [] };
        appUsage.days.push(day);
      }
      let item = day.apps.find((entry) => entry.app === appUsage.current.app);
      if (!item) {
        item = { app: appUsage.current.app, label: appUsage.current.label, category: appUsage.current.category || 'other', seconds: 0 };
        day.apps.push(item);
      }
      item.seconds = Math.min(86400, item.seconds + elapsedSeconds);
      day.apps.sort((left, right) => right.seconds - left.seconds);
    }
  }
  if (appUsage.current?.app !== classified.app) {
    appUsage.current = { ...classified, startedAt: new Date(now).toISOString() };
  }
  appUsage.lastSampleAt = now;
  appUsage.days = appUsage.days.slice(-MAX_USAGE_DAYS);
  state.lastUpdatedAt = new Date(now).toISOString();
  return state;
}

function startFocusSession(value, input = {}, now = Date.now()) {
  const state = normalizeAssistantState(value);
  if (state.currentFocus) return state;
  state.currentFocus = normalizeFocusSession({
    id: stableId('focus', now, input.label),
    mode: input.mode,
    label: input.label,
    plannedMinutes: input.minutes,
    actualMinutes: 0,
    status: 'active',
    startedAt: new Date(now).toISOString()
  });
  state.lastUpdatedAt = new Date(now).toISOString();
  return state;
}

function finishFocusSession(value, options = {}, now = Date.now()) {
  const state = normalizeAssistantState(value);
  if (!state.currentFocus) return state;
  const startedAt = new Date(state.currentFocus.startedAt).getTime();
  const actualMinutes = Math.max(1, Math.round((now - startedAt) / 60000));
  const completed = normalizeFocusSession({
    ...state.currentFocus,
    actualMinutes,
    status: options.cancelled ? 'cancelled' : 'completed',
    endedAt: new Date(now).toISOString(),
    reflection: options.reflection
  });
  state.focusSessions = [...state.focusSessions, completed].slice(-MAX_FOCUS_SESSIONS);
  state.currentFocus = null;
  state.eventLedger.push({ key: `focus:${completed.id}`, count: 1, lastAt: now, status: completed.status });
  state.eventLedger = state.eventLedger.slice(-2000);
  state.lastUpdatedAt = new Date(now).toISOString();
  return state;
}

function todayUsage(state, now = Date.now()) {
  const day = state.appUsage?.days?.find((item) => item.date === localDateKey(now)) || { apps: [] };
  const totalSeconds = day.apps.reduce((total, item) => total + item.seconds, 0);
  const productiveSeconds = day.apps.filter((item) => ['work', 'study'].includes(item.category))
    .reduce((total, item) => total + item.seconds, 0);
  return { apps: day.apps.slice(0, 20), totalSeconds, productiveSeconds };
}

function todayFocus(state, now = Date.now()) {
  const date = localDateKey(now);
  const sessions = state.focusSessions.filter((item) => localDateKey(item.startedAt) === date && item.status === 'completed');
  return {
    sessions,
    minutes: sessions.reduce((total, item) => total + item.actualMinutes, 0),
    studyMinutes: sessions.filter((item) => ['study', 'reading'].includes(item.mode)).reduce((total, item) => total + item.actualMinutes, 0)
  };
}

function buildMorningBriefing(input = {}, now = Date.now()) {
  const date = localDateKey(now);
  const items = (Array.isArray(input.lifeItems) ? input.lifeItems : [])
    .filter((item) => !item.completed && item.dueAt && localDateKey(item.dueAt) === date)
    .sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)));
  const projects = (Array.isArray(input.projects) ? input.projects : []).filter((item) => item.status === 'active').slice(0, 4);
  const habits = (Array.isArray(input.habits) ? input.habits : []).filter((item) => item.active && item.dueToday && !item.completedToday).slice(0, 6);
  const highlights = [];
  if (input.weather?.description) highlights.push(`${input.weather.locationName || input.weather.city || '今天'}：${input.weather.description}，${Math.round(input.weather.temperature)}℃`);
  for (const item of items) highlights.push(`${new Date(item.dueAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} · ${item.title}`);
  if (projects[0]) highlights.push(`优先项目：${projects[0].title}（${projects[0].progress || 0}%）`);
  if (habits.length) highlights.push(`今天待完成习惯：${habits.map((item) => item.title).join('、')}`);
  if (!highlights.length) highlights.push('今天暂时没有硬性安排，可以先确定最重要的一件事。');
  return normalizeBrief({
    id: stableId('morning', date), date, title: `${date} 晨间简报`, highlights,
    content: `早上好。${highlights.join('；')}。先把最重要的一件事做完，剩下的节奏会轻松很多。`,
    createdAt: new Date(now).toISOString()
  }, 'morning');
}

function buildEveningReview(input = {}, now = Date.now()) {
  const date = localDateKey(now);
  const assistant = normalizeAssistantState(input.assistant, { lifeItems: input.lifeItems });
  const focus = todayFocus(assistant, now);
  const usage = todayUsage(assistant, now);
  const completedItems = (Array.isArray(input.lifeItems) ? input.lifeItems : []).filter((item) => item.completed && localDateKey(item.updatedAt) === date);
  const completedHabits = (Array.isArray(input.habits) ? input.habits : []).filter((item) => item.completedToday);
  const highlights = [
    `完成 ${completedItems.length} 项日程或待办`,
    `完成 ${completedHabits.length} 个习惯`,
    `专注 ${focus.minutes} 分钟${focus.studyMinutes ? `，其中学习 ${focus.studyMinutes} 分钟` : ''}`
  ];
  if (usage.totalSeconds > 0) highlights.push(`已记录应用使用 ${Math.round(usage.totalSeconds / 60)} 分钟，工作/学习 ${Math.round(usage.productiveSeconds / 60)} 分钟`);
  return normalizeBrief({
    id: stableId('review', date), date, title: `${date} 晚间复盘`, highlights,
    content: `今天完成了 ${completedItems.length} 项安排、${completedHabits.length} 个习惯，并专注了 ${focus.minutes} 分钟。未完成的事情可以重新安排，不需要用焦虑给今天收尾。`,
    createdAt: new Date(now).toISOString()
  }, 'review');
}

function ensureBriefing(value, input = {}, type = 'morning', now = Date.now()) {
  const state = normalizeAssistantState(value, { lifeItems: input.lifeItems });
  const listKey = type === 'review' ? 'eveningReviews' : 'briefings';
  const date = localDateKey(now);
  let brief = state[listKey].find((item) => item.date === date);
  if (!brief) {
    brief = type === 'review'
      ? buildEveningReview({ ...input, assistant: state }, now)
      : buildMorningBriefing(input, now);
    state[listKey] = [...state[listKey], brief].slice(-MAX_BRIEFINGS);
  }
  return { state, brief };
}

function ensureMaiPlan(value, mind = {}, world = {}, now = Date.now()) {
  const state = normalizeAssistantState(value);
  const date = localDateKey(now);
  let plan = state.maiPlans.find((item) => item.date === date);
  if (!plan) {
    const choices = ['晚上读完手边那一章书', '收工后散步二十分钟', '整理下一周的剧本和行程', '回家好好做一顿晚饭', '留一点时间看一部想看的电影'];
    const seed = Number(date.replaceAll('-', '')) || 0;
    plan = normalizeMaiPlan({
      date,
      personalPlan: choices[Math.abs(seed) % choices.length],
      mood: mind.mood,
      energy: mind.energy,
      createdAt: new Date(now).toISOString()
    });
    state.maiPlans = [...state.maiPlans, plan].slice(-MAX_BRIEFINGS);
  } else {
    plan.mood = cleanText(mind.mood, 40) || plan.mood;
    plan.energy = Math.round(clamp(mind.energy, 0, 100, plan.energy));
    plan.updatedAt = new Date(now).toISOString();
  }
  return { state, plan: { ...plan, currentActivity: world.currentLabel || '', location: world.location || '', nextActivity: world.nextLabel || '' } };
}

function ledgerItem(state, key) {
  return state.eventLedger.find((item) => item.key === key);
}

function assistantProactiveCue(value, input = {}, now = Date.now()) {
  const state = normalizeAssistantState(value, { lifeItems: input.lifeItems });
  const date = localDateKey(now);
  const minutes = minuteOfDay(now);
  const morningAt = parseClock(input.settings?.morningTime, 8 * 60);
  const reviewAt = parseClock(input.settings?.eveningTime, 21 * 60 + 30);
  if (input.settings?.morningEnabled !== false && minutes >= morningAt && minutes < 12 * 60 && !ledgerItem(state, `morning:${date}`)) {
    return { reason: 'morning_briefing', key: `morning:${date}` };
  }
  if (input.settings?.eveningEnabled !== false && minutes >= reviewAt && !ledgerItem(state, `review:${date}`)) {
    return { reason: 'evening_review', key: `review:${date}` };
  }
  const currentAppStartedAt = new Date(state.appUsage.current?.startedAt || 0).getTime();
  const longSessionKey = `long-app:${date}:${state.appUsage.current?.app || ''}`;
  if (
    input.settings?.activityTrackingEnabled === true
    && ['work', 'study'].includes(state.appUsage.current?.category)
    && Number.isFinite(currentAppStartedAt)
    && now - currentAppStartedAt >= 90 * 60 * 1000
    && !ledgerItem(state, longSessionKey)
  ) {
    return { reason: 'long_work_session', key: longSessionKey, app: state.appUsage.current };
  }
  const promise = state.promises.find((item) => {
    const due = new Date(item.dueAt || 0).getTime();
    return item.status === 'open' && due > 0 && due <= now && now - due < 7 * 86400000
      && item.followUpCount < 3 && now - item.lastFollowUpAt >= 6 * 3600000;
  });
  return promise ? { reason: 'promise_follow_up', key: `promise:${promise.id}`, promise } : null;
}

function markAssistantCue(value, cue, now = Date.now()) {
  const state = normalizeAssistantState(value);
  if (!cue?.key) return state;
  const existing = ledgerItem(state, cue.key);
  if (existing) {
    existing.count += 1;
    existing.lastAt = now;
    existing.status = 'delivered';
  } else {
    state.eventLedger.push({ key: cue.key, count: 1, lastAt: now, status: 'delivered' });
  }
  if (cue.promise?.id) {
    const promise = state.promises.find((item) => item.id === cue.promise.id);
    if (promise) {
      promise.followUpCount += 1;
      promise.lastFollowUpAt = now;
      promise.updatedAt = new Date(now).toISOString();
    }
  }
  state.eventLedger = state.eventLedger.slice(-2000);
  state.lastUpdatedAt = new Date(now).toISOString();
  return state;
}

function answerAssistantPromise(value, promiseId, response, now = Date.now()) {
  const normalizedId = String(promiseId || '');
  const promiseIndex = Array.isArray(value?.promises)
    ? value.promises.findIndex((item) => item.id === normalizedId)
    : -1;
  if (promiseIndex < 0) return { state: value, promise: null };

  const normalizedResponse = ['done', 'later', 'cancel'].includes(response) ? response : 'later';
  const previous = value.promises[promiseIndex];
  const promise = {
    ...previous,
    lastResponse: normalizedResponse,
    status: normalizedResponse === 'done' ? 'completed' : normalizedResponse === 'cancel' ? 'paused' : 'open',
    updatedAt: new Date(now).toISOString()
  };
  return {
    state: {
      ...value,
      promises: value.promises.map((item, index) => (index === promiseIndex ? promise : item))
    },
    promise
  };
}

function assistantContext(value, input = {}, now = Date.now()) {
  const state = normalizeAssistantState(value, { lifeItems: input.lifeItems });
  const focus = todayFocus(state, now);
  const usage = todayUsage(state, now);
  const openPromises = state.promises.filter((item) => item.status === 'open').slice(0, 8);
  const lines = ['\n以下是现实生活助理在本机保存的连续状态：'];
  if (state.currentFocus) lines.push(`用户当前正在进行“${state.currentFocus.label}”专注，模式 ${state.currentFocus.mode}，开始于 ${state.currentFocus.startedAt}。`);
  lines.push(`今天已经完成 ${focus.sessions.length} 次专注，共 ${focus.minutes} 分钟。`);
  if (input.activityTrackingEnabled && usage.totalSeconds > 0) {
    lines.push(`今天获准记录的应用使用约 ${Math.round(usage.totalSeconds / 60)} 分钟，其中工作或学习约 ${Math.round(usage.productiveSeconds / 60)} 分钟。`);
    if (state.appUsage.current?.label) lines.push(`当前前台应用：${state.appUsage.current.label}。这里只代表应用名称，不能声称看到了用户屏幕内容。`);
  }
  if (openPromises.length) lines.push(`尚未兑现或确认的承诺：${openPromises.map((item) => item.title).join('；')}。避免重复催促，同一承诺最多主动跟进三次。`);
  lines.push('只在话题相关时自然使用；不要把应用名称推断成具体操作，也不要声称读到了未导入的文件。');
  return lines.join('\n');
}

function publicAssistantState(value, input = {}, now = Date.now()) {
  const state = normalizeAssistantState(value, { lifeItems: input.lifeItems });
  const mai = ensureMaiPlan(state, input.mind, input.world, now);
  const focus = todayFocus(mai.state, now);
  const usage = todayUsage(mai.state, now);
  return {
    ...mai.state,
    promises: mai.state.promises.slice(0, 200),
    focusSessions: mai.state.focusSessions.slice(-200).reverse(),
    briefings: mai.state.briefings.slice(-30).reverse(),
    eveningReviews: mai.state.eveningReviews.slice(-30).reverse(),
    mai: mai.plan,
    today: { focus, usage },
    lifeItems: (Array.isArray(input.lifeItems) ? input.lifeItems : []).slice(0, 300),
    settings: { ...(input.settings || {}) }
  };
}

module.exports = {
  ASSISTANT_STATE_VERSION,
  FOCUS_MODES,
  applyActivitySample,
  answerAssistantPromise,
  assistantContext,
  assistantProactiveCue,
  buildEveningReview,
  buildMorningBriefing,
  classifyApplication,
  defaultAssistantState,
  ensureBriefing,
  ensureMaiPlan,
  finishFocusSession,
  localDateKey,
  markAssistantCue,
  normalizeAssistantState,
  normalizePromise,
  publicAssistantState,
  startFocusSession,
  syncPromises,
  todayFocus,
  todayUsage
};
