'use strict';

// This is adapted from the v5.12 AgentTaskState contract. The v7 variant is
// immutable so AgentLoop remains the only lifecycle writer.
const AGENT_TASK_STATUS = Object.freeze({
  CREATED: 'created', RUNNING: 'running', WAITING_USER: 'waiting_user',
  COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled'
});
const TERMINAL_TASK_STATUSES = new Set([
  AGENT_TASK_STATUS.COMPLETED, AGENT_TASK_STATUS.FAILED, AGENT_TASK_STATUS.CANCELLED
]);
const DEFAULT_AGENT_LIMITS = Object.freeze({
  maxRounds: 15, maxToolCalls: 10, maxToolErrors: 3, timeoutMs: 10 * 60 * 1000
});

function boundedInteger(value, minimum, maximum, fallback) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}
function normalizeLimits(input = {}) {
  return Object.freeze({
    maxRounds: boundedInteger(input.maxRounds, 1, 30, DEFAULT_AGENT_LIMITS.maxRounds),
    maxToolCalls: boundedInteger(input.maxToolCalls, 1, 20, DEFAULT_AGENT_LIMITS.maxToolCalls),
    maxToolErrors: boundedInteger(input.maxToolErrors, 1, 8, DEFAULT_AGENT_LIMITS.maxToolErrors),
    // Production defaults remain v5's ten minutes. The smaller lower bound is
    // intentional: it keeps cancellation/timeout behavior deterministically testable.
    timeoutMs: boundedInteger(input.timeoutMs, 10, 30 * 60 * 1000, DEFAULT_AGENT_LIMITS.timeoutMs)
  });
}
function timestamp(now = Date.now()) { return new Date(now).toISOString(); }
function createAgentTaskId(now = Date.now(), random = Math.random) {
  return `agent-task-${Number(now).toString(36)}-${random().toString(36).slice(2, 9)}`;
}
function createAgentTaskState(input = {}, options = {}) {
  const at = timestamp(options.now || Date.now());
  return Object.freeze({
    taskId: String(input.taskId || createAgentTaskId(options.now, options.random)).slice(0, 120),
    sessionId: String(input.sessionId || '').slice(0, 120),
    goal: String(input.goal || '').replace(/\s+/g, ' ').trim().slice(0, 6000), status: AGENT_TASK_STATUS.CREATED,
    createdAt: at, startedAt: null, completedAt: null, updatedAt: at,
    rounds: 0, toolCalls: 0, toolErrors: 0, observations: Object.freeze([]), stepLog: Object.freeze([]),
    stopReason: null, limits: normalizeLimits(input.limits), result: null, error: null
  });
}
function isTerminalTaskState(task) { return TERMINAL_TASK_STATUSES.has(task?.status); }
function stateError(message) { const error = new Error(message); error.code = 'AGENT_ILLEGAL_STATE_TRANSITION'; return error; }
function updateAgentTaskState(task, patch = {}, now = Date.now()) {
  if (!task || typeof task !== 'object') throw new TypeError('Agent task state is required.');
  if (Object.hasOwn(patch, 'status')) throw stateError('Status must change through an AgentTaskState transition.');
  if (isTerminalTaskState(task)) throw stateError('A terminal Agent task is immutable.');
  return Object.freeze({ ...task, ...patch, updatedAt: timestamp(now) });
}
function startAgentTask(task, now = Date.now()) {
  if (task?.status !== AGENT_TASK_STATUS.CREATED) throw stateError('Only a created Agent task can start.');
  const at = timestamp(now);
  return Object.freeze({ ...task, status: AGENT_TASK_STATUS.RUNNING, startedAt: at, updatedAt: at });
}
function setAgentWaitingUser(task, now = Date.now()) {
  if (task?.status !== AGENT_TASK_STATUS.RUNNING) throw stateError('Only a running Agent task can wait for the user.');
  return Object.freeze({ ...task, status: AGENT_TASK_STATUS.WAITING_USER, updatedAt: timestamp(now) });
}
function resumeAgentTask(task, now = Date.now()) {
  if (task?.status !== AGENT_TASK_STATUS.WAITING_USER) throw stateError('Only a waiting Agent task can resume.');
  return Object.freeze({ ...task, status: AGENT_TASK_STATUS.RUNNING, updatedAt: timestamp(now) });
}
function finishAgentTask(task, status, patch = {}, now = Date.now()) {
  if (!TERMINAL_TASK_STATUSES.has(status)) throw stateError('Agent task must finish in a terminal status.');
  if (![AGENT_TASK_STATUS.RUNNING, AGENT_TASK_STATUS.WAITING_USER].includes(task?.status)) throw stateError('Only a running or waiting Agent task can finish.');
  const at = timestamp(now);
  return Object.freeze({ ...task, ...patch, status, completedAt: at, updatedAt: at });
}
function recordAgentObservation(task, observation = {}, now = Date.now()) {
  const item = Object.freeze({
    callId: String(observation.callId || '').slice(0, 160), tool: String(observation.tool || observation.toolName || '').slice(0, 80),
    ok: observation.ok === true, summary: String(observation.summary || '').replace(/\s+/g, ' ').trim().slice(0, 1000), at: timestamp(now)
  });
  return updateAgentTaskState(task, { observations: Object.freeze([...task.observations, item].slice(-20)), toolErrors: task.toolErrors + (item.ok ? 0 : 1) }, now);
}
function recordAgentTaskStep(task, step = {}, now = Date.now()) {
  const item = Object.freeze({
    id: String(step.id || `task-step-${task.taskId}-${task.stepLog.length + 1}`).slice(0, 120), kind: String(step.kind || 'reasoning').slice(0, 40),
    title: String(step.title || '').replace(/\s+/g, ' ').trim().slice(0, 160), detail: String(step.detail || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    tool: String(step.tool || '').slice(0, 80), at: timestamp(now)
  });
  return updateAgentTaskState(task, { stepLog: Object.freeze([...task.stepLog, item].slice(-30)) }, now);
}
function publicAgentTaskState(task) {
  if (!task) return null;
  return {
    taskId: task.taskId, sessionId: task.sessionId, goal: task.goal, status: task.status, createdAt: task.createdAt,
    startedAt: task.startedAt, completedAt: task.completedAt, updatedAt: task.updatedAt, rounds: task.rounds, toolCalls: task.toolCalls,
    toolErrors: task.toolErrors, observations: task.observations.map((item) => ({ ...item })), stepLog: task.stepLog.map((item) => ({ ...item })),
    stopReason: task.stopReason, limits: { ...task.limits }, result: task.result, error: task.error
  };
}

module.exports = {
  AGENT_TASK_STATUS, TERMINAL_TASK_STATUSES, DEFAULT_AGENT_LIMITS, normalizeLimits, createAgentTaskId, createAgentTaskState,
  isTerminalTaskState, updateAgentTaskState, startAgentTask, setAgentWaitingUser, resumeAgentTask, finishAgentTask,
  recordAgentObservation, recordAgentTaskStep, publicAgentTaskState
};
