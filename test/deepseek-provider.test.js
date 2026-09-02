const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DeepSeekProvider,
  ModelProviderError,
  resolveModel
} = require('../deepseek-provider');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

function streamResponse(chunks) {
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: new TextEncoder().encode(chunks[index++]) };
          }
        };
      }
    }
  };
}

function makeProvider(fetchImpl, overrides = {}) {
  return new DeepSeekProvider({
    fetchImpl,
    getApiKey: () => 'local-test-key',
    getModel: () => 'deepseek-v4-flash',
    estimateTokens: () => 10,
    ...overrides
  });
}

test('DeepSeekProvider normalizes Chat JSON content, model and token usage', async () => {
  let request = null;
  const provider = makeProvider(async (_url, options) => {
    request = JSON.parse(options.body);
    return jsonResponse({
      model: 'deepseek-v4-flash',
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{"reply":"你好"}' } }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 4,
        prompt_cache_hit_tokens: 9,
        prompt_cache_miss_tokens: 3
      }
    });
  });

  const result = await provider.complete({
    messages: [{ role: 'user', content: '你好' }],
    structured: true,
    maxTokens: 800
  });
  assert.equal(result.rawContent, '{"reply":"你好"}');
  assert.equal(result.model, 'deepseek-v4-flash');
  assert.deepEqual(result.usage, {
    promptTokens: 12,
    completionTokens: 4,
    promptCacheHitTokens: 9,
    promptCacheMissTokens: 3
  });
  assert.deepEqual(result.responseMetadata, {
    httpStatus: 200,
    choicesCount: 1,
    finishReason: 'stop',
    messagePresent: true,
    messageRole: 'assistant',
    contentPresent: true,
    contentType: 'string',
    contentParts: null,
    contentChars: 14,
    contentNonWhitespaceChars: 14,
    reasoningContentPresent: false,
    reasoningContentType: 'undefined',
    reasoningContentChars: 0,
    reasoningContentNonWhitespaceChars: 0,
    toolCallsPresent: false,
    toolCallsCount: 0,
    functionCallPresent: false,
    refusalPresent: false
  });
  assert.deepEqual(request.response_format, { type: 'json_object' });
  assert.equal(request.max_tokens, 800);
  assert.equal(request.stream, false);
  assert.equal(request.tools, undefined);
});

test('DeepSeekProvider parses SSE and emits only the visible structured reply', async () => {
  const deltas = [];
  const provider = makeProvider(async () => streamResponse([
    'data: {"model":"deepseek-v4-flash","choices":[{"delta":{"content":"{\\"reply\\":\\"你"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"好\\",\\"action\\":\\"wave\\"}"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":5,"prompt_cache_hit_tokens":2,"prompt_cache_miss_tokens":1}}\n\n',
    'data: [DONE]\n\n'
  ]));
  const result = await provider.complete({
    messages: [{ role: 'user', content: '你好' }],
    stream: true,
    structured: true,
    onDelta: (addition, current) => deltas.push({ addition, current })
  });

  assert.equal(result.rawContent, '{"reply":"你好","action":"wave"}');
  assert.equal(deltas.at(-1).current, '你好');
  assert.equal(deltas.map((entry) => entry.addition).join(''), '你好');
  assert.deepEqual(result.usage, {
    promptTokens: 3,
    completionTokens: 5,
    promptCacheHitTokens: 2,
    promptCacheMissTokens: 1
  });
});

test('DeepSeekProvider maps provider HTTP failures to stable error codes', async () => {
  const cases = [
    [401, 'authentication_failed', 'API Key'],
    [402, 'insufficient_balance', '余额不足'],
    [429, 'rate_limited', '请求较多'],
    [503, 'provider_unavailable', '暂时不可用'],
    [400, 'provider_http_error', 'bad request']
  ];
  for (const [status, code, message] of cases) {
    const provider = makeProvider(async () => jsonResponse({ error: { message: 'bad request' } }, status));
    await assert.rejects(
      provider.complete({ messages: [{ role: 'user', content: 'test' }] }),
      (error) => error instanceof ModelProviderError
        && error.code === code
        && error.status === status
        && error.message.includes(message)
    );
  }
});

