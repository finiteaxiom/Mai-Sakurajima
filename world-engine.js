const WORLD_STATE_VERSION = 1;

function clampMinute(value) {
  return Math.max(0, Math.min(1440, Math.round(Number(value) || 0)));
}

function localDateKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateAtMinute(date, minute) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  value.setMinutes(clampMinute(minute));
  return value;
}

function stableVariant(date, choices) {
  const key = Number(localDateKey(date).replaceAll('-', '')) || 0;
  return choices[Math.abs(key) % choices.length];
}

function daySchedule(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const weekday = date.getDay();
  const weekend = weekday === 0 || weekday === 6;
  const eveningActivity = stableVariant(date, [
    { key: 'reading', label: '在家看书和剧本', detail: '手边放着一杯温热的饮料，偶尔会看手机。' },
    { key: 'movie', label: '在家看电影', detail: '看到有意思的地方，可能会想起你。' },
    { key: 'self-care', label: '在家整理衣物和护肤', detail: '正在处理自己的生活琐事，不算忙。' }
  ]);
  const daytime = weekend
    ? [
        { start: 540, end: 660, key: 'slow-morning', label: '悠闲地吃早餐', location: '家里', busy: 0.15, detail: '今天没有赶通告，节奏比平时慢一点。' },
        { start: 660, end: 900, key: 'personal-outing', label: stableVariant(date, ['外出买东西', '去书店逛逛', '在咖啡店看剧本']), location: '外面', busy: 0.45, detail: '在过自己的周末，也会留意手机消息。' },
        { start: 900, end: 1080, key: 'weekend-rest', label: '处理自己的事情', location: '家里', busy: 0.3, detail: '可能在读书、整理房间，或者只是发一会儿呆。' }
      ]
    : [
        { start: 540, end: 720, key: 'morning-work', label: '上午拍摄或上课', location: '片场', busy: 0.82, detail: '工作间隙会看消息，但不一定立刻长聊。' },
        { start: 720, end: 780, key: 'lunch', label: '午间吃饭休息', location: '片场附近', busy: 0.35, detail: '终于有一小段能放松看手机的时间。' },
        { start: 780, end: 1080, key: 'afternoon-work', label: '下午拍摄或工作', location: '片场', busy: 0.86, detail: '正在认真处理工作，空下来会接着之前的话题。' }
      ];
  return [
    { start: 0, end: 90, key: 'late-night', label: '睡前放松', location: '家里', busy: 0.12, detail: '还没睡，语气会比白天更放松。' },
    { start: 90, end: 450, key: 'sleeping', label: '正在睡觉', location: '家里', busy: 1, detail: '这是正常睡眠时间，不会主动催促回复。' },
    { start: 450, end: 510, key: 'waking', label: '刚起床洗漱', location: '家里', busy: 0.5, detail: '正在慢慢清醒，准备开始今天。' },
    { start: 510, end: 540, key: 'commute-morning', label: weekend ? '准备出门' : '去片场的路上', location: weekend ? '家里' : '路上', busy: 0.55, detail: '行程正在开始，会抽空看手机。' },
    ...daytime,
    { start: 1080, end: 1140, key: 'commute-evening', label: weekend ? '在回家的路上' : '收工回家', location: '路上', busy: 0.58, detail: '一天的安排快结束了，心情逐渐放松。' },
    { start: 1140, end: 1260, key: 'dinner', label: '吃晚饭和收拾', location: '家里', busy: 0.3, detail: '在处理晚饭，也愿意聊聊彼此今天发生的事。' },
    { start: 1260, end: 1380, ...eveningActivity, location: '家里', busy: 0.2 },
    { start: 1380, end: 1440, key: 'wind-down', label: '准备休息', location: '家里', busy: 0.15, detail: '在做睡前的事，但不会突然结束正在进行的认真对话。' }
  ];
}

