'use strict';

const { workspaceErrorDetails } = require('../agent/workspace-error');

const OPERATION_NAMES = Object.freeze({ create_file: 'create', create_word_document: 'create', create_directory: 'create_directory', write_file: 'write', append_word_document: 'write', rename_path: 'rename', move_path: 'move', copy_file: 'copy', delete_path: 'delete' });
const OPERATION_TITLES = Object.freeze({ create: '已创建', create_directory: '已创建文件夹', write: '已修改', rename: '已重命名', move: '已移动', copy: '已复制', delete: '已删除' });
function safePath(value) { return typeof value === 'string' ? value.slice(0, 600) : ''; }

function operationResultFromToolResult(result = {}) {
  const operation = OPERATION_NAMES[String(result.tool || result.toolName || '')];
  if (!operation) return null;
  const data = result.data && typeof result.data === 'object' ? result.data : {};
  const ok = result.ok === true;
  const failure = ok ? null : workspaceErrorDetails(result.error || result);
  return { operation, title: ok ? OPERATION_TITLES[operation] : '操作未完成', ok, path: safePath(data.path || data.relativePath), sourcePath: safePath(data.sourcePath), destinationPath: safePath(data.destinationPath), kind: data.kind === 'directory' ? 'directory' : data.kind === 'file' ? 'file' : '', error: failure ? { code: failure.code, userMessage: failure.userMessage, retryable: failure.retryable } : null };
}

function normalizeOperationResults(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object' || !OPERATION_TITLES[item.operation]) return null;
    return { operation: item.operation, title: String(item.title || OPERATION_TITLES[item.operation]).slice(0, 120), ok: item.ok === true, path: safePath(item.path), sourcePath: safePath(item.sourcePath), destinationPath: safePath(item.destinationPath), kind: item.kind === 'directory' ? 'directory' : item.kind === 'file' ? 'file' : '', error: item.error && typeof item.error === 'object' ? { code: String(item.error.code || 'WORKSPACE_OPERATION_FAILED').slice(0, 120), userMessage: String(item.error.userMessage || '无法完成这项 Workspace 操作。').slice(0, 500), retryable: item.error.retryable === true } : null };
  }).filter(Boolean).slice(-50);
}

module.exports = { OPERATION_NAMES, operationResultFromToolResult, normalizeOperationResults };
