'use strict';

const { ActionRuntime, ActionRuntimeError } = require('./action-runtime');
const { createCapabilityPolicy } = require('./capability-policy');
const { createAgentTaskState, publicAgentTaskState } = require('./agent-task-state');
const { AgentEventStream } = require('./agent-event-stream');
const { AgentRunCoordinator } = require('./agent-run-coordinator');
const { AgentLoop } = require('./agent-loop');
const { createSafeAgentToolRegistry } = require('./agent-tool-registry');
const { createWorkspaceAgentToolRegistry } = require('./workspace-tools');
const { ToolOrchestrator } = require('./tool-orchestrator');

class MaiAgentRuntime extends ActionRuntime {
  constructor(options = {}) {
    super('mai-agent', { label: 'Mai Work', available: true, streaming: false, capabilities: ['safe-local', 'workspace-read', 'workspace-write'] });
    this.now = options.now || (() => Date.now());
    this.limits = options.limits || {};
    this.coordinator = options.coordinator || new AgentRunCoordinator();
    if (!options.modelAdapter || typeof options.modelAdapter.runRound !== 'function') {
      throw new TypeError('MaiAgentRuntime requires an explicit production model adapter.');
    }
    this.modelAdapter = options.modelAdapter;
    this.capabilityPolicy = options.capabilityPolicy || createCapabilityPolicy({ allowed: ['safe-local', 'workspace-read', 'workspace-write'] });
    this.toolOrchestrator = options.toolOrchestrator || null;
    this.toolRegistry = options.toolRegistry || null;
    this.createToolOrchestrator = options.createToolOrchestrator || ((workspacePath) => new ToolOrchestrator({
      registry: this.toolRegistry || (typeof options.getWorkspacePath === 'function'
        ? createWorkspaceAgentToolRegistry({ now: () => new Date(this.now()), getWorkspacePath: () => workspacePath })
        : createSafeAgentToolRegistry({ now: () => new Date(this.now()) })),
      capabilityPolicy: this.capabilityPolicy
    }));
    this.sessions = new Map();
  }

  async execute(request = {}, options = {}) {
    const text = String(request.text || '').trim();
    if (!text) throw new ActionRuntimeError('invalid_action_request', '请先告诉我需要处理什么。');
    const sessionId = String(options.sessionId || '');
    let task = createAgentTaskState({ sessionId, limits: this.limits }, { now: this.now() });
    this.sessions.set(sessionId, task.taskId);
    const events = new AgentEventStream({ sessionId, taskId: task.taskId, now: this.now, onEvent: options.onEvent });
    const signal = this.coordinator.start({ taskId: task.taskId, sessionId, parentSignal: options.signal, timeoutMs: task.limits.timeoutMs });
    const toolOrchestrator = this.toolOrchestrator || this.createToolOrchestrator(String(request.workspacePath || ''));
    const loop = new AgentLoop({ modelAdapter: this.modelAdapter, toolOrchestrator, now: this.now });
    try {
      const outcome = await loop.run({ task, goal: text, workspaceSelection: request.workspaceSelection, grantedCapabilities: request.capabilities, signal, eventStream: events, requestApproval: options.requestApproval });
      return { ...outcome.result, task: publicAgentTaskState(outcome.task), events: events.events };
    } catch (error) {
      if (error?.task) error.task = publicAgentTaskState(error.task);
      throw error;
    } finally {
      this.coordinator.complete(task.taskId);
      this.sessions.delete(sessionId);
    }
  }

  async cancel(sessionId) {
    return this.coordinator.cancelSession(String(sessionId || ''));
  }

  async cancelAll() { this.coordinator.cancelAll(); }
}

module.exports = { MaiAgentRuntime };
