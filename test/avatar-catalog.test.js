'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  AVATAR_TARGETS,
  CUSTOM_AVATAR_ID,
  DEFAULT_AVATAR_PATHS,
  normalizeAvatarSelections,
  publicAvatarState
} = require('../avatar-catalog');

test('public build exposes no bundled avatar catalog and keeps safe defaults', () => {
  assert.deepEqual(AVATAR_TARGETS, ['mai', 'user']);
  assert.equal(CUSTOM_AVATAR_ID, 'custom');
  assert.equal(DEFAULT_AVATAR_PATHS.mai, '../assets/mai-profile.png');
  assert.equal(DEFAULT_AVATAR_PATHS.user, '../assets/mai-icon.png');
  assert.deepEqual(publicAvatarState({}).avatars, []);
});

test('custom avatar selections require target-specific local copies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-local-avatar-'));
  const mai = path.join(root, 'mai.jpg');
  const user = path.join(root, 'user.jpg');
  try {
    fs.writeFileSync(mai, 'local');
    assert.deepEqual(normalizeAvatarSelections({ mai: 'custom', user: 'custom' }, { mai, user }), {
      mai: 'custom',
      user: ''
    });
    const state = publicAvatarState({ mai: 'custom', user: 'custom' }, { mai, user });
    assert.equal(state.paths.mai.startsWith('file:'), true);
    assert.equal(state.paths.user, DEFAULT_AVATAR_PATHS.user);
    assert.deepEqual(state.avatars, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