test('DeepSeekProvider distinguishes user cancellation from provider timeout', async () => {
  const pendingFetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  const provider = makeProvider(pendingFetch);
  const external = new AbortController();
  const userReason = new Error('user stopped task');
  const cancelled = provider.complete({
    messages: [{ role: 'user', content: 'cancel' }],
    signal: external.signal,
    timeoutMs: 5000
  });
  external.abort(userReason);
  await assert.rejects(cancelled, (error) => error === userReason);

  await assert.rejects(
    provider.complete({ messages: [{ role: 'user', content: 'timeout' }], timeoutMs: 5 }),
    (error) => error instanceof ModelProviderError && error.code === 'request_timeout'
  );
});

test('DeepSeekProvider reports missing key, malformed response and network errors', async () => {
  const missing = makeProvider(async () => jsonResponse({}), { getApiKey: () => '' });
  await assert.rejects(
    missing.complete({ messages: [{ role: 'user', content: 'test' }] }),
    (error) => error.code === 'missing_api_key'
  );

  const malformed = makeProvider(async () => jsonResponse({ unexpected: true }));
  await assert.rejects(
    malformed.complete({ messages: [{ role: 'user', content: 'test' }] }),
    (error) => error.code === 'empty_response'
  );

  const network = makeProvider(async () => { throw new TypeError('offline'); });
  await assert.rejects(
    network.complete({ messages: [{ role: 'user', content: 'test' }] }),
    (error) => error.code === 'network_error'
  );
});

test('Chat may inspect an empty completion before applying its legacy fallback', async () => {
  const provider = makeProvider(async () => jsonResponse({
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '' } }]
  }));
  const result = await provider.complete({
    messages: [{ role: 'user', content: 'test' }],
    allowEmpty: true
  });
  assert.equal(result.rawContent, '');
  assert.equal(result.finishReason, 'stop');
  assert.deepEqual(result.responseMetadata, {
    httpStatus: 200,
    choicesCount: 1,
    finishReason: 'stop',
    messagePresent: true,
    messageRole: 'assistant',
    contentPresent: true,
    contentType: 'string',
    contentParts: null,
    contentChars: 0,
    contentNonWhitespaceChars: 0,
    reasoningContentPresent: false,
    reasoningContentType: 'undefined',
    reasoningContentChars: 0,
    reasoningContentNonWhitespaceChars: 0,
    toolCallsPresent: false,
    toolCallsCount: 0,
    functionCallPresent: false,
    refusalPresent: false
  });
});

test('DeepSeekProvider records response shape without retaining reasoning or tool text', async () => {
  const provider = makeProvider(async () => jsonResponse({
    choices: [{
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: '   ',
        reasoning_content: 'private reasoning',
        tool_calls: [{ id: 'private-tool-id' }],
        function_call: { name: 'private-function' },
        refusal: 'private refusal'
      }
    }]
  }));
  const result = await provider.complete({
    messages: [{ role: 'user', content: 'test' }],
    allowEmpty: true
  });
  assert.equal(result.rawContent, '');
  assert.deepEqual(result.responseMetadata, {
    httpStatus: 200,
    choicesCount: 1,
    finishReason: 'stop',
    messagePresent: true,
    messageRole: 'assistant',
    contentPresent: true,
    contentType: 'string',
    contentParts: null,
    contentChars: 3,
    contentNonWhitespaceChars: 0,
    reasoningContentPresent: true,
    reasoningContentType: 'string',
    reasoningContentChars: 17,
    reasoningContentNonWhitespaceChars: 17,
    toolCallsPresent: true,
    toolCallsCount: 1,
    functionCallPresent: true,
    refusalPresent: true
  });
});

test('DeepSeekProvider falls back to an allowed model name', () => {
  assert.equal(resolveModel('deepseek-v4-pro'), 'deepseek-v4-pro');
  assert.equal(resolveModel('untrusted-model'), 'deepseek-v4-flash');
});
