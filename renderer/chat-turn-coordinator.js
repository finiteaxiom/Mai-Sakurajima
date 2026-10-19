(function attachChatTurnCoordinator() {
'use strict';

const TURN_HANDLE = Symbol('chat-turn-handle');

function createChatTurnCoordinator(options = {}) {
  const api = options.api || {};
  const disposers = new Set();
  let sessionId = '';
  let turnSequence = 0;
  let viewGeneration = 0;
  let activeTurn = null;
  let cancelOperation = null;
  let activeVoiceStream = null;
  let disposed = false;

  function getState() {
    return {
      sessionId,
      activeTurnToken: activeTurn?.token || '',
      activeTurnSessionId: activeTurn?.sessionId || '',
      viewGeneration,
      turnSequence,
      busy: Boolean(activeTurn || cancelOperation),
      cancellationPending: Boolean(cancelOperation),
      disposed
    };
  }

  function publishState() {
    if (disposed) return;
    options.onStateChange?.(getState());
  }

  function isViewCurrent(identity = {}) {
    return !disposed
      && String(identity.sessionId || '') === sessionId
      && Number(identity.viewGeneration) === viewGeneration
      && Number(identity.turnSequence) === turnSequence;
  }

  function isTurnCurrent(turn) {
    return !disposed
      && activeTurn === turn
      && !cancelOperation
      && sessionId === turn.sessionId
      && viewGeneration === turn.viewGeneration
      && (typeof turn.voiceIsCurrent !== 'function' || turn.voiceIsCurrent());
  }

  function removePending(turn) {
    if (turn.pendingRemoved) return;
    turn.pendingRemoved = true;
    turn.removePending?.();
  }

  function clearStreamReference(turn, stream) {
    if (turn?.stream === stream) turn.stream = null;
    if (activeVoiceStream === stream) activeVoiceStream = null;
  }

  function cancelStream(turn) {
    const stream = turn?.stream;
    if (!stream) return;
    clearStreamReference(turn, stream);
    try { stream.cancel?.(); } catch { /* Renderer stream cancellation is best effort. */ }
  }

  function cleanupTurn(turn) {
    if (!turn || turn.cleaned) return false;
    turn.cleaned = true;
    removePending(turn);
    cancelStream(turn);
    turn.removeOptimistic?.();
    return true;
  }

  function settleCancellation(operation, outcome) {
    if (!operation || operation.settled) return;
    operation.settled = true;
    operation.resolve(outcome);
  }

  function ownsCancellation(operation) {
    return !disposed && cancelOperation === operation;
  }

  function cancellationBelongsToCurrentSession(operation) {
    return ownsCancellation(operation) && sessionId === operation.sessionId;
  }

  function abandonCancellation(operation) {
    if (cancelOperation === operation) {
      cancelOperation = null;
      settleCancellation(operation, { kind: 'stale' });
      publishState();
    } else {
      settleCancellation(operation, { kind: 'stale' });
    }
    return { cancelled: false, stale: true };
  }

  function restoreTurnAfterCancelError(operation, error, onError) {
    if (!cancellationBelongsToCurrentSession(operation)) return abandonCancellation(operation);
    cancelOperation = null;
    if (operation.turn.cleaned) {
      settleCancellation(operation, { kind: 'refreshed' });
    } else {
      // The local stream was stopped immediately. Keep the original message
      // visible and let a still-running Main request finish as text if needed.
      operation.turn.stream = null;
      activeTurn = operation.turn;
      settleCancellation(operation, { kind: 'resume' });
    }
    publishState();
    if (!disposed && sessionId === operation.sessionId && typeof onError === 'function') {
      onError(error);
    }
    return { cancelled: false, error };
  }

  function applyChatStateInternal(state, projectState = options.onApplyChatState, preservedCancellation = null) {
    if (disposed) return false;
    const nextSessionId = String(state?.activeSessionId || '');
    const staleTurn = activeTurn;
    const staleCancellation = cancelOperation && cancelOperation !== preservedCancellation
      ? cancelOperation
      : null;

    if (staleCancellation) {
      const stale = staleCancellation;
      cancelOperation = null;
      cleanupTurn(stale.turn);
      settleCancellation(stale, { kind: 'stale' });
      try {
        Promise.resolve(api.cancelChatRequest?.(stale.sessionId)).catch(() => {});
      } catch { /* The originating state change still invalidates its Renderer projection. */ }
    }
    if (staleTurn) {
      activeTurn = null;
      cleanupTurn(staleTurn);
      try {
        Promise.resolve(api.cancelChatRequest?.(staleTurn.sessionId)).catch(() => {});
      } catch { /* Main also cancels on its own session-switch path. */ }
    }

    sessionId = nextSessionId;
    viewGeneration += 1;
    projectState?.(state);
    publishState();
    return true;
  }

  function applyChatState(state, projectState = options.onApplyChatState) {
    return applyChatStateInternal(state, projectState);
  }

  function applySessionMetadata(state, expectedView) {
    if (!isViewCurrent(expectedView)) return false;
    if (String(state?.activeSessionId || '') !== sessionId) return false;
    options.onApplySessionMetadata?.(state);
    return true;
  }

  async function refreshSessionMetadata(loadState = api.getChatState) {
    if (disposed || typeof loadState !== 'function') return false;
    const expectedView = getState();
    const state = await loadState();
    return applySessionMetadata(state, expectedView);
  }

  function beginTurn(input = {}) {
    if (disposed || activeTurn || cancelOperation) return null;
    const requestedSessionId = String(input.sessionId || sessionId);
    if (!requestedSessionId || requestedSessionId !== sessionId) return null;
    const turn = {
      token: `renderer-chat-turn-${++turnSequence}`,
      sessionId: requestedSessionId,
      viewGeneration,
      requestId: String(input.requestId || ''),
      voiceIsCurrent: input.voiceIsCurrent,
      removeOptimistic: input.removeOptimistic,
      removePending: input.removePending,
      stream: null,
      pendingRemoved: false,
      cleaned: false
    };
    activeTurn = turn;
    if (input.stream) setVoiceStreamInternal(turn, input.stream);
    publishState();

    const handle = {
      token: turn.token,
      sessionId: turn.sessionId,
      requestId: turn.requestId,
      isCurrent: () => isTurnCurrent(turn),
      setVoiceStream: (stream) => setVoiceStreamInternal(turn, stream),
      removePending: () => removePending(turn)
    };
    Object.defineProperty(handle, TURN_HANDLE, { value: turn });
    return Object.freeze(handle);
  }

  function setVoiceStreamInternal(turn, stream) {
    if (!stream) {
      if (turn.stream) clearStreamReference(turn, turn.stream);
      return false;
    }
    if (!isTurnCurrent(turn)) {
      try { stream.cancel?.(); } catch { /* Stale stream cleanup is best effort. */ }
      return false;
    }
    if (turn.stream && turn.stream !== stream) cancelStream(turn);
    turn.stream = stream;
    activeVoiceStream = stream;
    return true;
  }

  async function awaitCancelDecision(turn, result, error) {
    const operation = cancelOperation?.turn === turn ? cancelOperation : null;
    if (!operation) return null;
    if (result !== undefined) operation.pendingResult = result;
    if (error !== undefined) operation.pendingError = error;
    return operation.promise;
  }

  function finishTurn(turn) {
    if (disposed || activeTurn !== turn) return false;
    activeTurn = null;
    if (turn.stream) clearStreamReference(turn, turn.stream);
    publishState();
    return true;
  }

  async function runTurn(handle, handlers = {}) {
    const turn = handle?.[TURN_HANDLE];
    if (!turn || typeof handlers.send !== 'function') {
      throw new TypeError('Chat turn execution requires a current turn handle and send().');
    }
    if (!isTurnCurrent(turn)) {
      if (!disposed && activeTurn === turn && !cancelOperation) {
        activeTurn = null;
        cleanupTurn(turn);
        publishState();
      }
      return null;
    }
    try {
      const result = await handlers.send(handle);
      if (result?.cancelled === true) {
        if (!disposed) cleanupTurn(turn);
        return null;
      }

      const cancelOutcome = await awaitCancelDecision(turn, result);
      if (cancelOutcome && cancelOutcome.kind !== 'resume') return result;
      if (disposed) return result;
      if (!isTurnCurrent(turn)) {
        if (!cancelOperation?.turn || cancelOperation.turn !== turn) cleanupTurn(turn);
        return result;
      }

      const stream = turn.stream;
      if (stream) {
        stream.finish?.(result?.content, result?.emotion);
        await stream.done;
        const afterStreamCancel = await awaitCancelDecision(turn, result);
        if (afterStreamCancel && afterStreamCancel.kind !== 'resume') return result;
        if (disposed) return result;
        if (!isTurnCurrent(turn)) {
          if (!cancelOperation?.turn || cancelOperation.turn !== turn) cleanupTurn(turn);
          return result;
        }
      }

      if (!isTurnCurrent(turn)) return result;
      removePending(turn);
      if (typeof handlers.onReply === 'function') await handlers.onReply(result, handle);
      return result;
    } catch (error) {
      const cancelOutcome = await awaitCancelDecision(turn, undefined, error);
      if (cancelOutcome && cancelOutcome.kind !== 'resume') return null;
      if (disposed) return null;
      cleanupTurn(turn);
      if (isTurnCurrent(turn) && typeof handlers.onError === 'function') handlers.onError(error, handle);
      return null;
    } finally {
      finishTurn(turn);
    }
  }

  async function cancelCurrentTurn(options = {}) {
    if (disposed || !activeTurn || cancelOperation) return { cancelled: false };
    const turn = activeTurn;
    activeTurn = null;
    const operation = {
      turn,
      sessionId: turn.sessionId,
      promise: null,
      resolve: null,
      settled: false,
      pendingResult: undefined,
      pendingError: undefined
    };
    operation.promise = new Promise((resolve) => { operation.resolve = resolve; });
    cancelOperation = operation;
    cancelStream(turn);
    publishState();

    let result;
    try {
      result = await api.cancelChatRequest(operation.sessionId);
    } catch (error) {
      return restoreTurnAfterCancelError(operation, error, options.onError);
    }
    if (!cancellationBelongsToCurrentSession(operation)) return abandonCancellation(operation);

    if (result?.cancelled === true) {
      cleanupTurn(turn);
      cancelOperation = null;
      settleCancellation(operation, { kind: 'cancelled' });
      publishState();
      return result;
    }

    let state;
    try {
      if (typeof api.getChatState !== 'function') throw new TypeError('Chat state refresh is unavailable.');
      state = await api.getChatState();
    } catch (error) {
      return restoreTurnAfterCancelError(operation, error, options.onError);
    }
    if (!cancellationBelongsToCurrentSession(operation)) return abandonCancellation(operation);

    cleanupTurn(turn);
    applyChatStateInternal(state, undefined, operation);
    if (ownsCancellation(operation)) {
      cancelOperation = null;
      settleCancellation(operation, { kind: 'refreshed' });
      publishState();
    }
    return result || { cancelled: false };
  }

  function handleVoiceStreamDelta(payload = {}) {
    const turn = activeTurn;
    const stream = activeVoiceStream;
    if (!turn || !stream || !isTurnCurrent(turn)) return false;
    if (!payload.requestId || String(payload.requestId) !== turn.requestId) return false;
    if (turn.stream !== stream) return false;
    stream.push?.(String(payload.delta || ''));
    return true;
  }

  function addDisposer(disposer) {
    if (typeof disposer !== 'function') return () => {};
    if (disposed) {
      try { disposer(); } catch { /* A late disposer still detaches its own resource. */ }
      return () => {};
    }
    disposers.add(disposer);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      disposers.delete(disposer);
    };
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    const turns = new Set([activeTurn, cancelOperation?.turn].filter(Boolean));
    const operation = cancelOperation;
    activeTurn = null;
    cancelOperation = null;
    activeVoiceStream = null;
    for (const turn of turns) cleanupTurn(turn);
    if (operation) settleCancellation(operation, { kind: 'stale' });
    for (const disposer of disposers) {
      try { disposer(); } catch { /* Teardown continues even if one listener fails to detach. */ }
    }
    disposers.clear();
    for (const turn of turns) {
      try { Promise.resolve(api.cancelChatRequest?.(turn.sessionId)).catch(() => {}); }
      catch { /* Main also cancels requests when the Chat window closes. */ }
    }
    return true;
  }

  return {
    addDisposer,
    applyChatState,
    beginTurn,
    cancelCurrentTurn,
    clearVoiceStream(stream) {
      if (!stream || activeVoiceStream !== stream) return false;
      clearStreamReference(activeTurn || cancelOperation?.turn, stream);
      return true;
    },
    dispose,
    getState,
    getVoiceStream: () => disposed ? null : activeVoiceStream,
    handleVoiceStreamDelta,
    applySessionMetadata,
    isViewCurrent,
    refreshSessionMetadata,
    runTurn
  };
}

const api = { createChatTurnCoordinator };
if (typeof module === 'object' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.MaiChatTurnCoordinator = api;
})();
