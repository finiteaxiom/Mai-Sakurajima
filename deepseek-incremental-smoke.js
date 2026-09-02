'use strict';

const { createHash } = require('node:crypto');

// Development-only, content-free structured-prompt diagnosis. This module is
// deliberately independent of Electron; Main supplies production sections and
// the existing ModelGateway request function.

function text(value) {
  return String(value || '');
}

function orderedSections(sections) {
  return (Array.isArray(sections) ? sections : [])
    .filter((section) => typeof section?.name === 'string' && text(section.text))
    .map((section) => ({ name: section.name, text: text(section.text) }));
}

function promptFor(sections, names) {
  const included = new Set(names);
  return sections
    .filter((section) => included.has(section.name))
    .map((section) => section.text)
    .join('\n');
}

function includedInProductionOrder(sections, names) {
  const included = new Set(names);
  return sections.filter((section) => included.has(section.name)).map((section) => section.name);
}

function buildIncrementalCases(sections) {
  const normalized = orderedSections(sections);
  const names = normalized.map((section) => section.name);
  const core = names.includes('core_system') ? 'core_system' : names[0];
  const contract = names.includes('structured_reply_contract') ? 'structured_reply_contract' : null;
  const selected = new Set([core, contract].filter(Boolean));
  const cases = [{
    case: 'REAL_R1',
    addedSection: contract || core,
    includedSections: includedInProductionOrder(normalized, selected)
  }];
  for (const name of names) {
    if (selected.has(name)) continue;
    selected.add(name);
    cases.push({
      case: `REAL_R${cases.length + 1}`,
      addedSection: name,
      includedSections: includedInProductionOrder(normalized, selected)
    });
  }
  return cases;
}

