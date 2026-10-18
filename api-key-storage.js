'use strict';

function encryptionAvailable(safeStorage) {
  try { return safeStorage?.isEncryptionAvailable?.() === true; } catch { return false; }
}

function encryptAndVerify(apiKey, safeStorage) {
  const encrypted = safeStorage.encryptString(apiKey);
  const bytes = Buffer.isBuffer(encrypted) ? encrypted : Buffer.from(encrypted);
  const encoded = bytes.toString('base64');
  const verified = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  if (verified !== apiKey) {
    const error = new Error('系统安全存储没有通过 API Key 验证。');
    error.code = 'safe_storage_verification_failed';
    throw error;
  }
  return encoded;
}

function setApiKey(settings, apiKey, safeStorage) {
  if (!settings.deepseek || typeof settings.deepseek !== 'object') settings.deepseek = {};
  if (!apiKey) {
    settings.deepseek.apiKeyEncrypted = '';
    settings.deepseek.apiKeyPlain = '';
    return { cleared: true };
  }
  if (!encryptionAvailable(safeStorage)) {
    const error = new Error('系统安全存储当前不可用，API Key 未保存。请稍后重试或检查 Windows 凭据加密服务。');
    error.code = 'safe_storage_unavailable';
    throw error;
  }
  const encrypted = encryptAndVerify(apiKey, safeStorage);
  settings.deepseek.apiKeyEncrypted = encrypted;
  settings.deepseek.apiKeyPlain = '';
  return { cleared: false };
}

function migratePlaintextApiKey(settings, safeStorage) {
  const plaintext = String(settings?.deepseek?.apiKeyPlain || '');
  if (!plaintext) return { changed: false, warning: false };
  if (!encryptionAvailable(safeStorage)) return { changed: false, warning: true };
  const encrypted = encryptAndVerify(plaintext, safeStorage);
  settings.deepseek.apiKeyEncrypted = encrypted;
  settings.deepseek.apiKeyPlain = '';
  return { changed: true, warning: false };
}

function getApiKey(settings, safeStorage, onDecryptError = () => {}) {
  const encrypted = String(settings?.deepseek?.apiKeyEncrypted || '');
  if (encrypted && encryptionAvailable(safeStorage)) {
    try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')); } catch (error) { onDecryptError(error); }
  }
  return String(settings?.deepseek?.apiKeyPlain || '');
}

module.exports = {
  encryptionAvailable,
  getApiKey,
  migratePlaintextApiKey,
  setApiKey
};
