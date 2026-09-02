'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WorkspaceSandbox } = require('../agent/workspace-sandbox');
const { createWorkspaceAgentToolRegistry } = require('../agent/workspace-tools');
const { ToolOrchestrator } = require('../agent/tool-orchestrator');
const { createCapabilityPolicy } = require('../agent/capability-policy');
const JSZip = require('jszip');

test('WorkspaceSandbox preserves v5 path and baseline protections', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-workspace-'));
  try {
    fs.writeFileSync(path.join(root, 'safe.txt'), 'before');
    const sandbox = new WorkspaceSandbox({ getWorkspacePath: () => root });
    await assert.rejects(sandbox.inspectWrite('../escape.txt', 'create'), { code: 'unsafe_filename' });
    const prepared = await sandbox.inspectWrite('safe.txt', 'replace');
    fs.writeFileSync(path.join(root, 'safe.txt'), 'changed');
    await assert.rejects(sandbox.writeTextFile('safe.txt', 'after', { mode: 'replace', prepared: { root: prepared.root, targetPath: prepared.path, mode: prepared.mode, baselineSha256: prepared.baselineSha256 } }), { code: 'file_changed' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('workspace read needs approval and execution rechecks the approved file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-workspace-'));
  try {
    fs.writeFileSync(path.join(root, 'note.txt'), 'hello');
    const registry = createWorkspaceAgentToolRegistry({ getWorkspacePath: () => root });
    const tools = new ToolOrchestrator({ registry, capabilityPolicy: createCapabilityPolicy({ allowed: ['workspace-read'] }) });
    const denied = await tools.execute({ callId: 'read-1', name: 'read_file', arguments: { path: 'note.txt' } }, { grantedCapabilities: ['workspace-read'], requestApproval: async () => false });
    assert.equal(denied.ok, false); assert.equal(denied.error.code, 'APPROVAL_DENIED');
    const accepted = await tools.execute({ callId: 'read-2', name: 'read_file', arguments: { path: 'note.txt' } }, { grantedCapabilities: ['workspace-read'], requestApproval: async () => true });
    assert.equal(accepted.ok, true); assert.equal(accepted.data.content, 'hello');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

function workspaceTools(root) {
  return new ToolOrchestrator({
    registry: createWorkspaceAgentToolRegistry({ getWorkspacePath: () => root }),
    capabilityPolicy: createCapabilityPolicy({ allowed: ['workspace-read', 'workspace-write'] })
  });
}

async function executeWrite(tools, name, args, options = {}) {
  return tools.execute({ callId: `${name}-${Date.now()}-${Math.random()}`, name, arguments: args }, {
    grantedCapabilities: ['workspace-write'], requestApproval: options.requestApproval || (async () => true), signal: options.signal
  });
}

test('workspace write tools create and replace text only after a one-time approval', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-workspace-'));
  try {
    const tools = workspaceTools(root);
    const created = await executeWrite(tools, 'create_file', { path: 'notes/today.md', content: 'hello' });
    assert.equal(created.ok, false, 'missing parent must be rejected');
    fs.mkdirSync(path.join(root, 'notes'));
    assert.equal((await executeWrite(tools, 'create_file', { path: 'notes/today.md', content: 'hello' })).ok, true);
    assert.equal(fs.readFileSync(path.join(root, 'notes', 'today.md'), 'utf8'), 'hello');
    const duplicate = await executeWrite(tools, 'create_file', { path: 'notes/today.md', content: 'other' });
    assert.equal(duplicate.error.code, 'FILE_ALREADY_EXISTS');
    const denied = await executeWrite(tools, 'write_file', { path: 'notes/today.md', content: 'blocked' }, { requestApproval: async () => false });
    assert.equal(denied.error.code, 'APPROVAL_DENIED');
    assert.equal(fs.readFileSync(path.join(root, 'notes', 'today.md'), 'utf8'), 'hello');
    const timedOut = await executeWrite(tools, 'write_file', { path: 'notes/today.md', content: 'timed out' }, { requestApproval: async () => ({ approved: false, reason: 'timeout' }) });
    assert.equal(timedOut.error.code, 'APPROVAL_TIMEOUT');
    assert.equal(fs.readFileSync(path.join(root, 'notes', 'today.md'), 'utf8'), 'hello');
    const changed = await executeWrite(tools, 'write_file', { path: 'notes/today.md', content: 'after' }, { requestApproval: async () => { fs.writeFileSync(path.join(root, 'notes', 'today.md'), 'outside change'); return true; } });
    assert.equal(changed.error.code, 'FILE_CHANGED_SINCE_APPROVAL');
    assert.equal(fs.readFileSync(path.join(root, 'notes', 'today.md'), 'utf8'), 'outside change');
    assert.equal((await executeWrite(tools, 'write_file', { path: 'notes/today.md', content: 'after' })).ok, true);
    assert.equal(fs.readFileSync(path.join(root, 'notes', 'today.md'), 'utf8'), 'after');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('workspace Word tools create and append docx only after a one-time approval and preserve the baseline', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-workspace-'));
  try {
    const tools = workspaceTools(root);
    let approval;
    const created = await executeWrite(tools, 'create_word_document', { path: 'letter.docx', content: '学姐的第一句话。' }, { requestApproval: async (value) => { approval = value; return true; } });
    assert.equal(created.ok, true);
    assert.match(approval.approval.summary, /新建 Word 文档/);
    const documentPath = path.join(root, 'letter.docx');
    const firstBytes = fs.readFileSync(documentPath);
    assert.equal(firstBytes.subarray(0, 2).toString('utf8'), 'PK');
    const denied = await executeWrite(tools, 'append_word_document', { path: 'letter.docx', content: '不应写入。' }, { requestApproval: async () => false });
    assert.equal(denied.error.code, 'APPROVAL_DENIED');
    assert.deepEqual(fs.readFileSync(documentPath), firstBytes);
    const changed = await executeWrite(tools, 'append_word_document', { path: 'letter.docx', content: '被外部修改时应停止。' }, { requestApproval: async () => { fs.writeFileSync(documentPath, Buffer.from('outside change')); return true; } });
    assert.equal(changed.error.code, 'FILE_CHANGED_SINCE_APPROVAL');
    fs.writeFileSync(documentPath, firstBytes);
    const appended = await executeWrite(tools, 'append_word_document', { path: 'letter.docx', content: '这是写入 Word 的新段落。' });
    assert.equal(appended.ok, true);
    const zip = await JSZip.loadAsync(fs.readFileSync(documentPath), { checkCRC32: true });
    const xml = await zip.file('word/document.xml').async('string');
    assert.match(xml, /学姐的第一句话。/);
    assert.match(xml, /这是写入 Word 的新段落。/);
    const wrongExtension = await executeWrite(tools, 'create_word_document', { path: 'letter.txt', content: 'blocked' });
    assert.equal(wrongExtension.error.code, 'INVALID_WORD_DOCUMENT');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('workspace write tools reject path escapes, absolute paths, links and cancelled approvals', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-workspace-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-outside-'));
  try {
    const tools = workspaceTools(root);
    assert.equal((await executeWrite(tools, 'create_file', { path: '../escape.txt', content: 'x' })).ok, false);
    assert.equal((await executeWrite(tools, 'create_file', { path: path.join(outside, 'escape.txt'), content: 'x' })).ok, false);
    fs.writeFileSync(path.join(root, 'cancel.txt'), 'before');
    const controller = new AbortController();
    const cancelled = executeWrite(tools, 'write_file', { path: 'cancel.txt', content: 'after' }, { signal: controller.signal, requestApproval: async () => { controller.abort(Object.assign(new Error('cancel'), { code: 'action_cancelled' })); return true; } });
    await assert.rejects(cancelled, { code: 'action_cancelled' });
    assert.equal(fs.readFileSync(path.join(root, 'cancel.txt'), 'utf8'), 'before');
    try {
      fs.symlinkSync(outside, path.join(root, 'linked'), 'junction');
    } catch { t.skip('当前环境不允许创建链接，链接逃逸由 WorkspaceSandbox 的 Windows realpath 路径覆盖。'); return; }
    const linked = await executeWrite(tools, 'create_file', { path: 'linked/escape.txt', content: 'x' });
    assert.equal(linked.ok, false);
    assert.equal(fs.existsSync(path.join(outside, 'escape.txt')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test('workspace directory, transfer, copy and delete tools remain inside the sandbox', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-workspace-'));
  try {
    const tools = workspaceTools(root);
    assert.equal((await executeWrite(tools, 'create_directory', { path: 'drafts' })).ok, true);
    assert.equal((await executeWrite(tools, 'create_directory', { path: '../outside' })).ok, false);
    fs.writeFileSync(path.join(root, 'drafts', 'a.txt'), 'A');
    const deniedRename = await executeWrite(tools, 'rename_path', { oldPath: 'drafts/a.txt', newPath: 'drafts/b.txt' }, { requestApproval: async () => false });
    assert.equal(deniedRename.error.code, 'APPROVAL_DENIED');
    assert.equal(fs.existsSync(path.join(root, 'drafts', 'a.txt')), true);
    assert.equal((await executeWrite(tools, 'rename_path', { oldPath: 'drafts/a.txt', newPath: 'drafts/b.txt' })).ok, true);
    assert.equal((await executeWrite(tools, 'move_path', { oldPath: 'drafts/b.txt', newPath: 'b.txt' })).ok, true);
    assert.equal((await executeWrite(tools, 'copy_file', { oldPath: 'b.txt', newPath: 'drafts/c.txt' })).ok, true);
    assert.equal(fs.readFileSync(path.join(root, 'drafts', 'c.txt'), 'utf8'), 'A');
    assert.equal((await executeWrite(tools, 'copy_file', { oldPath: 'b.txt', newPath: '../outside.txt' })).ok, false);
    const rejectedDelete = await executeWrite(tools, 'delete_path', { path: 'b.txt' }, { requestApproval: async () => false });
    assert.equal(rejectedDelete.error.code, 'APPROVAL_DENIED');
    assert.equal(fs.existsSync(path.join(root, 'b.txt')), true);
    assert.equal((await executeWrite(tools, 'delete_path', { path: 'b.txt' })).ok, true);
    const nonEmpty = await executeWrite(tools, 'delete_path', { path: 'drafts' });
    assert.equal(nonEmpty.error.code, 'DIRECTORY_NOT_EMPTY');
    assert.equal((await executeWrite(tools, 'delete_path', { path: 'drafts/c.txt' })).ok, true);
    assert.equal((await executeWrite(tools, 'delete_path', { path: 'drafts' })).ok, true);
    fs.mkdirSync(path.join(root, 'review'));
    fs.writeFileSync(path.join(root, 'review', 'note.txt'), 'review');
    let approval;
    const directoryMove = await executeWrite(tools, 'move_path', { oldPath: 'review', newPath: 'archive' }, { requestApproval: async (value) => { approval = value; return false; } });
    assert.equal(directoryMove.error.code, 'APPROVAL_DENIED');
    assert.match(approval.approval.summary, /影响范围：目录内 1 个文件、0 个子文件夹/);
    assert.equal(fs.existsSync(path.join(root, 'review', 'note.txt')), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('WorkspaceSandbox rejects root, UNC, device and hard-link paths before writes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-workspace-'));
  try {
    await assert.rejects(new WorkspaceSandbox({ getWorkspacePath: () => path.parse(root).root }).inspectWrite('x.txt', 'create'), { code: 'workspace_unavailable' });
    await assert.rejects(new WorkspaceSandbox({ getWorkspacePath: () => '\\\\server\\share' }).inspectWrite('x.txt', 'create'), { code: 'workspace_unavailable' });
    await assert.rejects(new WorkspaceSandbox({ getWorkspacePath: () => '\\\\?\\C:\\unsafe' }).inspectWrite('x.txt', 'create'), { code: 'workspace_unavailable' });
    fs.writeFileSync(path.join(root, 'original.txt'), 'original');
    fs.linkSync(path.join(root, 'original.txt'), path.join(root, 'linked.txt'));
    const tools = workspaceTools(root);
    const result = await executeWrite(tools, 'write_file', { path: 'linked.txt', content: 'blocked' });
    assert.equal(result.ok, false);
    assert.equal(fs.readFileSync(path.join(root, 'original.txt'), 'utf8'), 'original');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
