const EMOTION_ALIASES = {
  ANGRY: 'angry',
  DISGUSTED: 'angry',
  FEARFUL: 'concerned',
  HAPPY: 'happy',
  NEUTRAL: 'neutral',
  SAD: 'concerned',
  SURPRISED: 'curious'
};

const STYLE_PRESETS = {
  neutral: {
    action: 'wave',
    rate: 1,
    label: '自然',
    instruction: '请用自然、亲近、像面对面聊天一样的中文女声表达，避免播音腔和机械朗读感。'
  },
  happy: {
    action: 'jump',
    rate: 1.04,
    label: '开心',
    instruction: '请用开心、明亮、带一点自然笑意的中文女声表达，语气轻快但不要夸张。'
  },
  curious: {
    action: 'wave',
    rate: 1.02,
    label: '好奇',
    instruction: '请用好奇、灵动、略微上扬的中文女声表达，像正在认真等对方继续说。'
  },
  shy: {
    action: 'love',
    rate: 0.96,
    label: '害羞',
    instruction: '请用略带害羞、轻柔、亲近的中文女声表达，停顿自然，不要故意卖萌。'
  },
  concerned: {
    action: 'wave',
    rate: 0.93,
    label: '关心',
    instruction: '请用温柔、关心、稍慢一点的中文女声表达，像在认真安慰亲近的人。'
  },
  angry: {
    action: 'angry',
    rate: 1.03,
    label: '不满',
    instruction: '请用克制但能听出不满的中文女声表达，语气坚定，不要吼叫或戏剧化。'
  },
  sleepy: {
    action: 'lazy',
    rate: 0.9,
    label: '慵懒',
    instruction: '请用轻柔、慵懒、略带困意的中文女声表达，音量稍低，停顿放松。'
  },
  focused: {
    action: 'work',
    rate: 0.98,
    label: '认真',
    instruction: '请用清晰、沉稳、认真但不疏离的中文女声表达，重点词稍微加强。'
  }
};

function boundedNumber(value, minimum, maximum, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function normalizeAcousticProfile(value = {}) {
  return {
    averageEnergy: boundedNumber(value.averageEnergy, 0, 1),
    peakEnergy: boundedNumber(value.peakEnergy, 0, 1),
    variability: boundedNumber(value.variability, 0, 1),
    speechRatio: boundedNumber(value.speechRatio, 0, 1),
    durationMs: Math.round(boundedNumber(value.durationMs, 0, 60000)),
    vocalTone: ['soft', 'calm', 'energetic', 'urgent'].includes(value.vocalTone)
      ? value.vocalTone
      : 'calm'
  };
}

function normalizeSenseEmotion(value) {
  const token = String(value || '').replace(/[<>|]/g, '').trim().toUpperCase();
  return EMOTION_ALIASES[token] || '';
}

function textEmotion(text) {
  const content = String(text || '');
  if (/(生气|气死|烦死|讨厌|滚|别理我|不爽|恼火)/.test(content)) return 'angry';
  if (/(难过|伤心|想哭|哭了|委屈|孤独|失落|焦虑|害怕|压力|累死|撑不住)/.test(content)) return 'concerned';
  if (/(爱你|喜欢你|想你|抱抱|亲亲|害羞|脸红)/.test(content)) return 'shy';
  if (/(哈哈|嘿嘿|开心|高兴|太好了|好耶|笑死|棒极了)/.test(content)) return 'happy';
  if (/(为什么|怎么会|真的吗|什么情况|好奇|居然|竟然)/.test(content)) return 'curious';
  if (/(工作|学习|复习|考试|代码|项目|计划|专注)/.test(content)) return 'focused';
  if (/(困了|想睡|晚安|熬夜|睡觉|好困)/.test(content)) return 'sleepy';
  return '';
}

function detectUserEmotion(text, acoustic = {}, senseEmotion = '') {
  const sensed = normalizeSenseEmotion(senseEmotion);
  if (sensed && sensed !== 'neutral') return sensed;
  const fromText = textEmotion(text);
  if (fromText) return fromText;
  const profile = normalizeAcousticProfile(acoustic);
  if (profile.vocalTone === 'urgent') return 'concerned';
  if (profile.vocalTone === 'energetic') return 'happy';
  if (profile.vocalTone === 'soft') return 'shy';
  return sensed || 'neutral';
}

function inferReplyEmotion(text, fallback = 'neutral') {
  const content = String(text || '');
  if (/(笨蛋|不许|生气|不高兴|哼[。！!]?)/.test(content)) return 'angry';
  if (/(抱抱|别怕|没关系|我陪你|辛苦了|担心|好好休息)/.test(content)) return 'concerned';
  if (/(喜欢你|爱你|亲一下|才没有|害羞)/.test(content)) return 'shy';
  if (/(哈哈|太好啦|真棒|开心|好呀|当然可以)/.test(content)) return 'happy';
  if (/[？?]/.test(content)) return 'curious';
  return STYLE_PRESETS[fallback] ? fallback : 'neutral';
}

function planSpeechStyle(text, options = {}) {
  const requested = String(options.emotion || '').trim();
  const userEmotion = detectUserEmotion(
    options.userText,
    options.acoustic,
    options.senseEmotion
  );
  const emotion = STYLE_PRESETS[requested]
    ? requested
    : inferReplyEmotion(text, userEmotion === 'angry' ? 'concerned' : userEmotion);
  const preset = STYLE_PRESETS[emotion] || STYLE_PRESETS.neutral;
  return {
    emotion,
    action: preset.action,
    label: preset.label,
    instruction: preset.instruction,
    rate: boundedNumber((Number(options.baseRate) || 1) * preset.rate, 0.75, 1.3, 1)
  };
}

function extractSpeakableSegments(value, flush = false) {
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

function describeVoiceProfile(text, acoustic = {}, senseEmotion = '') {
  const profile = normalizeAcousticProfile(acoustic);
  const emotion = detectUserEmotion(text, profile, senseEmotion);
  const toneLabels = {
    soft: '声音偏轻',
    calm: '语气平稳',
    energetic: '语气有活力',
    urgent: '语速或音量显得急切'
  };
  return {
    ...profile,
    emotion,
    description: `${toneLabels[profile.vocalTone]}，情绪线索为${STYLE_PRESETS[emotion]?.label || '自然'}`
  };
}

module.exports = {
  STYLE_PRESETS,
  describeVoiceProfile,
  detectUserEmotion,
  extractSpeakableSegments,
  inferReplyEmotion,
  normalizeAcousticProfile,
  normalizeSenseEmotion,
  planSpeechStyle
};
