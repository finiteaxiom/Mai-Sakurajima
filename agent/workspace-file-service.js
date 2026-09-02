'use strict';

// The single Workspace filesystem access layer used by both the Explorer IPC
// and Work tools. It deliberately delegates every path decision to
// WorkspaceSandbox instead of accepting absolute paths from either caller.
const fs = require('fs');
const path = require('path');
const { WorkspaceSandbox, SandboxViolationError, sha256 } = require('./workspace-sandbox');

const MAX_READ_BYTES = 128 * 1024;
const MAX_LIST_ENTRIES = 300;
const MAX_SEARCH_RESULTS = 100;
const SAFE_READ_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.cs', '.css', '.csv', '.go', '.h', '.hpp', '.html', '.ini', '.java', '.js', '.json', '.jsx', '.md', '.markdown', '.mjs', '.py', '.rs', '.sql', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml']);
const WORD_WRITE_EXTENSIONS = new Set(['.docx']);

function normalizedRelativePath(value) {
  const text = String(value === undefined ? '.' : value).trim().replace(/\\/g, '/').replace(/^\.\//, '');
  return text || '.';
}

function publicEntry(target) {
  const stat = target.stat;
  return {
    name: target.relativePath ? path.basename(target.path) : path.basename(target.path),
    relativePath: target.relativePath,
    type: target.kind === 'directory' ? 'folder' : target.kind === 'file' ? 'file' : 'other',
    extension: target.kind === 'file' ? path.extname(target.path).toLowerCase() : '',
    size: target.kind === 'file' ? stat.size : 0,
    modifiedAt: stat.mtime.toISOString(),
    readable: target.kind === 'file' && SAFE_READ_EXTENSIONS.has(path.extname(target.path).toLowerCase()) && stat.size <= MAX_READ_BYTES
  };
}

function compareEntries(left, right) {
  if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
  return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
}

class WorkspaceFileService {
  constructor(options = {}) {
    this.sandbox = options.workspaceSandbox || new WorkspaceSandbox({ getWorkspacePath: options.getWorkspacePath });
  }

  async getWorkspaceInfo() {
    const target = await this.sandbox.inspectWorkspaceRoot();
    return { configured: true, name: path.basename(target.path), path: 'Workspace', rootPath: target.path, boundary: '仅显示和操作当前 Project Workspace 内的安全路径；文件正文发送给模型前仍需单次确认。' };
  }

  async listDirectory(relativePath = '.') {
    const target = await this.sandbox.inspectPath(normalizedRelativePath(relativePath), { kind: 'directory', allowRoot: true });
    const entries = [];
    let truncated = false;
    const directory = await fs.promises.opendir(target.path);
    for await (const dirent of directory) {
      // Hidden folders frequently contain dependencies, VCS state or OS data.
      // They remain inaccessible through this UI and tool layer by default.
      if (dirent.name.startsWith('.')) continue;
      const entryPath = path.join(target.path, dirent.name);
      let stat;
      try { stat = await fs.promises.lstat(entryPath); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (stat.isSymbolicLink() || (stat.isFile() && Number(stat.nlink) > 1)) continue;
      if (entries.length >= MAX_LIST_ENTRIES) {
        truncated = true;
        break;
      }
      const kind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
      const relative = target.relativePath ? `${target.relativePath}/${dirent.name}` : dirent.name;
      entries.push(publicEntry({ path: entryPath, relativePath: relative, kind, stat }));
    }
    entries.sort(compareEntries);
    return { path: target.friendlyPath, relativePath: target.relativePath, name: path.basename(target.path), entries, truncated };
  }

  async prepareList(relativePath = '.') {
    const target = await this.sandbox.inspectPath(normalizedRelativePath(relativePath), { kind: 'directory', allowRoot: true });
    return { root: target.root, targetPath: target.path, relativePath: target.relativePath };
  }

  async listPrepared(relativePath, prepared, options = {}) {
    const target = await this.sandbox.inspectPath(normalizedRelativePath(relativePath), { kind: 'directory', allowRoot: true });
    if (!prepared || prepared.root !== target.root || prepared.targetPath !== target.path) throw new SandboxViolationError('sandbox_intent_changed', 'Workspace 或目标目录在规划后发生变化，本次列举已停止。');
    return this.listFiles(relativePath, options);
  }

  async listFiles(relativePath = '.', options = {}) {
    const recursive = options.recursive === true;
    const maxEntries = Math.max(1, Math.min(MAX_LIST_ENTRIES, Number(options.maxEntries) || MAX_LIST_ENTRIES));
    const maxDepth = Math.max(1, Math.min(3, Number(options.maxDepth) || 3));
    const root = await this.listDirectory(relativePath);
    const entries = [];
    const visit = async (directory, depth) => {
      const listing = directory === root ? root : await this.listDirectory(directory.relativePath);
      for (const entry of listing.entries) {
        if (entries.length >= maxEntries) return;
        entries.push(entry);
        if (recursive && entry.type === 'folder' && depth < maxDepth) await visit(entry, depth + 1);
      }
    };
    await visit(root, 1);
    return { path: root.path, relativePath: root.relativePath, entries, truncated: entries.length >= maxEntries };
  }

  async getPathInfo(relativePath = '.') {
    const target = await this.sandbox.inspectPath(normalizedRelativePath(relativePath), { allowRoot: true });
    return { path: target.friendlyPath, ...publicEntry(target) };
  }

  async prepareRead(relativePath) {
    const target = await this.sandbox.inspectPath(normalizedRelativePath(relativePath), { kind: 'file' });
    if (!SAFE_READ_EXTENSIONS.has(path.extname(target.path).toLowerCase())) throw Object.assign(new Error('当前文件类型不在允许的文本读取范围内。'), { code: 'unsupported_file' });
    if (target.stat.size > MAX_READ_BYTES) throw Object.assign(new Error('文件超过当前安全读取上限。'), { code: 'file_too_large' });
    const content = await fs.promises.readFile(target.path);
    if (content.includes(0)) throw Object.assign(new Error('文件不是安全的纯文本。'), { code: 'binary_content_denied' });
    return {
      target,
      prepared: { root: target.root, targetPath: target.path, baselineSha256: sha256(content), baselineSize: content.length },
      approval: { title: '允许读取 Workspace 文件？', summary: `Mai 想读取“${target.friendlyPath}”。`, risk: '文件正文会作为本次 Agent 上下文发送给 DeepSeek API；确认仅对这一路径有效。' }
    };
  }

  async readPrepared(relativePath, prepared) {
    const target = await this.sandbox.inspectPath(normalizedRelativePath(relativePath), { kind: 'file' });
    const content = await fs.promises.readFile(target.path);
    if (!prepared || prepared.root !== target.root || prepared.targetPath !== target.path || prepared.baselineSha256 !== sha256(content) || prepared.baselineSize !== content.length) throw new SandboxViolationError('file_changed', '文件在审批后发生变化，本次读取已停止。');
    return { path: target.friendlyPath, content: content.toString('utf8'), truncated: false };
  }

  // Direct Explorer preview is local-only: it shares the exact same Sandbox,
  // allowlist and byte limit as Agent reads, but never enters the Agent loop
  // or leaves the device for a provider request.
  async readPreview(relativePath) {
    const target = await this.sandbox.inspectPath(normalizedRelativePath(relativePath), { kind: 'file' });
    const extension = path.extname(target.path).toLowerCase();
    if (!SAFE_READ_EXTENSIONS.has(extension)) throw Object.assign(new Error('当前文件类型不在允许的文本读取范围内。'), { code: 'unsupported_file' });
    if (target.stat.size > MAX_READ_BYTES) throw Object.assign(new Error('文件超过当前安全读取上限。'), { code: 'file_too_large' });
    const content = await fs.promises.readFile(target.path);
    if (content.includes(0)) throw Object.assign(new Error('文件不是安全的纯文本。'), { code: 'binary_content_denied' });
    return { path: target.friendlyPath, relativePath: target.relativePath, content: content.toString('utf8'), truncated: false };
  }

  async searchFileNames(query, options = {}) {
    const needle = String(query || '').trim().toLocaleLowerCase('zh-CN');
    if (!needle || needle.length > 160) throw Object.assign(new Error('文件名搜索词不能为空且不能过长。'), { code: 'invalid_arguments' });
    const listing = await this.listFiles(options.path || '.', { recursive: true, maxEntries: MAX_LIST_ENTRIES, maxDepth: 3 });
    const entries = listing.entries.filter((entry) => entry.name.toLocaleLowerCase('zh-CN').includes(needle)).slice(0, MAX_SEARCH_RESULTS);
    return { path: listing.path, query: String(query).trim(), entries, truncated: listing.truncated || entries.length >= MAX_SEARCH_RESULTS };
  }

  async prepareTextSearch(query, options = {}) {
    const needle = String(query || '').trim();
    if (!needle || needle.length > 160) throw Object.assign(new Error('文本搜索词不能为空且不能过长。'), { code: 'invalid_arguments' });
    const listing = await this.listFiles(options.path || '.', { recursive: true, maxEntries: MAX_LIST_ENTRIES, maxDepth: 3 });
    const files = listing.entries.filter((entry) => entry.type === 'file' && entry.readable).slice(0, 60);
    const preparedFiles = [];
    for (const entry of files) {
      const target = await this.sandbox.inspectPath(entry.relativePath, { kind: 'file' });
      const content = await fs.promises.readFile(target.path);
      if (content.includes(0)) continue;
      preparedFiles.push({ relativePath: entry.relativePath, root: target.root, targetPath: target.path, baselineSha256: sha256(content), baselineSize: content.length });
    }
    return {
      prepared: { query: needle, files: preparedFiles },
      approval: { title: '允许搜索 Workspace 文本？', summary: `Mai 想在 ${preparedFiles.length} 个安全文本文件中搜索“${needle}”。`, risk: '匹配片段会作为本次 Agent 上下文发送给 DeepSeek API；确认仅对这一次搜索有效。' }
    };
  }

  async searchPreparedText(query, prepared) {
    if (!prepared || prepared.query !== String(query || '').trim() || !Array.isArray(prepared.files)) throw new SandboxViolationError('sandbox_intent_changed', '搜索条件在审批后发生变化，本次搜索已停止。');
    const needle = prepared.query.toLocaleLowerCase('zh-CN');
    const matches = [];
    for (const item of prepared.files) {
      const target = await this.sandbox.inspectPath(item.relativePath, { kind: 'file' });
      const content = await fs.promises.readFile(target.path);
      if (item.root !== target.root || item.targetPath !== target.path || item.baselineSha256 !== sha256(content) || item.baselineSize !== content.length) throw new SandboxViolationError('file_changed', '文件在审批后发生变化，本次搜索已停止。');
      const lines = content.toString('utf8').split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].toLocaleLowerCase('zh-CN').includes(needle)) continue;
        matches.push({ path: target.friendlyPath, relativePath: item.relativePath, line: index + 1, snippet: lines[index].slice(0, 240) });
        if (matches.length >= MAX_SEARCH_RESULTS) return { query: prepared.query, matches, truncated: true };
      }
    }
    return { query: prepared.query, matches, truncated: false };
  }

  // UI and tool mutations both route through these wrappers. The sandbox owns
  // validation, preparation, revalidation and atomic writes.
  prepareCreate(relativePath, content) { return this.sandbox.inspectWrite(relativePath, 'create').then((target) => ({ target, content: this.sandbox.validateContent(content) })); }
  prepareReplace(relativePath, content) { return this.sandbox.inspectWrite(relativePath, 'replace').then((target) => ({ target, content: this.sandbox.validateContent(content) })); }
  writeTextFile(relativePath, content, options) { return this.sandbox.writeTextFile(relativePath, content, options); }
  prepareWordCreate(relativePath, content) { return this.sandbox.inspectWrite(relativePath, 'create', { allowedExtensions: WORD_WRITE_EXTENSIONS }).then((target) => ({ target, content: this.sandbox.validateBinaryContent(content) })); }
  async prepareWordAppend(relativePath, appendText, appendDocument) {
    if (typeof appendDocument !== 'function') throw new SandboxViolationError('invalid_word_document', 'Word 文档处理器不可用。');
    const target = await this.sandbox.inspectWrite(relativePath, 'replace', { allowedExtensions: WORD_WRITE_EXTENSIONS });
    const source = await fs.promises.readFile(target.path);
    const content = this.sandbox.validateBinaryContent(await appendDocument(source, appendText));
    return { target, content };
  }
  writeWordFile(relativePath, content, options = {}) { return this.sandbox.writeBinaryFile(relativePath, content, { ...options, allowedExtensions: WORD_WRITE_EXTENSIONS }); }
  prepareDirectoryCreate(relativePath) { return this.sandbox.prepareDirectoryCreate(relativePath); }
  createDirectory(prepared) { return this.sandbox.createDirectory(prepared); }
  prepareTransfer(source, destination, operation) { return this.sandbox.prepareTransfer(source, destination, operation); }
  transfer(prepared) { return this.sandbox.transfer(prepared); }
  prepareDelete(relativePath) { return this.sandbox.prepareDelete(relativePath); }
  deletePath(prepared) { return this.sandbox.deletePath(prepared); }
}

module.exports = { MAX_READ_BYTES, MAX_LIST_ENTRIES, SAFE_READ_EXTENSIONS, WORD_WRITE_EXTENSIONS, WorkspaceFileService };
