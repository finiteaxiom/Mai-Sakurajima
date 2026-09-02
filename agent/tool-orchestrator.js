'use strict';

const crypto = require('crypto');
const { createToolResult } = require('./tool-result');

function abortError(signal) { return signal?.reason instanceof Error ? signal.reason : Object.assign(new Error('Agent 任务已取消。'), { code: 'action_cancelled' }); }
async function executeWithControls(executor, context = {}) {
  if (context.signal?.aborted) throw abortError(context.signal);
  const controller = new AbortController();
  const timeoutMs = Math.max(10, Math.min(5 * 60 * 1000, Number(context.timeoutMs) || 30_000));
  let timer;
  const parentAbort = () => controller.abort(abortError(context.signal));
  if (context.signal) context.signal.addEventListener('abort', parentAbort, { once: true });
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => { const error = Object.assign(new Error('工具执行超时。'), { code: 'AGENT_TOOL_TIMEOUT', retryable: true }); controller.abort(error); reject(error); }, timeoutMs);
      controller.signal.addEventListener('abort', () => reject(abortError(controller.signal)), { once: true });
      Promise.resolve().then(() => executor({ ...context, signal: controller.signal })).then(resolve, reject);
    });
  } finally { clearTimeout(timer); context.signal?.removeEventListener('abort', parentAbort); }
}
function normalizedAuthorization(value) {
  const input = value && typeof value === 'object' ? value : {};
  return { allowed: input.allowed !== false, code: String(input.code || ''), message: String(input.message || ''), retryable: input.retryable !== false, prepared: input.prepared && typeof input.prepared === 'object' ? structuredClone(input.prepared) : null, approval: input.approval && typeof input.approval === 'object' ? structuredClone(input.approval) : null };
}

class ToolOrchestrator {
  constructor({ registry, capabilityPolicy, defaultTimeoutMs = 30_000 } = {}) {
    if (!registry || typeof registry.get !== 'function') throw new TypeError('Tool orchestrator requires a registry.');
    this.registry = registry; this.capabilityPolicy = capabilityPolicy; this.defaultTimeoutMs = defaultTimeoutMs;
  }
  async execute(call = {}, options = {}) {
    const startedAt = Date.now(); const callId = String(call.callId || '').slice(0, 160); const toolName = String(call.name || '').slice(0, 80);
    const finish = (input) => createToolResult({ callId, tool: toolName, durationMs: Date.now() - startedAt, ...input });
    if (options.signal?.aborted) throw abortError(options.signal);
    const spec = this.registry.get(toolName);
    if (!spec) return finish({ error: { code: 'TOOL_NOT_FOUND', message: '未找到允许的本地工具。' }, retryable: false });
    const granted = new Set(Array.isArray(options.grantedCapabilities) ? options.grantedCapabilities : []);
    const policy = this.capabilityPolicy?.evaluate(spec.capabilities) || { denied: [] };
    if (spec.capabilities.some((capability) => !granted.has(capability)) || policy.denied.length) return finish({ error: { code: 'CAPABILITY_NOT_GRANTED', message: '该工具所需能力未获授权。' }, retryable: false });
    let args;
    try { args = spec.validate(call.arguments); } catch (error) { return finish({ error, code: error?.code || 'TOOL_INVALID_ARGUMENTS', retryable: true }); }
    let authorization;
    try { authorization = normalizedAuthorization(await spec.authorize(args, options)); } catch (error) { return finish({ error, code: error?.code || 'SANDBOX_DENIED', retryable: error?.retryable !== false }); }
    if (!authorization.allowed) return finish({ error: { code: authorization.code || 'SANDBOX_DENIED', message: authorization.message || '安全边界拒绝了这项操作。' }, retryable: authorization.retryable });
    const approval = authorization.approval || spec.approval(args);
    if (approval) {
      const intentFingerprint = crypto.createHash('sha256').update(JSON.stringify({ toolName, args, prepared: authorization.prepared })).digest('hex');
      options.onStage?.('approval_requested', { callId, toolName, approval, intentFingerprint });
      if (typeof options.requestApproval !== 'function') return finish({ error: { code: 'APPROVAL_REQUIRED', message: '这项操作需要用户单次确认。' }, retryable: false });
      let decision;
      try { decision = await options.requestApproval({ callId, toolName, args, approval, intentFingerprint, prepared: authorization.prepared, signal: options.signal }); } catch (error) { if (options.signal?.aborted) throw abortError(options.signal); options.onStage?.('approval_resolved', { callId, toolName, approved: false, reason: 'unavailable' }); return finish({ error: { code: 'APPROVAL_UNAVAILABLE', message: String(error?.message || '审批不可用。') }, retryable: false }); }
      if (options.signal?.aborted) throw abortError(options.signal);
      if (decision !== true && decision?.approved !== true) {
        options.onStage?.('approval_resolved', { callId, toolName, approved: false, reason: decision?.reason || 'denied' });
        return finish({ error: { code: decision?.reason === 'timeout' ? 'APPROVAL_TIMEOUT' : 'APPROVAL_DENIED', message: decision?.reason === 'timeout' ? '授权等待已超时，操作没有执行。' : '用户拒绝授权，操作没有执行。' }, retryable: decision?.reason === 'timeout' });
      }
      options.onStage?.('approval_resolved', { callId, toolName, approved: true });
    }
    try {
      const value = await executeWithControls((context) => spec.executeTool(args, { ...context, authorization, callId }), { ...options, timeoutMs: spec.timeoutMs || this.defaultTimeoutMs });
      if (value && typeof value === 'object' && typeof value.ok === 'boolean') return finish(value);
      return finish({ ok: true, summary: value?.summary || '工具已执行。', data: value?.data !== undefined ? value.data : value });
    } catch (error) { if (options.signal?.aborted) throw abortError(options.signal); return finish({ error, code: error?.code || 'TOOL_EXECUTION_FAILED', retryable: error?.retryable }); }
  }
}
module.exports = { ToolOrchestrator, executeWithControls, normalizedAuthorization };
