const canvas = document.getElementById('sprite');
const context = canvas.getContext('2d', { alpha: true });
const stage = document.getElementById('stage');
const speech = document.getElementById('speech');
const speechText = document.getElementById('speech-text');
const prop = document.getElementById('prop');
const effectLayer = document.getElementById('effect-layer');
const stateLabel = document.getElementById('state-label');

const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
const desktopApi = window.maiPet ?? {
  getSettings: async () => ({ firstLaunch: true }),
  getContext: async () => ({
    cursor: { x: window.screenX + window.innerWidth / 2, y: window.screenY + window.innerHeight / 2 },
    bounds: { x: window.screenX, y: window.screenY, width: window.innerWidth, height: window.innerHeight }
  }),
  moveWindow: () => {},
  endDrag: () => {},
  showContextMenu: () => {},
  hide: () => {},
  openChat: () => {},
  openTimer: () => {},
  setHovering: () => {},
  setInvisibleMode: async () => false,
  onAction: () => {},
  onAiReply: () => {},
  onProactiveGreeting: () => {},
  onReminder: () => {},
  onInvisibleMode: () => {},
  onSyndromeVisible: () => {}
};

const STATES = {
  lifted: { row: 4, frames: [1, 2], interval: 200, label: '轻轻提起', prop: '' },
  land: { row: 4, frames: [3, 4], interval: 200, label: '站稳啦', prop: '' },
  outfitPrimary: { row: 7, frames: [0, 1, 2, 3, 4, 5], interval: 250, label: '日常陪伴', prop: '' },
  outfitSecondary: { row: 6, frames: [0, 1, 2, 3, 4, 5], interval: 330, label: '放松片刻', prop: '' },
  idle: {
    row: 0,
    frames: [0, 1, 2, 3, 4, 5],
    interval: 235,
    label: '安静陪伴',
    prop: ''
  },
  runRight: {
    row: 1,
    frames: [0, 1, 2, 3, 4, 5, 6, 7],
    interval: 90,
    label: '跟着你',
    prop: ''
  },
  runLeft: {
    row: 2,
    frames: [0, 1, 2, 3, 4, 5, 6, 7],
    interval: 90,
    label: '跟着你',
    prop: ''
  },
  wave: {
    row: 3,
    frames: [0, 1, 2, 3, 2, 1],
    interval: 165,
    label: '向你招手',
    prop: ''
  },
  jump: {
    row: 4,
    frames: [0, 1, 2, 3, 4],
    interval: 125,
    label: '心情很好',
    prop: ''
  },
  angry: {
    row: 5,
    frames: [0, 1, 2, 3, 4, 5, 6, 7],
    interval: 185,
    label: '有一点生气',
    prop: '╬',
    propClass: 'angry'
  },
  sleep: {
    row: 5,
    frames: [2, 3, 4, 5, 4, 3],
    interval: 520,
    label: '安心睡觉',
    prop: 'Z z z',
    propClass: 'sleep'
  },
  lazy: {
    row: 6,
    frames: [0, 1, 2, 3, 4, 5],
    interval: 330,
    label: '偷偷发呆',
    prop: '…',
    propClass: 'lazy'
  },
  study: {
    row: 7,
    frames: [0, 1, 2, 3, 4, 5],
    interval: 250,
    label: '努力学习',
    prop: '📖',
    propClass: 'study'
  },
  work: {
    row: 7,
    frames: [0, 1, 2, 3, 4, 5],
    interval: 155,
    label: '认真工作',
    prop: '⌨️',
    propClass: 'work'
  },
  snack: {
    row: 8,
    frames: [0, 1, 2, 3, 4, 5],
    interval: 240,
    label: '吃点零食',
    prop: '🍪',
    propClass: 'snack'
  },
  love: {
    row: 3,
    frames: [0, 1, 2, 3, 2, 1],
    interval: 145,
    label: '满心喜欢你',
    prop: '♥',
    propClass: 'love'
  }
};

