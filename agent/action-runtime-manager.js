'use strict';

const { ACTION_SESSION_STATUS, ActionRuntimeError } = require('./action-runtime');
const { createActionSession, publicActionSession, transitionActionSession } = require('./action-session');
const { createCapabilityPolicy } = require('./capability-policy');
const { presentActionError, presentActionResult } = require('./action-presentation');

const MAX_TERMINAL_ACTION_SESSIONS = 500;
const TERMINAL_ACTION_SESSION_STATUSES = new Set([
  ACTION_SESSION_STATUS.COMPLETED,
  ACTION_SESSION_STATUS.FAILED,
  ACTION_SESSION_STATUS.CANCELLED
]);

function normalizeActionConfiguration(value = {}) {
  return {
    enabled: value?.enabled === true,
    runtime: String(value?.runtime || 'mai-agent').trim().toLowerCase() || 'mai-agent'
  };
}

class ActionRuntimeManager {
  constructor(options = {}) {
    if (typeof options.getConfiguration !== 'function') {
      throw new TypeError('Action runtime manager requires getConfiguration().');
    }
    this.getConfiguration = options.getConfiguration;
    this.runtimes = new Map();
    this.sessions = new Map();
    this.controllers = new Map();
    this.terminalSessionOrder = [];
    this.terminalSessionOrderHead = 0;
    this.terminalSessionIds = new Set();
    this.terminalSessionCount = 0;
    this.createSession = options.createSession || createActionSession;
    this.now = options.now || (() => Date.now());
    this.capabilityPolicy = options.capabilityPolicy || createCapabilityPolicy({ allowed: ['safe-local', 'workspace-read', 'workspace-write'] });
  }

  register(runtime) {
    const id = String(runtime?.id || '').trim().toLowerCase();
    if (!id || typeof runtime?.execute !== 'function') {
      throw new TypeError('Action runtime requires an id and execute().');
    }
    this.runtimes.set(id, runtime);
    return this;
  }

  configuration() {
    return normalizeActionConfiguration(this.getConfiguration());
  }

  status() {
    const configuration = this.configuration();
    const runtime = this.runtimes.get(configuration.runtime);
    return {
      enabled: configuration.enabled,
      available: Boolean(configuration.enabled && runtime && runtime.metadata?.available !== false),
      reason: !configuration.enabled
        ? 'Work 尚未启用。'
        : !runtime
          ? '当前行动能力暂不可用。'
          : runtime.metadata?.available === false
            ? '当前行动能力暂不可用。'
            : '',
      activeSessionId: [...this.sessions.values()].find((session) => session.status === ACTION_SESSION_STATUS.RUNNING)?.id || null
    };
  }

  getSession(id) {
    return publicActionSession(this.sessions.get(String(id || '')) || null);
  }

  listSessions() {
    return [...this.sessions.values()]
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .map((session) => publicActionSession(session));
  }

  pruneTerminalSessions() {
    let excess = this.terminalSessionCount - MAX_TERMINAL_ACTION_SESSIONS;
    if (excess <= 0) return 0;

    let removed = 0;
    const protectedEntries = [];
    const queuedAtStart = this.terminalSessionOrder.length - this.terminalSessionOrderHead;
    for (let scanned = 0; scanned < queuedAtStart && excess > 0; scanned += 1) {
      const sessionId = this.terminalSessionOrder[this.terminalSessionOrderHead++];
      if (!this.terminalSessionIds.has(sessionId)) continue;
      const session = this.sessions.get(sessionId);
      if (this.controllers.has(sessionId) || !TERMINAL_ACTION_SESSION_STATUSES.has(session?.status)) {
        protectedEntries.push(sessionId);
        continue;
      }
      this.sessions.delete(sessionId);
      this.terminalSessionIds.delete(sessionId);
      this.terminalSessionCount -= 1;
      excess -= 1;
      removed += 1;
    }
    if (protectedEntries.length) this.terminalSessionOrder.push(...protectedEntries);
    if (this.terminalSessionOrderHead > 256 && this.terminalSessionOrderHead * 2 >= this.terminalSessionOrder.length) {
      this.terminalSessionOrder = this.terminalSessionOrder.slice(this.terminalSessionOrderHead);
      this.terminalSessionOrderHead = 0;
    }
    return removed;
  }

