const { createSseParser, extractStreamingReply } = require('./deepseek-stream');

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
const DEFAULT_MODEL = 'deepseek-v4-flash';

class ModelProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ModelProviderError';
    this.code = code;
    this.status = Number.isFinite(options.status) ? options.status : null;
  }
}

function apiErrorMessage(status, providerMessage) {
  if (status === 401) return 'API Key 无效或已失效，请重新检查。';
  if (status === 402) return 'DeepSeek 账户余额不足，请充值后重试。';
  if (status === 429) return 'DeepSeek 当前请求较多，请稍后再试。';
  if (status >= 500) return 'DeepSeek 服务暂时不可用，请稍后再试。';
  return providerMessage
    ? `DeepSeek 请求失败：${String(providerMessage).slice(0, 180)}`
    : `DeepSeek 请求失败（HTTP ${status}）。`;
}

function errorCodeForStatus(status) {
  if (status === 401) return 'authentication_failed';
  if (status === 402) return 'insufficient_balance';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'provider_unavailable';
  return 'provider_http_error';
}

function extractContentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (
      typeof part === 'string'
        ? part
        : typeof part?.text === 'string'
          ? part.text
          : ''
    ))
    .join('');
}

function extractMessageText(message) {
  return extractContentText(message?.content).trim();
}

function messageContentMetadata(message) {
  const content = message?.content;
  const contentType = Array.isArray(content) ? 'array' : typeof content;
  const rawText = extractContentText(content);
  return {
    messagePresent: Boolean(message),
    contentPresent: content !== null && content !== undefined,
    contentType,
    contentParts: Array.isArray(content) ? content.length : null,
    contentChars: rawText.length,
    contentHasNonWhitespace: Boolean(rawText.trim()),
    reasoningContentPresent: message?.reasoning_content !== null && message?.reasoning_content !== undefined
  };
}

// Development diagnostics must describe the response shape without retaining
// model text, reasoning, user data, or credentials.
function responseShapeMetadata(data, choice, httpStatus = null) {
  const message = choice?.message;
  const content = message?.content;
  const reasoning = message?.reasoning_content;
  const toolCalls = message?.tool_calls;
  const contentText = extractContentText(content);
  const reasoningText = extractContentText(reasoning);
  return {
    httpStatus: Number.isFinite(httpStatus) ? httpStatus : null,
    choicesCount: Array.isArray(data?.choices) ? data.choices.length : 0,
    finishReason: choice?.finish_reason || '',
    messagePresent: Boolean(message),
    messageRole: typeof message?.role === 'string' ? message.role : '',
    contentPresent: content !== null && content !== undefined,
    contentType: Array.isArray(content) ? 'array' : typeof content,
    contentParts: Array.isArray(content) ? content.length : null,
    contentChars: contentText.length,
    contentNonWhitespaceChars: contentText.trim().length,
    reasoningContentPresent: reasoning !== null && reasoning !== undefined,
    reasoningContentType: Array.isArray(reasoning) ? 'array' : typeof reasoning,
    reasoningContentChars: reasoningText.length,
    reasoningContentNonWhitespaceChars: reasoningText.trim().length,
    toolCallsPresent: toolCalls !== null && toolCalls !== undefined,
    toolCallsCount: Array.isArray(toolCalls) ? toolCalls.length : 0,
    functionCallPresent: message?.function_call !== null && message?.function_call !== undefined,
    refusalPresent: message?.refusal !== null && message?.refusal !== undefined
  };
}

function emptyResponseMessage(finishReason) {
  if (finishReason === 'content_filter') {
    return 'DeepSeek 的安全过滤器拦截了本次回复，请换一种说法后重试。';
  }
  if (finishReason === 'length') {
    return 'DeepSeek 的输出达到长度限制，请缩短问题后重试。';
  }
  if (finishReason === 'insufficient_system_resource') {
    return 'DeepSeek 当前推理资源不足，请稍后再试。';
  }
  return 'DeepSeek 返回了空回复，请稍后重新发送。';
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  return {
    promptTokens: Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : null,
    completionTokens: Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null,
    // TEMPORARY diagnostics consume these optional DeepSeek response fields.
    // They are response metadata only and do not change request parameters.
    promptCacheHitTokens: Number.isFinite(usage.prompt_cache_hit_tokens)
      ? usage.prompt_cache_hit_tokens
      : null,
    promptCacheMissTokens: Number.isFinite(usage.prompt_cache_miss_tokens)
      ? usage.prompt_cache_miss_tokens
      : null
  };
}

