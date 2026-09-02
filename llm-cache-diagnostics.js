'use strict';

const { createHash } = require('node:crypto');

// TEMPORARY: development-only DeepSeek Prompt Cache observation. This module
// intentionally receives only usage metadata and prompt sizes; it never logs
// message, memory, persona, response, configuration, or credential content.

function nonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function cacheHitRate(hitTokens, missTokens) {
  const hit = nonNegativeNumber(hitTokens);
  const miss = nonNegativeNumber(missTokens);
  if (hit === null || miss === null) return null;
  const total = hit + miss;
  return total > 0 ? hit / total : null;
}

function formatCount(value) {
  const normalized = nonNegativeNumber(value);
  return normalized === null ? 'N/A' : String(normalized);
}

function formatRate(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'N/A';
}

function messageChars(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((total, message) => (
    total + String(message?.content || '').length
  ), 0);
}

function estimate(value, estimateTokenCount) {
  try {
    return nonNegativeNumber(estimateTokenCount(value));
  } catch {
    return null;
  }
}

function buildPromptComposition({ systemPrompt, messages, estimateTokenCount } = {}) {
  const conversation = Array.isArray(messages) ? messages : [];
  const system = String(systemPrompt || '');
  const finalMessages = [{ role: 'system', content: system }, ...conversation];
  return {
    systemPromptChars: system.length,
    systemPromptTokens: estimate(system, estimateTokenCount),
    conversationHistoryChars: messageChars(conversation),
    conversationHistoryTokens: estimate(JSON.stringify(conversation), estimateTokenCount),
    messageCount: finalMessages.length,
    promptTotalTokens: estimate(JSON.stringify(finalMessages), estimateTokenCount)
  };
}

function promptSectionDigest(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function normalizePromptSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .filter((section) => typeof section?.name === 'string')
    .map((section) => ({
      name: section.name,
      chars: String(section.text || '').length,
      hash: promptSectionDigest(section.text)
    }));
}

function buildPrefixStability(sections, previousHashes, estimateTokenCount) {
  const normalized = normalizePromptSections(sections);
  if (!normalized.length) {
    return {
      lines: [],
      firstChangedSection: null,
      stablePrefixChars: null,
      stablePrefixTokens: null
    };
  }

  let stablePrefixChars = 0;
  let canContinuePrefix = true;
  const stablePrefixTexts = [];
  const sectionTextByName = new Map((Array.isArray(sections) ? sections : [])
    .filter((section) => typeof section?.name === 'string')
    .map((section) => [section.name, String(section.text || '')]));
  const hasPreviousRequest = normalized.every((section) => previousHashes.has(section.name));
  let firstChangedSection = '';
  const lines = ['[Prompt Prefix Stability]'];
  for (const section of normalized) {
    const previousHash = previousHashes.get(section.name);
    const changed = previousHash === undefined ? null : previousHash !== section.hash;
    if (canContinuePrefix && changed === false) {
      stablePrefixChars += section.chars;
      stablePrefixTexts.push(sectionTextByName.get(section.name) || '');
    } else if (changed !== false) {
      canContinuePrefix = false;
      if (changed === true && !firstChangedSection) firstChangedSection = section.name;
    }
    lines.push(`${section.name}: chars=${section.chars}, hash=${section.hash}, hash_changed=${changed === null ? 'N/A' : String(changed)}`);
  }
  const stablePrefixTokens = hasPreviousRequest
    ? estimate(stablePrefixTexts.join('\n'), estimateTokenCount)
    : null;
  const stablePrefix = hasPreviousRequest ? stablePrefixChars : 'N/A';
  lines.push(`first_changed_section: ${hasPreviousRequest ? firstChangedSection || 'none' : 'N/A'}`);
  lines.push(`stable_prefix_chars: ${stablePrefix}`);
  lines.push(`stable_prefix_tokens_estimate: ${formatCount(stablePrefixTokens)}`);
  lines.push(`stable_prefix_chars_since_previous_request: ${stablePrefix}`);
  for (const section of normalized) {
    previousHashes.set(section.name, section.hash);
  }
  return {
    lines,
    firstChangedSection: hasPreviousRequest ? firstChangedSection || 'none' : null,
    stablePrefixChars: hasPreviousRequest ? stablePrefixChars : null,
    stablePrefixTokens
  };
}

