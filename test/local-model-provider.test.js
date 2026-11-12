'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LocalModelProvider, OLLAMA_ENDPOINT } = require('../local-model-provider');
const { ModelGateway } = require('../model-gateway');
const { ModelProviderRegistry } = require('../model-provider-registry');

function fixture(overrides = {}) {
  const calls = [];
  const provider = new LocalModelProvider({ getModel: () => 'sample:4b', fetchImpl: async (url, options) => {
    const path = url.slice(OLLAMA_ENDPOINT.length), body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, options, body });
    if (overrides[path]) return overrides[path](options, body);
    if (path === '/api/tags') return Response.json({ models: [{ name: 'sample:4b' }, { name: 'remote:cloud' }, { name: 'alias:latest', remote_host: 'https://ollama.com' }] });
    if (path === '/api/show') return Response.json({ capabilities: ['completion', 'thinking'], thinking: { values: [false, true] } });
    return Response.json({ done: true, message: { content: '{"reply":"你好"}', thinking: 'private reasoning' }, done_reason: 'stop' });
  } });
  return { provider, calls };
}
test('Ollama discovers installed models and emits only ordinary Chat fields to loopback', async () => {
  const { provider, calls } = fixture();
  assert.deepEqual((await provider.refreshModels()).models, ['sample:4b']);
  const gateway = new ModelGateway({ registry: new ModelProviderRegistry().register(provider), getProviderId: () => 'local' });
  const result = await gateway.generate({ messages: [{ role: 'user', content: '你好', images: ['secret'], tool_calls: [{}] }], apiKey: 'secret', tools: [{}], structured: true });
  const request = calls.at(-1);
  assert.equal(request.url, OLLAMA_ENDPOINT + '/api/chat');
  assert.equal(request.options.redirect, 'error');
  assert.deepEqual(request.body.messages, [{ role: 'user', content: '你好' }]);
  assert.equal(request.body.format, 'json'); assert.equal(request.body.think, false);
  assert.equal(request.body.options.num_ctx, 16384);
  assert.doesNotMatch(JSON.stringify(request), /secret|tool_calls|Authorization/);
  assert.doesNotMatch(JSON.stringify(result), /private reasoning|thinking/);
  assert.equal(result.rawContent, '{"reply":"你好"}');
});
test('Ollama decodes split UTF-8 NDJSON and keeps thinking out of visible deltas', async () => {
  const bytes = new TextEncoder().encode([
    { message: { thinking: 'private' } }, { message: { content: '{"reply":"你' } },
    { message: { content: '好"}' }, done: true, done_reason: 'stop' }
  ].map(JSON.stringify).join('\n'));
  const { provider } = fixture({ '/api/chat': () => new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 2) controller.enqueue(bytes.slice(i, i + 2)); controller.close();
  } })) });
  const deltas = [];
  const result = await provider.complete({ messages: [], stream: true, onDelta: delta => deltas.push(delta) });
  assert.equal(result.rawContent, '{"reply":"你好"}'); assert.equal(deltas.join(''), '你好');
});
test('Ollama adapts named thinking levels and rejects remote aliases before generation', async () => {
  const { provider, calls } = fixture({ '/api/show': () => Response.json({ capabilities: ['completion', 'thinking'], thinking: { values: ['low', 'medium', 'high'] } }) });
  await provider.complete({ messages: [] }); assert.equal(calls.at(-1).body.think, 'low');
  const remote = fixture({ '/api/show': () => Response.json({ capabilities: ['completion'], remote_model: 'cloud-model' }) });
  await assert.rejects(remote.provider.complete({ messages: [] }), { code: 'local_model_unsupported' });
  assert.equal(remote.calls.some(call => call.url.endsWith('/api/chat')), false);
});
test('Ollama cancellation and timeout cover an unfinished response body', async () => {
  for (const cancel of [false, true]) {
    let cancelled = false;
    const { provider } = fixture({ '/api/chat': () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) });
    const controller = new AbortController();
    const keeper = setTimeout(() => {}, 200);
    const pending = provider.complete({ messages: [], signal: controller.signal, timeoutMs: 25 });
    if (cancel) setTimeout(() => controller.abort(Object.assign(new Error('cancelled'), { code: 'CHAT_REQUEST_CANCELLED' })), 10);
    await assert.rejects(pending, { code: cancel ? 'CHAT_REQUEST_CANCELLED' : 'request_timeout' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cancelled, true); clearTimeout(keeper);
  }
});
test('Ollama fails closed on missing models, oversized contexts, incomplete streams and tool calls', async () => {
  const { provider, calls } = fixture();
  await assert.rejects(provider.complete({ model: 'missing', messages: [] }), { code: 'local_model_missing' });
  const count = calls.length;
  await assert.rejects(provider.complete({ messages: [{ role: 'user', content: 'x'.repeat(26000) }] }), { code: 'local_context_too_large' });
  assert.equal(calls.length, count);
  for (const [part, code] of [
    [{ message: { content: 'unfinished' } }, 'local_incomplete_response'],
    [{ done: true, message: { tool_calls: [{}] } }, 'unexpected_tool_call'],
    [{ done: true, done_reason: 'length', message: { content: 'partial' } }, 'local_response_truncated']
  ]) {
    const f = fixture({ '/api/chat': () => Response.json(part) });
    await assert.rejects(f.provider.complete({ messages: [] }), { code });
  }
});