const DIALOGUES = {
  hello: [
    '我在这里。今天也会一直陪着你。',
    '终于召唤我了？我一直在等你。',
    '欢迎回来。只要你需要，我就在。'
  ],
  wake: [
    '早上好。新的一天，也让我陪着你吧。',
    '我已经醒了。今天也一起努力。',
    '你来了。这样一天才算真正开始。'
  ],
  idle: [
    '我在这里，陪着你。',
    '有我在，今天也会顺利的。',
    '偶尔看我一眼也可以，我会很开心。'
  ],
  lazy: [
    '休息一下也不算偷懒吧。',
    '只发五分钟呆……你陪我。',
    '现在是合理的放空时间。'
  ],
  sleep: [
    '借我靠一会儿……晚安。',
    '你在旁边，我就睡得很安心。',
    '睡醒以后，还要继续陪着我。'
  ],
  snack: [
    '这个很好吃。要分你一半吗？',
    '补充能量之后，再陪你努力。',
    '只吃一块……大概。'
  ],
  study: [
    '一起专心一会儿吧。',
    '我会陪你把这件事做好。',
    '认真起来的你，我很喜欢。'
  ],
  work: [
    '别分心，我也在认真工作。',
    '完成以后，要记得表扬我。',
    '慢慢来，我会一直陪你做到结束。'
  ],
  angry: [
    '哼……摸摸头我才考虑原谅你。',
    '我在生气。你知道该怎么哄我的。',
    '现在不许装作没看见我。摸摸头。'
  ],
  love: [
    '……这样就原谅你了。',
    '最喜欢你了。再摸一下也可以。',
    '你的手很温柔。我会一直喜欢你的。'
  ],
  head: [
    '不要盯着我看太久哦……会害羞的。',
    '摸头可以，但只准对我这么温柔。',
    '再摸一下也不是不可以。'
  ],
  poke: [
    '突然碰我做什么……想让我看你吗？',
    '笨蛋，还不快去工作或学习。',
    '不要盯着我看太久哦。',
    '嗯？我一直注意着你。'
  ],
  inactive: [
    '三分钟都没理我……你该不会把我忘了吧？',
    '笨蛋，还不快去工作或学习。',
    '偶尔也看看我吧，我可是一直都在。',
    '休息一下也好。你已经专心很久了。',
    '不要盯着屏幕太久，眼睛会累的。'
  ]
};

const AUTONOMOUS_ACTIONS = [
  { name: 'lazy', weight: 22, min: 6500, max: 10500 },
  { name: 'sleep', weight: 13, min: 9000, max: 15000 },
  { name: 'snack', weight: 18, min: 6000, max: 9800 },
  { name: 'study', weight: 21, min: 8000, max: 13500 },
  { name: 'work', weight: 19, min: 8000, max: 14000 },
  { name: 'angry', weight: 7, min: 18000, max: 26000 }
];

let spriteSheet = new Image();
let animationStarted = false;
let currentState = 'idle';
let frameIndex = 0;
let lastFrameAt = 0;
let stateToken = 0;
let actionTimer = null;
let autonomyTimer = null;
let speechTimer = null;
let gaze = null;
let pointerContextPending = false;
let drag = null;
let lastInteractionAt = Date.now();
const outfitPlayer = window.MaiPetSprites.createPlayer(context);
let outfitId = 'original';
let pendingOutfit = null;
let outfitRequest = 0;
let userReducedOutfitMotion = false;
let reducedOutfitMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { reducedOutfitMotion = event.matches; });

async function changeOutfit(id) {
  const request = ++outfitRequest;
  const normalized = window.MaiPetCatalog.normalize(id);
  pendingOutfit = normalized;
  try {
    const asset = await window.MaiPetSprites.load(normalized);
    if (request !== outfitRequest) return;
    if (drag) { pendingOutfit = normalized; return; }
    pendingOutfit = null;
    outfitId = normalized;
    outfitPlayer.setAsset(asset);
    outfitPlayer.setAction(currentState, performance.now(), true);
    updateProp(STATES[currentState]);
    const outfit = window.MaiPetCatalog.get(outfitId);
    if (currentState === 'outfitPrimary') stateLabel.textContent = outfit.primary;
    if (currentState === 'outfitSecondary') stateLabel.textContent = outfit.secondary;
    if (!animationStarted) { animationStarted = true; requestAnimationFrame(drawFrame); }
  } catch {
    if (request !== outfitRequest) return;
    pendingOutfit = null;
    showSpeech('这套衣服暂时没能加载，先保持现在的装扮。');
  }
}

