'use strict';

const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const AVATAR_TARGETS = Object.freeze(['mai', 'user']);
const CUSTOM_AVATAR_ID = 'custom';
const DEFAULT_AVATAR_PATHS = Object.freeze({
  mai: '../assets/mai-profile.png',
  user: '../assets/mai-icon.png'
});

function validCustomPath(target, customPaths = {}) {
  const candidate = AVATAR_TARGETS.includes(target) ? String(customPaths[target] || '').trim() : '';
  return candidate && fs.existsSync(candidate) ? candidate : '';
}

function normalizeAvatarId(value, target, customPaths = {}) {
  return value === CUSTOM_AVATAR_ID && validCustomPath(target, customPaths)
    ? CUSTOM_AVATAR_ID
    : '';
}

function normalizeAvatarSelections(value, customPaths = {}) {
  const selections = value && typeof value === 'object' ? value : {};
  return {
    mai: normalizeAvatarId(selections.mai, 'mai', customPaths),
    user: normalizeAvatarId(selections.user, 'user', customPaths)
  };
}

function publicAvatarState(value, customPaths = {}) {
  const selections = normalizeAvatarSelections(value, customPaths);
  const paths = {};
  for (const target of AVATAR_TARGETS) {
    const customPath = selections[target] === CUSTOM_AVATAR_ID
      ? validCustomPath(target, customPaths)
      : '';
    paths[target] = customPath ? pathToFileURL(customPath).href : DEFAULT_AVATAR_PATHS[target];
  }
  return {
    selections,
    defaults: { ...DEFAULT_AVATAR_PATHS },
    paths,
    avatars: []
  };
}

module.exports = {
  AVATAR_TARGETS,
  CUSTOM_AVATAR_ID,
  DEFAULT_AVATAR_PATHS,
  normalizeAvatarId,
  normalizeAvatarSelections,
  publicAvatarState
};
