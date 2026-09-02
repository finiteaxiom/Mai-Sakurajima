'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WorkspaceFileService } = require('./agent/workspace-file-service');
const { isFilesystemRoot, isNetworkOrDevicePath } = require('./agent/workspace-sandbox');

const CHAT_WORKSPACE_OPERATIONS = Object.freeze(['list', 'read']);
const CHAT_WORKSPACE_GRANT_TTL_MS = 30 * 60 * 1000;
const CHAT_WORKSPACE_CONTEXT_TTL_MS = 2 * 60 * 1000;
const MAX_CHAT_CONTEXT_CHARS = 12 * 1024;
const MAX_CHAT_EXCERPT_CHARS = 6 * 1024;

function capabilityError(code, message) {
  return Object.assign(new Error(message), { code });
}

function safeSessionId(value) {
  const sessionId = String(value || '').trim();
  if (!sessionId || sessionId.length > 160) {
    throw capabilityError('workspace_grant_required', '请先在当前聊天中选择一个 Workspace。');
  }
  return sessionId;
}

function publicGrant(grant) {
  if (!grant) return { granted: false, operations: CHAT_WORKSPACE_OPERATIONS };
  return {
    granted: true,
    workspaceId: grant.workspaceId,
    displayName: grant.displayName,
    operations: CHAT_WORKSPACE_OPERATIONS,
    issuedAt: new Date(grant.issuedAt).toISOString(),
    expiresAt: new Date(grant.expiresAt).toISOString()
  };
}

function isSensitiveWorkspaceFile(relativePath) {
  const name = path.posix.basename(String(relativePath || '').replace(/\\/g, '/')).toLocaleLowerCase('en-US');
  return name === '.env'
    || name.startsWith('.env.')
    || /\.(?:pem|key|p12|pfx)$/i.test(name)
    || /^(?:credentials|credential|secret|secrets|token)(?:[._-]|$)/i.test(name);
}

function boundedFileContext(file) {
  const content = String(file?.content || '');
  const contentChars = content.length;
  if (contentChars <= MAX_CHAT_CONTEXT_CHARS) {
    return {
      kind: 'workspace_file',
      relativePath: String(file?.relativePath || ''),
      content,
      contentChars,
      contentTruncated: false
    };
  }
  return {
    kind: 'workspace_file',
    relativePath: String(file?.relativePath || ''),
    content: content.slice(0, MAX_CHAT_EXCERPT_CHARS),
    contentChars,
    contentTruncated: true
  };
}

class WorkspaceCapabilityGateway {
  constructor(options = {}) {
    if (typeof options.selectDirectory !== 'function') {
      throw new TypeError('Workspace capability gateway requires selectDirectory().');
    }
    this.selectDirectory = options.selectDirectory;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.grantTtlMs = Number.isFinite(options.grantTtlMs) ? options.grantTtlMs : CHAT_WORKSPACE_GRANT_TTL_MS;
    this.contextTtlMs = Number.isFinite(options.contextTtlMs) ? options.contextTtlMs : CHAT_WORKSPACE_CONTEXT_TTL_MS;
    this.createWorkspaceFileService = typeof options.createWorkspaceFileService === 'function'
      ? options.createWorkspaceFileService
      : (rootPath) => new WorkspaceFileService({ getWorkspacePath: () => rootPath });
    this.grants = new Map();
    this.contexts = new Map();
  }

  clearExpired() {
    const now = this.now();
    for (const [sessionId, grant] of this.grants) {
      if (grant.expiresAt <= now) this.grants.delete(sessionId);
    }
    for (const [contextId, context] of this.contexts) {
      if (context.expiresAt <= now) this.contexts.delete(contextId);
    }
  }

  getGrant(sessionId) {
    this.clearExpired();
    return this.grants.get(safeSessionId(sessionId)) || null;
  }

  getStatus(sessionId) {
    return publicGrant(this.getGrant(sessionId));
  }

