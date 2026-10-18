'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getApiKey, migratePlaintextApiKey, setApiKey } = require('../api-key-storage');

function secureStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`test-cipher:${value}`, 'utf8'),
    decryptString: (value) => String(value).replace(/^test-cipher:/, '')
  };
}

test('new API keys are refused without safe storage and settings remain unchanged', () => {
  const settings = { deepseek: { apiKeyPlain: '', apiKeyEncrypted: '', model: 'deepseek-v4-flash' } };
  const before = structuredClone(settings);
  const unavailable = { isEncryptionAvailable: () => false };
  assert.throws(() => setApiKey(settings, 'fake-key-for-test', unavailable), { code: 'safe_storage_unavailable' });
  assert.deepEqual(settings, before);
});

test('existing plaintext credentials stay local with a warning until secure migration is available', () => {
  const settings = { deepseek: { apiKeyPlain: 'legacy-fake-key', apiKeyEncrypted: '' } };
  const unavailable = { isEncryptionAvailable: () => false };
  assert.deepEqual(migratePlaintextApiKey(settings, unavailable), { changed: false, warning: true });
  assert.equal(settings.deepseek.apiKeyPlain, 'legacy-fake-key');
  assert.equal(getApiKey(settings, unavailable), 'legacy-fake-key');
});

test('legacy plaintext migration verifies encryption before removing the original value', () => {
  const settings = { deepseek: { apiKeyPlain: 'legacy-fake-key', apiKeyEncrypted: '' } };
  const secure = secureStorage();
  assert.deepEqual(migratePlaintextApiKey(settings, secure), { changed: true, warning: false });
  assert.equal(settings.deepseek.apiKeyPlain, '');
  assert.notEqual(settings.deepseek.apiKeyEncrypted, '');
  assert.equal(getApiKey(settings, secure), 'legacy-fake-key');
});

test('failed encryption verification does not mutate existing credentials', () => {
  const settings = { deepseek: { apiKeyPlain: 'legacy-fake-key', apiKeyEncrypted: '', model: 'deepseek-v4-flash' } };
  const before = structuredClone(settings);
  const badStorage = {
    isEncryptionAvailable: () => true,
    encryptString: () => Buffer.from('bad-cipher'),
    decryptString: () => 'wrong-key'
  };
  assert.throws(() => migratePlaintextApiKey(settings, badStorage), { code: 'safe_storage_verification_failed' });
  assert.deepEqual(settings, before);
});