function resolveModel(model) {
  return DEEPSEEK_MODELS.has(model) ? model : DEFAULT_MODEL;
}

function abortError(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new ModelProviderError('request_cancelled', '模型请求已取消。');
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function awaitWithSignal(value, signal) {
  if (!signal) return Promise.resolve(value);
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', aborted);
    const aborted = () => {
      cleanup();
      reject(abortError(signal));
    };
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(value).then((result) => {
      cleanup();
      resolve(result);
    }, (error) => {
      cleanup();
      reject(error);
    });
  });
}

async function readJsonSafely(response, signal) {
  try {
    return await awaitWithSignal(response.json(), signal);
  } catch (error) {
    if (signal?.aborted) throw abortError(signal);
    return null;
  }
}

class DeepSeekProvider {
  constructor(options = {}) {
    this.id = 'deepseek';
    this.endpoint = options.endpoint || DEEPSEEK_ENDPOINT;
    this.fetchImpl = options.fetchImpl || ((...args) => globalThis.fetch(...args));
    this.getApiKey = typeof options.getApiKey === 'function' ? options.getApiKey : () => '';
    this.getModel = typeof options.getModel === 'function' ? options.getModel : () => DEFAULT_MODEL;
    this.estimateTokens = typeof options.estimateTokens === 'function'
      ? options.estimateTokens
      : (value) => Math.ceil(String(value || '').length / 3);
  }

  metadata() {
    return {
      label: 'DeepSeek 云端',
      available: true,
      local: false,
      streaming: true,
      cancellation: true,
      models: [...DEEPSEEK_MODELS]
    };
  }

