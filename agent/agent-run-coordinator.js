'use strict';

class AgentRunCoordinator {
  constructor() { this.runs = new Map(); }

  start({ taskId, sessionId, parentSignal, timeoutMs }) {
    const controller = new AbortController();
    const cancel = (reason) => { if (!controller.signal.aborted) controller.abort(reason); };
    const parentAbort = () => cancel(parentSignal.reason || Object.assign(new Error('行动已取消。'), { code: 'action_cancelled' }));
    parentSignal?.addEventListener('abort', parentAbort, { once: true });
    const timer = setTimeout(() => cancel(Object.assign(new Error('Agent 运行超时。'), { code: 'AGENT_TIMEOUT' })), timeoutMs);
    this.runs.set(String(taskId), { taskId, sessionId, controller, timer, parentSignal, parentAbort });
    return controller.signal;
  }

  cancelTask(taskId, reason = Object.assign(new Error('行动已取消。'), { code: 'action_cancelled' })) {
    const run = this.runs.get(String(taskId));
    if (!run) return false;
    if (!run.controller.signal.aborted) run.controller.abort(reason);
    return true;
  }

  cancelSession(sessionId, reason) {
    return [...this.runs.values()].some((run) => run.sessionId === sessionId && this.cancelTask(run.taskId, reason));
  }

  cancelAll(reason) { for (const run of [...this.runs.values()]) this.cancelTask(run.taskId, reason); }

  complete(taskId) {
    const run = this.runs.get(String(taskId));
    if (!run) return;
    clearTimeout(run.timer);
    run.parentSignal?.removeEventListener('abort', run.parentAbort);
    this.runs.delete(String(taskId));
  }
}

module.exports = { AgentRunCoordinator };
