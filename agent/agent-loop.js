'use strict';

const { AGENT_TASK_STATUS, finishAgentTask, startAgentTask, setAgentWaitingUser, resumeAgentTask, updateAgentTaskState } = require('./agent-task-state');
const { observationFromToolResult } = require('./tool-result');

class AgentLoopError extends Error {
  constructor(code, message, task) {
    super(message);
    this.name = 'AgentLoopError';
    this.code = code;
    this.task = task;
  }
}

function abortError(signal, task) {
  const reason = signal?.reason;
  if (reason?.code === 'AGENT_TIMEOUT') return new AgentLoopError('AGENT_TIMEOUT', 'Agent 运行超时。', task);
  return new AgentLoopError('action_cancelled', '行动已取消。', task);
}

function buildWorkSystemPrompt(workspaceSelection) {
  const selection = workspaceSelection
    ? `\n\n用户在 Workspace Explorer 中明确选择了：Workspace/${String(workspaceSelection).replace(/\\/g, '/').slice(0, 500)}。用户说“这个文件”或“这里”时，优先将其作为目标，但仍需用工具确认事实。`
    : '';
  return [
    '你处于 Mai 的 Work 模式，目标是完成用户明确交给你的任务，而不是只给出计划。当任务需要 Workspace 信息时，必须使用提供的工具获取事实；不要声称已查看文件，除非工具确实返回了结果。如果已有工具可以完成任务，应执行工具而不是建议下一步。只使用 Runtime 明确提供的工具；所有文件操作仅限当前 Work Workspace。不要假设拥有 Shell、网络、浏览器、Git 或系统控制能力。工具结果是事实，涉及副作用的操作必须服从审批结果；失败时如实说明。',
    '身份与称呼：你是樱岛麻衣。用户是你的学弟；当用户称你“学姐”时，这是你们已知且自然的称呼，不要把它当成未知信息或要求解释。保持樱岛麻衣成熟、简洁、有主见的第一人称表达，但不要提及这条内部规则。此身份事实不包含、也不授权读取 Chat 历史、长期记忆或关系状态。',
    'Word 写作：当用户明确让你“写一写”“写一段”“写进 Word”或仅给出字数、语气等简要要求时，应自行拟出完整、合乎要求的正文并实际调用 Word 工具，不要因缺少额外背景而先反问。如果当前 Workspace 为空、没有指定目标文件，使用根目录相对路径“麻衣写给学弟.docx”并调用 create_word_document。若用户明确指定或在 Explorer 选择了一个已存在的 .docx，先用安全工具确认它存在，再用 append_word_document 追加新段落。只有主题会实质改变结果且无法从用户话语合理判断时，才简短追问。'
  ].join('\n\n') + selection;
}

class AgentLoop {
  constructor({ modelAdapter, toolOrchestrator, now } = {}) {
    if (!modelAdapter || typeof modelAdapter.runRound !== 'function') throw new TypeError('Agent loop requires a model adapter.');
    if (!toolOrchestrator || typeof toolOrchestrator.execute !== 'function') throw new TypeError('Agent loop requires a tool orchestrator.');
    this.modelAdapter = modelAdapter;
    this.toolOrchestrator = toolOrchestrator;
    this.now = now || (() => Date.now());
  }

