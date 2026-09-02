'use strict';

const { ACTION_SESSION_STATUS } = require('./action-runtime');

const TERMINAL_STATUSES = new Set([
  ACTION_SESSION_STATUS.COMPLETED,
  ACTION_SESSION_STATUS.FAILED,
  ACTION_SESSION_STATUS.CANCELLED
]);

function makeActionSessionId(now = Date.now(), random = Math.random) {
  return `action-${Number(now).toString(36)}-${random().toString(36).slice(2, 9)}`;
}

function createActionSession(input = {}, options = {}) {
  const timestamp = new Date(options.now || Date.now()).toISOString();
  return {
    id: String(input.id || makeActionSessionId(options.now, options.random)).slice(0, 120),
    status: ACTION_SESSION_STATUS.IDLE,
    createdAt: timestamp,
    updatedAt: timestamp,
    request: {
      text: String(input.text || '').trim().slice(0, 6000),
      capabilities: Array.isArray(input.capabilities) ? input.capabilities.map(String).slice(0, 32) : []
    },
    runtime: String(input.runtime || '').slice(0, 80),
    projectId: String(input.projectId || '').slice(0, 120),
    workSessionId: String(input.workSessionId || '').slice(0, 120),
    result: null,
    error: null,
    task: null
  };
}

function transitionActionSession(session, status, patch = {}, now = Date.now()) {
  if (!Object.values(ACTION_SESSION_STATUS).includes(status)) {
    throw new TypeError(`Unsupported action session status: ${String(status)}`);
  }
  if (TERMINAL_STATUSES.has(session.status) && status !== session.status) {
    throw new Error('Action session is already complete.');
  }
  return {
    ...session,
    ...patch,
    status,
    updatedAt: new Date(now).toISOString()
  };
}

function publicActionSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    request: { text: session.request.text },
    projectId: session.projectId || '',
    workSessionId: session.workSessionId || '',
    result: session.result,
    error: session.error,
    task: session.task || null
  };
}

module.exports = {
  TERMINAL_STATUSES,
  createActionSession,
  makeActionSessionId,
  publicActionSession,
  transitionActionSession
};
