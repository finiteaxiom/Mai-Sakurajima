'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
const codes = new Set(['ENOENT','EACCES','EPERM','ENOSPC','EIO','JSON_PARSE_ERROR','BACKUP_CONFLICT','RESTORE_ROLLBACK_FAILED','CHAT_REQUEST_CANCELLED','request_timeout','authentication_failed','insufficient_balance','rate_limited','provider_unavailable','missing_api_key','request_cancelled','action_cancelled','ABORT_ERR']);
const errorCode = error => codes.has(error?.code) ? error.code : error?.name === 'AbortError' ? 'ABORT_ERR' : 'operation_failed';
class RuntimeDiagnostics {
  constructor({ directory, maxBytes = 2 * 1024 * 1024, archives = 4, retentionDays = 14, io = fs.promises } = {}) {
    this.directory = directory; this.maxBytes = maxBytes; this.archives = archives;
    this.retentionMs = retentionDays * 86400000; this.io = io;
    this.runId = randomUUID(); this.queue = Promise.resolve(); this.pending = 0;
    this.dropped = 0; this.writeFailures = 0; this.counts = { completed: 0, failed: 0, cancelled: 0 };
    this.prunedAt = 0;
  }
  file(index = 0) { return path.join(this.directory, index ? `runtime.${index}.jsonl` : 'runtime.jsonl'); }
  record(module, operation, outcome, extra = {}) {
    if (!this.directory) return;
    // All labels originate in application code, never accept request bodies or errors as fields.
    const record = { time: new Date().toISOString(), runId: this.runId,
      traceId: context.getStore()?.traceId || randomUUID(), module, operation, outcome };
    if (Number.isFinite(extra.durationMs)) record.durationMs = Math.max(0, Math.round(extra.durationMs));
    if (extra.error) record.code = errorCode(extra.error);
    if (Object.hasOwn(this.counts, outcome)) this.counts[outcome]++;
    if (this.pending >= 500) { this.dropped++; return; }
    this.pending++;
    this.queue = this.queue.then(async () => {
      await this.io.mkdir(this.directory, { recursive: true });
      if (Date.now() - this.prunedAt > 3600000) {
        for (let i = 0; i <= this.archives; i++) {
          try {
            const stat = await this.io.stat(this.file(i));
            if (Date.now() - stat.mtimeMs > this.retentionMs) { await this.io.unlink(this.file(i)); continue; }
            if (stat.size > this.maxBytes) { await this.io.unlink(this.file(i)); continue; }
            const contents = await this.io.readFile(this.file(i), 'utf8');
            const kept = contents.split('\n').filter(line => {
              try { const time = Date.parse(JSON.parse(line).time); return Number.isFinite(time) && Date.now() - time <= this.retentionMs; } catch { return false; }
            });
            const trimmed = kept.length ? kept.join('\n') + '\n' : '';
            if (trimmed !== contents) await this.io.writeFile(this.file(i), trimmed, 'utf8');
          }
          catch (e) { if (e.code !== 'ENOENT') throw e; }
        }
        this.prunedAt = Date.now();
      }
      const line = JSON.stringify(record) + '\n';
      let size = 0;
      try { size = (await this.io.stat(this.file())).size; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (size + Buffer.byteLength(line) > this.maxBytes) {
        try { await this.io.unlink(this.file(this.archives)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        for (let i = this.archives - 1; i >= 0; i--) {
          try { await this.io.rename(this.file(i), this.file(i + 1)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        }
      }
      await this.io.appendFile(this.file(), line, 'utf8');
    }).catch(() => { this.writeFailures++; }).finally(() => { this.pending--; });
  }
  span(module, operation, callback) {
    const parent = context.getStore();
    return context.run(parent || { traceId: randomUUID() }, () => {
      const start = Date.now(); this.record(module, operation, 'started');
      const done = value => {
        const outcome = value?.session?.status === 'failed' || value?.ok === false || value?.success === false || value?.status === 'failed' ? 'failed' : (value?.status === 'cancelled' || value?.session?.status === 'cancelled') ? 'cancelled' : 'completed';
        this.record(module, operation, outcome, { durationMs: Date.now() - start }); return value;
      };
      const fail = error => {
        this.record(module, operation, ['ABORT_ERR','CHAT_REQUEST_CANCELLED','request_cancelled','action_cancelled'].includes(errorCode(error)) ? 'cancelled' : 'failed', { error, durationMs: Date.now() - start }); throw error;
      };
      try { const value = callback(); return value && typeof value.then === 'function' ? value.then(done, fail) : done(value); }
      catch (error) { return fail(error); }
    });
  }
  async snapshot() {
    await this.queue;
    const records = [];
    let readFailures = 0;
    for (let i = this.archives; i >= 0; i--) {
      try {
        if ((await this.io.stat(this.file(i))).size > this.maxBytes) { readFailures++; continue; }
        for (const line of (await this.io.readFile(this.file(i), 'utf8')).split('\n')) {
          try {
            const r = JSON.parse(line);
            if (Date.now() - Date.parse(r.time) > this.retentionMs || !Number.isFinite(Date.parse(r.time))) continue;
            // Read only our fixed schema; never export unknown fields from disk.
            if (!/^[a-z][a-z0-9:-]{0,90}$/.test(r.operation) || !['app','ipc','model','persistence','renderer'].includes(r.module)
              || !['started','completed','failed','cancelled'].includes(r.outcome)
              || !/^[0-9a-f-]{36}$/.test(r.traceId) || !/^[0-9a-f-]{36}$/.test(r.runId)) continue;
            const safe = { time: new Date(r.time).toISOString(), runId: r.runId, traceId: r.traceId, module: r.module, operation: r.operation, outcome: r.outcome };
            if (Number.isFinite(r.durationMs)) safe.durationMs = r.durationMs;
            if (codes.has(r.code) || r.code === 'operation_failed') safe.code = r.code;
            records.push(safe);
            if (records.length > 1000) records.shift();
          } catch { /* Partial tail from a crash is ignored. */ }
        }
      } catch (e) { if (e.code !== 'ENOENT') readFailures++; }
    }
    return { runId: this.runId, directory: this.directory, retentionDays: this.retentionMs / 86400000,
      maxFiles: this.archives + 1, maxFileBytes: this.maxBytes, writeFailures: this.writeFailures, readFailures,
      dropped: this.dropped, counts: { ...this.counts }, records };
  }
}
let active = null;
const runtimeDiagnostics = {
  initialize(options) { active = new RuntimeDiagnostics(options); return active; },
  span(module, operation, callback) { return active ? active.span(module, operation, callback) : callback(); },
  record(module, operation, outcome, extra) { active?.record(module, operation, outcome, extra); },
  snapshot() { return active.snapshot(); },
  flush() { return active?.queue || Promise.resolve(); }
};
function instrumentIpc(ipcMain) {
  return new Proxy(ipcMain, { get(target, key) {
    if (key === 'handle') return (channel, handler) => target.handle(channel, (event, ...args) =>
      channel.startsWith('diagnostics:') ? handler(event, ...args) : runtimeDiagnostics.span('ipc', channel, () => handler(event, ...args)));
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
}
module.exports = { RuntimeDiagnostics, runtimeDiagnostics, instrumentIpc };
