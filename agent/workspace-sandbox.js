'use strict';

// Directly migrated from Mai v5.12.0. Only the module location changed.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_WORKSPACE_WRITE_BYTES = 64 * 1024;
const SAFE_WORKSPACE_WRITE_EXTENSIONS = new Set(['.c','.cc','.cpp','.cs','.css','.csv','.go','.h','.hpp','.html','.ini','.java','.js','.json','.jsx','.md','.markdown','.mjs','.py','.rs','.sql','.toml','.ts','.tsx','.txt','.xml','.yaml','.yml']);
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
class SandboxViolationError extends Error { constructor(code, message, options = {}) { super(message); this.name = 'SandboxViolationError'; this.code = String(code || 'sandbox_denied'); this.retryable = options.retryable !== false; this.permissionDenied = true; } }
function normalizeCase(value) { const resolved = path.resolve(value); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; }
function pathIsInside(candidate, root) { const normalizedCandidate = normalizeCase(candidate); const normalizedRoot = normalizeCase(root); return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`); }
function isFilesystemRoot(target) { const resolved = path.resolve(target); return path.dirname(resolved) === resolved; }
function isNetworkOrDevicePath(target) { const raw = String(target || '').trim().replace(/\//g, '\\'); return /^\\\\/.test(raw) || /^\\[?.]\\/.test(raw); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sanitizeManagedTitle(title) { return String(title || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim().slice(0, 64) || 'Mai 的笔记'; }
function safeWorkspaceRequest(value) {
  const requested = String(value || '').trim();
  if (!requested || requested.length > 500 || requested.includes('\u0000')) throw new SandboxViolationError('invalid_path', 'Workspace 写入路径无效。');
  if (path.isAbsolute(requested) || /^(?:\\\\|\\\\\?\\|\\\\\.\\|\/\/)/.test(requested)) throw new SandboxViolationError('sandbox_path_denied', 'permission denied：请只使用 Workspace 内的相对路径。');
  if (requested === '.' || requested === './') return '.';
  const parts = requested.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.some((part) => part.includes(':') || /[. ]$/.test(part) || WINDOWS_RESERVED_NAMES.test(part))) throw new SandboxViolationError('unsafe_filename', '路径包含 Windows 保留名、数据流或容易混淆的结尾，Sandbox 已拒绝。');
  return requested;
}
function normalizedRelativePath(requested) { const slashPath = requested.replace(/\\/g, '/').replace(/^\.\//, '').trim(); if (/^(workspace|工作区|当前工作区)(?:\/|$)/i.test(slashPath)) return slashPath.replace(/^(workspace|工作区|当前工作区)\/?/i, ''); return slashPath === '.' ? '' : slashPath; }

class WorkspaceSandbox {
  constructor(options = {}) { this.getWorkspacePath = typeof options.getWorkspacePath === 'function' ? options.getWorkspacePath : () => ''; this.maxWriteBytes = Math.max(1024, Number(options.maxWriteBytes) || MAX_WORKSPACE_WRITE_BYTES); this.writeExtensions = options.writeExtensions instanceof Set ? new Set(options.writeExtensions) : new Set(SAFE_WORKSPACE_WRITE_EXTENSIONS); }
  configuredRoot() { const raw = String(this.getWorkspacePath() || '').trim(); if (!raw || !path.isAbsolute(raw) || isFilesystemRoot(raw) || isNetworkOrDevicePath(raw)) throw new SandboxViolationError('workspace_unavailable', '还没有选择可用的 Work Workspace。请先在 Work 工作区选择文件夹。'); return path.resolve(raw); }
  candidatePath(requested, options = {}) { const raw = safeWorkspaceRequest(requested); const root = this.configuredRoot(); const candidate = path.resolve(root, normalizedRelativePath(raw)); if (!pathIsInside(candidate, root) || (candidate === root && options.allowRoot !== true)) throw new SandboxViolationError('sandbox_path_denied', 'permission denied：操作只能发生在当前 Workspace 内。'); return { root, candidate }; }
  async inspectWorkspaceRoot() {
    const configured = this.configuredRoot();
    let root;
    try { root = await fs.promises.realpath(configured); } catch { throw new SandboxViolationError('workspace_unavailable', '选择的 Workspace 已不存在或无法访问。'); }
    if (isFilesystemRoot(root) || isNetworkOrDevicePath(root)) throw new SandboxViolationError('unsafe_workspace_root', 'Workspace 不能解析为整个磁盘根目录、网络共享或设备路径。');
    const stat = await fs.promises.lstat(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new SandboxViolationError('workspace_unavailable', '选择的 Workspace 不是安全文件夹。');
    return { root, path: root, parentPath: path.dirname(root), relativePath: '', friendlyPath: 'Workspace', stat, kind: 'directory', baselineSha256: '' };
  }
  validateWriteFilename(candidate, allowedExtensions = this.writeExtensions) { const name = path.basename(candidate); if (!name || name === '.' || name === '..' || name.includes(':') || WINDOWS_RESERVED_NAMES.test(name)) throw new SandboxViolationError('unsafe_filename', '目标文件名不安全，Sandbox 已拒绝写入。'); if (!(allowedExtensions instanceof Set) || !allowedExtensions.has(path.extname(name).toLowerCase())) throw new SandboxViolationError('unsafe_file_type', 'Workspace 只允许写入受支持的纯文本代码或文档文件。'); }
  async inspectWrite(requested, mode = 'create', options = {}) {
    const normalizedMode = mode === 'replace' ? 'replace' : 'create'; const { root, candidate } = this.candidatePath(requested); this.validateWriteFilename(candidate, options.allowedExtensions || this.writeExtensions);
    let realRoot; let realParent; try { realRoot = await fs.promises.realpath(root); realParent = await fs.promises.realpath(path.dirname(candidate)); } catch { throw new SandboxViolationError('workspace_parent_missing', '目标文件夹不存在；请先选择 Workspace 中已经存在的目录。'); }
    if (isFilesystemRoot(realRoot) || isNetworkOrDevicePath(realRoot)) throw new SandboxViolationError('unsafe_workspace_root', 'Workspace 不能解析为整个磁盘根目录。');
    if (!pathIsInside(realParent, realRoot)) throw new SandboxViolationError('sandbox_symlink_escape', '目标路径通过链接越过了 Workspace，Sandbox 已拒绝写入。');
    const resolvedCandidate = path.join(realParent, path.basename(candidate)); let stat = null; try { stat = await fs.promises.lstat(resolvedCandidate); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isSymbolicLink()) throw new SandboxViolationError('sandbox_symlink_denied', '不能写入符号链接或目录链接。'); if (stat && Number(stat.nlink) > 1) throw new SandboxViolationError('sandbox_hardlink_denied', '不能覆盖具有多个硬链接的文件。'); if (stat && !stat.isFile()) throw new SandboxViolationError('not_a_file', '目标路径不是普通文件。');
    if (normalizedMode === 'create' && stat) throw new SandboxViolationError('file_exists', '目标文件已经存在。若确实需要覆盖，请改用 replace 模式。'); if (normalizedMode === 'replace' && !stat) throw new SandboxViolationError('file_missing', '目标文件不存在。若要新建文件，请改用 create 模式。'); if (stat && stat.size > this.maxWriteBytes) throw new SandboxViolationError('write_target_too_large', `为避免破坏大型文件，不能替换超过 ${Math.round(this.maxWriteBytes / 1024)} KB 的文件。`);
    const relative = path.relative(realRoot, resolvedCandidate).replace(/\\/g, '/'); const baselineSha256 = stat ? sha256(await fs.promises.readFile(resolvedCandidate)) : '';
    return { root: realRoot, path: resolvedCandidate, friendlyPath: `Workspace/${relative}`, relativePath: relative, exists: Boolean(stat), size: stat?.size || 0, mode: normalizedMode, baselineSha256 };
  }
  validateContent(content) { const text = String(content ?? ''); if (text.includes('\u0000')) throw new SandboxViolationError('binary_content_denied', '写入内容看起来不是安全纯文本。'); const bytes = Buffer.byteLength(text, 'utf8'); if (bytes > this.maxWriteBytes) throw new SandboxViolationError('write_too_large', `单次写入不能超过 ${Math.round(this.maxWriteBytes / 1024)} KB。`); return { text, bytes }; }
  validateBinaryContent(content) { if (!Buffer.isBuffer(content) && !(content instanceof Uint8Array)) throw new SandboxViolationError('binary_content_denied', '文档写入内容无效。'); const data = Buffer.from(content); if (!data.length) throw new SandboxViolationError('binary_content_denied', '文档写入内容不能为空。'); if (data.length > this.maxWriteBytes) throw new SandboxViolationError('write_too_large', `单次写入不能超过 ${Math.round(this.maxWriteBytes / 1024)} KB。`); return { data, bytes: data.length }; }
  async writeTextFile(requested, content, options = {}) {
    const { text, bytes } = this.validateContent(content); const contentSha256 = sha256(Buffer.from(text, 'utf8')); const inspected = await this.inspectWrite(requested, options.mode); const prepared = options.prepared && typeof options.prepared === 'object' ? options.prepared : null;
    if (prepared && (normalizeCase(prepared.root) !== normalizeCase(inspected.root) || normalizeCase(prepared.targetPath) !== normalizeCase(inspected.path) || prepared.mode !== inspected.mode)) throw new SandboxViolationError('sandbox_intent_changed', 'Workspace、目标路径或操作模式在审批后发生变化，本次写入已停止。');
    if (prepared?.baselineSha256 !== undefined && prepared.baselineSha256 !== inspected.baselineSha256) throw new SandboxViolationError('file_changed', '文件在审批或规划后发生了变化；为避免覆盖新内容，本次写入已停止。'); if (prepared?.contentSha256 && prepared.contentSha256 !== contentSha256) throw new SandboxViolationError('sandbox_intent_changed', '写入内容在审批后发生变化，本次写入已停止。');
    let previousSha256 = ''; if (inspected.exists) { const previous = await fs.promises.readFile(inspected.path); previousSha256 = sha256(previous); const expected = String(options.expectedSha256 || '').trim().toLowerCase(); if (expected && expected !== previousSha256) throw new SandboxViolationError('file_changed', '文件在规划后发生了变化；为避免覆盖新内容，本次写入已停止。'); }
    if (inspected.mode === 'create') await fs.promises.writeFile(inspected.path, text, { encoding: 'utf8', flag: 'wx' }); else {
      const temporaryPath = path.join(path.dirname(inspected.path), `.mai-write-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`);
      try { await fs.promises.writeFile(temporaryPath, text, { encoding: 'utf8', flag: 'wx' }); const finalCheck = await this.inspectWrite(requested, 'replace'); if (normalizeCase(finalCheck.path) !== normalizeCase(inspected.path) || finalCheck.baselineSha256 !== inspected.baselineSha256) throw new SandboxViolationError('sandbox_target_changed', '目标路径在写入前发生变化，Sandbox 已停止操作。'); await fs.promises.rename(temporaryPath, inspected.path); } catch (error) { try { await fs.promises.unlink(temporaryPath); } catch {} throw error; }
    }
    return { path: inspected.friendlyPath, relativePath: inspected.relativePath, mode: inspected.mode, bytes, sha256: contentSha256, previousSha256 };
  }
  async writeBinaryFile(requested, content, options = {}) {
    const { data, bytes } = this.validateBinaryContent(content); const allowedExtensions = options.allowedExtensions; if (!(allowedExtensions instanceof Set)) throw new SandboxViolationError('unsafe_file_type', '二进制写入必须由受限文档工具发起。'); const contentSha256 = sha256(data); const inspected = await this.inspectWrite(requested, options.mode, { allowedExtensions }); const prepared = options.prepared && typeof options.prepared === 'object' ? options.prepared : null;
    if (prepared && (normalizeCase(prepared.root) !== normalizeCase(inspected.root) || normalizeCase(prepared.targetPath) !== normalizeCase(inspected.path) || prepared.mode !== inspected.mode)) throw new SandboxViolationError('sandbox_intent_changed', 'Workspace、目标路径或操作模式在审批后发生变化，本次写入已停止。');
    if (prepared?.baselineSha256 !== undefined && prepared.baselineSha256 !== inspected.baselineSha256) throw new SandboxViolationError('file_changed', '文件在审批或规划后发生了变化；为避免覆盖新内容，本次写入已停止。'); if (prepared?.contentSha256 && prepared.contentSha256 !== contentSha256) throw new SandboxViolationError('sandbox_intent_changed', '写入内容在审批后发生变化，本次写入已停止。');
    let previousSha256 = ''; if (inspected.exists) { const previous = await fs.promises.readFile(inspected.path); previousSha256 = sha256(previous); const expected = String(options.expectedSha256 || '').trim().toLowerCase(); if (expected && expected !== previousSha256) throw new SandboxViolationError('file_changed', '文件在规划后发生了变化；为避免覆盖新内容，本次写入已停止。'); }
    if (inspected.mode === 'create') await fs.promises.writeFile(inspected.path, data, { flag: 'wx' }); else {
      const temporaryPath = path.join(path.dirname(inspected.path), `.mai-write-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`);
      try { await fs.promises.writeFile(temporaryPath, data, { flag: 'wx' }); const finalCheck = await this.inspectWrite(requested, 'replace', { allowedExtensions }); if (normalizeCase(finalCheck.path) !== normalizeCase(inspected.path) || finalCheck.baselineSha256 !== inspected.baselineSha256) throw new SandboxViolationError('sandbox_target_changed', '目标路径在写入前发生变化，Sandbox 已停止操作。'); await fs.promises.rename(temporaryPath, inspected.path); } catch (error) { try { await fs.promises.unlink(temporaryPath); } catch {} throw error; }
    }
    return { path: inspected.friendlyPath, relativePath: inspected.relativePath, mode: inspected.mode, bytes, sha256: contentSha256, previousSha256 };
  }
  async prepareManagedNote(title, content = '') {
    const root = await fs.promises.realpath(this.configuredRoot()); if (isFilesystemRoot(root) || isNetworkOrDevicePath(root)) throw new SandboxViolationError('unsafe_workspace_root', 'Workspace 不能解析为整个磁盘根目录。'); const body = `# ${String(title || '').trim().slice(0, 120)}\n\n${String(content || '').trim()}\n`; this.validateContent(body);
    const safeTitle = sanitizeManagedTitle(title); const noteRoot = path.join(root, 'Mai Notes'); let noteStat = null; try { noteStat = await fs.promises.lstat(noteRoot); } catch (error) { if (error.code !== 'ENOENT') throw error; } if (noteStat?.isSymbolicLink() || (noteStat && !noteStat.isDirectory())) throw new SandboxViolationError('sandbox_symlink_denied', 'Workspace/Mai Notes 不是安全目录。'); let inspectionRoot = noteRoot; if (noteStat) { inspectionRoot = await fs.promises.realpath(noteRoot); if (!pathIsInside(inspectionRoot, root)) throw new SandboxViolationError('sandbox_symlink_escape', '笔记目录越过了 Workspace，Sandbox 已拒绝写入。'); }
    let filename = ''; for (let index = 1; index <= 999; index += 1) { const suffix = index === 1 ? '' : ` (${index})`; const candidateName = `${safeTitle}${suffix}.md`; try { await fs.promises.lstat(path.join(inspectionRoot, candidateName)); } catch (error) { if (error.code === 'ENOENT') { filename = candidateName; break; } throw error; } } if (!filename) throw new SandboxViolationError('too_many_note_conflicts', '同名笔记过多，无法在 Workspace 中创建新文件。');
    return { root, title: String(title || '').trim().slice(0, 120), safeTitle, filename, directoryName: 'Mai Notes', friendlyDirectory: 'Workspace/Mai Notes', friendlyPath: `Workspace/Mai Notes/${filename}`, contentSha256: sha256(Buffer.from(body, 'utf8')) };
  }
  async createManagedNote(prepared, content) {
    if (!prepared || typeof prepared !== 'object') throw new SandboxViolationError('missing_tool_intent', '缺少经过 Sandbox 准备的笔记写入意图。'); const currentRoot = await fs.promises.realpath(this.configuredRoot()); if (normalizeCase(currentRoot) !== normalizeCase(prepared.root)) throw new SandboxViolationError('sandbox_intent_changed', 'Workspace 在审批后发生变化，本次笔记写入已停止。'); const noteRoot = path.join(currentRoot, 'Mai Notes'); let noteStat = null; try { noteStat = await fs.promises.lstat(noteRoot); } catch (error) { if (error.code !== 'ENOENT') throw error; } if (noteStat?.isSymbolicLink() || (noteStat && !noteStat.isDirectory())) throw new SandboxViolationError('sandbox_symlink_denied', 'Workspace/Mai Notes 不是安全目录。'); if (!noteStat) await fs.promises.mkdir(noteRoot); const realNoteRoot = await fs.promises.realpath(noteRoot); if (!pathIsInside(realNoteRoot, currentRoot)) throw new SandboxViolationError('sandbox_symlink_escape', '笔记目录越过了 Workspace，Sandbox 已拒绝写入。'); const body = `# ${prepared.title}\n\n${String(content || '').trim()}\n`; if (prepared.contentSha256 !== sha256(Buffer.from(body, 'utf8'))) throw new SandboxViolationError('sandbox_intent_changed', '笔记内容在审批后发生变化，本次写入已停止。'); const { bytes } = this.validateContent(body); const filename = String(prepared.filename || ''); const candidate = path.join(realNoteRoot, filename); if (!filename || path.basename(filename) !== filename) throw new SandboxViolationError('sandbox_intent_changed', '笔记目标在审批后发生变化，本次写入已停止。'); this.validateWriteFilename(candidate); try { await fs.promises.writeFile(candidate, body, { encoding: 'utf8', flag: 'wx' }); } catch (error) { if (error.code === 'EEXIST') throw new SandboxViolationError('file_changed', '审批后的笔记目标已被占用，本次写入已停止。'); throw error; }
    return { path: `Workspace/Mai Notes/${filename}`, relativePath: `Mai Notes/${filename}`, mode: 'create', bytes, sha256: sha256(Buffer.from(body, 'utf8')) };
  }
  async inspectPath(requested, options = {}) {
    const expectedKind = options.kind || 'any';
    const mustExist = options.mustExist !== false;
    const allowRoot = options.allowRoot === true;
    const { root, candidate } = this.candidatePath(requested, { allowRoot });
    const realRoot = await fs.promises.realpath(root);
    if (isFilesystemRoot(realRoot) || isNetworkOrDevicePath(realRoot)) throw new SandboxViolationError('unsafe_workspace_root', 'Workspace 不能解析为整个磁盘根目录。');
    if (candidate === root) {
      if (!allowRoot) throw new SandboxViolationError('sandbox_path_denied', 'permission denied：不能直接操作 Workspace 根目录。');
      const stat = await fs.promises.lstat(realRoot);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new SandboxViolationError('workspace_unavailable', 'Workspace 不是安全文件夹。');
      if (expectedKind === 'file') throw new SandboxViolationError('not_a_file', '目标路径不是普通文件。');
      return { root: realRoot, path: realRoot, parentPath: path.dirname(realRoot), relativePath: '', friendlyPath: 'Workspace', stat, kind: 'directory', baselineSha256: '' };
    }
    const parentPath = path.dirname(candidate);
    let realParent;
    try { realParent = await fs.promises.realpath(parentPath); } catch { throw new SandboxViolationError('workspace_parent_missing', '目标文件夹不存在；请先创建或选择 Workspace 内已有的文件夹。'); }
    if (!pathIsInside(realParent, realRoot)) throw new SandboxViolationError('sandbox_symlink_escape', '目标路径通过链接越过了 Workspace，Sandbox 已拒绝。');
    const targetPath = path.join(realParent, path.basename(candidate));
    let stat = null;
    try { stat = await fs.promises.lstat(targetPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (mustExist && !stat) throw new SandboxViolationError('file_missing', '目标路径不存在。');
    if (!mustExist && stat) throw new SandboxViolationError('file_exists', '目标路径已经存在。');
    if (stat?.isSymbolicLink()) throw new SandboxViolationError('sandbox_symlink_denied', '不能操作符号链接或目录链接。');
    if (stat && stat.isFile() && Number(stat.nlink) > 1) throw new SandboxViolationError('sandbox_hardlink_denied', '不能操作具有多个硬链接的文件。');
    if (stat && expectedKind === 'file' && !stat.isFile()) throw new SandboxViolationError('not_a_file', '目标路径不是普通文件。');
    if (stat && expectedKind === 'directory' && !stat.isDirectory()) throw new SandboxViolationError('not_a_directory', '目标路径不是文件夹。');
    const relativePath = path.relative(realRoot, targetPath).replace(/\\/g, '/');
    const baselineSha256 = stat?.isFile() ? sha256(await fs.promises.readFile(targetPath)) : '';
    return { root: realRoot, path: targetPath, parentPath: realParent, relativePath, friendlyPath: `Workspace/${relativePath}`, stat, kind: stat?.isDirectory() ? 'directory' : stat?.isFile() ? 'file' : 'missing', baselineSha256 };
  }
  async prepareDirectoryCreate(requested) {
    const target = await this.inspectPath(requested, { mustExist: false });
    return { operation: 'create_directory', root: target.root, targetPath: target.path, relativePath: target.relativePath };
  }
  async createDirectory(prepared) {
    if (!prepared || prepared.operation !== 'create_directory') throw new SandboxViolationError('missing_tool_intent', '缺少经过 Sandbox 准备的目录创建意图。');
    const target = await this.inspectPath(prepared.relativePath, { mustExist: false });
    if (normalizeCase(target.root) !== normalizeCase(prepared.root) || normalizeCase(target.path) !== normalizeCase(prepared.targetPath)) throw new SandboxViolationError('sandbox_intent_changed', '目录目标在审批后发生变化，本次创建已停止。');
    try { await fs.promises.mkdir(target.path); } catch (error) { if (error.code === 'EEXIST') throw new SandboxViolationError('file_exists', '审批后的目录目标已存在，本次创建已停止。'); throw error; }
    return { path: target.friendlyPath, relativePath: target.relativePath, alreadyExists: false };
  }
  async prepareTransfer(requestedSource, requestedDestination, operation) {
    const source = await this.inspectPath(requestedSource, { mustExist: true });
    const destination = await this.inspectPath(requestedDestination, { mustExist: false });
    if (operation === 'copy_file' && source.kind !== 'file') throw new SandboxViolationError('not_a_file', '复制仅支持普通文件。');
    return { operation, root: source.root, sourcePath: source.path, sourceRelativePath: source.relativePath, destinationPath: destination.path, destinationRelativePath: destination.relativePath, sourceKind: source.kind, baselineSha256: source.baselineSha256, baselineMtimeMs: source.stat?.mtimeMs || 0, baselineSize: source.stat?.size || 0, impact: await this.describeTransferImpact(source) };
  }
  async describeTransferImpact(source) {
    if (source.kind !== 'directory') return { files: source.kind === 'file' ? 1 : 0, directories: 0, truncated: false };
    const limit = 500;
    const result = { files: 0, directories: 0, truncated: false };
    const pending = [source.path];
    while (pending.length && !result.truncated) {
      const current = pending.pop();
      const directory = await fs.promises.opendir(current);
      for await (const item of directory) {
        if (result.files + result.directories >= limit) { result.truncated = true; break; }
        const itemPath = path.join(current, item.name);
        let stat;
        try { stat = await fs.promises.lstat(itemPath); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (stat.isDirectory() && !stat.isSymbolicLink()) { result.directories += 1; pending.push(itemPath); }
        else result.files += 1;
      }
    }
    return result;
  }
  async revalidateTransfer(prepared) {
    const source = await this.inspectPath(prepared.sourceRelativePath, { mustExist: true });
    const destination = await this.inspectPath(prepared.destinationRelativePath, { mustExist: false });
    if (normalizeCase(source.root) !== normalizeCase(prepared.root) || normalizeCase(source.path) !== normalizeCase(prepared.sourcePath) || normalizeCase(destination.path) !== normalizeCase(prepared.destinationPath) || source.kind !== prepared.sourceKind || source.baselineSha256 !== prepared.baselineSha256 || source.stat?.size !== prepared.baselineSize || source.stat?.mtimeMs !== prepared.baselineMtimeMs) throw new SandboxViolationError('file_changed', '文件或目标路径在审批后发生变化，本次操作已停止。');
    return { source, destination };
  }
  async transfer(prepared) {
    if (!prepared || !['rename_path', 'move_path', 'copy_file'].includes(prepared.operation)) throw new SandboxViolationError('missing_tool_intent', '缺少经过 Sandbox 准备的文件操作意图。');
    const { source, destination } = await this.revalidateTransfer(prepared);
    if (prepared.operation === 'copy_file') {
      const content = await fs.promises.readFile(source.path);
      const temporaryPath = path.join(destination.parentPath, `.mai-copy-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`);
      try { await fs.promises.writeFile(temporaryPath, content, { flag: 'wx' }); await fs.promises.rename(temporaryPath, destination.path); } catch (error) { try { await fs.promises.unlink(temporaryPath); } catch {} throw error; }
    } else {
      await fs.promises.rename(source.path, destination.path);
    }
    return { operation: prepared.operation, sourcePath: source.friendlyPath, destinationPath: destination.friendlyPath, path: destination.friendlyPath };
  }
  async prepareDelete(requested) {
    const target = await this.inspectPath(requested, { mustExist: true });
    if (target.kind === 'directory') {
      const entries = await fs.promises.readdir(target.path);
      if (entries.length) throw new SandboxViolationError('directory_not_empty', '暂不允许递归删除非空目录。');
    }
    return { operation: 'delete_path', root: target.root, targetPath: target.path, relativePath: target.relativePath, kind: target.kind, baselineSha256: target.baselineSha256, baselineMtimeMs: target.stat?.mtimeMs || 0, baselineSize: target.stat?.size || 0 };
  }
  async deletePath(prepared) {
    if (!prepared || prepared.operation !== 'delete_path') throw new SandboxViolationError('missing_tool_intent', '缺少经过 Sandbox 准备的删除意图。');
    const target = await this.inspectPath(prepared.relativePath, { mustExist: true });
    if (normalizeCase(target.root) !== normalizeCase(prepared.root) || normalizeCase(target.path) !== normalizeCase(prepared.targetPath) || target.kind !== prepared.kind || target.baselineSha256 !== prepared.baselineSha256 || target.stat?.size !== prepared.baselineSize || target.stat?.mtimeMs !== prepared.baselineMtimeMs) throw new SandboxViolationError('file_changed', '目标在审批后发生变化，本次删除已停止。');
    if (target.kind === 'directory') {
      const entries = await fs.promises.readdir(target.path); if (entries.length) throw new SandboxViolationError('directory_not_empty', '目录在审批后变为非空，未执行递归删除。'); await fs.promises.rmdir(target.path);
    } else await fs.promises.unlink(target.path);
    return { path: target.friendlyPath, relativePath: target.relativePath, kind: target.kind };
  }
}
module.exports = { MAX_WORKSPACE_WRITE_BYTES, SAFE_WORKSPACE_WRITE_EXTENSIONS, SandboxViolationError, WorkspaceSandbox, isFilesystemRoot, isNetworkOrDevicePath, pathIsInside, sanitizeManagedTitle, sha256 };
