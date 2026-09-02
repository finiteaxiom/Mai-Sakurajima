'use strict';

// v5 ToolResult fields are retained; callId and durationMs are the v7
// execution-correlation additions.
function safeText(value, limit) { return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, limit); }
function createToolResult(input = {}) {
  const ok = input.ok === true;
  const data = input.data !== undefined ? input.data : (ok ? input.output ?? null : null);
  const errorMessage = ok ? '' : safeText(input.error?.message || input.error || '工具执行失败。', 500);
  return Object.freeze({
    callId: safeText(input.callId, 160), tool: safeText(input.tool || input.toolName, 80), toolName: safeText(input.toolName || input.tool, 80), ok,
    summary: safeText(input.summary || (ok ? '工具已执行。' : errorMessage), 1000), data, output: ok ? data : null,
    durationMs: Math.max(0, Math.round(Number(input.durationMs) || 0)),
    ...(ok ? {} : { error: { code: safeText(input.code || input.error?.code || 'TOOL_EXECUTION_FAILED', 120), message: errorMessage } }),
    ...(typeof input.retryable === 'boolean' ? { retryable: input.retryable } : {}),
    ...(input.details && typeof input.details === 'object' ? { details: structuredClone(input.details) } : {})
  });
}
function observationFromToolResult(result) {
  return Object.freeze({
    callId: result.callId, tool: result.tool, toolName: result.toolName, ok: result.ok,
    summary: result.summary, data: result.data, error: result.error || null
  });
}
module.exports = { createToolResult, observationFromToolResult };
