/* Settings navigation owns presentation only. Existing controls and IPC handlers are reused. */
(() => {
  const overlay = document.getElementById('settings-overlay');
  const panels = [...overlay.querySelectorAll('.settings-panel')];
  const buttons = [...overlay.querySelectorAll('[data-settings-section]')];
  const hint = document.getElementById('settings-draft-hint');
  let dirty = false;
  let selected = 'appearance';
  let busy = false;
  // Inert preserves each field's own disabled state (voice/provider dependencies).
  // Independent resource buttons and diagnostics remain available.
  const submissionControls = [...overlay.querySelectorAll('input, textarea, select, #save-settings, #test-connection, #preview-greeting, #preview-girlfriend, #discard-settings, #clear-key')];
  function setBusy(value) {
    busy = Boolean(value);
    for (const control of submissionControls) {
      control.inert = busy;
      if (busy) control.setAttribute('aria-disabled', 'true');
      else control.removeAttribute('aria-disabled');
    }
    document.getElementById('save-settings').textContent = busy ? '处理中…' : '保存更改';
  }
  function select(section, focus = false) {
    if (!buttons.some(button => button.dataset.settingsSection === section)) return;
    selected = section;
    for (const panel of panels) panel.hidden = panel.id !== `settings-panel-${section}`;
    for (const button of buttons) {
      if (button.dataset.settingsSection === section) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    overlay.querySelector('.settings-content').scrollTop = 0;
    if (focus) buttons.find(button => button.dataset.settingsSection === section).focus();
  }
  function clean() {
    dirty = false;
    hint.textContent = '普通设置需保存；切换分类保留输入。';
  }
  function changed(event) {
    if (!event.target.matches('input, textarea, select')) return;
    dirty = true;
    hint.textContent = '有未保存的更改；暂存于本窗口，关闭软件后丢弃。';
  }
  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.settingsSection)));
  overlay.addEventListener('input', changed);
  overlay.addEventListener('change', changed);
  // Reuse the existing navigation handlers, including their modal and Runtime boundaries.
  overlay.querySelectorAll('[data-settings-link]').forEach(button => button.addEventListener('click', () => {
    document.getElementById(button.dataset.settingsLink)?.click();
  }));
  document.getElementById('test-connection').textContent = '保存并测试连接';
  document.getElementById('preview-greeting').textContent = '保存并试主动聊天';
  document.getElementById('preview-girlfriend').textContent = '保存并试女友消息';
  document.getElementById('save-settings').textContent = '保存更改';
  window.maiSettingsView = Object.freeze({
    select, clean, setBusy, isBusy: () => busy, isDirty: () => dirty,
    open(section) { select(section || selected); },
    focus() { buttons.find(button => button.dataset.settingsSection === selected)?.focus(); }
  });
})();
