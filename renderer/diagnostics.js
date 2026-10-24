(() => {
  const api = window.maiDiagnostics;
  const output = document.getElementById('diagnostics-output');
  if (!api || !output) return;
  const run = async (button, fn) => {
    button.disabled = true;
    try { await fn(); } catch { output.textContent = '诊断操作失败，请稍后重试或检查目录权限。'; }
    finally { button.disabled = false; }
  };
  document.getElementById('diagnostics-refresh').addEventListener('click', event => run(event.currentTarget, async () => {
    const s = await api.snapshot();
    output.textContent = `版本 ${s.version} · 主进程内存 ${s.memoryMB} MB\n日志目录：${s.directory}\n最多 ${s.maxFiles} 个文件，每个 ${s.maxFileBytes / 1048576} MB，保留 ${s.retentionDays} 天\n本次操作（包含嵌套模块）：完成 ${s.counts.completed} / 失败 ${s.counts.failed} / 取消 ${s.counts.cancelled}\n日志写入失败 ${s.writeFailures} / 读取失败 ${s.readFailures} / 丢弃 ${s.dropped}\n近期记录（含历史运行，最多展示 50 条）：\n` + s.records.slice(-50).reverse().map(r => `${r.time} ${r.module}/${r.operation} ${r.outcome}${r.code ? ' '+r.code : ''} · ${r.durationMs ?? '-'}ms · 关联 ${r.traceId}`).join('\n');
  }));
  document.getElementById('diagnostics-folder').addEventListener('click', event => run(event.currentTarget, async () => { await api.openFolder(); output.textContent = '已请求打开日志目录。'; }));
  document.getElementById('diagnostics-export').addEventListener('click', event => run(event.currentTarget, async () => { const r = await api.export(); output.textContent = r.cancelled ? '已取消导出。' : '已导出最近最多 1000 条脱敏记录，不含本地日志目录。'; }));
  window.addEventListener('error', () => api.reportError('script-error'));
  window.addEventListener('unhandledrejection', () => api.reportError('unhandled-rejection'));
})();