function currentScheduleEntry(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const minute = date.getHours() * 60 + date.getMinutes();
  const schedule = daySchedule(date);
  const index = Math.max(0, schedule.findIndex((entry) => minute >= entry.start && minute < entry.end));
  const current = schedule[index];
  const next = schedule[(index + 1) % schedule.length];
  return {
    ...current,
    startsAt: dateAtMinute(date, current.start).toISOString(),
    endsAt: dateAtMinute(date, current.end).toISOString(),
    nextKey: next.key,
    nextLabel: next.label,
    nextAt: (index === schedule.length - 1
      ? dateAtMinute(new Date(date.getTime() + 86400000), next.start)
      : dateAtMinute(date, next.start)).toISOString(),
    dayPlan: schedule.map((entry) => ({
      key: entry.key,
      label: entry.label,
      location: entry.location,
      startsAt: dateAtMinute(date, entry.start).toISOString(),
      endsAt: dateAtMinute(date, entry.end).toISOString()
    }))
  };
}

function defaultWorldState(now = Date.now()) {
  const entry = currentScheduleEntry(new Date(now));
  return {
    version: WORLD_STATE_VERSION,
    dateKey: localDateKey(new Date(now)),
    currentKey: entry.key,
    currentLabel: entry.label,
    location: entry.location,
    detail: entry.detail,
    busy: entry.busy,
    startedAt: entry.startsAt,
    endsAt: entry.endsAt,
    nextKey: entry.nextKey,
    nextLabel: entry.nextLabel,
    nextAt: entry.nextAt,
    previousKey: '',
    previousLabel: '',
    lastTransitionAt: new Date(now).toISOString(),
    dayPlan: entry.dayPlan
  };
}

function normalizeWorldState(value, now = Date.now()) {
  const fallback = defaultWorldState(now);
  if (!value || typeof value !== 'object') return fallback;
  return {
    ...fallback,
    dateKey: String(value.dateKey || fallback.dateKey),
    currentKey: String(value.currentKey || fallback.currentKey).slice(0, 40),
    currentLabel: String(value.currentLabel || fallback.currentLabel).slice(0, 80),
    location: String(value.location || fallback.location).slice(0, 80),
    detail: String(value.detail || fallback.detail).slice(0, 240),
    busy: Math.max(0, Math.min(1, Number(value.busy) || 0)),
    startedAt: value.startedAt || fallback.startedAt,
    endsAt: value.endsAt || fallback.endsAt,
    nextKey: String(value.nextKey || fallback.nextKey).slice(0, 40),
    nextLabel: String(value.nextLabel || fallback.nextLabel).slice(0, 80),
    nextAt: value.nextAt || fallback.nextAt,
    previousKey: String(value.previousKey || '').slice(0, 40),
    previousLabel: String(value.previousLabel || '').slice(0, 80),
    lastTransitionAt: value.lastTransitionAt || fallback.lastTransitionAt
  };
}

function advanceWorldState(value, now = Date.now()) {
  const previous = normalizeWorldState(value, now);
  const next = defaultWorldState(now);
  if (previous.currentKey === next.currentKey && previous.dateKey === next.dateKey) {
    return {
      ...next,
      previousKey: previous.previousKey,
      previousLabel: previous.previousLabel,
      startedAt: previous.startedAt || next.startedAt,
      lastTransitionAt: previous.lastTransitionAt || next.lastTransitionAt
    };
  }
  return {
    ...next,
    previousKey: previous.currentKey,
    previousLabel: previous.currentLabel,
    lastTransitionAt: new Date(now).toISOString()
  };
}

function worldContext(value, now = Date.now()) {
  const state = advanceWorldState(value, now);
  const busyText = state.busy >= 0.75
    ? '当前比较忙，回复可以自然简短，但不要假装真的无法回复。'
    : state.busy >= 0.45
      ? '当前有自己的安排，同时可以正常聊天。'
      : '当前比较放松，可以更从容地延续话题。';
  return [
    '\n以下是麻衣在现实时间中持续推进的今日生活状态：',
    `现在：${state.currentLabel}；地点：${state.location}。${state.detail}`,
    `下一项：${state.nextLabel}，预计在 ${new Date(state.nextAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} 左右开始。`,
    busyText,
    '这个状态是连续日程背景，不要逐字汇报；只有话题相关时才自然提到。不要声称发生了日程之外的具体事件。'
  ].join('\n');
}

module.exports = {
  WORLD_STATE_VERSION,
  advanceWorldState,
  currentScheduleEntry,
  daySchedule,
  defaultWorldState,
  localDateKey,
  normalizeWorldState,
  worldContext
};
