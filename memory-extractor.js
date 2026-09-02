const { canonicalizeMemoryKey } = require('./memory-engine');

function cleanEvidence(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function evidenceAppearsInSource(evidence, source) {
  const normalizedEvidence = cleanEvidence(evidence).replace(/[“”‘’"']/g, '');
  const normalizedSource = String(source || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000)
    .replace(/[“”‘’"']/g, '');
  return normalizedEvidence.length >= 2 && normalizedSource.includes(normalizedEvidence);
}

function memoryObjectKey(prefix, value) {
  const object = canonicalizeMemoryKey(String(value || '').replace(/[了呢呀吧啊哦]$/g, '').slice(0, 36));
  return object ? `${prefix}.${object}`.slice(0, 80) : prefix;
}

function cleanMemoryObject(value) {
  return String(value || '').trim().replace(/[了呢呀吧啊哦]+$/g, '').trim();
}

function candidate(text, key, category, importance, evidence, confidence = 0.96, metadata = {}) {
  return {
    text: String(text || '').trim().slice(0, 360),
    key: canonicalizeMemoryKey(key),
    category,
    importance,
    evidence: cleanEvidence(evidence),
    confidence,
    ...metadata
  };
}

function isTemporaryState(value) {
  const text = cleanEvidence(value);
  return /(?:今天|现在|刚刚|刚才|这会儿|此刻).{0,10}(?:有点困|困了|累了|心情不好|不开心|难过|去洗澡|去吃饭|刚吃完|吃完饭|要睡了|在排队|在路上)/.test(text)
    || /^(?:我)?(?:有点困|困了|累了|去洗澡|去吃饭|刚吃完饭|今天心情不好)[。！？!?]*$/.test(text);
}

function shouldStoreAsLongTermFact(value = {}) {
  const text = cleanEvidence(value.text || value.evidence);
  const evidence = cleanEvidence(value.evidence || text);
  if (!text || isTemporaryState(evidence)) return false;
  if (/记(?:住|得)|别忘/.test(evidence)) return true;
  if (['identity', 'preference', 'relationship', 'goal', 'routine', 'experience', 'boundary'].includes(value.category)) {
    return true;
  }
  return value.category === 'other' && Number(value.importance) >= 5 && Number(value.confidence) >= 0.9;
}

function extractStatementCandidates(statement) {
  const results = [];
  const text = cleanEvidence(statement);
  if (text.length < 3 || isTemporaryState(text)) return results;
  let match = null;
  const explicitCorrection = /(?:不是这个|我之前说错了|我前面说错了|刚才说错了|你记错了|纠正一下)/.test(text);
  let hasSpecificGoal = false;

  match = text.match(/(?:我)?(?:以前|曾经|原来)(?:很|更|一直)?喜欢(?:吃|喝|看|听|玩)?[：:,，\s]*(?:的是)?([^，。！？,.!?]{1,48})[，,；;\s]+(?:但|不过)?(?:我)?(?:现在|如今)(?:更|比较|最)?喜欢(?:吃|喝|看|听|玩)?[：:,，\s]*(?:的是)?([^，。！？,.!?]{1,48})/);
  if (match) {
    const previous = cleanMemoryObject(match[1]);
    const current = cleanMemoryObject(match[2]);
    results.push(candidate(`用户以前喜欢${previous}`, memoryObjectKey('preference.item', previous), 'preference', 4, text, 0.98, {
      temporalStatus: 'historical',
      explicitCorrection: true
    }));
    results.push(candidate(`用户现在更喜欢${current}`, memoryObjectKey('preference.item', current), 'preference', 4, text, 0.98, {
      temporalStatus: 'current',
      explicitCorrection: true
    }));
  }

  match = text.match(/(?:我)?(?:现在)?不怎么(?:喜欢|吃|喝|看|听|玩)?[：:,，\s]*([^，。！？,.!?]{1,48})了?[，,；;\s]+(?:我)?(?:现在)?更喜欢(?:吃|喝|看|听|玩)?[：:,，\s]*([^，。！？,.!?]{1,48})/);
  if (match) {
    const previous = cleanMemoryObject(match[1]);
    const current = cleanMemoryObject(match[2]);
    results.push(candidate(`用户现在不怎么喜欢${previous}`, memoryObjectKey('preference.item', previous), 'preference', 4, text, 0.98, {
      temporalStatus: 'current',
      explicitCorrection: true
    }));
    results.push(candidate(`用户现在更喜欢${current}`, memoryObjectKey('preference.item', current), 'preference', 4, text, 0.98, {
      temporalStatus: 'current',
      explicitCorrection: true
    }));
  }

  match = text.match(/(?:我)?(?:准备|计划|打算|今年要|明年要).{0,12}(?:考|通过)[：:,，\s]*([A-Za-z]{1,4}\s*\d|N\d)/i);
  if (match) {
    const exam = match[1].replace(/\s+/g, '').toUpperCase();
    hasSpecificGoal = true;
    results.push(candidate(`用户准备参加${exam}考试`, memoryObjectKey('goal.exam', exam), 'goal', 4, text, 0.97, {
      temporalStatus: 'future'
    }));
  }

  match = text.match(/([A-Za-z]{1,4}\s*\d|N\d).{0,8}(?:已经)?(?:考完|考过|通过|结束|完成)了?/i);
  if (match) {
    const exam = match[1].replace(/\s+/g, '').toUpperCase();
    results.push(candidate(`用户已完成${exam}考试`, memoryObjectKey('goal.exam', exam), 'goal', 4, text, 0.99, {
      temporalStatus: 'historical',
      effect: '考试已完成',
      explicitCorrection: true
    }));
  }

  match = text.match(/(?:我叫|我的名字是|你可以叫我)[：:,，\s]*([^，。！？,.!?]{1,24})/);
  if (match) results.push(candidate(`用户的名字是${match[1].trim()}`, 'identity.name', 'identity', 5, text));

  match = text.match(/我今年[：:,，\s]*(\d{1,3})\s*岁/);
  if (match) results.push(candidate(`用户今年${match[1]}岁`, 'identity.age', 'identity', 4, text));

  match = text.match(/我的生日(?:是|在)?[：:,，\s]*([^，。！？,.!?]{2,32})/);
  if (match) results.push(candidate(`用户的生日是${match[1].trim()}`, 'identity.birthday', 'identity', 5, text));

  match = text.match(/我(?:现在)?(?:搬到|住在)[：:,，\s]*([^，。！？,.!?]{1,48})/);
  if (match) results.push(candidate(`用户现在住在${cleanMemoryObject(match[1])}`, 'identity.location', 'identity', 4, text, 0.98, {
    temporalStatus: 'current',
    explicitCorrection: explicitCorrection || /现在|搬到/.test(text)
  }));

  match = text.match(/我(?:现在)?在[：:,，\s]*([^，。！？,.!?]{1,36})(?:工作|上班)/);
  if (match) results.push(candidate(`用户在${match[1].trim()}工作`, 'identity.workplace', 'identity', 4, text));

  match = text.match(/我(?:现在)?是(?:一名|一个)?[：:,，\s]*([^，。！？,.!?]{1,36})/);
  if (match && !/^(?:觉得|想|希望|准备)/.test(match[1])) {
    results.push(candidate(`用户是${match[1].trim()}`, 'identity.role', 'identity', 4, text));
  }

  match = text.match(/我(?:最|很|特别|比较|更|一直都)?(?:喜欢|爱)(?:吃|喝|看|听|玩)?[：:,，\s]*(?:的是)?([^，。！？,.!?]{1,72})/);
  if (match) {
    const object = cleanMemoryObject(match[1]);
    results.push(candidate(`用户喜欢${object}`, memoryObjectKey('preference.item', object), 'preference', 4, text, 0.96, {
      explicitCorrection
    }));
  }

  match = text.match(/我(?:最|很|特别|比较|一直都)?(?:不喜欢|讨厌|不爱)(?:吃|喝|看|听|玩)?[：:,，\s]*(?:的是)?([^，。！？,.!?]{1,72})/);
  if (match) {
    const object = cleanMemoryObject(match[1]);
    results.push(candidate(`用户不喜欢${object}`, memoryObjectKey('preference.item', object), 'preference', 4, text, 0.96, {
      explicitCorrection: explicitCorrection || /不再|现在|说错/.test(text)
    }));
  }

  match = text.match(/我的([^，。！？,.!?：:]{1,16})(?:是|叫|在|为)[：:,，\s]*([^，。！？,.!?]{1,80})/);
  if (match && !/密码|口令|密钥|验证码|身份证|银行卡|信用卡|支付|住址|手机号|电话|邮箱/.test(match[1])) {
    const attribute = match[1].trim();
    const value = match[2].trim();
    const category = /目标|计划|梦想/.test(attribute)
      ? 'goal'
      : /习惯|作息/.test(attribute)
        ? 'routine'
        : /称呼|昵称|关系/.test(attribute)
          ? 'relationship'
          : /喜欢|爱好|口味|偏好/.test(attribute)
            ? 'preference'
            : 'identity';
    const canonicalKey = {
      名字: 'identity.name',
      姓名: 'identity.name',
      生日: 'identity.birthday',
      年龄: 'identity.age',
      工作: 'identity.job',
      职业: 'identity.job',
      昵称: 'relationship.user_nickname',
      称呼: 'relationship.user_nickname'
    }[attribute];
    results.push(candidate(
      `用户的${attribute}是${value}`,
      canonicalKey || memoryObjectKey(`${category}.attribute`, attribute),
      category,
      category === 'identity' || category === 'relationship' ? 4 : 3,
      text,
      0.94
    ));
  }

  if (/我(?:每天|通常|一般|平时|经常|习惯)/.test(text)) {
    results.push(candidate(`用户的日常习惯：${text}`, memoryObjectKey('routine', text), 'routine', 3, text, 0.92));
  }

  if (!hasSpecificGoal && /我(?:的长期目标|的目标|的梦想|以后打算|计划|打算|希望以后|想在|准备在|今年要|明年要)/.test(text)) {
    results.push(candidate(`用户的计划或目标：${text}`, memoryObjectKey('goal', text), 'goal', 4, text, 0.92));
  }

  if (/我(?:曾经|以前|小时候|从小|已经).{2,}/.test(text) && !/(?:以前|曾经).{0,8}喜欢/.test(text)) {
    results.push(candidate(`用户的重要经历：${text}`, memoryObjectKey('experience', text), 'experience', 3, text, 0.9));
  }

  if (/我(?:不能接受|不接受|不希望你|不想让你)|(?:请|以后)?不要(?:再)?对我/.test(text)) {
    results.push(candidate(`用户明确表达的边界：${text}`, memoryObjectKey('boundary', text), 'boundary', 5, text, 0.96));
  }

  match = text.match(/(?:以后|你可以|请)(?:叫我|称呼我)[：:,，\s]*([^，。！？,.!?]{1,24})/);
  if (match) results.push(candidate(`用户希望被称呼为${match[1].trim()}`, 'relationship.user_nickname', 'relationship', 5, text));

  match = text.match(/(?:请|你(?:一定)?要|一定要)?记(?:住|得)(?:一下|了|这件事)?[：:,，\s]*(.{3,180})/);
  if (match) {
    const remembered = match[1].trim();
    results.push(candidate(`用户明确要求记住：${remembered}`, memoryObjectKey('explicit', remembered), 'other', 5, text, 1));
  }

  return results;
}

function extractExplicitMemoryCandidates(value) {
  const source = String(value || '').trim().slice(0, 12000);
  if (!source) return [];
  const statements = source
    .split(/(?<=[。！？!?；;])|\n+/)
    .map(cleanEvidence)
    .filter((statement) => statement.length >= 3);
  const unique = new Map();
  for (const statement of statements) {
    for (const item of extractStatementCandidates(statement)) {
      const id = item.key || `${item.category}:${item.text}`;
      const previous = unique.get(id);
      if (!previous || item.importance > previous.importance) unique.set(id, item);
    }
  }
  return Array.from(unique.values()).slice(0, 32);
}

module.exports = {
  cleanEvidence,
  evidenceAppearsInSource,
  extractExplicitMemoryCandidates,
  isTemporaryState,
  shouldStoreAsLongTermFact
};
