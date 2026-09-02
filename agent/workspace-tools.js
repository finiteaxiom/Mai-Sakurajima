'use strict';

const path = require('path');
const { ToolSpec, ToolRegistry, createSafeAgentToolRegistry } = require('./agent-tool-registry');
const { WorkspaceSandbox, sha256, SandboxViolationError } = require('./workspace-sandbox');
const { MAX_READ_BYTES, MAX_LIST_ENTRIES, SAFE_READ_EXTENSIONS, WorkspaceFileService } = require('./workspace-file-service');
const { workspaceErrorDetails } = require('./workspace-error');
const { createWordDocument, appendWordDocument } = require('./word-document-service');
function parseArgs(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('工具参数必须是对象。'), { code: 'invalid_arguments' }); return value; }
function requireText(value, name, limit = 64 * 1024) { if (typeof value !== 'string' || value.length > limit) throw Object.assign(new Error(`${name} 必须是文本且不能超过大小限制。`), { code: 'invalid_arguments' }); return value; }
function stableSandboxError(error) {
  const details = workspaceErrorDetails(error);
  return Object.assign(new Error(details.userMessage), { code: details.code, retryable: details.retryable });
}
async function sandboxCall(callback) { try { return await callback(); } catch (error) { throw stableSandboxError(error); } }
function relativeRequest(value) { const text = String(value || '').trim().replace(/\\/g, '/').replace(/^(?:workspace|工作区|当前工作区)\/?/i, '').replace(/^\.\//, ''); if (!text || text.length > 500 || text.includes('\u0000') || path.isAbsolute(text) || /^(?:\/\/|\\\\)/.test(text)) throw new SandboxViolationError('sandbox_path_denied', '只能访问当前 Workspace 内的相对路径。'); return text; }
function wordDocumentRequest(value) { const requested = relativeRequest(value); if (path.extname(requested).toLowerCase() !== '.docx') throw Object.assign(new Error('Word 文档路径必须以 .docx 结尾。'), { code: 'INVALID_WORD_DOCUMENT' }); return requested; }
function preparedWordWrite(preparedWrite) {
  const { target, content } = preparedWrite;
  return { root: target.root, targetPath: target.path, mode: target.mode, baselineSha256: target.baselineSha256, contentSha256: sha256(content.data), contentBase64: content.data.toString('base64') };
}
function approvedWordContent(prepared) {
  if (!prepared || typeof prepared.contentBase64 !== 'string') throw new SandboxViolationError('missing_tool_intent', '缺少经过审批的 Word 文档写入内容。');
  const content = Buffer.from(prepared.contentBase64, 'base64');
  if (!content.length || sha256(content) !== prepared.contentSha256) throw new SandboxViolationError('sandbox_intent_changed', 'Word 文档写入内容在审批后发生变化，本次写入已停止。');
  return content;
}
function createWorkspaceAgentToolRegistry(options = {}) {
  const registry = new ToolRegistry(createSafeAgentToolRegistry(options).list());
  const sandbox = options.workspaceSandbox || new WorkspaceSandbox({ getWorkspacePath: options.getWorkspacePath });
  const workspace = options.workspaceFileService || new WorkspaceFileService({ workspaceSandbox: sandbox });
  registry.register(new ToolSpec({
    name: 'get_workspace_info', label: '工作区信息', description: '获取用户明确选择的 Workspace 的安全状态，不读取文件正文。', capabilities: ['workspace-read'], parameters: { type: 'object', properties: {}, additionalProperties: false }, validate: () => ({}),
    async execute() { try { const info = await workspace.getWorkspaceInfo(); return { summary: `当前 Workspace 是 ${info.name}。`, data: info }; } catch (error) { return { ok: false, error, summary: String(error.message || 'Workspace 当前不可用。') }; } }
  }));
  registry.register(new ToolSpec({
    name: 'list_files', label: '列出文件', description: '列出当前 Work Workspace 内文件和目录的安全摘要。path 为 Workspace 内相对目录路径；省略或使用 "." 可列出根目录。recursive 为 true 时最多递归三层。', capabilities: ['workspace-read'], parameters: { type: 'object', properties: { path: { type: 'string', description: 'Workspace 内的相对目录路径；根目录使用 "."。' }, recursive: { type: 'boolean', description: '是否递归列出子目录，最多三层。' } }, additionalProperties: false },
    validate(raw) { const args = parseArgs(raw); return { path: relativeRequest(args.path === undefined ? '.' : args.path), recursive: args.recursive === true }; },
    async authorize(args) { return { allowed: true, prepared: await workspace.prepareList(args.path) }; },
    async execute(args, context) { const data = await workspace.listPrepared(args.path, context.authorization?.prepared, { recursive: args.recursive, maxEntries: MAX_LIST_ENTRIES }); return { summary: `${data.path} 中找到 ${data.entries.length} 项${data.truncated ? '（已达到安全上限）' : ''}。`, data }; }
  }));
  registry.register(new ToolSpec({
    name: 'read_file', label: '读取文件', description: '在用户单次确认后读取 Workspace 内的安全纯文本文件。', capabilities: ['workspace-read'], parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
    validate(raw) { return { path: relativeRequest(parseArgs(raw).path) }; },
    async authorize(args) { const preparedRead = await workspace.prepareRead(args.path); return { allowed: true, prepared: preparedRead.prepared, approval: preparedRead.approval }; },
    async execute(args, context) { const data = await workspace.readPrepared(args.path, context.authorization?.prepared); return { summary: `已读取 ${data.path}。`, data }; }
  }));
  registry.register(new ToolSpec({
    name: 'get_file_info', label: '文件信息', description: '获取当前 Workspace 内文件或文件夹的基础信息，不读取文件正文。', capabilities: ['workspace-read'], parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
    validate(raw) { return { path: relativeRequest(parseArgs(raw).path) }; },
    async execute(args) { const data = await workspace.getPathInfo(args.path); return { summary: `${data.path} 是${data.type === 'folder' ? '文件夹' : '文件'}。`, data }; }
  }));
  registry.register(new ToolSpec({
    name: 'search_files', label: '搜索文件', description: '按文件或文件夹名称搜索当前 Workspace，最多扫描三层且不会读取文件正文。', capabilities: ['workspace-read'], parameters: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string' } }, required: ['query'], additionalProperties: false },
    validate(raw) { const args = parseArgs(raw); return { query: requireText(args.query, 'query', 160), path: args.path === undefined ? '.' : relativeRequest(args.path) }; },
    async execute(args) { const data = await workspace.searchFileNames(args.query, { path: args.path }); return { summary: `找到 ${data.entries.length} 个名称匹配项。`, data }; }
  }));
  registry.register(new ToolSpec({
    name: 'search_file_content', label: '搜索文本内容', description: '在 Workspace 内受支持的纯文本文件中搜索内容；执行前必须单次确认，因为匹配片段会发送给模型。', capabilities: ['workspace-read'], parameters: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string' } }, required: ['query'], additionalProperties: false },
    validate(raw) { const args = parseArgs(raw); return { query: requireText(args.query, 'query', 160), path: args.path === undefined ? '.' : relativeRequest(args.path) }; },
    async authorize(args) { const preparedSearch = await workspace.prepareTextSearch(args.query, { path: args.path }); return { allowed: true, prepared: preparedSearch.prepared, approval: preparedSearch.approval }; },
    async execute(args, context) { const data = await workspace.searchPreparedText(args.query, context.authorization?.prepared); return { summary: `找到 ${data.matches.length} 处文本匹配。`, data }; }
  }));
  registry.register(new ToolSpec({
    name: 'create_file', label: '创建文件', description: '在当前 Work Workspace 内创建新的纯文本文件。path 必须是相对路径；不会覆盖现有文件。', capabilities: ['workspace-write'],
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Work Workspace 内的相对文件路径' }, content: { type: 'string', description: '要写入的完整纯文本内容' } }, required: ['path', 'content'], additionalProperties: false },
    validate(raw) { const args = parseArgs(raw); return { path: relativeRequest(args.path), content: requireText(args.content, 'content', 128 * 1024) }; },
    async authorize(args) { return sandboxCall(async () => { const preparedWrite = await workspace.prepareCreate(args.path, args.content); const { target, content } = preparedWrite; return { allowed: true, prepared: { root: target.root, targetPath: target.path, mode: target.mode, baselineSha256: target.baselineSha256, contentSha256: sha256(Buffer.from(content.text, 'utf8')) }, approval: { title: '允许创建 Work 文件？', summary: `Mai 想创建：\n\n${target.friendlyPath}\n\n操作：新建文本文件\n文件大小：${content.bytes} B`, risk: '确认仅允许这一次创建；不会覆盖已有文件。' } }; }); },
    async execute(args, context) { return sandboxCall(async () => { const result = await workspace.writeTextFile(args.path, args.content, { mode: 'create', prepared: context.authorization?.prepared }); return { summary: `已创建 ${result.path}。`, data: result }; }); }
  }));
  registry.register(new ToolSpec({
    name: 'write_file', label: '修改文件', description: '在用户单次确认后，用完整文本覆盖当前 Work Workspace 内已有的纯文本文件。path 必须是相对路径。', capabilities: ['workspace-write'],
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Work Workspace 内的相对文件路径' }, content: { type: 'string', description: '新的完整纯文本内容' } }, required: ['path', 'content'], additionalProperties: false },
    validate(raw) { const args = parseArgs(raw); return { path: relativeRequest(args.path), content: requireText(args.content, 'content', 128 * 1024) }; },
    async authorize(args) { return sandboxCall(async () => { const preparedWrite = await workspace.prepareReplace(args.path, args.content); const { target, content } = preparedWrite; return { allowed: true, prepared: { root: target.root, targetPath: target.path, mode: target.mode, baselineSha256: target.baselineSha256, contentSha256: sha256(Buffer.from(content.text, 'utf8')) }, approval: { title: '允许修改 Work 文件？', summary: `Mai 想修改：\n\n${target.friendlyPath}\n\n操作：覆盖文件内容\n文件大小：${content.bytes} B`, risk: '确认仅允许这一次覆盖；审批后文件若被修改，Mai 会停止写入。' } }; }); },
    async execute(args, context) { return sandboxCall(async () => { const result = await workspace.writeTextFile(args.path, args.content, { mode: 'replace', prepared: context.authorization?.prepared }); return { summary: `已修改 ${result.path}。`, data: result }; }); }
  }));
  registry.register(new ToolSpec({
    name: 'create_word_document', label: '新建 Word 文档', description: '在当前 Work Workspace 内新建标准 .docx 文档。path 必须以 .docx 结尾；不会覆盖已有文件。', capabilities: ['workspace-write'],
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Work Workspace 内的 .docx 相对路径' }, content: { type: 'string', description: '要写入 Word 文档的正文文本' } }, required: ['path', 'content'], additionalProperties: false },
    validate(raw) { const args = parseArgs(raw); return { path: wordDocumentRequest(args.path), content: requireText(args.content, 'content', 48 * 1024) }; },
    async authorize(args) { return sandboxCall(async () => { const preparedWrite = await workspace.prepareWordCreate(args.path, await createWordDocument(args.content)); const prepared = preparedWordWrite(preparedWrite); return { allowed: true, prepared, approval: { title: '允许创建 Word 文档？', summary: `Mai 想创建：\n\n${preparedWrite.target.friendlyPath}\n\n操作：新建 Word 文档\n新增文本：${args.content.length} 个字符\n文件大小：${preparedWrite.content.bytes} B`, risk: '确认仅允许这一次创建；不会覆盖已有文件。' } }; }); },
    async execute(args, context) { return sandboxCall(async () => { const result = await workspace.writeWordFile(args.path, approvedWordContent(context.authorization?.prepared), { mode: 'create', prepared: context.authorization?.prepared }); return { summary: `已创建 Word 文档 ${result.path}。`, data: result }; }); }
  }));
  registry.register(new ToolSpec({
    name: 'append_word_document', label: '写入 Word 文档', description: '在用户单次确认后，向当前 Work Workspace 内已有的标准 .docx 文档追加新段落。不会读取或发送既有 Word 正文给模型。', capabilities: ['workspace-write'],
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Work Workspace 内已有 .docx 的相对路径' }, content: { type: 'string', description: '要追加到 Word 文档的新段落文本' } }, required: ['path', 'content'], additionalProperties: false },
    validate(raw) { const args = parseArgs(raw); return { path: wordDocumentRequest(args.path), content: requireText(args.content, 'content', 48 * 1024) }; },
    async authorize(args) { return sandboxCall(async () => { const preparedWrite = await workspace.prepareWordAppend(args.path, args.content, appendWordDocument); const prepared = preparedWordWrite(preparedWrite); return { allowed: true, prepared, approval: { title: '允许写入 Word 文档？', summary: `Mai 想追加到：\n\n${preparedWrite.target.friendlyPath}\n\n操作：在文档末尾新增段落\n新增文本：${args.content.length} 个字符\n文件大小：${preparedWrite.content.bytes} B`, risk: '确认仅允许这一次追加；审批后文档若被修改，Mai 会停止写入。' } }; }); },
    async execute(args, context) { return sandboxCall(async () => { const result = await workspace.writeWordFile(args.path, approvedWordContent(context.authorization?.prepared), { mode: 'replace', prepared: context.authorization?.prepared }); return { summary: `已写入 Word 文档 ${result.path}。`, data: result }; }); }
  }));
  registry.register(new ToolSpec({
    name: 'create_directory', label: '创建文件夹', description: '在当前 Work Workspace 内创建一个新文件夹。path 必须是相对路径，父文件夹必须已存在。', capabilities: ['workspace-write'],
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Work Workspace 内的相对文件夹路径' } }, required: ['path'], additionalProperties: false },
    validate(raw) { return { path: relativeRequest(parseArgs(raw).path) }; },
    async authorize(args) { return sandboxCall(async () => { const prepared = await workspace.prepareDirectoryCreate(args.path); return { allowed: true, prepared, approval: { title: '允许创建 Work 文件夹？', summary: `Mai 想创建：\n\nWorkspace/${prepared.relativePath}\n\n操作：新建文件夹`, risk: '确认仅允许这一次创建。' } }; }); },
    async execute(_args, context) { return sandboxCall(async () => { const result = await workspace.createDirectory(context.authorization?.prepared); return { summary: `已创建 ${result.path}。`, data: result }; }); }
  }));
  for (const operation of ['rename_path', 'move_path', 'copy_file']) {
    const verb = { rename_path: '重命名', move_path: '移动', copy_file: '复制' }[operation];
    registry.register(new ToolSpec({
      name: operation, label: verb, description: `${verb}当前 Work Workspace 内的路径；oldPath 和 newPath 必须都是相对路径，不能跨出 Workspace。`, capabilities: ['workspace-write'],
      parameters: { type: 'object', properties: { oldPath: { type: 'string', description: '现有的 Workspace 相对路径' }, newPath: { type: 'string', description: '新的 Workspace 相对路径' } }, required: ['oldPath', 'newPath'], additionalProperties: false },
      validate(raw) { const args = parseArgs(raw); return { oldPath: relativeRequest(args.oldPath), newPath: relativeRequest(args.newPath) }; },
      async authorize(args) { return sandboxCall(async () => { const prepared = await workspace.prepareTransfer(args.oldPath, args.newPath, operation); const impact = prepared.impact || {}; const scope = prepared.sourceKind === 'directory' ? `\n\n影响范围：目录内 ${impact.files || 0} 个文件、${impact.directories || 0} 个子文件夹${impact.truncated ? '（至少；已达到统计上限）' : ''}。` : ''; return { allowed: true, prepared, approval: { title: `允许${verb} Work 路径？`, summary: `Mai 想${verb}：\n\nWorkspace/${prepared.sourceRelativePath}\n\n到：\n\nWorkspace/${prepared.destinationRelativePath}${scope}`, risk: '确认仅允许这一次 Workspace 内操作；审批后路径改变会停止执行。' } }; }); },
      async execute(_args, context) { return sandboxCall(async () => { const result = await workspace.transfer(context.authorization?.prepared); return { summary: `已${verb}到 ${result.destinationPath}。`, data: result }; }); }
    }));
  }
  registry.register(new ToolSpec({
    name: 'delete_path', label: '删除路径', description: '删除当前 Work Workspace 内的一个普通文件或空文件夹；不支持递归删除非空目录。', capabilities: ['workspace-write'],
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'Work Workspace 内要删除的相对路径' } }, required: ['path'], additionalProperties: false },
    validate(raw) { return { path: relativeRequest(parseArgs(raw).path) }; },
    async authorize(args) { return sandboxCall(async () => { const prepared = await workspace.prepareDelete(args.path); return { allowed: true, prepared, approval: { title: '允许删除 Work 路径？', summary: `Mai 想删除：\n\nWorkspace/${prepared.relativePath}\n\n操作：删除${prepared.kind === 'directory' ? '空文件夹' : '文件'}`, risk: '删除后无法通过 Mai 自动恢复；非空文件夹不会递归删除。' } }; }); },
    async execute(_args, context) { return sandboxCall(async () => { const result = await workspace.deletePath(context.authorization?.prepared); return { summary: `已删除 ${result.path}。`, data: result }; }); }
  }));
  return registry;
}
module.exports = { MAX_READ_BYTES, MAX_LIST_ENTRIES, SAFE_READ_EXTENSIONS, createWorkspaceAgentToolRegistry };
