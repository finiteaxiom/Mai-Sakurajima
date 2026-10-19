'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatRequestLifecycle } = require('../chat-request-lifecycle');

function createLifecycle() {
  let sequence = 0;
  return createChatRequestLifecycle({ createId: () => `request-${++sequence}` });
}

test('Chat lifecycle rejects same-session overlap while allowing independent sessions', () => {
  const lifecycle = createLifecycle();
  const first = lifecycle.begin({ sessionId: 'chat-a', senderId: 10 });
  assert.throws(
    () => lifecycle.begin({ sessionId: 'chat-a', senderId: 10 }),
    { code: 'CHAT_REQUEST_IN_PROGRESS' }
  );
  const second = lifecycle.begin({ sessionId: 'chat-b', senderId: 10 });
  assert.notEqual(first.requestId, second.requestId);
  assert.equal(lifecycle.activeCount(), 2);
  first.finish();
  second.finish();
  assert.equal(lifecycle.activeCount(), 0);
});

test('Chat cancellation is scoped to the owner and target session and invalidates commits', () => {
  const lifecycle = createLifecycle();
  const first = lifecycle.begin({ sessionId: 'chat-a', senderId: 10 });
  const other = lifecycle.begin({ sessionId: 'chat-b', senderId: 11 });
  assert.equal(lifecycle.cancelSessionForSender('chat-a', 11), false);
  assert.equal(lifecycle.cancelSessionForSender('chat-a', 10), true);
  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.throws(first.assertCurrent, { code: 'CHAT_REQUEST_CANCELLED' });
  assert.equal(other.isCurrent(), true);
  other.finish();
});

test('a user turn supersedes a pending proactive turn for the same session', () => {
  const lifecycle = createLifecycle();
  const proactive = lifecycle.begin({
    sessionId: 'chat-a', senderId: 'background', kind: 'proactive'
  });
  const user = lifecycle.begin({ sessionId: 'chat-a', senderId: 10 });
  assert.equal(proactive.signal.aborted, true);
  assert.equal(proactive.isCurrent(), false);
  assert.equal(user.isCurrent(), true);
  user.finish();
});

test('restore and shutdown invalidate every pending Main-owned request', () => {
  const lifecycle = createLifecycle();
  const first = lifecycle.begin({ sessionId: 'chat-a', senderId: 10 });
  const second = lifecycle.begin({ sessionId: 'chat-b', senderId: 11 });
  assert.equal(lifecycle.cancelAll('restore_started'), 2);
  assert.equal(first.signal.reason.reason, 'restore_started');
  assert.equal(second.signal.reason.reason, 'restore_started');
  assert.equal(lifecycle.activeCount(), 0);
});
