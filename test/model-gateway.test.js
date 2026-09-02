'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { LocalModelProvider } = require('../local-model-provider');
const { ModelGateway } = require('../model-gateway');
const { ModelProviderRegistry } = require('../model-provider-registry');

test('ModelGateway keeps companion generation free of tool contracts', async () => {
  const calls = [];
  const registry = new ModelProviderRegistry().register({
    id: 'cloud',
    complete: async (options) => {
      calls.push(options);
      return { rawContent: 'ok' };
    }
  });
  const gateway = new ModelGateway({ registry, getProviderId: () => 'cloud' });

  await gateway.generate({ messages: [{ role: 'user', content: 'hello' }], tools: [{ name: 'unsafe' }] });
  assert.equal(Object.hasOwn(calls[0], 'tools'), false);
  assert.equal(calls[0].stream, false);
  assert.equal(calls[0].onDelta, null);
});

test('ModelGateway selects the configured provider and preserves streaming cancellation options', async () => {
  const calls = [];
  const registry = new ModelProviderRegistry().register({
    id: 'cloud',
    metadata: () => ({ label: 'Cloud', available: true, models: ['cloud-model'] }),
    complete: async (options) => {
      calls.push(options);
      return { rawContent: 'ok' };
    }
  });
  const gateway = new ModelGateway({ registry, getProviderId: () => 'cloud' });
  const onDelta = () => {};
  const signal = new AbortController().signal;

  await gateway.stream({ messages: [{ role: 'user', content: 'chat' }], onDelta, signal });
  assert.equal(calls[0].stream, true);
  assert.equal(calls[0].onDelta, onDelta);
  assert.equal(calls[0].signal, signal);
  assert.equal(Object.hasOwn(calls[0], 'tools'), false);
  assert.deepEqual(gateway.providers()[0].models, ['cloud-model']);
});

test('local provider is an honest unavailable extension point', async () => {
  const local = new LocalModelProvider();
  const registry = new ModelProviderRegistry().register(local);
  const gateway = new ModelGateway({ registry, getProviderId: () => 'local' });

  assert.equal(gateway.providers()[0].available, false);
  assert.equal(gateway.providers()[0].local, true);
  await assert.rejects(gateway.generate({ messages: [{ role: 'user', content: 'hello' }] }), (error) => {
    assert.equal(error.code, 'provider_unavailable');
    return true;
  });
});

test('ModelGateway validates its registry and streaming callback', () => {
  assert.throws(() => new ModelGateway(), /provider registry/);
  const gateway = new ModelGateway({ registry: new ModelProviderRegistry().register({ id: 'cloud', complete: async () => ({}) }) });
  assert.throws(() => gateway.stream({ messages: [] }), /requires onDelta/);
});
