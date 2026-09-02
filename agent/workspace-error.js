'use strict';

const ERROR_MESSAGES = Object.freeze({
  ENOENT: '这个文件已经不存在，可能刚刚被移动或删除。', FILE_NOT_FOUND: '这个文件已经不存在，可能刚刚被移动或删除。',
  EACCES: '无法访问这个文件，因为当前系统账户没有权限。', EPERM: '无法完成这项操作，因为当前系统账户没有权限。',
  EEXIST: '目标位置已经存在同名文件或文件夹。', FILE_ALREADY_EXISTS: '目标位置已经存在同名文件或文件夹。',
  ENOTDIR: '目标路径不是文件夹。', EISDIR: '目标路径是文件夹，不能按文本文件读取。', NOT_A_DIRECTORY: '目标路径不是文件夹。', NOT_A_FILE: '目标路径不是普通文件。',
  FILE_TOO_LARGE: '文件超过当前安全读取上限，因此未加载完整内容。', UNSUPPORTED_FILE: '当前文件类型不在允许的文本读取范围内。', BINARY_CONTENT_DENIED: '这是二进制文件，Work 当前不会把它作为文本读取。',
  INVALID_WORD_DOCUMENT: '当前文件不是可安全处理的标准 .docx 文档。', WORD_DOCUMENT_TOO_LARGE: 'Word 文档超过当前安全写入上限，未修改文件。',
  OUTSIDE_WORKSPACE: '只能访问当前 Workspace 内的相对路径。', SANDBOX_DENIED: '该路径不符合当前 Workspace 的安全边界。', WORKSPACE_UNAVAILABLE: '当前 Workspace 不可用，请重新选择项目文件夹。',
  APPROVAL_DENIED: '此操作已取消，文件没有发生变化。', APPROVAL_TIMEOUT: '等待确认超时，文件没有发生变化。', DIRECTORY_NOT_EMPTY: '此目录不是空目录，当前 Work 不会递归删除它。',
  FILE_CHANGED_SINCE_APPROVAL: '文件在确认后发生变化，为保护你的内容，本次操作已停止。',
  WORKSPACE_GRANT_REQUIRED: '请先为当前聊天明确选择并授权一个 Workspace。',
  WORKSPACE_CONTEXT_UNAVAILABLE: '这次 Workspace 上下文已经失效，请重新请求读取。',
  WORKSPACE_OPERATION_DENIED: 'Chat 只允许列出目录或读取单个受支持的文本文件。',
  SENSITIVE_FILE_DENIED: '为保护隐私，Chat 不会读取 .env、密钥、凭据或令牌类文件。',
  UNSAFE_WORKSPACE_ROOT: '请选择一个具体的本地文件夹，不能使用整个磁盘、网络共享或设备路径。'
});

function normalizedCode(error) {
  const code = String(error?.code || error?.error?.code || '').trim();
  const aliases = { file_missing: 'FILE_NOT_FOUND', file_exists: 'FILE_ALREADY_EXISTS', file_changed: 'FILE_CHANGED_SINCE_APPROVAL', directory_not_empty: 'DIRECTORY_NOT_EMPTY', unsafe_file_type: 'UNSUPPORTED_FILE', unsupported_file: 'UNSUPPORTED_FILE', invalid_word_document: 'INVALID_WORD_DOCUMENT', word_document_too_large: 'WORD_DOCUMENT_TOO_LARGE', file_too_large: 'FILE_TOO_LARGE', binary_content_denied: 'BINARY_CONTENT_DENIED', sandbox_path_denied: 'OUTSIDE_WORKSPACE', unsafe_filename: 'OUTSIDE_WORKSPACE', workspace_unavailable: 'WORKSPACE_UNAVAILABLE', not_a_directory: 'NOT_A_DIRECTORY', not_a_file: 'NOT_A_FILE', workspace_grant_required: 'WORKSPACE_GRANT_REQUIRED', workspace_context_unavailable: 'WORKSPACE_CONTEXT_UNAVAILABLE', workspace_operation_denied: 'WORKSPACE_OPERATION_DENIED', sensitive_file_denied: 'SENSITIVE_FILE_DENIED', unsafe_workspace_root: 'UNSAFE_WORKSPACE_ROOT' };
  return aliases[code] || code.toUpperCase() || 'WORKSPACE_OPERATION_FAILED';
}

function workspaceErrorDetails(error) {
  const code = normalizedCode(error);
  return { code, developerMessage: String(error?.message || error?.error?.message || 'Workspace operation failed.'), userMessage: ERROR_MESSAGES[code] || '无法完成这项 Workspace 操作，请刷新后重试。', retryable: ['ENOENT', 'FILE_NOT_FOUND', 'EACCES', 'EPERM', 'FILE_CHANGED_SINCE_APPROVAL', 'WORKSPACE_UNAVAILABLE'].includes(code) };
}

module.exports = { normalizedCode, workspaceErrorDetails };
