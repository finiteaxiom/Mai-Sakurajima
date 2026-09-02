'use strict';

function presentActionResult(result) {
  const summary = String(result?.summary || '这件事已经处理好了。').trim();
  return {
    content: summary,
    summary,
    steps: Array.isArray(result?.steps) ? result.steps : [],
    artifacts: Array.isArray(result?.artifacts) ? result.artifacts : []
  };
}

function presentActionError(error) {
  return {
    content: String(error?.message || '这次行动没有完成，但普通聊天不会受影响。'),
    code: String(error?.code || 'action_execution_failed')
  };
}

module.exports = {
  presentActionError,
  presentActionResult
};