function choose(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomBetween(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function registerInteraction() {
  lastInteractionAt = Date.now();
}

function weightedAction() {
  const total = AUTONOMOUS_ACTIONS.reduce((sum, action) => sum + action.weight, 0);
  let roll = Math.random() * total;
  for (const action of AUTONOMOUS_ACTIONS) {
    roll -= action.weight;
    if (roll <= 0) {
      return action;
    }
  }
  return AUTONOMOUS_ACTIONS[0];
}

function updateProp(config) {
  prop.className = 'prop';
  if (outfitId !== 'original') { prop.textContent = ''; return; }
  prop.textContent = config.prop || '';
  if (config.propClass) {
    prop.classList.add(`prop--${config.propClass}`);
  }
}

function showSpeech(message, duration = 4300) {
  clearTimeout(speechTimer);
  speechText.textContent = message;
  speech.classList.remove('speech--hidden');
  speechTimer = setTimeout(() => speech.classList.add('speech--hidden'), duration);
}

function setState(name, options = {}) {
  if (!STATES[name]) {
    return;
  }

  stateToken += 1;
  const token = stateToken;
  clearTimeout(actionTimer);
  currentState = name;
  frameIndex = 0;
  lastFrameAt = 0;
  gaze = null;
  outfitPlayer.setAction(name, performance.now(), Boolean(drag) || name === 'land' || name === 'love');

  const config = STATES[name];
  const outfit = window.MaiPetCatalog.get(outfitId);
  stateLabel.textContent = name === 'outfitPrimary' ? outfit.primary : name === 'outfitSecondary' ? outfit.secondary : config.label;
  updateProp(config);

  if (options.dialogue) {
    showSpeech(options.dialogue, options.speechDuration);
  } else if (DIALOGUES[name]) {
    showSpeech(choose(DIALOGUES[name]), options.speechDuration);
  }

  if (options.duration) {
    actionTimer = setTimeout(() => {
      if (stateToken !== token || drag) {
        return;
      }
      setState('idle');
      scheduleAutonomy();
    }, options.duration);
  }
}

function scheduleAutonomy(delay = randomBetween(9000, 17000)) {
  clearTimeout(autonomyTimer);
  autonomyTimer = setTimeout(() => {
    if (drag || currentState !== 'idle') {
      scheduleAutonomy(5000);
      return;
    }
    const action = outfitId === 'original' ? weightedAction() : {
      name: choose(['outfitPrimary', 'outfitSecondary', 'wave', 'sleep']), min: 6500, max: 10000
    };
    setState(action.name, { duration: randomBetween(action.min, action.max) });
  }, delay);
}

function drawFrame(timestamp) {
  if (outfitId !== 'original') {
    outfitPlayer.draw(timestamp, reducedOutfitMotion || userReducedOutfitMotion);
    requestAnimationFrame(drawFrame);
    return;
  }
  if (!spriteSheet.complete || spriteSheet.naturalWidth === 0) {
    requestAnimationFrame(drawFrame);
    return;
  }

  const config = STATES[currentState];
  if (timestamp - lastFrameAt >= config.interval) {
    lastFrameAt = timestamp;
    frameIndex = (frameIndex + 1) % config.frames.length;
  }

  let row = config.row;
  let column = config.frames[frameIndex];
  if (currentState === 'idle' && gaze) {
    row = gaze.row;
    column = gaze.column;
  }

  context.clearRect(0, 0, CELL_WIDTH, CELL_HEIGHT);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    spriteSheet,
    column * CELL_WIDTH,
    row * CELL_HEIGHT,
    CELL_WIDTH,
    CELL_HEIGHT,
    0,
    0,
    CELL_WIDTH,
    CELL_HEIGHT
  );
  requestAnimationFrame(drawFrame);
}

function emitHearts(count = 10) {
  for (let index = 0; index < count; index += 1) {
    const heart = document.createElement('span');
    heart.className = 'heart-particle';
    heart.textContent = '♥';
    heart.style.setProperty('--size', `${randomBetween(12, 24)}px`);
    heart.style.setProperty('--duration', `${randomBetween(1050, 1850)}ms`);
    heart.style.setProperty('--drift', `${randomBetween(-92, 92)}px`);
    heart.style.setProperty('--rotate', `${randomBetween(-35, 35)}deg`);
    heart.style.marginLeft = `${randomBetween(-34, 34)}px`;
    heart.style.animationDelay = `${index * 55}ms`;
    effectLayer.appendChild(heart);
    setTimeout(() => heart.remove(), 2200 + index * 55);
  }
}

function petHead() {
  clearTimeout(autonomyTimer);
  emitHearts(currentState === 'angry' ? 14 : 10);
  setState('love', {
    duration: 3300,
    dialogue: currentState === 'angry' ? choose(DIALOGUES.love) : choose(DIALOGUES.head),
    speechDuration: 3900
  });
}

function pokeBody() {
  clearTimeout(autonomyTimer);
  emitHearts(3);
  setState(Math.random() > 0.45 ? 'jump' : 'wave', {
    duration: 1500,
    dialogue: choose(DIALOGUES.poke),
    speechDuration: 3400
  });
}

function runAction(action) {
  clearTimeout(autonomyTimer);
  const durations = {
    lazy: 11000,
    sleep: 15000,
    snack: 9000,
    study: 14000,
    work: 14000,
    jump: 1700
  };

  if (action === 'pet') {
    petHead();
    return;
  }
  if (action === 'hello' || action === 'wake') {
    setState('wave', {
      duration: 2600,
      dialogue: choose(DIALOGUES[action]),
      speechDuration: 4600
    });
    return;
  }
  if (STATES[action]) {
    setState(action, {
      duration: durations[action] || 10000,
      dialogue: DIALOGUES[action] ? choose(DIALOGUES[action]) : undefined
    });
  }
}

function localStagePoint(event) {
  const bounds = stage.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  };
}

