'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MAX_LIST_ENTRIES, WorkspaceFileService } = require('../agent/workspace-file-service');

test('WorkspaceFileService exposes a lazy-safe Explorer view and supported text reads', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-workspace-explorer-'));
  try {
    fs.writeFileSync(path.join(root, 'README.md'), '# Hello\nMai');
    fs.writeFileSync(path.join(root, 'page.html'), '<h1>Hello</h1>');
    fs.writeFileSync(path.join(root, 'document.docx'), 'not rendered as text');
    fs.writeFileSync(path.join(root, '.private'), 'not listed');
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs', 'notes.txt'), 'alpha beta');
    const service = new WorkspaceFileService({ getWorkspacePath: () => root });

    const listing = await service.listDirectory('.');
    assert.deepEqual(listing.entries.map((entry) => entry.name), ['docs', 'document.docx', 'page.html', 'README.md']);
    assert.equal(listing.entries.find((entry) => entry.name === 'page.html').readable, true);
    assert.equal(listing.entries.find((entry) => entry.name === 'document.docx').readable, false);
    assert.deepEqual((await service.listDirectory('docs')).entries.map((entry) => entry.name), ['notes.txt']);
    assert.equal((await service.getPathInfo('.')).type, 'folder');

    const prepared = await service.prepareRead('page.html');
    assert.match((await service.readPrepared('page.html', prepared.prepared)).content, /Hello/);
    const search = await service.searchFileNames('note');
    assert.deepEqual(search.entries.map((entry) => entry.relativePath), ['docs/notes.txt']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('WorkspaceFileService rejects paths outside the selected Workspace', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-workspace-explorer-'));
  try {
    const service = new WorkspaceFileService({ getWorkspacePath: () => root });
    await assert.rejects(service.listDirectory('../'), { code: 'unsafe_filename' });
    await assert.rejects(service.getPathInfo(path.resolve(root, '..')), { code: 'sandbox_path_denied' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('WorkspaceFileService bounds Explorer directories and reports empty folders', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-workspace-explorer-'));
  try {
    fs.mkdirSync(path.join(root, 'empty'));
    for (let index = 0; index < MAX_LIST_ENTRIES + 6; index += 1) fs.writeFileSync(path.join(root, `entry-${index}.txt`), String(index));
    const service = new WorkspaceFileService({ getWorkspacePath: () => root });
    const listing = await service.listDirectory('.');
    assert.equal(listing.entries.length, MAX_LIST_ENTRIES);
    assert.equal(listing.truncated, true);
    const empty = await service.listDirectory('empty');
    assert.deepEqual(empty.entries, []);
    assert.equal(empty.truncated, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('WorkspaceFileService local preview keeps text restrictions without Agent approval', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-workspace-preview-'));
  try {
    fs.writeFileSync(path.join(root, 'README.md'), '# Local only');
    fs.writeFileSync(path.join(root, 'image.png'), 'not a PNG');
    fs.writeFileSync(path.join(root, 'binary.txt'), Buffer.from([0, 1, 2]));
    fs.writeFileSync(path.join(root, 'large.txt'), Buffer.alloc(128 * 1024 + 1, 'a'));
    const service = new WorkspaceFileService({ getWorkspacePath: () => root });
    assert.equal((await service.readPreview('README.md')).content, '# Local only');
    await assert.rejects(service.readPreview('image.png'), { code: 'unsupported_file' });
    await assert.rejects(service.readPreview('binary.txt'), { code: 'binary_content_denied' });
    await assert.rejects(service.readPreview('large.txt'), { code: 'file_too_large' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