function buildPrefixStabilityLines(sections, previousHashes, estimateTokenCount) {
  return buildPrefixStability(sections, previousHashes, estimateTokenCount).lines;
}

function createTurnTotals() {
  return {
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    unavailable: new Set(),
    fallback: false,
    fallbackReasons: new Set(),
    mainFinishReason: null,
    mainContentChars: null,
    mainContentNonWhitespaceChars: null
  };
}

function addUsage(totals, key, value) {
  const normalized = nonNegativeNumber(value);
  if (normalized === null) {
    totals.unavailable.add(key);
    return;
  }
  totals[key] += normalized;
}

function formatTurnDiagnostic(turnId, totals) {
  const total = (key) => formatCount(totals.unavailable.has(key) ? null : totals[key]);
  return [
    '[LLM Turn Diagnostic]',
    `turn_id: ${turnId}`,
    `request_count: ${totals.requestCount}`,
    '',
    `total_prompt_tokens: ${total('promptTokens')}`,
    `total_completion_tokens: ${total('completionTokens')}`,
    `total_cache_hit_tokens: ${total('cacheHitTokens')}`,
    `total_cache_miss_tokens: ${total('cacheMissTokens')}`,
    `fallback: ${totals.fallback}`,
    `fallback_reason: ${[...totals.fallbackReasons].join('|') || 'N/A'}`
  ];
}

function requestDiagnosticLines(request = {}) {
  return [
    '[LLM Request Diagnostic]',
    `turn_id: ${String(request.turnId || 'N/A')}`,
    `request_id: ${String(request.requestId || 'N/A')}`,
    `request_purpose: ${String(request.requestPurpose || 'unspecified')}`,
    `caller: ${String(request.caller || 'ChatRequestService')}`,
    `streaming: ${request.streaming === true}`,
    `model: ${String(request.model || 'N/A')}`
  ];
}

function structuredFallbackLines(request = {}, fallback = null, structured = null) {
  if (!fallback) return [];
  const provider = structured?.providerContent;
  return [
    '[Structured Fallback Diagnostic]',
    `turn_id: ${String(request.turnId || 'N/A')}`,
    `request_id: ${String(request.requestId || 'N/A')}`,
    `fallback_reason: ${String(fallback.reason || 'UNKNOWN_STRUCTURED_FAILURE')}`,
    `will_fallback: ${fallback.willFallback === true}`,
    `finish_reason: ${String(structured?.finishReason || 'N/A')}`,
    `response_chars: ${formatCount(structured?.responseChars)}`,
    `schema_valid: ${structured?.schemaValid === null || structured?.schemaValid === undefined ? 'N/A' : String(structured.schemaValid)}`,
    `visible_reply_present: ${structured?.visibleReplyPresent === null || structured?.visibleReplyPresent === undefined ? 'N/A' : String(structured.visibleReplyPresent)}`,
    `structured_parse_success: ${structured?.structuredParseSuccess === null || structured?.structuredParseSuccess === undefined ? 'N/A' : String(structured.structuredParseSuccess)}`,
    `parser_error_code: ${String(structured?.parserErrorCode || 'N/A')}`,
    `provider_content_type: ${String(provider?.contentType || 'N/A')}`,
    `provider_content_present: ${provider?.contentPresent === true}`,
    `provider_reasoning_content_present: ${provider?.reasoningContentPresent === true}`,
    `provider_error_code: ${String(fallback.providerErrorCode || 'N/A')}`,
    `provider_http_status: ${formatCount(fallback.providerStatus)}`
  ];
}

