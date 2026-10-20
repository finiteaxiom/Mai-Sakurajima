const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const renderer = path.join(root, 'renderer');
const codexCss = fs.readFileSync(path.join(renderer, 'codex-ui.css'), 'utf8');
const wallpaperCss = fs.readFileSync(path.join(renderer, 'wallpaper.css'), 'utf8');

test('full-size Renderer pages load the v6 companion visual system last', () => {
  for (const file of ['chat.html', 'assistant.html', 'timer.html']) {
    const html = fs.readFileSync(path.join(renderer, file), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="codex-ui\.css">/);
    assert.ok(
      html.lastIndexOf('codex-ui.css') > html.lastIndexOf('light-theme.css'),
      `${file} must load the visual system after the compatibility theme`
    );
  }
});

test('Mai Design System provides shared tokens and a bounded appearance projection', () => {
  const html = fs.readFileSync(path.join(renderer, 'chat.html'), 'utf8');
  const tokens = fs.readFileSync(path.join(renderer, 'mai-design.css'), 'utf8');
  const appearance = fs.readFileSync(path.join(renderer, 'appearance.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

  assert.match(html, /href="mai-design\.css"/);
  assert.match(html, /id="appearance-theme"/);
  assert.match(html, /id="appearance-transparency"/);
  assert.match(tokens, /--mai-bg-primary/);
  assert.match(tokens, /--mai-radius-panel/);
  assert.match(tokens, /--mai-space-6/);
  assert.match(tokens, /--mai-blur-frame/);
  assert.match(tokens, /--mai-motion-normal/);
  assert.match(appearance, /function applyAppearance/);
  assert.match(appearance, /dataset\.maiTheme/);
  assert.match(main, /function normalizeAppearanceSettings/);
  assert.match(main, /chat:set-appearance/);
});

test('Codex visual system has one shared high-contrast token contract', () => {
  for (const token of [
    '--codex-canvas: #f7f5f5',
    '--codex-sidebar: #f5f3f3',
    '--codex-surface: #ffffff',
    '--codex-text: #282626',
    '--codex-border: #dedcdc',
    '--codex-accent: #b33f74'
  ]) {
    assert.match(codexCss, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(codexCss, /\.ui-chat \.chat-app/);
  assert.match(codexCss, /\.ui-assistant \.app-shell/);
  assert.match(codexCss, /\.ui-timer \.timer-app/);
  assert.match(codexCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test('visual system stays presentation-only and does not expand Renderer authority', () => {
  const cssWithoutComments = codexCss.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(cssWithoutComments, /ipcRenderer|window\.maiPet|require\s*\(|fetch\s*\(|WebSocket|powershell/i);
});

test('Chat loads the wallpaper presentation layer after the shared visual system', () => {
  const html = fs.readFileSync(path.join(renderer, 'chat.html'), 'utf8');
  assert.ok(html.lastIndexOf('wallpaper.css') > html.lastIndexOf('codex-ui.css'));
  assert.match(html, /id="wallpaper-layer"/);
  assert.match(html, /id="wallpaper-grid"/);
  assert.match(html, /id="choose-custom-wallpaper"/);
  assert.match(html, /id="clear-custom-wallpaper"/);
  assert.match(wallpaperCss, /background-size:\s*cover/);
  assert.match(wallpaperCss, /pointer-events:\s*none/);
  assert.match(wallpaperCss, /object-fit:\s*cover/);
  assert.match(wallpaperCss, /grid-template-columns:\s*repeat\(auto-fit, minmax\(140px, 220px\)\)/);
  assert.match(wallpaperCss, /--glass-frame-image:/);
  assert.match(wallpaperCss, /radial-gradient\(/);
  assert.match(wallpaperCss, /linear-gradient\(/);
  assert.match(wallpaperCss, /backdrop-filter:\s*var\(--glass-blur-frame\)/);
  assert.match(wallpaperCss, /box-shadow:[^;}]*inset/s);
  assert.match(wallpaperCss, /liquid-glass-enter/);
});

test('wallpaper picker spans both settings columns so its options cannot overflow a single column', () => {
  const layoutCss = fs.readFileSync(path.join(renderer, 'workspace-layout.css'), 'utf8');
  assert.match(
    layoutCss,
    /#settings-overlay \.wallpaper-settings,[\s\S]*?grid-column:\s*1\s*\/\s*-1/
  );
});

test('Chat and Work use an explicit top-level workspace switch with separate surfaces', () => {
  const html = fs.readFileSync(path.join(renderer, 'chat.html'), 'utf8');
  const script = fs.readFileSync(path.join(renderer, 'chat.js'), 'utf8');
  const workController = fs.readFileSync(path.join(renderer, 'work-renderer-controller.js'), 'utf8');
  const workBindings = fs.readFileSync(path.join(renderer, 'work-renderer-bindings.js'), 'utf8');
  const explorerController = fs.readFileSync(path.join(renderer, 'workspace-explorer-controller.js'), 'utf8');
  const layoutCss = fs.readFileSync(path.join(renderer, 'workspace-layout.css'), 'utf8');

  assert.doesNotMatch(html, /workspace-context-toggle/);
  assert.doesNotMatch(script, /workspaceContextToggle|mai-companion-context-collapsed|context-collapsed/);
  assert.doesNotMatch(layoutCss, /context-collapsed/);
  assert.match(html, /id="companion-context"/);
  assert.match(html, /id="action-context"/);
  assert.match(html, /id="runtime-switcher-button"/);
  assert.match(html, /data-runtime-mode="chat"/);
  assert.match(html, /data-runtime-mode="agent"/);
  assert.match(html, /<strong>Chat<\/strong>/);
  assert.match(html, /<strong>Work<\/strong>/);
  assert.match(html, /id="work-project-list"/);
  assert.match(html, /id="new-work-project-button"/);
  assert.match(html, /id="agent-avatar-button"/);
  assert.match(script, /runtime-mode--chat/);
  assert.match(script, /runtime-mode--agent/);
  assert.match(script, /getWorkData/);
  assert.match(script, /agentAvatarButton\.addEventListener\('click', \(\) => openAvatarPicker\('mai'\)\)/);
  assert.match(script, /selectedRuntimeMode === 'agent'/);
  assert.match(script, /workRendererBindings\.executeAction\(content, selectedPath, identity\)/);
  assert.match(workController, /async function executeAction\(/);
  assert.match(workController, /async function renameSession\(/);
  assert.match(workController, /async function deleteSession\(/);
  assert.match(workBindings, /createWorkRendererController/);
  assert.match(script, /openConversationContextMenu\(event, session, 'work'\)/);
  assert.match(script, /workRendererBindings\.renameSession\(workProjectId, session\.id, values\.title, workIdentity\)/);
  assert.match(script, /workRendererBindings\.deleteSession\(workProjectId, session\.id, workIdentity\)/);
  assert.match(script, /renameConversationSession\(session, 'chat'\)/);
  assert.match(script, /deleteConversationSession\(session, 'chat'\)/);
  assert.match(html, /id="action-workspace-tree"/);
  assert.match(html, /id="refresh-action-workspace"/);
  assert.match(html, /id="workspace-preview-overlay"/);
  assert.match(html, /id="close-workspace-preview"/);
  assert.match(explorerController, /api\.listActionWorkspaceDirectory/);
  assert.match(explorerController, /api\.previewActionWorkspaceFile/);
  assert.match(script, /function renderWorkspaceExplorer\(\)/);
  assert.match(script, /function loadWorkspaceDirectory\(/);
  assert.match(script, /workspaceExplorerSelection/);
  assert.match(script, /allWorkSessions/);
  assert.match(script, /agent-project-group__tasks/);
  assert.match(script, /function isUngroupedWorkProject\(project\)/);
  assert.match(script, /heading\.textContent = '最近'/);
  assert.match(script, /function renderOperationResultCards\(/);
  assert.match(script, /messagesElement\.querySelector\('\.runtime-welcome'\)\?\.remove\(\)/);
  assert.match(script, /项目已创建。请为它选择一个 Workspace。/);
  assert.match(script, /请先选择这个项目的 Workspace；选择后即可浏览和读取其中的文件。/);
  assert.match(script, /session\.title \|\| '新任务'/);
  assert.match(script, /setRuntimeMode\('chat'\);/);
  assert.doesNotMatch(script, /localStorage\.getItem\('mai-runtime-mode'\)/);
  assert.doesNotMatch(script, /api\.sendChat[\s\S]{0,300}executeAction/);
});

test('Work project and settings controls keep their intended high-contrast states', () => {
  const designCss = fs.readFileSync(path.join(renderer, 'mai-design.css'), 'utf8');
  assert.match(wallpaperCss, /\.input-dialog-button:not\(\.input-dialog-button--primary\)/);
  assert.match(designCss, /\.endpoint \{ color: var\(--mai-text-secondary\); \}/);
  assert.match(designCss, /\.endpoint code \{ color: var\(--mai-text-primary\);/);
});

test('Chat Workspace capability stays a session-bound read-only gateway, not an Agent surface', () => {
  const html = fs.readFileSync(path.join(renderer, 'chat.html'), 'utf8');
  const script = fs.readFileSync(path.join(renderer, 'chat.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  assert.match(html, /id="chat-workspace-capability"/);
  assert.match(script, /function workspaceIntentFromChat/);
  assert.match(script, /api\.executeChatWorkspaceCapability/);
  assert.match(script, /workspaceContextId/);
  assert.doesNotMatch(script, /workspace-capability:|agent:|AgentLoop|ToolRuntime/);
  assert.match(preload, /workspace-capability:status/);
  assert.match(preload, /workspace-capability:execute/);
});

test('narrow Work keeps the single inspector reachable as an accessible drawer', () => {
  const html = fs.readFileSync(path.join(renderer, 'chat.html'), 'utf8');
  const script = fs.readFileSync(path.join(renderer, 'chat.js'), 'utf8');
  const css = fs.readFileSync(path.join(renderer, 'codex-ui.css'), 'utf8');

  assert.match(html, /id="work-inspector-toggle"[^>]*aria-controls="action-context"[^>]*aria-expanded="false"/);
  assert.match(html, /id="companion-inspector-toggle"[^>]*aria-controls="companion-context"[^>]*aria-expanded="false"/);
  assert.match(html, /id="companion-inspector-scrim"[^>]*aria-hidden="true"/);
  assert.match(html, /id="work-inspector-scrim"[^>]*aria-hidden="true"/);
  assert.equal((html.match(/id="action-context"/g) || []).length, 1);
  assert.doesNotMatch(html, /action-context-mobile/);
  assert.match(script, /function setWorkInspectorOpen\(open\)/);
  assert.match(script, /function setCompanionInspectorOpen\(open\)/);
  assert.match(script, /window\.matchMedia\('\(max-width: 1180px\)'\)/);
  assert.match(script, /workInspectorScrim\.addEventListener\('click', \(\) => setWorkInspectorOpen\(false\)\)/);
  assert.match(script, /companionInspectorScrim\.addEventListener\('click', \(\) => setCompanionInspectorOpen\(false\)\)/);
  assert.match(script, /else if \(workInspectorOpen\) setWorkInspectorOpen\(false\)/);
  assert.match(script, /if \(agentMode\) \{\s*closeHistory\(\);/);
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*?\.work-inspector-toggle \{ display: inline-flex; \}/);
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*?\.companion-inspector-toggle,[\s\S]*?\.work-inspector-toggle \{ display: inline-flex; \}/);
  assert.match(css, /companion-inspector-open \.companion-context \{[\s\S]*?transform: translateX\(0\);[\s\S]*?pointer-events: auto;/);
  assert.match(css, /runtime-mode--agent\.sidebar-collapsed \{[\s\S]*?--companion-sidebar-width: 232px;/);
  assert.match(css, /runtime-mode--agent #workspace-sidebar-toggle \{ display: none; \}/);
  assert.match(wallpaperCss, /\.companion-inspector-scrim,[\s\S]*?\.work-inspector-scrim \{[\s\S]*?backdrop-filter: none;/);
  assert.match(wallpaperCss, /\.companion-inspector-scrim,[\s\S]*?\.work-inspector-scrim \{[\s\S]*?background-color: transparent;/);
  assert.match(css, /runtime-mode--agent #workspace-search-button \{ display: none; \}/);
  assert.match(wallpaperCss, /\.work-inspector-scrim \{[\s\S]*?backdrop-filter: none;/);
  assert.match(css, /\.action-context \{[\s\S]*?position: fixed;[\s\S]*?transform: translateX\(105%\);[\s\S]*?pointer-events: none;/);
  assert.match(css, /work-inspector-open \.action-context \{[\s\S]*?transform: translateX\(0\);[\s\S]*?pointer-events: auto;/);
  assert.doesNotMatch(css, /@media \(max-width: 1180px\) \{\s*\.ui-chat \.action-context \{ display: none; \}/);
});

test('Chat exposes two local avatar triggers without a bundled catalog', () => {
  const html = fs.readFileSync(path.join(renderer, 'chat.html'), 'utf8');
  const script = fs.readFileSync(path.join(renderer, 'chat.js'), 'utf8');

  assert.match(html, /id="mai-avatar-button"/);
  assert.match(html, /id="user-avatar-button"/);
  assert.match(html, /id="avatar-picker-overlay"/);
  assert.match(html, /id="avatar-grid"/);
  assert.match(html, /id="choose-custom-avatar"/);
  assert.match(html, /id="clear-custom-avatar"/);
  assert.match(script, /api\.chooseCustomAvatar\(target\)/);
  assert.match(script, /api\.clearCustomAvatar\(target\)/);
  assert.doesNotMatch(script, /mai_avatar_\d+/);
  assert.match(script, /openAvatarPicker\('mai'\)/);
  assert.match(script, /openAvatarPicker\('user'\)/);
  assert.doesNotMatch(script, /agent:set-avatar|tool.*avatar/i);
});
