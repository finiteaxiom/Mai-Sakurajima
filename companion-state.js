const {
  defaultMindState,
  markUserReturned,
  normalizeMindState,
  updateMindAfterTurn
} = require('./intelligence');

function normalizeRelationshipState(value, maxFollowUps = 999) {
  return {
    waitingSince: Math.max(0, Number(value?.waitingSince) || 0),
    waitingSessionId: String(value?.waitingSessionId || ''),
    lastUserMessageAt: Math.max(0, Number(value?.lastUserMessageAt) || 0),
    lastCompanionMessageAt: Math.max(0, Number(value?.lastCompanionMessageAt) || 0),
    followUpCount: Math.max(0, Math.min(maxFollowUps, Math.round(Number(value?.followUpCount) || 0)))
  };
}

function writeMind(memoryState, nextMind) {
  memoryState.mind = normalizeMindState(nextMind);
  return memoryState.mind;
}

function applyMindTurn(memoryState, input) {
  return writeMind(memoryState, updateMindAfterTurn(memoryState.mind, input));
}

function markMindUserReturned(memoryState, now) {
  return writeMind(memoryState, markUserReturned(memoryState.mind, now));
}

function resetMind(memoryState) {
  memoryState.mind = defaultMindState();
  return memoryState.mind;
}

function recordProactiveGreeting(memoryState, timestamp, dateKey) {
  const currentMind = normalizeMindState(memoryState.mind);
  return writeMind(memoryState, {
    ...currentMind,
    lastProactiveAt: timestamp,
    dailyProactiveDate: dateKey,
    dailyProactiveCount: currentMind.dailyProactiveDate === dateKey
      ? currentMind.dailyProactiveCount + 1
      : 1
  });
}

function recordProactiveReason(memoryState, reason) {
  const currentMind = normalizeMindState(memoryState.mind);
  return writeMind(memoryState, {
    ...currentMind,
    recentProactiveReasons: [
      ...currentMind.recentProactiveReasons,
      String(reason || 'unknown')
    ].slice(-8)
  });
}

function writeRelationship(memoryState, nextRelationship, maxFollowUps) {
  memoryState.relationship = normalizeRelationshipState(nextRelationship, maxFollowUps);
  return memoryState.relationship;
}

function normalizeRelationship(memoryState, maxFollowUps) {
  return writeRelationship(memoryState, memoryState.relationship, maxFollowUps);
}

function updateRelationship(memoryState, patch, maxFollowUps) {
  return writeRelationship(memoryState, {
    ...normalizeRelationshipState(memoryState.relationship, maxFollowUps),
    ...patch
  }, maxFollowUps);
}

function clearRelationshipWaiting(memoryState, maxFollowUps) {
  return updateRelationship(memoryState, {
    waitingSince: 0,
    waitingSessionId: '',
    followUpCount: 0
  }, maxFollowUps);
}

function beginRelationshipWaiting(memoryState, patch, maxFollowUps) {
  return updateRelationship(memoryState, {
    waitingSince: 0,
    waitingSessionId: '',
    followUpCount: 0,
    ...patch
  }, maxFollowUps);
}

function recordCompanionMessage(memoryState, timestamp, maxFollowUps) {
  return updateRelationship(memoryState, { lastCompanionMessageAt: timestamp }, maxFollowUps);
}

function incrementRelationshipFollowUp(memoryState, maxFollowUps) {
  const relationship = normalizeRelationshipState(memoryState.relationship, maxFollowUps);
  return updateRelationship(memoryState, {
    followUpCount: relationship.followUpCount + 1
  }, maxFollowUps);
}

function recordRelationshipUserReply(memoryState, timestamp, maxFollowUps) {
  return updateRelationship(memoryState, {
    waitingSince: 0,
    waitingSessionId: '',
    lastUserMessageAt: timestamp,
    followUpCount: 0
  }, maxFollowUps);
}

module.exports = {
  applyMindTurn,
  beginRelationshipWaiting,
  clearRelationshipWaiting,
  incrementRelationshipFollowUp,
  markMindUserReturned,
  normalizeRelationship,
  normalizeRelationshipState,
  recordCompanionMessage,
  recordProactiveGreeting,
  recordProactiveReason,
  recordRelationshipUserReply,
  resetMind
};
