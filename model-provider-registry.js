'use strict';

const PROVIDER_IDS = Object.freeze({
  DEEPSEEK: 'deepseek',
  LOCAL: 'local'
});

class ModelProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(provider) {
    const id = String(provider?.id || '').trim().toLowerCase();
    if (!id || typeof provider?.complete !== 'function') {
      throw new TypeError('Model provider requires an id and complete().');
    }
    this.providers.set(id, provider);
    return this;
  }

  get(providerId) {
    return this.providers.get(String(providerId || '').trim().toLowerCase()) || null;
  }

  require(providerId) {
    const provider = this.get(providerId);
    if (!provider) {
      const error = new Error(`Model provider “${String(providerId || '')}” is not registered.`);
      error.code = 'model_provider_not_registered';
      throw error;
    }
    return provider;
  }

  list() {
    return [...this.providers.values()].map((provider) => {
      const metadata = typeof provider.metadata === 'function'
        ? provider.metadata()
        : {};
      return {
        id: String(provider.id),
        label: String(metadata.label || provider.id),
        available: metadata.available !== false,
        local: metadata.local === true,
        streaming: metadata.streaming !== false,
        cancellation: metadata.cancellation !== false,
        models: Array.isArray(metadata.models) ? metadata.models.map(String) : [],
        reason: String(metadata.reason || '')
      };
    });
  }
}

module.exports = {
  ModelProviderRegistry,
  PROVIDER_IDS
};