function isHeadPoint(point) {
  return point.x >= 71 && point.x <= 190 && point.y >= 35 && point.y <= 143;
}

stage.addEventListener('pointermove', (event) => {
  const point = localStagePoint(event);
  stage.classList.toggle('head-hover', !drag?.moved && isHeadPoint(point));

  if (!drag || event.pointerId !== drag.pointerId || !drag.origin) {
    return;
  }

  const dx = event.screenX - drag.startScreenX;
  const dy = event.screenY - drag.startScreenY;
  if (!drag.moved && Math.hypot(dx, dy) >= 6) {
    drag.moved = true;
    speech.classList.add('speech--hidden');
  }

  if (drag.moved) {
    const direction = outfitId === 'original' ? (dx >= drag.lastDx ? 'runRight' : 'runLeft') : 'lifted';
    if (currentState !== direction) {
      setState(direction);
    }
    drag.lastDx = dx;
    desktopApi.moveWindow(drag.origin.x + dx, drag.origin.y + dy);
  }
});

stage.addEventListener('pointerdown', async (event) => {
  if (event.button !== 0) {
    return;
  }
  registerInteraction();
  stage.setPointerCapture(event.pointerId);
  drag = {
    pointerId: event.pointerId,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    startPoint: localStagePoint(event),
    origin: null,
    lastDx: 0,
    moved: false
  };
  const petContext = await desktopApi.getContext();
  if (drag && drag.pointerId === event.pointerId) {
    drag.origin = { x: petContext.bounds.x, y: petContext.bounds.y };
  }
});

function finishPointer(event) {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  const finishedDrag = drag;
  drag = null;
  stage.classList.remove('head-hover');

  if (finishedDrag.moved) {
    desktopApi.endDrag();
    setState(outfitId === 'original' ? 'jump' : 'land', { duration: 1000 });
  } else if (isHeadPoint(finishedDrag.startPoint)) {
    petHead();
  } else {
    pokeBody();
  }
  if (pendingOutfit) changeOutfit(pendingOutfit);
}

stage.addEventListener('pointerup', finishPointer);
stage.addEventListener('pointercancel', finishPointer);
stage.addEventListener('pointerenter', () => desktopApi.setHovering(true));
stage.addEventListener('pointerleave', () => desktopApi.setHovering(false));
stage.addEventListener('dblclick', () => {
  registerInteraction();
  desktopApi.openChat();
});

