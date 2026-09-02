'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AGENT_TASK_STATUS, createAgentTaskState, startAgentTask, finishAgentTask, updateAgentTaskState } = require('../agent/agent-task-state');

test('AgentTaskState rejects illegal transitions and keeps terminal states immutable', () => {
  const created = createAgentTaskState({ taskId: 'task-1' });
  assert.throws(() => finishAgentTask(created, AGENT_TASK_STATUS.COMPLETED), { code: 'AGENT_ILLEGAL_STATE_TRANSITION' });
  const completed = finishAgentTask(startAgentTask(created), AGENT_TASK_STATUS.COMPLETED, { result: { success: true } });
  assert.throws(() => startAgentTask(completed), { code: 'AGENT_ILLEGAL_STATE_TRANSITION' });
  assert.throws(() => updateAgentTaskState(completed, { rounds: 9 }), { code: 'AGENT_ILLEGAL_STATE_TRANSITION' });
});
