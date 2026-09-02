const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildPromptComposition,
  buildPrefixStabilityLines,
  cacheHitRate,
  createLlmCacheDiagnosticLogger,
  deepSeekResponseShapeLines
} = require('../llm-cache-diagnostics');

test('cache hit rate uses hit plus miss and treats missing or zero denominator as unavailable', () => {
  assert.equal(cacheHitRate(5424, 1418), 5424 / (5424 + 1418));
  assert.equal(cacheHitRate(0, 0), null);
  assert.equal(cacheHitRate(null, 10), null);
  assert.equal(cacheHitRate(10, undefined), null);
});

test('prompt composition records only sizes and final message count', () => {
  const composition = buildPromptComposition({
    systemPrompt: 'system context',
    messages: [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' }
    ],
    estimateTokenCount: (value) => String(value).length
  });
  assert.deepEqual(composition, {
    systemPromptChars: 14,
    systemPromptTokens: 14,
    conversationHistoryChars: 11,
    conversationHistoryTokens: 75,
    messageCount: 3,
    promptTotalTokens: 120
  });
});

test('temporary diagnostic keeps zero counts, prints N/A for missing data, and never prints content', () => {
  const output = [];
  const record = createLlmCacheDiagnosticLogger({ enabled: true, logger: (line) => output.push(line) });
  record({
    usage: {
      promptTokens: 8,
      completionTokens: 0,
      promptCacheHitTokens: 0,
      promptCacheMissTokens: 0
    },
    systemPrompt: 'private system prompt',
    messages: [{ role: 'user', content: 'private user message' }],
    request: {
      turnId: 'turn-1',
      requestId: 'turn-1-main',
      requestPurpose: 'chat_response',
      caller: 'ChatService.send',
      streaming: false,
      model: 'deepseek-v4-flash'
    },
    estimateTokenCount: (value) => String(value).length
  });
  assert.equal(output.length, 1);
  assert.match(output[0], /cache_hit_tokens: 0/);
  assert.match(output[0], /cache_miss_tokens: 0/);
  assert.match(output[0], /cache_hit_rate: N\/A/);
  assert.match(output[0], /\[LLM Request Diagnostic\]/);
  assert.match(output[0], /request_purpose: chat_response/);
  assert.match(output[0], /\[LLM Turn Diagnostic\]/);
  assert.match(output[0], /request_count: 1/);
  assert.doesNotMatch(output[0], /private system prompt|private user message/);

  const missing = [];
  createLlmCacheDiagnosticLogger({ enabled: true, logger: (line) => missing.push(line) })({
    usage: null,
    systemPrompt: '',
    messages: [],
    estimateTokenCount: () => 0
  });
  assert.match(missing[0], /prompt_tokens: N\/A/);
  assert.match(missing[0], /cache_hit_rate: N\/A/);
});

test('prefix stability diagnostic reports only section sizes and digests across requests', () => {
  const previous = new Map();
  const first = buildPrefixStabilityLines([
    { name: 'core_system', text: 'private core' },
    { name: 'current_time', text: 'private time one' }
  ], previous).join('\n');
  assert.match(first, /\[Prompt Prefix Stability\]/);
  assert.match(first, /core_system: chars=12, hash=[a-f0-9]{12}, hash_changed=N\/A/);
  assert.match(first, /stable_prefix_chars_since_previous_request: N\/A/);
  assert.doesNotMatch(first, /private core|private time one/);

  const second = buildPrefixStabilityLines([
    { name: 'core_system', text: 'private core' },
    { name: 'current_time', text: 'private time two' }
  ], previous, (value) => String(value).length).join('\n');
  assert.match(second, /core_system: chars=12, hash=[a-f0-9]{12}, hash_changed=false/);
  assert.match(second, /current_time: chars=16, hash=[a-f0-9]{12}, hash_changed=true/);
  assert.match(second, /first_changed_section: current_time/);
  assert.match(second, /stable_prefix_chars: 12/);
  assert.match(second, /stable_prefix_tokens_estimate: 12/);
  assert.match(second, /stable_prefix_chars_since_previous_request: 12/);
  assert.doesNotMatch(second, /private core|private time two/);
});