document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  registerInteraction();
  desktopApi.showContextMenu();
});

setInterval(() => {
  if (Date.now() - lastInteractionAt < 3 * 60 * 1000 || drag) {
    return;
  }
  lastInteractionAt = Date.now();
  clearTimeout(autonomyTimer);
  const action = choose(['wave', 'study', 'work', 'lazy']);
  setState(action, {
    duration: 5200,
    dialogue: choose(DIALOGUES.inactive),
    speechDuration: 6200
  });
}, 15000);

setInterval(async () => {
  if (pointerContextPending || currentState !== 'idle' || drag) {
    return;
  }
  pointerContextPending = true;
  try {
    const petContext = await desktopApi.getContext();
    const centerX = petContext.bounds.x + petContext.bounds.width / 2;
    const centerY = petContext.bounds.y + 195;
    const dx = petContext.cursor.x - centerX;
    const dy = petContext.cursor.y - centerY;
    const distance = Math.hypot(dx, dy);

    if (distance < 56) {
      gaze = null;
      return;
    }

    let degrees = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (degrees < 0) {
      degrees += 360;
    }
    const directionIndex = Math.round(degrees / 22.5) % 16;
    gaze = directionIndex < 8
      ? { row: 9, column: directionIndex }
      : { row: 10, column: directionIndex - 8 };
  } finally {
    pointerContextPending = false;
  }
}, 260);

spriteSheet.addEventListener('load', () => {
  if (!animationStarted) {
    animationStarted = true;
    requestAnimationFrame(drawFrame);
  }
});
spriteSheet.addEventListener('error', () => {
  if (!spriteSheet.src.endsWith('spritesheet-original.png')) {
    spriteSheet.src = '../assets/spritesheet-original.png';
  }
});
spriteSheet.src = '../assets/spritesheet-original.png';

desktopApi.getSettings().then((settings) => {
  userReducedOutfitMotion = ['off', 'reduced'].includes(settings.appearance?.motion);
  if (settings.firstLaunch) {
    showSpeech('以后我会经常来找你。右键可以设置番茄钟，还藏着一个“不可见”的秘密。', 8200);
  }
  scheduleAutonomy(settings.firstLaunch ? 13000 : 8000);
});

if (window.maiWardrobe) {
  let receivedOutfitEvent = false;
  window.maiWardrobe.onChanged(state => { receivedOutfitEvent = true; changeOutfit(state.outfitId); });
  window.maiWardrobe.get().then(state => { if (!receivedOutfitEvent) changeOutfit(state.outfitId); }).catch(() => {});
}

desktopApi.onAction(runAction);
desktopApi.onInvisibleMode((enabled) => {
  showSpeech(
    enabled
      ? '青春期综合征模式……现在，还有谁能看见我呢？'
      : '欢迎回来。这样就能一直看见我了。',
    5600
  );
});

function showAiPayload(payload, proactive = false) {
  const normalized = typeof payload === 'string' ? { content: payload } : (payload || {});
  const availableActions = new Set(Object.keys(STATES));
  const action = availableActions.has(normalized.action) ? normalized.action : 'wave';
  const durations = {
    idle: 4800,
    wave: 4300,
    jump: 2600,
    love: 4800,
    angry: 5200,
    sleep: 6500,
    lazy: 5600,
    study: 6000,
    work: 6000,
    snack: 5200
  };
  if (normalized.emotion === 'happy' || normalized.emotion === 'shy' || action === 'love') {
    emitHearts(normalized.emotion === 'shy' ? 7 : 4);
  }
  setState(action, {
    duration: proactive ? Math.min(durations[action], 4800) : durations[action],
    dialogue: String(normalized.content || '我在这里。').slice(0, 180),
    speechDuration: proactive ? 6200 : 7600
  });
}

desktopApi.onAiReply((payload) => showAiPayload(payload, false));
desktopApi.onProactiveGreeting((payload) => showAiPayload(payload, true));
desktopApi.onReminder((payload) => showAiPayload(payload, false));
desktopApi.onSyndromeVisible((payload) => showAiPayload(payload, false));
setState('idle');