function sectionFeatures(section) {
  const value = text(section?.text);
  const includes = (pattern) => pattern.test(value);
  return {
    chars: value.length,
    lineCount: value ? value.split(/\r?\n/).length : 0,
    containsJsonKeyword: includes(/json/i),
    containsMarkdownFence: includes(/```/),
    containsInstructionLikePhrases: includes(/只输出|不要输出|必须|忽略|system|assistant|JSON/i),
    containsBraces: includes(/[{}]/),
    containsQuotes: includes(/["'“”‘’]/),
    containsRoleWords: includes(/system|assistant|user|用户|麻衣/i),
    containsSystemLikeMarkers: includes(/(^|\n)\s*(system|assistant|user)\s*[:：]/im)
  };
}

function messageProfile(messages) {
  const normalized = Array.isArray(messages) ? messages : [];
  return {
    conversation_message_count: normalized.length,
    conversation_chars: normalized.reduce((total, message) => total + text(message?.content).length, 0),
    conversation_roles: normalized.map((message) => String(message?.role || 'unknown')).join('|')
  };
}

function messageMetadata(messages) {
  return (Array.isArray(messages) ? messages : []).map((message, index) => {
    const value = text(message?.content);
    let structuredPayloadPresent = false;
    try {
      const parsed = JSON.parse(value);
      structuredPayloadPresent = Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
    } catch {
      // A boolean is sufficient; the diagnostic must never preserve content.
    }
    return {
      message_index: index,
      role: String(message?.role || 'unknown'),
      chars: value.length,
      content_hash: createHash('sha256').update(value, 'utf8').digest('hex'),
      message_type: structuredPayloadPresent ? 'structured_payload' : 'plain',
      structured_payload_present: structuredPayloadPresent,
      contains_json_object_like_text: /\{\s*"[^"\n]+"\s*:/.test(value),
      contains_markdown_code_fence: /```/.test(value),
      contains_xml_like_tags: /<\/?[a-z][^>]*>/i.test(value),
      contains_parenthetical_roleplay: /[（(][^)）]{1,80}[）)]/.test(value),
      contains_system_like_prefix: /(^|\n)\s*system\s*[:：]/im.test(value),
      contains_assistant_like_prefix: /(^|\n)\s*assistant\s*[:：]/im.test(value),
      contains_user_like_prefix: /(^|\n)\s*user\s*[:：]/im.test(value),
      contains_nested_quotes: /["“”'‘’].{0,200}["“”'‘’]/s.test(value),
      contains_backticks: /`/.test(value),
      contains_braces: /[{}]/.test(value),
      contains_square_brackets: /[\[\]]/.test(value),
      control_char_count: (value.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g) || []).length,
      zero_width_char_count: (value.match(/[\u200B\u200C\u200D\uFEFF]/g) || []).length,
      unusual_unicode_count: (value.match(/[\u2028\u2029\u2060\u2066-\u2069]/g) || []).length,
      large_whitespace_runs: /\s{5,}/.test(value),
      internal_metadata_present: /\b(?:memory|memories|episodes|topics|people|projects|habits|commitments|mind|action|emotion)\b/i.test(value)
    };
  });
}

function safeResponseRecord({ testCase, response, error, systemPrompt, messages }) {
  const shape = response?.responseMetadata || {};
  const raw = text(response?.rawContent);
  let jsonParseable = false;
  if (raw.trim()) {
    try {
      JSON.parse(raw);
      jsonParseable = true;
    } catch {
      // This is intentionally a boolean-only diagnostic.
    }
  }
  const responseContentChars = Number.isFinite(shape.contentChars) ? shape.contentChars : null;
  const responseContentNonWhitespaceChars = Number.isFinite(shape.contentNonWhitespaceChars)
    ? shape.contentNonWhitespaceChars
    : null;
  return {
    case: testCase.case,
    added_section: testCase.addedSection || null,
    included_sections: Array.isArray(testCase.includedSections) ? testCase.includedSections : [],
    section_count: Array.isArray(testCase.includedSections) ? testCase.includedSections.length : 0,
    system_prompt_chars: text(systemPrompt).length,
    ...messageProfile(messages),
    message_metadata: messageMetadata(messages),
    http_status: Number.isFinite(shape.httpStatus) ? shape.httpStatus : null,
    model: response?.model || null,
    finish_reason: response?.finishReason || '',
    prompt_tokens: Number.isFinite(response?.usage?.promptTokens) ? response.usage.promptTokens : null,
    completion_tokens: Number.isFinite(response?.usage?.completionTokens) ? response.usage.completionTokens : null,
    content_chars: responseContentChars,
    content_non_whitespace_chars: responseContentNonWhitespaceChars,
    json_parseable: jsonParseable,
    reasoning_content_present: shape.reasoningContentPresent === true,
    tool_calls_count: Number.isFinite(shape.toolCallsCount) ? shape.toolCallsCount : null,
    success: Boolean(response && jsonParseable && responseContentNonWhitespaceChars > 0),
    suspect: false,
    error_code: error?.code || null,
    provider_status: Number.isFinite(error?.status) ? error.status : null
  };
}

async function executeCase({ testCase, sections, request, messages, maxTokens }) {
  const systemPrompt = promptFor(sections, testCase.includedSections);
  try {
    const response = await request({
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      maxTokens,
      structured: true
    });
    return safeResponseRecord({ testCase, response, systemPrompt, messages });
  } catch (error) {
    return safeResponseRecord({ testCase, error, systemPrompt, messages });
  }
}

function csvCell(value) {
  const valueText = value === null || value === undefined
    ? ''
    : Array.isArray(value) ? value.join('|') : String(value);
  return /[",\r\n]/.test(valueText) ? `"${valueText.replaceAll('"', '""')}"` : valueText;
}

function writeResults({ fileSystem, pathModule, directory, records, baseName = 'deepseek-json-incremental-smoke' }) {
  if (!fileSystem || !pathModule || !directory) return null;
  const jsonlPath = pathModule.join(directory, `${baseName}.jsonl`);
  const csvPath = pathModule.join(directory, `${baseName}-summary.csv`);
  const headers = [
    'case', 'added_section', 'section_count', 'system_prompt_chars', 'conversation_message_count',
    'conversation_chars', 'conversation_roles', 'content_chars',
    'content_non_whitespace_chars', 'json_parseable', 'finish_reason', 'prompt_tokens',
    'completion_tokens', 'success', 'suspect'
  ];
  fileSystem.mkdirSync(directory, { recursive: true });
  fileSystem.writeFileSync(jsonlPath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
  fileSystem.writeFileSync(
    csvPath,
    `${[headers.join(',')].concat(records.map((record) => headers.map((key) => csvCell(record[key])).join(','))).join('\n')}\n`,
    'utf8'
  );
  return { jsonlPath, csvPath };
}

function splitConversationTurns(messages) {
  const normalized = Array.isArray(messages) ? messages : [];
  const latestUser = normalized.at(-1)?.role === 'user' ? normalized.at(-1) : null;
  if (!latestUser) throw new Error('Conversation message bisect requires a final user message.');
  const history = normalized.slice(0, -1);
  const turns = [];
  for (let index = 0; index < history.length;) {
    if (history[index]?.role === 'user' && history[index + 1]?.role === 'assistant') {
      turns.push([history[index], history[index + 1]]);
      index += 2;
    } else {
      // Retain unusual saved role order as an opaque one-message unit instead
      // of silently altering the conversation being diagnosed.
      turns.push([history[index]]);
      index += 1;
    }
  }
  return { latestUser, turns };
}

async function runConversationMessageBisect({ sections, request, messages, maxTokens = 700, fileSystem, pathModule, directory } = {}) {
  if (typeof request !== 'function') throw new TypeError('Conversation message bisect requires request().');
  const normalizedSections = orderedSections(sections);
  const selectedNames = ['core_system', 'structured_reply_contract']
    .filter((name) => normalizedSections.some((section) => section.name === name));
  if (selectedNames.length !== 2) throw new Error('Conversation message bisect requires core_system and structured_reply_contract.');
  const { latestUser, turns } = splitConversationTurns(messages);
  const records = [];
  const evaluate = async (label, rangeStart, rangeEnd) => {
    const history = turns.slice(rangeStart, rangeEnd).flat();
    const record = await executeCase({
      testCase: {
        case: label,
        addedSection: 'conversation_history',
        includedSections: selectedNames
      },
      sections: normalizedSections,
      request,
      messages: [...history, latestUser],
      maxTokens
    });
    record.history_turn_start = rangeStart;
    record.history_turn_end = rangeEnd;
    record.history_turn_count = rangeEnd - rangeStart;
    records.push(record);
    return record;
  };

  const base = await evaluate('SESSION_BASE_LATEST_USER', 0, 0);
  const full = await evaluate('SESSION_FULL_HISTORY', 0, turns.length);
  let outcome = {
    kind: 'full_history_passed',
    candidateTurnRange: null
  };

  if (base.success !== true) {
    outcome = { kind: 'latest_user_message', candidateTurnRange: null };
  } else if (full.success !== true) {
    const narrowOneFailingRange = async (initialStart, initialEnd) => {
      let rangeStart = initialStart;
      let rangeEnd = initialEnd;
      while (rangeEnd - rangeStart > 1) {
      const midpoint = rangeStart + Math.floor((rangeEnd - rangeStart) / 2);
      const left = await evaluate(`SESSION_RANGE_${rangeStart}_${midpoint}`, rangeStart, midpoint);
      const right = await evaluate(`SESSION_RANGE_${midpoint}_${rangeEnd}`, midpoint, rangeEnd);
      if (left.success !== true && right.success === true) {
        rangeEnd = midpoint;
        continue;
      }
      if (left.success === true && right.success !== true) {
        rangeStart = midpoint;
        continue;
      }
      if (left.success !== true && right.success !== true) {
        // Either half is an independently failing witness. Keep narrowing one
        // deterministically; callers retain the other root range separately.
        rangeEnd = midpoint;
        continue;
      }
      return { kind: 'history_combination', candidateTurnRange: [rangeStart, rangeEnd] };
      }
      return { kind: 'single_history_turn', candidateTurnRange: [rangeStart, rangeEnd] };
    };

    if (turns.length === 1) {
      outcome = { kind: 'single_history_turn', candidateTurnRange: [0, 1] };
    } else {
      const midpoint = Math.floor(turns.length / 2);
      const left = await evaluate(`SESSION_RANGE_0_${midpoint}`, 0, midpoint);
      const right = await evaluate(`SESSION_RANGE_${midpoint}_${turns.length}`, midpoint, turns.length);
      if (left.success !== true && right.success !== true) {
        // Keep diagnostics serial so the Provider sees a deterministic request
        // sequence and response/cache accounting is not interleaved.
        const leftOutcome = await narrowOneFailingRange(0, midpoint);
        const rightOutcome = await narrowOneFailingRange(midpoint, turns.length);
        outcome = {
          kind: 'multiple_independent_history_ranges',
          candidateTurnRanges: [leftOutcome.candidateTurnRange, rightOutcome.candidateTurnRange]
        };
      } else if (left.success !== true) {
        outcome = await narrowOneFailingRange(0, midpoint);
      } else if (right.success !== true) {
        outcome = await narrowOneFailingRange(midpoint, turns.length);
      } else {
        outcome = { kind: 'history_combination', candidateTurnRange: [0, turns.length] };
      }
    }
  }

  const paths = writeResults({
    fileSystem,
    pathModule,
    directory,
    records,
    baseName: 'deepseek-session-message-bisect'
  });
  return {
    historyTurnCount: turns.length,
    basePassed: base.success === true,
    fullHistoryPassed: full.success === true,
    outcome,
    records,
    paths
  };
}

async function runConversationMessageShapeAudit({ sections, request, messages, maxTokens = 700, fileSystem, pathModule, directory } = {}) {
  if (typeof request !== 'function') throw new TypeError('Conversation message shape audit requires request().');
  const normalizedSections = orderedSections(sections);
  const selectedNames = ['core_system', 'structured_reply_contract']
    .filter((name) => normalizedSections.some((section) => section.name === name));
  if (selectedNames.length !== 2) throw new Error('Conversation message shape audit requires core_system and structured_reply_contract.');
  const { latestUser, turns } = splitConversationTurns(messages);
  const selectedTurn = turns[0];
  const historicalUser = selectedTurn?.find((message) => message?.role === 'user');
  const historicalAssistant = selectedTurn?.find((message) => message?.role === 'assistant');
  if (!historicalUser || !historicalAssistant) {
    throw new Error('Conversation message shape audit requires a saved user/assistant turn.');
  }
  const auditCases = [
    { case: 'SHAPE_BASE_LATEST_USER', messages: [latestUser] },
    { case: 'SHAPE_HISTORICAL_USER_ONLY', messages: [historicalUser, latestUser] },
    { case: 'SHAPE_HISTORICAL_ASSISTANT_ONLY', messages: [historicalAssistant, latestUser] },
    { case: 'SHAPE_HISTORICAL_PAIR_ORIGINAL', messages: [...selectedTurn, latestUser] },
    { case: 'SHAPE_ASSISTANT_AS_USER', messages: [{ ...historicalAssistant, role: 'user' }, latestUser] },
    { case: 'SHAPE_FIXED_ASSISTANT_JSON', messages: [{ role: 'assistant', content: '{"reply":"好的"}' }, latestUser] },
    { case: 'SHAPE_FIXED_ASSISTANT_TEXT', messages: [{ role: 'assistant', content: '好的' }, latestUser] },
    { case: 'SHAPE_ACTUAL_USER_FIXED_ASSISTANT_JSON', messages: [historicalUser, { role: 'assistant', content: '{"reply":"好的"}' }, latestUser] },
    { case: 'SHAPE_ACTUAL_USER_FIXED_ASSISTANT_TEXT', messages: [historicalUser, { role: 'assistant', content: '好的' }, latestUser] },
    { case: 'SHAPE_FIXED_USER_ACTUAL_ASSISTANT', messages: [{ role: 'user', content: '这是安全固定的历史用户消息。' }, historicalAssistant, latestUser] }
  ];
  const records = [];
  for (const auditCase of auditCases) {
    records.push(await executeCase({
      testCase: {
        case: auditCase.case,
        addedSection: 'conversation_message_shape',
        includedSections: selectedNames
      },
      sections: normalizedSections,
      request,
      messages: auditCase.messages,
      maxTokens
    }));
  }
  const paths = writeResults({
    fileSystem,
    pathModule,
    directory,
    records,
    baseName: 'deepseek-session-message-shape-audit'
  });
  return { selectedTurnIndex: 0, records, paths };
}

async function runIncrementalSmoke({ sections, request, messages, maxTokens = 700, fileSystem, pathModule, directory } = {}) {
  if (typeof request !== 'function') throw new TypeError('Incremental smoke requires request().');
  const normalized = orderedSections(sections);
  const safeMessages = Array.isArray(messages) ? messages : [];
  const cases = buildIncrementalCases(normalized);
  const records = [];
  for (const testCase of cases) {
    records.push(await executeCase({ testCase, sections: normalized, request, messages: safeMessages, maxTokens }));
  }

  const firstFailureIndex = records.findIndex((record) => record.success !== true);
  const firstFailure = firstFailureIndex >= 0 ? records[firstFailureIndex] : null;
  const lastSuccess = firstFailureIndex > 0
    ? records[firstFailureIndex - 1]
    : firstFailureIndex === -1 ? records[cases.length - 1] : null;
  if (firstFailure) {
    firstFailure.suspect = true;
    const baseNames = ['core_system', 'structured_reply_contract'].filter((name) => normalized.some((section) => section.name === name));
    const suspect = firstFailure.added_section;
    const isolateCases = [
      {
        case: 'ISOLATE_BASE_PLUS_SUSPECT',
        addedSection: suspect,
        includedSections: includedInProductionOrder(normalized, new Set([...baseNames, suspect]))
      },
      {
        case: 'ISOLATE_FULL_MINUS_SUSPECT',
        addedSection: suspect,
        includedSections: normalized.filter((section) => section.name !== suspect).map((section) => section.name)
      }
    ];
    for (const testCase of isolateCases) {
      const record = await executeCase({ testCase, sections: normalized, request, messages: safeMessages, maxTokens });
      record.suspect = true;
      records.push(record);
    }
  } else {
    const allNames = normalized.map((section) => section.name);
    for (const historyCount of [0, 1, 3, 5]) {
      const history = Array.from({ length: historyCount }, (_, index) => ([
        { role: 'user', content: `这是安全的固定历史问题 ${index + 1}。` },
        { role: 'assistant', content: '{"reply":"这是安全的固定历史回复","action":"wave","emotion":"calm"}' }
      ])).flat();
      records.push(await executeCase({
        testCase: {
          case: `HISTORY_${historyCount}_TURNS`,
          addedSection: `history_${historyCount}_turns`,
          includedSections: allNames
        },
        sections: normalized,
        request,
        messages: [...history, ...safeMessages],
        maxTokens
      }));
    }
  }

  const suspectFeatures = firstFailure
    ? sectionFeatures(normalized.find((section) => section.name === firstFailure.added_section))
    : null;
  const paths = writeResults({ fileSystem, pathModule, directory, records });
  return {
    productionSectionOrder: normalized.map((section) => section.name),
    records,
    allIncrementalCasesPassed: firstFailure === null,
    lastSuccessCase: lastSuccess?.case || null,
    firstFailureCase: firstFailure?.case || null,
    firstFailureAddedSection: firstFailure?.added_section || null,
    suspectFeatures,
    paths
  };
}

module.exports = {
  buildIncrementalCases,
  runConversationMessageShapeAudit,
  runConversationMessageBisect,
  runIncrementalSmoke,
  sectionFeatures
};
