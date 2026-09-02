'use strict';

const { AgentModelAdapter, AgentModelAdapterError } = require('./agent-model-adapter');
const { DEEPSEEK_ENDPOINT, DEEPSEEK_MODELS, DEFAULT_MODEL, ModelProviderError, apiErrorMessage } = require('../deepseek-provider');

function resolveModel(value) { return DEEPSEEK_MODELS.has(value) ? value : DEFAULT_MODEL; }
function normalizeUsage(usage) { return { inputTokens: Number(usage?.prompt_tokens) || 0, outputTokens: Number(usage?.completion_tokens) || 0 }; }
function toError(status, message) {
  const code = status === 401 ? 'authentication_failed' : status === 402 ? 'insufficient_balance' : status === 429 ? 'rate_limited' : status >= 500 ? 'provider_unavailable' : 'provider_http_error';
  return new AgentModelAdapterError(code, apiErrorMessage(status, message));
}
function cleanToolCalls(calls) {
  return (Array.isArray(calls) ? calls : []).map((call, index) => ({
    callId: String(call?.id || `agent-call-${index + 1}`).slice(0, 160), name: String(call?.function?.name || '').slice(0, 80),
    arguments: typeof call?.function?.arguments === 'string' ? (() => { try { return JSON.parse(call.function.arguments); } catch { return {}; } })() : (call?.function?.arguments || {})
  })).filter((call) => call.name);
}
function continuationAssistant(message) {
  const item = { role: 'assistant', content: typeof message?.content === 'string' ? message.content : null };
  if (Array.isArray(message?.tool_calls)) item.tool_calls = message.tool_calls;
  // DeepSeek thinking/tool-call continuation requires this field when present.
  if (message?.reasoning_content !== undefined && message?.reasoning_content !== null) item.reasoning_content = message.reasoning_content;
  return item;
}

class DeepSeekAgentAdapter extends AgentModelAdapter {
  constructor(options = {}) {
    super('deepseek'); this.endpoint = options.endpoint || DEEPSEEK_ENDPOINT; this.fetchImpl = options.fetchImpl || ((...args) => globalThis.fetch(...args));
    this.getApiKey = typeof options.getApiKey === 'function' ? options.getApiKey : () => ''; this.getModel = typeof options.getModel === 'function' ? options.getModel : () => DEFAULT_MODEL;
    this.defaultTimeoutMs = Math.max(1_000, Number(options.timeoutMs) || 90_000);
  }
  async runRound(context = {}, options = {}) {
    const apiKey = String(this.getApiKey() || '').trim();
    if (!apiKey) throw new AgentModelAdapterError('missing_api_key', '还没有设置 DeepSeek API Key。');
    const messages = Array.isArray(context.messages) ? context.messages : [];
    if (!messages.length) throw new AgentModelAdapterError('invalid_request', 'Agent 模型请求中没有消息。');
    const controller = new AbortController(); let timedOut = false;
    const relayAbort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) relayAbort(); else options.signal?.addEventListener('abort', relayAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Number(context.timeoutMs) || this.defaultTimeoutMs); timer.unref?.();
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ model: resolveModel(context.model || this.getModel()), messages, tools: Array.isArray(context.tools) ? context.tools : [], tool_choice: 'auto', thinking: { type: 'disabled' }, max_tokens: Number(context.maxTokens) || 900, stream: false })
      });
      let data = null; try { data = await response.json(); } catch { /* handled below */ }
      if (!response?.ok) throw toError(Number(response?.status) || 0, data?.error?.message);
      const choice = data?.choices?.[0]; const message = choice?.message;
      if (!message) throw new AgentModelAdapterError('empty_response', 'DeepSeek 没有返回 Agent 回复。');
      return { model: data?.model || resolveModel(context.model || this.getModel()), usage: normalizeUsage(data?.usage), assistantItem: continuationAssistant(message), toolCalls: cleanToolCalls(message.tool_calls), finishReason: String(choice?.finish_reason || ''), continuation: continuationAssistant(message) };
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason instanceof Error ? options.signal.reason : new AgentModelAdapterError('action_cancelled', 'Agent 模型请求已取消。');
      if (timedOut || error?.name === 'AbortError') throw new AgentModelAdapterError('request_timeout', '连接 DeepSeek 超时，请检查网络后重试。', { cause: error });
      if (error instanceof AgentModelAdapterError || error instanceof ModelProviderError) throw error;
      if (error instanceof TypeError) throw new AgentModelAdapterError('network_error', '无法连接 DeepSeek，请检查网络或代理设置。', { cause: error });
      throw new AgentModelAdapterError(error?.code || 'AGENT_MODEL_FAILURE', String(error?.message || 'Agent 模型请求失败。'), { cause: error });
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', relayAbort); }
  }
}
module.exports = { DeepSeekAgentAdapter, continuationAssistant, cleanToolCalls };