function deepSeekResponseShapeLines(request = {}, structured = null) {
  if (!structured?.providerContent) return [];
  const provider = structured.providerContent;
  return [
    '[DeepSeek Response Shape]',
    `request_id: ${String(request.requestId || 'N/A')}`,
    `structured: true`,
    `choices_count: ${formatCount(provider.choicesCount)}`,
    `finish_reason: ${String(structured.finishReason || 'N/A')}`,
    `message_role: ${String(provider.messageRole || 'N/A')}`,
    `content_type: ${String(provider.contentType || 'N/A')}`,
    `content_chars: ${formatCount(provider.contentChars)}`,
    `content_non_whitespace_chars: ${formatCount(provider.contentNonWhitespaceChars)}`,
    `reasoning_content_present: ${provider.reasoningContentPresent === true}`,
    `reasoning_content_type: ${String(provider.reasoningContentType || 'N/A')}`,
    `reasoning_content_chars: ${formatCount(provider.reasoningContentChars)}`,
    `reasoning_content_non_whitespace_chars: ${formatCount(provider.reasoningContentNonWhitespaceChars)}`,
    `tool_calls_present: ${provider.toolCallsPresent === true}`,
    `tool_calls_count: ${formatCount(provider.toolCallsCount)}`,
    `function_call_present: ${provider.functionCallPresent === true}`,
    `refusal_present: ${provider.refusalPresent === true}`
  ];
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function turnSummaryRecord(turnId, totals) {
  const total = (key) => totals.unavailable.has(key) ? null : totals[key];
  const hit = total('cacheHitTokens');
  const miss = total('cacheMissTokens');
  return {
    turn_id: turnId,
    request_count: totals.requestCount,
    total_prompt_tokens: total('promptTokens'),
    total_completion_tokens: total('completionTokens'),
    total_cache_hit_tokens: hit,
    total_cache_miss_tokens: miss,
    cache_hit_rate: cacheHitRate(hit, miss),
    fallback: totals.fallback,
    fallback_reason: [...totals.fallbackReasons].join('|'),
    main_finish_reason: totals.mainFinishReason,
    main_content_chars: totals.mainContentChars,
    main_content_non_whitespace_chars: totals.mainContentNonWhitespaceChars
  };
}

function summarizeTurnRecords(records) {
  const rows = Array.isArray(records) ? records : [];
  const fallbackReasons = {};
  let fallbackTurns = 0;
  let promptTotal = 0;
  let promptCount = 0;
  let mainCacheRateTotal = 0;
  let mainCacheRateCount = 0;
  let fallbackCacheRateTotal = 0;
  let fallbackCacheRateCount = 0;
  for (const row of rows) {
    if (row?.fallback === true) {
      fallbackTurns += 1;
      for (const reason of String(row.fallback_reason || '').split('|').filter(Boolean)) {
        fallbackReasons[reason] = (fallbackReasons[reason] || 0) + 1;
      }
    }
    if (Number.isFinite(row?.total_prompt_tokens)) {
      promptTotal += row.total_prompt_tokens;
      promptCount += 1;
    }
    if (Number.isFinite(row?.cache_hit_rate)) {
      if (row?.fallback === true) {
        fallbackCacheRateTotal += row.cache_hit_rate;
        fallbackCacheRateCount += 1;
      } else {
        mainCacheRateTotal += row.cache_hit_rate;
        mainCacheRateCount += 1;
      }
    }
  }
  return {
    turns: rows.length,
    fallbackTurns,
    fallbackRate: rows.length ? fallbackTurns / rows.length : null,
    averagePromptTokensPerTurn: promptCount ? promptTotal / promptCount : null,
    averageCacheHitRateMain: mainCacheRateCount ? mainCacheRateTotal / mainCacheRateCount : null,
    averageCacheHitRateFallback: fallbackCacheRateCount ? fallbackCacheRateTotal / fallbackCacheRateCount : null,
    fallbackReasons
  };
}

function createDiagnosticFileWriter({ fileSystem, pathModule, directory, maxBytes = 4 * 1024 * 1024 } = {}) {
  if (!fileSystem || !pathModule || !directory) {
    return { appendRequest() {}, writeTurnSummaries() {} };
  }
  const jsonlPath = pathModule.join(directory, 'llm-diagnostics.jsonl');
  const csvPath = pathModule.join(directory, 'llm-turn-summary.csv');
  const ensureDirectory = () => fileSystem.mkdirSync(directory, { recursive: true });
  const prepareJsonl = () => {
    try {
      if (fileSystem.existsSync(jsonlPath) && fileSystem.statSync(jsonlPath).size >= maxBytes) {
        fileSystem.writeFileSync(jsonlPath, '', 'utf8');
      }
    } catch {
      // A diagnostic write must never affect Chat.
    }
  };
  return {
    appendRequest(record) {
      try {
        ensureDirectory();
        prepareJsonl();
        fileSystem.appendFileSync(jsonlPath, `${JSON.stringify(record)}\n`, 'utf8');
      } catch {
        // A diagnostic write must never affect Chat.
      }
    },
    writeTurnSummaries(rows) {
      try {
        ensureDirectory();
        const headers = [
          'turn_id', 'request_count', 'total_prompt_tokens', 'total_completion_tokens',
          'total_cache_hit_tokens', 'total_cache_miss_tokens', 'cache_hit_rate',
          'fallback', 'fallback_reason', 'main_finish_reason', 'main_content_chars',
          'main_content_non_whitespace_chars'
        ];
        const csv = [headers.join(',')]
          .concat((Array.isArray(rows) ? rows : []).map((row) => headers.map((key) => csvCell(row[key])).join(',')))
          .join('\n');
        fileSystem.writeFileSync(csvPath, `${csv}\n`, 'utf8');
      } catch {
        // A diagnostic write must never affect Chat.
      }
    },
    paths: { jsonlPath, csvPath }
  };
}

function createLlmCacheDiagnosticLogger({
  enabled = false,
  logger = console.info,
  fileSystem = null,
  pathModule = null,
  directory = ''
} = {}) {
  if (enabled !== true || typeof logger !== 'function') return () => {};

  const previousSectionHashesByPurpose = new Map();
  const turnTotalsById = new Map();
  const fileWriter = createDiagnosticFileWriter({ fileSystem, pathModule, directory });

  return ({ usage, systemPrompt, messages, promptSections, request, structured, fallback, estimateTokenCount } = {}) => {
    try {
      const hitTokens = nonNegativeNumber(usage?.promptCacheHitTokens);
      const missTokens = nonNegativeNumber(usage?.promptCacheMissTokens);
      const composition = buildPromptComposition({ systemPrompt, messages, estimateTokenCount });
      const purposeKey = `${String(request?.requestPurpose || 'unspecified')}:${request?.streaming === true}`;
      const previousSectionHashes = previousSectionHashesByPurpose.get(purposeKey) || new Map();
      previousSectionHashesByPurpose.set(purposeKey, previousSectionHashes);
      const turnId = String(request?.turnId || 'N/A');
      const totals = turnTotalsById.get(turnId) || createTurnTotals();
      totals.requestCount += 1;
      addUsage(totals, 'promptTokens', usage?.promptTokens);
      addUsage(totals, 'completionTokens', usage?.completionTokens);
      addUsage(totals, 'cacheHitTokens', usage?.promptCacheHitTokens);
      addUsage(totals, 'cacheMissTokens', usage?.promptCacheMissTokens);
      if (request?.isFallbackRequest === true || fallback?.willFallback === true) {
        totals.fallback = true;
      }
      if (fallback?.reason) totals.fallbackReasons.add(String(fallback.reason));
      if (request?.fallbackReason) totals.fallbackReasons.add(String(request.fallbackReason));
      if (request?.isFallbackRequest !== true && structured?.providerContent) {
        totals.mainFinishReason = structured.finishReason || null;
        totals.mainContentChars = nonNegativeNumber(structured.providerContent.contentChars);
        totals.mainContentNonWhitespaceChars = nonNegativeNumber(
          structured.providerContent.contentNonWhitespaceChars
        );
      }
      turnTotalsById.set(turnId, totals);
      if (turnTotalsById.size > 120) turnTotalsById.delete(turnTotalsById.keys().next().value);
      const prefixStability = buildPrefixStability(promptSections, previousSectionHashes, estimateTokenCount);
      const turnRows = [...turnTotalsById.entries()]
        .map(([id, turn]) => turnSummaryRecord(id, turn));
      fileWriter.appendRequest({
        timestamp: new Date().toISOString(),
        turn_id: turnId,
        request_id: request?.requestId || null,
        request_purpose: request?.requestPurpose || 'unspecified',
        caller: request?.caller || 'ChatRequestService',
        streaming: request?.streaming === true,
        model: request?.model || null,
        prompt_tokens: nonNegativeNumber(usage?.promptTokens),
        completion_tokens: nonNegativeNumber(usage?.completionTokens),
        cache_hit_tokens: hitTokens,
        cache_miss_tokens: missTokens,
        cache_hit_rate: cacheHitRate(hitTokens, missTokens),
        first_changed_section: prefixStability.firstChangedSection,
        stable_prefix_chars: prefixStability.stablePrefixChars,
        stable_prefix_tokens_estimate: prefixStability.stablePrefixTokens,
        fallback: fallback?.willFallback === true || request?.isFallbackRequest === true,
        fallback_reason: fallback?.reason || request?.fallbackReason || null,
        provider_error_code: fallback?.providerErrorCode || null,
        provider_http_status: Number.isFinite(fallback?.providerStatus) ? fallback.providerStatus : null,
        structured: structured || null
      });
      fileWriter.writeTurnSummaries(turnRows);
      logger([
        ...requestDiagnosticLines(request),
        ...(structured?.providerContent ? ['', ...deepSeekResponseShapeLines(request, structured)] : []),
        ...(fallback ? ['', ...structuredFallbackLines(request, fallback, structured)] : []),
        '',
        '[LLM Cache Diagnostic]',
        '',
        `prompt_tokens: ${formatCount(usage?.promptTokens)}`,
        `completion_tokens: ${formatCount(usage?.completionTokens)}`,
        '',
        `cache_hit_tokens: ${formatCount(hitTokens)}`,
        `cache_miss_tokens: ${formatCount(missTokens)}`,
        '',
        `cache_hit_rate: ${formatRate(cacheHitRate(hitTokens, missTokens))}`,
        '',
        '[Prompt Composition]',
        `system_prompt_chars: ${formatCount(composition.systemPromptChars)}`,
        `system_prompt_tokens_estimate: ${formatCount(composition.systemPromptTokens)}`,
        `conversation_history_chars: ${formatCount(composition.conversationHistoryChars)}`,
        `conversation_history_tokens_estimate: ${formatCount(composition.conversationHistoryTokens)}`,
        `message_count: ${formatCount(composition.messageCount)}`,
        `prompt_total_tokens_estimate: ${formatCount(composition.promptTotalTokens)}`,
        '',
        ...prefixStability.lines,
        '',
        ...formatTurnDiagnostic(turnId, totals)
      ].join('\n'));
    } catch {
      // Diagnostics must never affect a successful chat request.
    }
  };
}

module.exports = {
  buildPromptComposition,
  buildPrefixStability,
  buildPrefixStabilityLines,
  cacheHitRate,
  createLlmCacheDiagnosticLogger,
  createDiagnosticFileWriter,
  deepSeekResponseShapeLines,
  formatTurnDiagnostic,
  normalizePromptSections,
  promptSectionDigest,
  requestDiagnosticLines,
  structuredFallbackLines,
  summarizeTurnRecords,
  turnSummaryRecord
};
