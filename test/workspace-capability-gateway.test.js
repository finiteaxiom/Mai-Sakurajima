'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WorkspaceCapabilityGateway, MAX_CHAT_EXCERPT_CHARS } = require('../workspace-capability-gateway');

function workspaceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-chat-workspace-'));
  fs.writeFileSync(path.join(root, 'README.md'), '# Hello\nThis is untrusted workspace content.');
  fs.writeFileSync(path.join(root, '.env'), 'API_KEY=secret');
  fs.writeFileSync(path.join(root, 'credentials.json'), '{"token":"secret"}');
  fs.writeFileSync(path.join(root, 'image.png'), Buffer.from([0, 1, 2]));
  fs.writeFileSync(path.join(root, 'large.txt'), 'x'.repeat(MAX_CHAT_EXCERPT_CHARS * 2 + 100));
  fs.mkdirSync(path.join(root, 'docs'));
  return root;
}

test('Chat Workspace gateway grants a session-bound, revocable read-only scope', async () => {
  const root = workspaceFixture();
  try {
    let now = 1000;
    const gateway = new WorkspaceCapabilityGateway({ selectDirectory: async () => root, now: () => now, grantTtlMs: 100 });
    await assert.rejects(gateway.execute('chat-1', { operation: 'list', relativePath: '.' }), { code: 'workspace_grant_required' });
    const grant = await gateway.selectWorkspace('chat-1');
    assert.equal(grant.granted, true);
    assert.equal(grant.displayName, path.basename(root));
    assert.equal('rootPath' in grant, false);
    const listing = await gateway.execute('chat-1', { operation: 'list', relativePath: '.' });
    assert.deepEqual(listing.result.entries.map((entry) => entry.name).sort(), ['README.md', 'credentials.json', 'docs', 'image.png', 'large.txt']);
    await assert.rejects(gateway.execute('chat-2', { operation: 'read', relativePath: 'README.md' }), { code: 'workspace_grant_required' });
    gateway.revoke('chat-1');
    await assert.rejects(gateway.execute('chat-1', { operation: 'list', relativePath: '.' }), { code: 'workspace_grant_required' });
    await gateway.selectWorkspace('chat-1');
    now += 101;
    assert.equal(gateway.getStatus('chat-1').granted, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Chat Workspace gateway preserves Sandbox limits and blocks sensitive or non-text files', async () => {
  const root = workspaceFixture();
  try {
    const gateway = new WorkspaceCapabilityGateway({ selectDirectory: async () => root });
    await gateway.selectWorkspace('chat-1');
    await assert.rejects(gateway.execute('chat-1', { operation: 'read', relativePath: '../README.md' }));
    await assert.rejects(gateway.execute('chat-1', { operation: 'read', relativePath: '.env' }), { code: 'sensitive_file_denied' });
    await assert.rejects(gateway.execute('chat-1', { operation: 'read', relativePath: 'credentials.json' }), { code: 'sensitive_file_denied' });
    await assert.rejects(gateway.execute('chat-1', { operation: 'read', relativePath: 'image.png' }), { code: 'unsupported_file' });
    const read = await gateway.execute('chat-1', { operation: 'read', relativePath: 'large.txt' });
    assert.equal(read.result.contentTruncated, true);
    const context = gateway.consumeContext('chat-1', read.contextId);
    assert.equal(context.payload.content.length, MAX_CHAT_EXCERPT_CHARS);
    assert.throws(() => gateway.consumeContext('chat-1', read.contextId), { code: 'workspace_context_unavailable' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