  async selectWorkspace(sessionId) {
    const normalizedSessionId = safeSessionId(sessionId);
    const selectedPath = await this.selectDirectory();
    if (!selectedPath) return { ...this.getStatus(normalizedSessionId), canceled: true };
    if (isNetworkOrDevicePath(selectedPath)) {
      throw capabilityError('unsafe_workspace_root', '不能选择网络共享或设备路径作为 Chat Workspace。');
    }
    const rootPath = await fs.promises.realpath(selectedPath);
    if (isFilesystemRoot(rootPath) || isNetworkOrDevicePath(rootPath)) {
      throw capabilityError('unsafe_workspace_root', '不能把整个磁盘设为 Chat Workspace，请选择具体文件夹。');
    }
    const stat = await fs.promises.stat(rootPath);
    if (!stat.isDirectory()) throw capabilityError('workspace_unavailable', 'Chat Workspace 必须是一个可访问的文件夹。');
    const issuedAt = this.now();
    const grant = {
      sessionId: normalizedSessionId,
      workspaceId: crypto.randomUUID(),
      rootPath,
      displayName: path.basename(rootPath) || 'Workspace',
      issuedAt,
      expiresAt: issuedAt + this.grantTtlMs
    };
    this.grants.set(normalizedSessionId, grant);
    for (const [contextId, context] of this.contexts) {
      if (context.sessionId === normalizedSessionId) this.contexts.delete(contextId);
    }
    return publicGrant(grant);
  }

  revoke(sessionId) {
    const normalizedSessionId = safeSessionId(sessionId);
    this.grants.delete(normalizedSessionId);
    for (const [contextId, context] of this.contexts) {
      if (context.sessionId === normalizedSessionId) this.contexts.delete(contextId);
    }
    return { granted: false, revoked: true, operations: CHAT_WORKSPACE_OPERATIONS };
  }

  requireGrant(sessionId) {
    const grant = this.getGrant(sessionId);
    if (!grant) throw capabilityError('workspace_grant_required', '请先授权当前聊天读取一个 Workspace。');
    return grant;
  }

  async execute(sessionId, input = {}) {
    const grant = this.requireGrant(sessionId);
    const operation = String(input.operation || '').trim();
    const relativePath = String(input.relativePath === undefined ? '.' : input.relativePath).trim() || '.';
    if (!CHAT_WORKSPACE_OPERATIONS.includes(operation)) {
      throw capabilityError('workspace_operation_denied', 'Chat 只允许列出目录或读取单个文本文件。');
    }
    const files = this.createWorkspaceFileService(grant.rootPath);
    let payload;
    if (operation === 'list') {
      const listing = await files.listDirectory(relativePath);
      payload = {
        kind: 'workspace_directory',
        relativePath: listing.relativePath,
        entries: listing.entries.map((entry) => ({
          name: entry.name,
          relativePath: entry.relativePath,
          type: entry.type,
          extension: entry.extension,
          size: entry.size,
          readable: entry.readable
        })),
        truncated: listing.truncated === true
      };
    } else {
      if (isSensitiveWorkspaceFile(relativePath)) {
        throw capabilityError('sensitive_file_denied', '为保护隐私，Chat 不会读取 .env、密钥、凭据或令牌类文件。');
      }
      payload = boundedFileContext(await files.readPreview(relativePath));
    }
    const contextId = crypto.randomUUID();
    this.contexts.set(contextId, {
      contextId,
      sessionId: grant.sessionId,
      workspaceId: grant.workspaceId,
      operation,
      payload,
      expiresAt: this.now() + this.contextTtlMs
    });
    return {
      contextId,
      operation,
      workspace: publicGrant(grant),
      result: operation === 'list'
        ? { relativePath: payload.relativePath, entries: payload.entries, truncated: payload.truncated }
        : { relativePath: payload.relativePath, contentChars: payload.contentChars, contentTruncated: payload.contentTruncated }
    };
  }

  consumeContext(sessionId, contextId) {
    this.clearExpired();
    const normalizedSessionId = safeSessionId(sessionId);
    const id = String(contextId || '').trim();
    const context = this.contexts.get(id);
    if (!context || context.sessionId !== normalizedSessionId) {
      throw capabilityError('workspace_context_unavailable', '这次 Workspace 上下文已失效，请重新请求读取。');
    }
    this.contexts.delete(id);
    return {
      workspaceId: context.workspaceId,
      operation: context.operation,
      payload: context.payload
    };
  }
}

module.exports = {
  CHAT_WORKSPACE_OPERATIONS,
  CHAT_WORKSPACE_GRANT_TTL_MS,
  MAX_CHAT_CONTEXT_CHARS,
  MAX_CHAT_EXCERPT_CHARS,
  WorkspaceCapabilityGateway,
  isSensitiveWorkspaceFile
};