test('turn diagnostics aggregate multiple requests without mixing separate request purposes', () => {
  const output = [];
  const record = createLlmCacheDiagnosticLogger({ enabled: true, logger: (line) => output.push(line) });
  const base = {
    systemPrompt: 'private prompt',
    messages: [],
    promptSections: [{ name: 'core_system', text: 'private core' }],
    estimateTokenCount: (value) => String(value).length
  };
  record({
    ...base,
    usage: { promptTokens: 10, completionTokens: 2, promptCacheHitTokens: 3, promptCacheMissTokens: 7 },
    request: { turnId: 'turn-2', requestId: 'turn-2-main', requestPurpose: 'chat_response', caller: 'ChatService.send', streaming: false, model: 'deepseek-v4-flash' }
  });
  record({
    ...base,
    usage: { promptTokens: 8, completionTokens: 1, promptCacheHitTokens: 4, promptCacheMissTokens: 4 },
    request: { turnId: 'turn-2', requestId: 'turn-2-main-fallback', requestPurpose: 'chat_response_fallback', caller: 'ChatRequestService.fallback', streaming: false, model: 'deepseek-v4-flash' }
  });
  assert.match(output[1], /request_id: turn-2-main-fallback/);
  assert.match(output[1], /request_count: 2/);
  assert.match(output[1], /total_prompt_tokens: 18/);
  assert.match(output[1], /total_completion_tokens: 3/);
  assert.match(output[1], /total_cache_hit_tokens: 7/);
  assert.match(output[1], /total_cache_miss_tokens: 11/);
  assert.doesNotMatch(output.join('\n'), /private prompt|private core/);
});

test('response-shape diagnostic records only structural fields', () => {
  const lines = deepSeekResponseShapeLines(
    { requestId: 'turn-main' },
    {
      finishReason: 'stop',
      providerContent: {
        choicesCount: 1,
        messageRole: 'assistant',
        contentType: 'string',
        contentChars: 55,
        contentNonWhitespaceChars: 0,
        reasoningContentPresent: true,
        reasoningContentType: 'string',
        reasoningContentChars: 20,
        reasoningContentNonWhitespaceChars: 20,
        toolCallsPresent: false,
        toolCallsCount: 0,
        functionCallPresent: false,
        refusalPresent: false
      }
    }
  ).join('\n');
  assert.match(lines, /\[DeepSeek Response Shape\]/);
  assert.match(lines, /content_non_whitespace_chars: 0/);
  assert.match(lines, /reasoning_content_chars: 20/);
  assert.doesNotMatch(lines, /private|reasoning text/);
});

test('development diagnostics write bounded content-free JSONL and one current row per turn', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-llm-diagnostics-'));
  try {
    const record = createLlmCacheDiagnosticLogger({
      enabled: true,
      logger: () => {},
      fileSystem: fs,
      pathModule: path,
      directory
    });
    record({
      usage: { promptTokens: 12, completionTokens: 2, promptCacheHitTokens: 4, promptCacheMissTokens: 8 },
      systemPrompt: 'private prompt body',
      messages: [{ role: 'user', content: 'private user body' }],
      promptSections: [{ name: 'core_system', text: 'private core body' }],
      request: { turnId: 'turn-file', requestId: 'turn-file-main', requestPurpose: 'chat_response', caller: 'ChatService.send', streaming: false, model: 'deepseek-v4-flash' },
      structured: { responseChars: 0, finishReason: 'stop', structuredParseSuccess: false, visibleReplyPresent: false, schemaValid: null, parserErrorCode: 'EMPTY_RESPONSE' },
      fallback: { reason: 'EMPTY_RESPONSE', willFallback: true },
      estimateTokenCount: (value) => String(value).length
    });
    record({
      usage: { promptTokens: 8, completionTokens: 1, promptCacheHitTokens: 2, promptCacheMissTokens: 6 },
      systemPrompt: 'private fallback body',
      messages: [{ role: 'user', content: 'private user body' }],
      promptSections: [{ name: 'core_system', text: 'private core body' }],
      request: { turnId: 'turn-file', requestId: 'turn-file-main-fallback', requestPurpose: 'chat_response_fallback', caller: 'ChatRequestService.fallback', streaming: false, isFallbackRequest: true, fallbackReason: 'EMPTY_RESPONSE', model: 'deepseek-v4-flash' },
      estimateTokenCount: (value) => String(value).length
    });
    const jsonl = fs.readFileSync(path.join(directory, 'llm-diagnostics.jsonl'), 'utf8');
    const records = jsonl.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(records.length, 2);
    assert.equal(records[0].fallback_reason, 'EMPTY_RESPONSE');
    assert.equal(records[1].request_id, 'turn-file-main-fallback');
    assert.doesNotMatch(jsonl, /private prompt body|private fallback body|private user body|private core body/);
    const csv = fs.readFileSync(path.join(directory, 'llm-turn-summary.csv'), 'utf8');
    assert.equal(csv.trim().split(/\r?\n/).length, 2);
    assert.match(csv, /turn-file,2,20,3,6,14/);
    assert.match(csv, /true,EMPTY_RESPONSE/);
    assert.match(csv, /main_finish_reason,main_content_chars,main_content_non_whitespace_chars/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
