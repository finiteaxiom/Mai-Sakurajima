const assert = require('node:assert/strict');
const test = require('node:test');

const {
  advanceWorldState,
  currentScheduleEntry,
  defaultWorldState,
  worldContext
} = require('../world-engine');

test('Mai world follows real local time and exposes the next activity', () => {
  const date = new Date(2026, 7, 5, 10, 30, 0);
  const entry = currentScheduleEntry(date);
  assert.equal(entry.key, 'morning-work');
  assert.equal(entry.location, '片场');
  assert.equal(entry.nextKey, 'lunch');
});

test('world transitions retain the previous activity', () => {
  const morning = defaultWorldState(new Date(2026, 7, 5, 10, 0, 0).getTime());
  const lunch = advanceWorldState(morning, new Date(2026, 7, 5, 12, 15, 0).getTime());
  assert.equal(lunch.currentKey, 'lunch');
  assert.equal(lunch.previousKey, 'morning-work');
  assert.ok(lunch.lastTransitionAt);
});

test('world context describes grounded schedule without inventing events', () => {
  const now = new Date(2026, 7, 5, 21, 0, 0).getTime();
  const context = worldContext(defaultWorldState(now), now);
  assert.match(context, /持续推进的今日生活状态/);
  assert.match(context, /不要声称发生了日程之外的具体事件/);
});
