'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_EVENTS = 80;

function serializeError(error) {
  if (!error) return '';
  return String(error.stack || error.message || error);
}

function rendererSmokeMode(environment = process.env) {
  if (environment.MAI_UI_SMOKE === '1') return 'ui';
  if (environment.MAI_CLOSE_CHAT_SMOKE === '1') return 'chat_close';
  return '';
}

function rendererSmokeOutput(environment = process.env) {
  if (environment.MAI_UI_SMOKE === '1') return String(environment.MAI_UI_SMOKE_OUTPUT || '');
  if (environment.MAI_CLOSE_CHAT_SMOKE === '1') return String(environment.MAI_CLOSE_CHAT_SMOKE_OUTPUT || '');
  return '';
}

class SmokeDiagnostics {
  constructor(options = {}) {
    this.mode = String(options.mode || 'unknown');
    this.outputPath = String(options.outputPath || '');
    this.startedAt = new Date().toISOString();
    this.phase = 'bootstrap';
    this.events = [];
    this.finished = false;
    this.record('smoke_started', { pid: process.pid });
  }

  snapshot() {
    return {
      mode: this.mode,
      phase: this.phase,
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString(),
      events: this.events.slice()
    };
  }

  write(payload = {}) {
    if (!this.outputPath) return;
    fs.mkdirSync(path.dirname(this.outputPath), { recursive: true });
    fs.writeFileSync(this.outputPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  checkpoint(phase, detail = {}) {
    if (this.finished) return;
    this.phase = String(phase || this.phase);
    this.record('checkpoint', detail, false);
    this.write({ ok: false, incomplete: true, diagnostics: this.snapshot() });
  }

  record(type, detail = {}, flush = true) {
    if (this.finished) return;
    this.events.push({
      at: new Date().toISOString(),
      type: String(type || 'event'),
      detail: detail && typeof detail === 'object' ? detail : { value: String(detail) }
    });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    if (flush) this.write({ ok: false, incomplete: true, diagnostics: this.snapshot() });
  }

  attachApp(app) {
    app.on('child-process-gone', (_event, details = {}) => {
      this.record('child_process_gone', {
        type: details.type || '',
        reason: details.reason || '',
        exitCode: details.exitCode ?? null,
        serviceName: details.serviceName || '',
        name: details.name || ''
      });
    });
  }

  attachWebContents(contents, label) {
    const name = String(label || 'window');
    contents.on('did-start-loading', () => this.record('did_start_loading', { window: name }));
    contents.on('did-finish-load', () => this.record('did_finish_load', { window: name }));
    contents.on('did-fail-load', (_event, code, description, validatedUrl, isMainFrame) => {
      this.record('did_fail_load', {
        window: name,
        code,
        description,
        validatedUrl,
        isMainFrame
      });
    });
    contents.on('render-process-gone', (_event, details = {}) => {
      this.record('render_process_gone', {
        window: name,
        reason: details.reason || '',
        exitCode: details.exitCode ?? null
      });
    });
    contents.on('unresponsive', () => this.record('renderer_unresponsive', { window: name }));
  }

  fail(error, extra = {}) {
    this.record('smoke_failed', { error: serializeError(error) }, false);
    this.finished = true;
    const result = {
      ok: false,
      error: serializeError(error),
      ...extra,
      diagnostics: this.snapshot()
    };
    this.write(result);
    return result;
  }

  finish(result = {}) {
    this.record('smoke_finished', { ok: result.ok === true }, false);
    this.finished = true;
    const output = { ...result, diagnostics: this.snapshot() };
    this.write(output);
    return output;
  }
}

function createSmokeDiagnostics(environment = process.env) {
  const mode = rendererSmokeMode(environment);
  const outputPath = rendererSmokeOutput(environment);
  return mode && outputPath ? new SmokeDiagnostics({ mode, outputPath }) : null;
}

module.exports = {
  MAX_EVENTS,
  SmokeDiagnostics,
  createSmokeDiagnostics,
  rendererSmokeMode,
  rendererSmokeOutput,
  serializeError
};