  recordTerminalSession(sessionId) {
    const id = String(sessionId || '');
    if (!id || this.terminalSessionIds.has(id)) return;
    this.terminalSessionIds.add(id);
    this.terminalSessionOrder.push(id);
    this.terminalSessionCount += 1;
  }

  async execute(input = {}) {
    const state = this.status();
    const configuration = this.configuration();
    if (!configuration.enabled) {
      throw new ActionRuntimeError('action_runtime_disabled', 'Work 尚未启用。');
    }
    const runtime = this.runtimes.get(configuration.runtime);
    if (!runtime || runtime.metadata?.available === false) {
      throw new ActionRuntimeError('action_runtime_unavailable', '当前行动能力暂不可用。');
    }
    if (state.activeSessionId) {
      throw new ActionRuntimeError('action_already_running', '请等待当前行动完成，或先取消它。');
    }
    const request = {
      text: String(input.text || '').trim(),
      capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
      runtime: runtime.id,
      projectId: String(input.projectId || '').slice(0, 120),
      workSessionId: String(input.workSessionId || '').slice(0, 120),
      workspacePath: typeof input.workspacePath === 'string' ? input.workspacePath.trim().slice(0, 2000) : '',
      workspaceSelection: typeof input.workspaceSelection === 'string' ? input.workspaceSelection.trim().slice(0, 500) : ''
    };
    const decision = this.capabilityPolicy.evaluate(request.capabilities);
    if (decision.denied.length) {
      throw new ActionRuntimeError('capability_not_granted', '这项行动请求了尚未授权的能力。');
    }
    let session = this.createSession(request, { now: this.now() });
    session = transitionActionSession(session, ACTION_SESSION_STATUS.RUNNING, {}, this.now());
    this.sessions.set(session.id, session);
    if (typeof input.onStarted === 'function') {
      try {
        input.onStarted(publicActionSession(session));
      } catch {
        // Renderer notification failures must not alter the action lifecycle.
      }
    }
    const controller = new AbortController();
    this.controllers.set(session.id, controller);
    try {
      const result = await runtime.execute({ ...request, capabilities: decision.granted }, {
        signal: controller.signal,
        sessionId: session.id,
        requestApproval: input.requestApproval,
        onEvent: (agentEvent) => {
          try { input.onEvent?.(agentEvent); } catch { /* Renderer event failures do not alter lifecycle. */ }
        }
      });
      session = transitionActionSession(session, ACTION_SESSION_STATUS.COMPLETED, { result, error: null, task: result?.task || null }, this.now());
      this.sessions.set(session.id, session);
      this.recordTerminalSession(session.id);
      return { session: publicActionSession(session), presentation: presentActionResult(result) };
    } catch (error) {
      const cancelled = controller.signal.aborted || error?.code === 'action_cancelled';
      const normalizedError = {
        code: String(error?.code || (cancelled ? 'action_cancelled' : 'action_execution_failed')),
        message: String(error?.message || '行动执行失败。')
      };
      session = transitionActionSession(
        session,
        cancelled ? ACTION_SESSION_STATUS.CANCELLED : ACTION_SESSION_STATUS.FAILED,
        { error: normalizedError, result: null, task: error?.task || null },
        this.now()
      );
      this.sessions.set(session.id, session);
      this.recordTerminalSession(session.id);
      return { session: publicActionSession(session), presentation: presentActionError(normalizedError) };
    } finally {
      this.controllers.delete(session.id);
      this.pruneTerminalSessions();
    }
  }

  async cancel(id) {
    const sessionId = String(id || '');
    const controller = this.controllers.get(sessionId);
    const session = this.sessions.get(sessionId);
    if (!controller || !session || session.status !== ACTION_SESSION_STATUS.RUNNING) return this.getSession(sessionId);
    const runtime = this.runtimes.get(this.configuration().runtime);
    try { await runtime?.cancel?.(sessionId); } catch { /* The manager's abort signal remains authoritative. */ }
    controller.abort(new ActionRuntimeError('action_cancelled', '行动已取消。'));
    return publicActionSession(session);
  }

  async cancelAll() {
    const running = [...this.sessions.values()].filter((session) => session.status === ACTION_SESSION_STATUS.RUNNING);
    await Promise.all(running.map((session) => this.cancel(session.id)));
  }
}

module.exports = {
  ActionRuntimeManager,
  normalizeActionConfiguration
};
