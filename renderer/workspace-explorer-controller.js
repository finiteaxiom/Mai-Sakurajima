(function attachWorkspaceExplorerController() {
'use strict';

function copy(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function sameIdentity(left, right) {
  return Boolean(left && right)
    && left.mode === right.mode
    && left.generation === right.generation
    && left.projectId === right.projectId
    && left.workSessionId === right.workSessionId
    && left.workspacePath === right.workspacePath;
}

function createWorkspaceExplorerController(options = {}) {
  const api = options.api || {};
  let disposed = false;
  let identity = null;
  let listings = new Map();
  let expanded = new Set(['']);
  let selection = null;
  let preview = null;
  let mayBeStale = false;
  let loadError = '';
  let refreshId = 0;
  let previewId = 0;
  let directoryId = 0;
  let directoryRequests = new Map();
  let loadingPaths = new Set();
  let refreshing = false;

  function currentExternalIdentity() {
    return typeof options.getViewIdentity === 'function' ? options.getViewIdentity() : null;
  }

  function isCurrent(viewIdentity) {
    return !disposed && sameIdentity(viewIdentity, identity) && sameIdentity(viewIdentity, currentExternalIdentity());
  }

  function getState() {
    return {
      identity: identity ? { ...identity } : null,
      projectId: identity?.projectId || '',
      workspacePath: identity?.workspacePath || '',
      listings: new Map([...listings.entries()].map(([key, value]) => [key, copy(value)])),
      expanded: new Set(expanded),
      selection: selection ? copy(selection) : null,
      preview: preview ? copy(preview) : null,
      loading: refreshing || loadingPaths.size > 0,
      loadingPaths: new Set(loadingPaths),
      mayBeStale,
      loadError,
      disposed
    };
  }

  function notify(expectedIdentity = identity) {
    if (isCurrent(expectedIdentity)) options.onStateChange?.(getState());
  }

  function invalidateRequests() {
    refreshId += 1;
    previewId += 1;
    directoryId += 1;
    directoryRequests.clear();
    loadingPaths.clear();
    refreshing = false;
  }

  function resetState() {
    listings = new Map();
    expanded = new Set(['']);
    selection = null;
    preview = null;
    mayBeStale = false;
    loadError = '';
  }

  function activateView(nextIdentity) {
    if (disposed || !nextIdentity) return false;
    if (sameIdentity(identity, nextIdentity)) return false;
    const previous = identity;
    const retainWorkspaceCache = previous?.mode === 'agent' && nextIdentity.mode === 'agent'
      && previous.projectId === nextIdentity.projectId
      && previous.workspacePath === nextIdentity.workspacePath;
    identity = { ...nextIdentity };
    invalidateRequests();
    preview = null;
    if (!retainWorkspaceCache) resetState();
    notify(identity);
    return true;
  }

  function findEntry(relativePath) {
    for (const listing of listings.values()) {
      const entry = (listing?.entries || []).find((item) => item.relativePath === relativePath);
      if (entry) return entry;
    }
    return null;
  }

  function currentRequest(request) {
    return Boolean(request)
      && isCurrent(request.identity)
      && directoryRequests.get(request.path) === request
      && (request.forRefreshId === null || request.forRefreshId === refreshId);
  }

  function requestDirectory(relativePath, viewIdentity, forRefreshId = null, force = false) {
    const requestPath = String(relativePath || '');
    if (!isCurrent(viewIdentity) || viewIdentity.mode !== 'agent' || !viewIdentity.projectId || !viewIdentity.workspacePath) {
      return Promise.resolve(null);
    }
    const existing = directoryRequests.get(requestPath);
    if (!force && existing && existing.forRefreshId === forRefreshId && sameIdentity(existing.identity, viewIdentity)) {
      return existing.promise;
    }
    const request = {
      id: ++directoryId,
      path: requestPath,
      identity: { ...viewIdentity },
      forRefreshId,
      promise: null
    };
    directoryRequests.set(requestPath, request);
    loadingPaths.add(requestPath);
    loadError = '';
    notify(viewIdentity);
    request.promise = (async () => {
      try {
        const listing = await api.listActionWorkspaceDirectory({ projectId: request.identity.projectId, path: requestPath || '.' });
        if (!currentRequest(request)) return null;
        listings.set(requestPath, copy(listing));
        if (forRefreshId === null) mayBeStale = false;
        return copy(listing);
      } catch (error) {
        if (currentRequest(request)) {
          loadError = String(error?.message || '暂时无法读取此 Workspace。');
          options.onNotice?.(error);
        }
        return null;
      } finally {
        if (currentRequest(request)) {
          directoryRequests.delete(requestPath);
          loadingPaths.delete(requestPath);
          notify(viewIdentity);
        }
      }
    })();
    return request.promise;
  }

  async function loadDirectory(relativePath = '', expectedIdentity = identity) {
    return requestDirectory(relativePath, expectedIdentity, null, false);
  }

  async function restoreExpandedDirectories(root, viewIdentity, thisRefreshId) {
    for (const entry of root?.entries || []) {
      if (!isCurrent(viewIdentity) || thisRefreshId !== refreshId) return false;
      if (entry.type !== 'folder' || !expanded.has(entry.relativePath)) continue;
      const child = await requestDirectory(entry.relativePath, viewIdentity, thisRefreshId, true);
      if (!isCurrent(viewIdentity) || thisRefreshId !== refreshId) return false;
      if (child && !(await restoreExpandedDirectories(child, viewIdentity, thisRefreshId))) return false;
      if (!isCurrent(viewIdentity) || thisRefreshId !== refreshId) return false;
    }
    return true;
  }

  async function refresh(expectedIdentity = identity) {
    if (!isCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent' || !expectedIdentity.workspacePath) return false;
    const refreshRequestId = ++refreshId;
    const viewIdentity = { ...expectedIdentity };
    const selectedPath = selection?.relativePath || '';
    invalidateRequests();
    refreshId = refreshRequestId;
    const expandedSnapshot = new Set(expanded);
    listings = new Map();
    expanded = expandedSnapshot;
    selection = null;
    preview = null;
    previewId += 1;
    mayBeStale = false;
    loadError = '';
    refreshing = true;
    notify(viewIdentity);
    try {
      const root = await requestDirectory('', viewIdentity, refreshRequestId, true);
      if (!isCurrent(viewIdentity) || refreshRequestId !== refreshId) return false;
      if (root) {
        const restored = await restoreExpandedDirectories(root, viewIdentity, refreshRequestId);
        if (!isCurrent(viewIdentity) || refreshRequestId !== refreshId || !restored) return false;
        selection = selectedPath ? findEntry(selectedPath) : null;
      }
      notify(viewIdentity);
      return Boolean(root);
    } finally {
      if (isCurrent(viewIdentity) && refreshRequestId === refreshId) {
        refreshing = false;
        notify(viewIdentity);
      }
    }
  }

  async function loadPreview(entry, expectedIdentity = identity) {
    if (entry?.type !== 'file' || !isCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent') return false;
    const currentEntry = findEntry(entry.relativePath);
    if (!currentEntry || currentEntry.type !== 'file') return false;
    const request = {
      id: ++previewId,
      identity: { ...expectedIdentity },
      projectId: expectedIdentity.projectId,
      workspacePath: expectedIdentity.workspacePath,
      workSessionId: expectedIdentity.workSessionId,
      relativePath: entry.relativePath,
      entry: copy(currentEntry)
    };
    selection = copy(currentEntry);
    preview = { entry: copy(currentEntry), status: 'loading', content: '', message: '' };
    notify(expectedIdentity);
    try {
      const result = await api.previewActionWorkspaceFile({ projectId: request.projectId, path: request.relativePath });
      if (disposed || request.id !== previewId || !isCurrent(request.identity)
        || identity.projectId !== request.projectId || identity.workspacePath !== request.workspacePath
        || identity.workSessionId !== request.workSessionId || selection?.relativePath !== request.relativePath) return false;
      preview = result?.ok
        ? { entry: request.entry, status: 'ready', content: String(result.data?.content || ''), message: '' }
        : { entry: request.entry, status: 'unavailable', content: '', message: String(result?.error?.userMessage || '此文件暂不支持文本预览。') };
      return true;
    } catch (error) {
      if (disposed || request.id !== previewId || !isCurrent(request.identity)
        || identity.projectId !== request.projectId || identity.workspacePath !== request.workspacePath
        || identity.workSessionId !== request.workSessionId || selection?.relativePath !== request.relativePath) return false;
      preview = { entry: request.entry, status: 'unavailable', content: '', message: String(error?.message || '此文件暂不支持文本预览。') };
      options.onNotice?.(error);
      return false;
    } finally {
      if (!disposed && request.id === previewId && isCurrent(request.identity)
        && selection?.relativePath === request.relativePath) notify(request.identity);
    }
  }

  async function selectEntry(entry, expectedIdentity = identity) {
    if (!entry || !isCurrent(expectedIdentity)) return false;
    const currentEntry = findEntry(entry.relativePath);
    if (!currentEntry || currentEntry.type !== entry.type) return false;
    selection = copy(currentEntry);
    if (currentEntry.type === 'folder') {
      previewId += 1;
      preview = null;
      if (expanded.has(currentEntry.relativePath)) {
        expanded.delete(currentEntry.relativePath);
      } else {
        expanded.add(currentEntry.relativePath);
        notify(expectedIdentity);
        if (!listings.has(currentEntry.relativePath)) await loadDirectory(currentEntry.relativePath, expectedIdentity);
      }
      if (!isCurrent(expectedIdentity)) return false;
      notify(expectedIdentity);
      return true;
    }
    if (currentEntry.type === 'file') return loadPreview(currentEntry, expectedIdentity);
    previewId += 1;
    preview = null;
    notify(expectedIdentity);
    return true;
  }

  function setStale(expectedIdentity = identity) {
    if (!isCurrent(expectedIdentity) || expectedIdentity.mode !== 'agent' || !expectedIdentity.workspacePath
      || refreshing || loadingPaths.size > 0 || listings.size === 0) return false;
    mayBeStale = true;
    notify(expectedIdentity);
    return true;
  }

  function closePreview(expectedIdentity = identity) {
    if (!isCurrent(expectedIdentity)) return false;
    previewId += 1;
    preview = null;
    notify(expectedIdentity);
    return true;
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    invalidateRequests();
    identity = null;
    resetState();
    return true;
  }

  return {
    activateView,
    closePreview,
    dispose,
    findEntry,
    getIdentity: () => identity ? { ...identity } : null,
    getState,
    isCurrent,
    loadDirectory,
    loadPreview,
    refresh,
    selectEntry,
    setStale
  };
}

const api = { createWorkspaceExplorerController };
if (typeof module === 'object' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.MaiWorkspaceExplorerController = api;
})();
