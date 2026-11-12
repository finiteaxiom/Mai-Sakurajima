'use strict';

const { extractStreamingReply } = require('./deepseek-stream');
const OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
const LOCAL_PROMPT_TOKENS = 12000;
function localError(code, message) { return Object.assign(new Error(message), { name: 'ModelProviderError', code }); }
function normalizeLocalModel(value) {
  const model = String(value || '').trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(model) && !/(?:[:/-]cloud)(?:$|[-:])/i.test(model) ? model : '';
}
function withSignal(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

class LocalModelProvider {
  constructor(options = {}) {
    this.id = 'local';
    this.fetchImpl = options.fetchImpl || ((...args) => globalThis.fetch(...args));
    this.getModel = options.getModel || (() => '');
    this.estimateTokens = options.estimateTokens || (text => Math.ceil(String(text).length / 2));
    this.models = []; this.lastDiscovery = 0;
    this.reason = '连接本机 Ollama，刷新后选择已下载的模型。';
  }
  metadata() {
    return { label: 'Ollama 本地模型', available: true, local: true, streaming: true,
      cancellation: true, models: [...this.models], reason: this.reason };
  }
  requestConfiguration() {
    return { model: normalizeLocalModel(this.getModel()), maxPromptTokens: LOCAL_PROMPT_TOKENS,
      maxContextMessages: 40, maxMessageTokens: 2000 };
  }
  isConfigured() { return Boolean(normalizeLocalModel(this.getModel())); }
  async operation(signal, timeoutMs, work) {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason instanceof Error ? signal.reason : localError('request_cancelled', '本地模型请求已取消。'));
    if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(localError('request_timeout', 'Ollama 请求超时，模型可能仍在加载；请检查本机服务或换用较小模型。')), timeoutMs);
    timer.unref?.();
    try {
      if (controller.signal.aborted) throw controller.signal.reason;
      return await withSignal(work(controller.signal), controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error?.name === 'ModelProviderError') throw error;
      throw localError('local_connection_failed', '无法连接本机 Ollama。请启动 Ollama 后刷新模型或测试连接。');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  async request(path, body, signal, onLine) {
    const response = await withSignal(this.fetchImpl(OLLAMA_ENDPOINT + path, {
      method: body ? 'POST' : 'GET', redirect: 'error', headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal
    }), signal);
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw localError(response.status === 404 ? 'local_model_missing' : 'local_service_error', response.status === 404
        ? '本地模型不存在，请刷新模型列表后重新选择。' : 'Ollama 未能完成请求。请检查模型是否可用及内存是否充足。');
    }
    const reader = response.body?.getReader();
    if (!reader) throw localError('local_invalid_response', 'Ollama 未返回有效响应。');
    const decoder = new TextDecoder(); let buffer = '', bytes = 0;
    try {
      while (true) {
        const { done, value } = await withSignal(reader.read(), signal);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4 * 1024 * 1024) throw localError('local_response_too_large', '本地模型响应超过限制。');
        buffer += decoder.decode(value, { stream: true });
        if (onLine) {
          let index;
          while ((index = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
            if (line) onLine(JSON.parse(line));
          }
        }
      }
      buffer += decoder.decode();
      if (onLine) { if (buffer.trim()) onLine(JSON.parse(buffer)); return; }
      return JSON.parse(buffer);
    } catch (error) {
      if (error instanceof SyntaxError) throw localError('local_invalid_response', 'Ollama 返回了无法解析的响应。');
      throw error;
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  async refreshModels(options = {}) {
    try {
      const data = await this.operation(options.signal, 5000, signal => this.request('/api/tags', null, signal));
      if (!Array.isArray(data.models)) throw localError('local_invalid_response', 'Ollama 模型列表无效。');
      this.models = [...new Set(data.models.filter(item => !item.remote_host && !item.remote_model)
        .map(item => normalizeLocalModel(item.name || item.model)).filter(Boolean))].slice(0, 100);
      this.lastDiscovery = Date.now();
      this.reason = this.models.length ? '模型在本机运行；首次加载可能较慢。' : 'Ollama 已连接，但未发现本地模型。请先在 Ollama 下载模型后刷新。';
      return this.metadata();
    } catch (error) { this.models = []; this.lastDiscovery = 0; this.reason = error.message; throw error; }
  }
  async complete(options = {}) {
    const model = normalizeLocalModel(options.model ?? this.getModel());
    if (!model) throw localError('local_model_missing', '请在设置中选择已下载的 Ollama 模型。');
    // Whitelist fields: never forward tools, images, credentials or remote routing.
    const messages = (Array.isArray(options.messages) ? options.messages : [])
      .filter(message => ['system', 'user', 'assistant'].includes(message?.role))
      .map(message => ({ role: message.role, content: String(message.content || '') }));
    const promptTokens = this.estimateTokens(JSON.stringify(messages));
    if (promptTokens > LOCAL_PROMPT_TOKENS) throw localError('local_context_too_large', '本轮内容超过本地模型上下文预算，请缩短消息或切换云端模型。');
    return this.operation(options.signal, options.timeoutMs || 180000, async signal => {
      if (Date.now() - this.lastDiscovery > 60000) await this.refreshModels({ signal });
      if (!this.models.includes(model)) throw localError('local_model_missing', '该模型未安装在本机。请刷新列表重新选择。');
      const info = await this.request('/api/show', { model }, signal);
      if (info.remote_host || info.remote_model || !info.capabilities?.includes('completion')) {
        throw localError('local_model_unsupported', '仅支持已安装在本机、可生成文字的模型，不调用 Ollama 云端模型。');
      }
      const values = info.thinking?.values || [];
      const think = values.includes(false) ? false : values.includes('low') ? 'low' : undefined;
      const context = Math.min(16384, ...Object.entries(info.model_info || {})
        .filter(([key, value]) => key.endsWith('.context_length') && Number.isFinite(value) && value > 0).map(([, value]) => value));
      const maxTokens = Math.max(16, Math.min(4096, Number(options.maxTokens) || 700));
      const predictionBudget = think === false || !info.capabilities.includes('thinking') ? maxTokens : Math.min(4096, maxTokens + 2048);
      if (promptTokens + predictionBudget + 256 > context) throw localError('local_context_too_large', '本轮内容超过该模型的上下文容量，请缩短消息或切换模型。');
      const payload = { model, messages, stream: options.stream === true, keep_alive: '5m',
        ...(options.structured === false ? {} : { format: 'json' }), ...(think === undefined ? {} : { think }),
        options: { num_ctx: context, num_predict: predictionBudget, temperature: 0.6 } };
      let rawContent = '', emitted = '', terminal = null;
      const consume = part => {
        if (signal.aborted) throw signal.reason;
        if (part.error) throw localError('local_service_error', '本地模型生成失败，请检查 Ollama 或切换模型。');
        if (part.message?.tool_calls?.length) throw localError('unexpected_tool_call', '本地模型返回了聊天不支持的工具调用。');
        if (typeof part.message?.content === 'string') rawContent += part.message.content;
        // message.thinking never enters visible replies, diagnostics or memory.
        if (options.stream && options.onDelta) {
          const reply = extractStreamingReply(rawContent, options.structured !== false).text;
          if (reply.length > emitted.length) { options.onDelta(reply.slice(emitted.length), reply); emitted = reply; }
        }
        if (part.done) terminal = part;
      };
      if (options.stream) await this.request('/api/chat', payload, signal, consume);
      else consume(await this.request('/api/chat', payload, signal));
      if (!terminal) throw localError('local_incomplete_response', '本地模型连接提前结束，未保存这条不完整回复。');
      if (terminal.done_reason === 'length') throw localError('local_response_truncated', '本地模型达到生成上限，请缩短问题或换用较小的非推理模型。');
      return { rawContent, message: { role: 'assistant', content: rawContent }, model,
        finishReason: terminal.done_reason || 'stop', usage: { prompt_tokens: terminal.prompt_eval_count || 0, completion_tokens: terminal.eval_count || 0 } };
    });
  }
}

module.exports = { LocalModelProvider, normalizeLocalModel, OLLAMA_ENDPOINT, LOCAL_PROMPT_TOKENS };
