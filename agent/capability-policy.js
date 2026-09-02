'use strict';

const KNOWN_CAPABILITIES = Object.freeze([
  'read',
  'write',
  'execute',
  'network',
  'external-action',
  'safe-local',
  'workspace-read',
  'workspace-write'
]);

function normalizeCapabilities(value) {
  const requested = Array.isArray(value) ? value : [];
  return [...new Set(requested.map((item) => String(item).trim()).filter(Boolean))]
    .filter((item) => KNOWN_CAPABILITIES.includes(item));
}

function createCapabilityPolicy(options = {}) {
  const allowed = new Set(normalizeCapabilities(options.allowed));
  return {
    evaluate(requested) {
      const normalized = normalizeCapabilities(requested);
      return {
        granted: normalized.filter((capability) => allowed.has(capability)),
        denied: normalized.filter((capability) => !allowed.has(capability))
      };
    }
  };
}

module.exports = {
  KNOWN_CAPABILITIES,
  createCapabilityPolicy,
  normalizeCapabilities
};