  requestTimeout(messages, timeoutMs) {
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) return timeoutMs;
    const estimate = this.estimateTokens(JSON.stringify(messages));
    return Math.min(180000, 45000 + Math.round(estimate * 0.15));
  }

  async complete(options = {}) {
    const apiKey = String(options.apiKey || this.getApiKey() || '').trim();
    if (!apiKey) {
      throw new ModelProviderError('missing_api_key', '还没有设置 DeepSeek API Key。');
    }
    if (!Array.isArray(options.messages) || options.messages.length === 0) {
      throw new ModelProviderError('invalid_request', '模型请求中没有可发送的消息。');
    }

    const model = resolveModel(options.model || this.getModel());
    const stream = options.stream === true;
    const controller = new AbortController();
    const externalSignal = options.signal;
    let timedOut = false;
    const abortFromExternal = () => controller.abort(externalSignal.reason);
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.requestTimeout(options.messages, options.timeoutMs));
    timeout.unref?.();

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: options.messages,
          thinking: { type: 'disabled' },
          ...(options.structured === false ? {} : { response_format: { type: 'json_object' } }),
          max_tokens: Number.isFinite(options.maxTokens) ? options.maxTokens : 700,
          stream
        }),
        signal: controller.signal
      });

      if (!response?.ok) {
        const data = await readJsonSafely(response, controller.signal);
        const status = Number(response?.status) || 0;
        throw new ModelProviderError(
          errorCodeForStatus(status),
          apiErrorMessage(status, data?.error?.message),
          { status }
        );
      }

      return await (stream
        ? this.readStream(response, { ...options, signal: controller.signal, model, httpStatus: Number(response.status) || null })
        : this.readResponse(response, model, options.allowEmpty === true, Number(response.status) || null, controller.signal));
    } catch (error) {
      if (externalSignal?.aborted) {
        if (externalSignal.reason instanceof Error) throw externalSignal.reason;
        throw new ModelProviderError('request_cancelled', '模型请求已取消。');
      }
      if (timedOut || error?.name === 'AbortError') {
        throw new ModelProviderError(
          'request_timeout',
          '连接 DeepSeek 超时，请检查网络后重试。',
          { cause: error }
        );
      }
      if (error instanceof ModelProviderError) throw error;
      if (error instanceof TypeError) {
        throw new ModelProviderError(
          'network_error',
          '无法连接 DeepSeek，请检查网络或代理设置。',
          { cause: error }
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    }
  }

  async readResponse(response, fallbackModel, allowEmpty = false, httpStatus = null, signal = null) {
    const data = await readJsonSafely(response, signal);
    const choice = data?.choices?.[0];
    if (!choice?.message) {
      if (allowEmpty) {
        return {
          message: { role: 'assistant', content: null },
          rawContent: '',
          finishReason: choice?.finish_reason || '',
          model: data?.model || fallbackModel,
          usage: normalizeUsage(data?.usage),
          responseMetadata: responseShapeMetadata(data, choice, httpStatus)
        };
      }
      throw new ModelProviderError(
        'empty_response',
        emptyResponseMessage(choice?.finish_reason || '')
      );
    }
    const rawContent = extractMessageText(choice.message);
    return {
      message: {
        role: 'assistant',
        content: rawContent || null
      },
      rawContent,
      finishReason: choice.finish_reason || '',
      model: data?.model || fallbackModel,
      usage: normalizeUsage(data?.usage),
      responseMetadata: responseShapeMetadata(data, choice, httpStatus)
    };
  }

  async readStream(response, options) {
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new ModelProviderError(
        'stream_unavailable',
        'DeepSeek 没有返回可读取的流式回复。'
      );
    }

    const decoder = new TextDecoder('utf-8');
    let rawContent = '';
    let streamedReply = '';
    let finishReason = '';
    let responseModel = options.model;
    let usage = null;
    let contentEventCount = 0;
    const parser = createSseParser((payload) => {
      if (payload === '[DONE]') return;
      let eventData = null;
      try {
        eventData = JSON.parse(payload);
      } catch {
        return;
      }
      responseModel = eventData.model || responseModel;
      usage = eventData.usage || usage;
      const choice = eventData?.choices?.[0];
      finishReason = choice?.finish_reason || finishReason;
      const delta = extractMessageText(choice?.delta);
      if (!delta) return;
      throwIfAborted(options.signal);
      contentEventCount += 1;
      rawContent += delta;
      const currentReply = extractStreamingReply(rawContent, options.structured !== false).text;
      if (typeof options.onDelta === 'function' && currentReply.length > streamedReply.length) {
        const addition = currentReply.slice(streamedReply.length);
        streamedReply = currentReply;
        options.onDelta(addition, currentReply);
      }
    });

    const reader = response.body.getReader();
    while (true) {
      throwIfAborted(options.signal);
      const { done, value } = await awaitWithSignal(reader.read(), options.signal);
      throwIfAborted(options.signal);
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.flush();

    return {
      message: { role: 'assistant', content: rawContent || null },
      rawContent,
      finishReason,
      model: responseModel,
      usage: normalizeUsage(usage),
      responseMetadata: {
        httpStatus: Number.isFinite(options.httpStatus) ? options.httpStatus : null,
        choicesCount: null,
        finishReason,
        messageRole: 'assistant',
        messagePresent: true,
        contentPresent: contentEventCount > 0,
        contentType: 'stream',
        contentParts: contentEventCount,
        contentChars: rawContent.length,
        contentNonWhitespaceChars: rawContent.trim().length,
        reasoningContentPresent: false,
        reasoningContentType: 'undefined',
        reasoningContentChars: 0,
        reasoningContentNonWhitespaceChars: 0,
        toolCallsPresent: false,
        toolCallsCount: 0,
        functionCallPresent: false,
        refusalPresent: false
      }
    };
  }
}

module.exports = {
  DEFAULT_MODEL,
  DEEPSEEK_ENDPOINT,
  DEEPSEEK_MODELS,
  DeepSeekProvider,
  ModelProviderError,
  apiErrorMessage,
  emptyResponseMessage,
  extractContentText,
  extractMessageText,
  messageContentMetadata,
  responseShapeMetadata,
  resolveModel
};