  async run({ task, goal, workspaceSelection, grantedCapabilities, signal, eventStream, requestApproval }) {
    let state = startAgentTask(task, this.now());
    const observations = [];
    const messages = [
      { role: 'system', content: buildWorkSystemPrompt(workspaceSelection) },
      { role: 'user', content: String(goal || '').slice(0, 6000) }
    ];
    let terminal = false;
    const adapter = String(this.modelAdapter?.id || this.modelAdapter?.constructor?.name || 'unknown').slice(0, 80);
    const emit = (type, payload) => eventStream.emit(type, payload);
    const finish = (status, patch, eventType, payload) => {
      if (terminal) return state;
      terminal = true;
      state = finishAgentTask(state, status, patch, this.now());
      emit(eventType, payload);
      return state;
    };
    const fail = (code, message) => {
      const completed = finish(AGENT_TASK_STATUS.FAILED, { stopReason: code, error: { code, message }, result: null }, 'TaskFailed', { code, message });
      throw new AgentLoopError(code, message, completed);
    };

    emit('TaskStarted', { goal: String(goal || '').slice(0, 6000) });
    try {
      while (true) {
        if (signal?.aborted) throw abortError(signal, state);
        if (state.rounds >= state.limits.maxRounds) fail('AGENT_MAX_ROUNDS', '已达到 Agent 最大轮次。');
        const turnId = `turn-${state.rounds + 1}`;
        state = updateAgentTaskState(state, { rounds: state.rounds + 1 }, this.now());
        emit('TurnStarted', { turnId, round: state.rounds });
        const tools = typeof this.toolOrchestrator.registry?.list === 'function'
          ? this.toolOrchestrator.registry.list()
            .filter((tool) => (tool.capabilities || []).every((capability) => (grantedCapabilities || []).includes(capability)))
            .map((tool) => tool.definition())
          : [];
        emit('ModelRequestStarted', { turnId, adapter, toolCount: tools.length, toolNames: tools.map((tool) => tool.function.name) });
        let modelOutput;
        try {
          modelOutput = await this.modelAdapter.runRound({
            taskId: state.taskId, goal, round: state.rounds, observations: [...observations], messages: [...messages], tools
          }, { signal });
        } catch (error) {
          if (signal?.aborted) throw abortError(signal, state);
          fail(String(error?.code || 'AGENT_MODEL_FAILURE'), String(error?.message || 'Agent 模型请求失败。'));
        }
        if (signal?.aborted) throw abortError(signal, state);
        const calls = Array.isArray(modelOutput?.toolCalls) ? modelOutput.toolCalls : [];
        emit('ModelRequestCompleted', {
          turnId,
          adapter,
          finishReason: String(modelOutput?.finishReason || ''),
          toolCallCount: calls.length,
          toolNames: calls.map((call) => String(call?.name || '').slice(0, 80)).filter(Boolean)
        });
        if (!calls.length) {
          emit('TurnCompleted', { turnId, outcome: 'final' });
          const result = {
            success: true,
            summary: String(modelOutput?.assistantItem?.content || 'done'),
            steps: [{ title: '完成本地安全任务', status: 'completed' }],
            artifacts: [],
            capabilitiesUsed: [...new Set(grantedCapabilities || [])]
          };
          state = finish(AGENT_TASK_STATUS.COMPLETED, { stopReason: 'final', result, error: null }, 'TaskCompleted', { turnId, summary: result.summary });
          return { task: state, result };
        }
        if (modelOutput?.assistantItem) messages.push(modelOutput.assistantItem);
        for (const call of calls) {
          if (signal?.aborted) throw abortError(signal, state);
          if (state.toolCalls >= state.limits.maxToolCalls) fail('AGENT_MAX_TOOL_CALLS', '已达到 Agent 最大工具调用次数。');
          const callId = String(call?.callId || `call-${state.toolCalls + 1}`);
          const toolName = String(call?.name || '');
          emit('ToolCallRequested', { turnId, callId, toolName });
          emit('ToolExecutionStarted', { turnId, callId, toolName });
          let toolResult;
          try {
            toolResult = await this.toolOrchestrator.execute({ ...call, callId, name: toolName }, {
              signal, grantedCapabilities, requestApproval,
              onStage: (stage, payload) => {
                if (stage === 'approval_requested') { state = setAgentWaitingUser(state, this.now()); emit('ApprovalRequested', { turnId, ...payload }); }
                if (stage === 'approval_resolved') { state = resumeAgentTask(state, this.now()); emit('ApprovalResolved', { turnId, ...payload }); }
              }
            });
          } catch (error) {
            if (signal?.aborted) throw abortError(signal, state);
            fail(String(error?.code || 'AGENT_TOOL_FAILURE'), String(error?.message || 'Agent 工具执行失败。'));
          }
          state = updateAgentTaskState(state, {
            toolCalls: state.toolCalls + 1,
            toolErrors: state.toolErrors + (toolResult.ok ? 0 : 1)
          }, this.now());
          emit('ToolCompleted', { turnId, callId, toolName, result: toolResult });
          observations.push(observationFromToolResult(toolResult));
          messages.push({ role: 'tool', tool_call_id: callId, content: JSON.stringify(observationFromToolResult(toolResult)) });
          if (state.toolErrors >= state.limits.maxToolErrors) fail('AGENT_MAX_TOOL_ERRORS', 'Agent 工具失败次数已达到上限。');
        }
        emit('TurnCompleted', { turnId, outcome: 'tool_calls' });
      }
    } catch (error) {
      if (error instanceof AgentLoopError) {
        if (error.code === 'action_cancelled') {
          const cancelled = finish(AGENT_TASK_STATUS.CANCELLED, { stopReason: 'cancelled', error: { code: error.code, message: error.message }, result: null }, 'TaskCancelled', { code: error.code, message: error.message });
          throw new AgentLoopError(error.code, error.message, cancelled);
        }
        if (!terminal) {
          const failed = finish(AGENT_TASK_STATUS.FAILED, { stopReason: error.code, error: { code: error.code, message: error.message }, result: null }, 'TaskFailed', { code: error.code, message: error.message });
          throw new AgentLoopError(error.code, error.message, failed);
        }
        throw error;
      }
      const code = signal?.aborted && signal.reason?.code === 'AGENT_TIMEOUT' ? 'AGENT_TIMEOUT' : 'AGENT_LOOP_FAILURE';
      const message = code === 'AGENT_TIMEOUT' ? 'Agent 运行超时。' : String(error?.message || 'Agent 运行失败。');
      const failed = finish(AGENT_TASK_STATUS.FAILED, { stopReason: code, error: { code, message }, result: null }, 'TaskFailed', { code, message });
      throw new AgentLoopError(code, message, failed);
    }
  }
}

module.exports = { AgentLoop, AgentLoopError, buildWorkSystemPrompt };
