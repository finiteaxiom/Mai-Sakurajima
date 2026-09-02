const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('no-sandbox');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-light-theme-user-'));
const outputDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'mai-light-theme-qa'));
const requestedPage = process.argv[3] || '';
const requestedTheme = process.argv[4] || 'light';
assert.ok(['light', 'dark', 'auto'].includes(requestedTheme), `unknown theme: ${requestedTheme}`);
app.setPath('userData', userData);
process.chdir(userData);

const pages = [
  {
    name: 'chat',
    file: 'chat.html',
    width: 1180,
    height: 820,
    selector: '.composer',
    layoutSelector: '.chat-app',
    expectedColumns: 2,
    preload: path.join(__dirname, 'mock-preload.js'),
    prepare: "const messages = document.getElementById('messages'); messages.innerHTML = ''; for (const type of ['assistant', 'user', 'proactive']) { const article = document.createElement('article'); article.className = `message message--${type}`; const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = type === 'user' ? '这是用户消息。' : '这是麻衣发来的消息。'; article.appendChild(bubble); messages.appendChild(article); } document.querySelectorAll('.message').forEach((item) => { item.style.animation = 'none'; })",
    contrastSelectors: ['.identity p', '.bubble', '.message-time', '#message-input', '.privacy-note'],
    translucentSurface: true,
    liquidGlass: true
  },
  {
    name: 'work',
    file: 'chat.html',
    width: 1180,
    height: 820,
    selector: '#workspace-preview-overlay',
    layoutSelector: '.chat-app',
    expectedColumns: 3,
    preload: path.join(__dirname, 'mock-preload.js'),
    prepare: "new Promise((resolve) => { document.querySelector('.runtime-option[data-runtime-mode=\"agent\"]')?.click(); const startedAt = Date.now(); const wait = () => { const entry = document.querySelector('[data-workspace-path=\"README.md\"]'); if (entry) { entry.click(); } const preview = document.getElementById('workspace-preview-content'); if (preview && !preview.hidden && preview.textContent.includes('Local preview.')) return resolve(); if (Date.now() - startedAt > 5000) return resolve(); setTimeout(wait, 50); }; wait(); })",
    contrastSelectors: ['#workspace-preview-name', '#workspace-preview-status', '.work-operation-result'],
    translucentSurface: false,
    liquidGlass: true
  },
  {
    name: 'chat-workspace',
    file: 'chat.html',
    width: 1180,
    height: 820,
    selector: '.composer',
    layoutSelector: '.chat-app',
    expectedColumns: 2,
    preload: path.join(__dirname, 'mock-preload.js'),
    prepare: "new Promise((resolve) => { const input = document.getElementById('message-input'); input.value = '看看 README'; document.getElementById('composer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); const startedAt = Date.now(); const waitForCard = () => { const allow = document.querySelector('.workspace-capability-request button'); if (allow) { allow.click(); waitForReply(); return; } if (Date.now() - startedAt > 5000) return resolve(); setTimeout(waitForCard, 50); }; const waitForReply = () => { if (document.querySelectorAll('.message--assistant').length > 0 && document.getElementById('chat-workspace-capability')?.textContent.includes('只读 Workspace')) return resolve(); if (Date.now() - startedAt > 5000) return resolve(); setTimeout(waitForReply, 50); }; waitForCard(); })",
    contrastSelectors: ['#chat-workspace-capability', '.workspace-capability-request'],
    translucentSurface: true,
    liquidGlass: true
  },
  {
    name: 'shared-life',
    file: 'chat.html',
    width: 1180,
    height: 820,
    selector: '.shared-life-card',
    layoutSelector: '.shared-life-card',
    expectedColumns: 2,
    preload: path.join(__dirname, 'mock-preload.js'),
    prepare: "document.getElementById('shared-life-button').click(); document.getElementById('shared-life-overlay').style.animation = 'none'",
    contrastSelectors: ['.settings-title-row p', '.world-card__now p', '.world-card__next small', '.memory-privacy'],
    translucentSurface: true,
    liquidGlass: true
  },
  {
    name: 'settings',
    file: 'chat.html',
    width: 1180,
    height: 820,
    selector: '.settings-card',
    layoutSelector: '#settings-overlay .settings-card',
    expectedColumns: 2,
    preload: path.join(__dirname, 'mock-preload.js'),
    prepare: "document.getElementById('settings-button').click(); document.getElementById('settings-overlay').style.animation = 'none'; document.querySelector('.wallpaper-settings')?.scrollIntoView({ block: 'center' })",
    contrastSelectors: ['.settings-title-row p', '.field > span', '.field small', '.toggle-row small', '.voice-settings-title strong', '.voice-slider-grid b', '.local-voice-install small'],
    translucentSurface: true,
    liquidGlass: true
  },
  {
    name: 'wallpaper-settings',
    file: 'chat.html',
    width: 1180,
    height: 820,
    selector: '.wallpaper-settings',
    layoutSelector: '.wallpaper-grid',
    expectedColumns: 5,
    preload: path.join(__dirname, 'mock-preload.js'),
    prepare: "document.getElementById('settings-button').click(); document.getElementById('settings-overlay').style.animation = 'none'; document.querySelector('.wallpaper-settings')?.scrollIntoView({ block: 'center' })",
    contrastSelectors: ['.wallpaper-settings__heading strong', '.wallpaper-settings__heading small', '.wallpaper-option span'],
    translucentSurface: true,
    liquidGlass: true
  },
  {
    name: 'avatar-picker',
    file: 'chat.html',
    width: 1180,
    height: 820,
    selector: '.avatar-picker-card',
    layoutSelector: '.avatar-grid',
    expectedColumns: 2,
    preload: path.join(__dirname, 'mock-preload.js'),
    prepare: "document.getElementById('mai-avatar-button').click(); document.getElementById('avatar-picker-overlay').style.animation = 'none'",
    contrastSelectors: ['#avatar-picker-title', '#avatar-picker-description', '#choose-custom-avatar', '#clear-custom-avatar'],
    translucentSurface: true,
    liquidGlass: true
  },
  {
    name: 'life',
    file: 'chat.html',
    width: 1180,
    height: 820,
    selector: '.life-card',
    layoutSelector: '.life-card',
    expectedColumns: 2,
    preload: path.join(__dirname, 'mock-preload.js'),
    prepare: "document.getElementById('life-button').click(); document.getElementById('life-overlay').style.animation = 'none'",
    contrastSelectors: ['.settings-title-row p', '.mind-panel__headline small', '#relationship-stage', '.mind-meter span', '.mind-note', '.weather-panel small', '#weather-summary', '.life-divider small', '#life-empty'],
    translucentSurface: true,
    liquidGlass: true
  },
  {
    name: 'assistant',
    file: 'assistant.html',
    width: 1180,
    height: 820,
    selector: '.feature-card:not(.feature-card--accent)',
    layoutSelector: '.app-shell',
    expectedColumns: 2,
    contrastSelectors: ['.hero p', '.feature-card p', '.section-heading p', '.card-label']
  },
  {
    name: 'timer',
    file: 'timer.html',
    width: 520,
    height: 700,
    selector: '.countdown-card',
    contrastSelectors: ['header p', '.timer-label', '.timer-status', '.field-title', '.field span', '.footnote']
  }
];

app.whenReady().then(async () => {
  const results = [];
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const selectedPages = requestedPage ? pages.filter((page) => page.name === requestedPage) : pages;
    assert.ok(selectedPages.length > 0, `unknown page: ${requestedPage}`);
    for (const page of selectedPages) {
      const window = new BrowserWindow({
        width: page.width,
        height: page.height,
        show: false,
        backgroundColor: '#ffffff',
        webPreferences: {
          preload: page.preload,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: !page.preload,
          backgroundThrottling: false
        }
      });
      await window.loadFile(path.join(__dirname, '..', 'renderer', page.file));
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (page.file === 'chat.html') {
        await window.webContents.executeJavaScript(`window.maiAppearance.apply({
          theme: ${JSON.stringify(requestedTheme)}, glassIntensity: 'balanced', transparency: 72,
          uiScale: 100, chatDensity: 'comfortable', motion: 'full'
        })`, true);
        await window.webContents.executeJavaScript(`new Promise((resolve) => {
          const startedAt = Date.now();
          const wait = () => {
            if (document.querySelectorAll('#wallpaper-grid .wallpaper-option').length === 10 || Date.now() - startedAt > 5000) resolve();
            else setTimeout(wait, 50);
          };
          wait();
        })`, true);
      }
      if (page.prepare) {
        await window.webContents.executeJavaScript(page.prepare, true);
        window.webContents.invalidate();
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      if (page.file === 'chat.html') {
        await window.webContents.executeJavaScript(`window.maiAppearance.apply({
          theme: ${JSON.stringify(requestedTheme)}, glassIntensity: 'balanced', transparency: 72,
          uiScale: 100, chatDensity: 'comfortable', motion: 'full'
        })`, true);
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      if (page.name === 'settings') {
        await window.webContents.executeJavaScript("const overlay = document.getElementById('settings-overlay'); overlay.classList.remove('overlay--hidden'); overlay.style.display = 'grid'; overlay.style.animation = 'none'; document.querySelector('.appearance-settings')?.scrollIntoView({ block: 'center' })", true);
        await new Promise((resolve) => setTimeout(resolve, 160));
        await window.webContents.executeJavaScript(`window.maiAppearance.apply({
          theme: ${JSON.stringify(requestedTheme)}, glassIntensity: 'balanced', transparency: 72,
          uiScale: 100, chatDensity: 'comfortable', motion: 'full'
        })`, true);
      }
      if (page.file === 'chat.html') {
        for (const [width, height, label] of [[900, 640, 'minimum'], [1180, 820, 'restored'], [1480, 940, 'expanded']]) {
          window.setSize(width, height);
          await new Promise((resolve) => setTimeout(resolve, 100));
          const overflow = await window.webContents.executeJavaScript('document.documentElement.scrollWidth > document.documentElement.clientWidth', true);
          assert.equal(overflow, false, `${page.name}: horizontal overflow at ${label} size`);
        }
        window.maximize();
        await new Promise((resolve) => setTimeout(resolve, 120));
        const maximizedOverflow = await window.webContents.executeJavaScript('document.documentElement.scrollWidth > document.documentElement.clientWidth', true);
        assert.equal(maximizedOverflow, false, `${page.name}: horizontal overflow while maximized`);
        window.unmaximize();
        window.setSize(page.width, page.height);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const state = await window.webContents.executeJavaScript(`(() => {
        const body = getComputedStyle(document.body);
        const surfaceElement = document.querySelector(${JSON.stringify(page.selector)});
        const surface = getComputedStyle(surfaceElement);
        const overlayElement = surfaceElement.closest('.overlay');
        const overlay = overlayElement ? getComputedStyle(overlayElement) : null;
        const overlayRect = overlayElement ? overlayElement.getBoundingClientRect() : null;
        const contrastSelectors = ${JSON.stringify(page.contrastSelectors || [])};
        const layoutSelector = ${JSON.stringify(page.layoutSelector || '')};
        const layoutElement = layoutSelector ? document.querySelector(layoutSelector) : null;
        const layoutColumns = layoutElement ? getComputedStyle(layoutElement).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
        const parseRgb = (value) => (String(value).match(/[0-9.]+/g) || []).slice(0, 3).map(Number);
        const luminance = (value) => {
          const channels = parseRgb(value).map((channel) => {
            const ratio = channel / 255;
            return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
          });
          return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
        };
        const contrastSamples = contrastSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).slice(0, 4).map((element) => {
          const color = getComputedStyle(element).color;
          return { selector, color, ratio: Number((1.05 / (luminance(color) + 0.05)).toFixed(2)) };
        }));
        const themeLoaded = Array.from(document.styleSheets).some((sheet) => String(sheet.href || '').endsWith('/light-theme.css'));
        const codexThemeLoaded = Array.from(document.styleSheets).some((sheet) => String(sheet.href || '').endsWith('/codex-ui.css'));
        const bubbleStyles = Object.fromEntries(['assistant', 'user', 'proactive'].map((type) => {
          const bubble = document.querySelector('.message--' + type + ' .bubble');
          const style = bubble ? getComputedStyle(bubble) : null;
          return [type, style ? { background: style.backgroundColor, border: style.borderColor } : null];
        }));
        return {
          theme: document.documentElement.dataset.maiTheme || '',
          primaryTextToken: getComputedStyle(document.documentElement).getPropertyValue('--mai-text-primary').trim(),
          sidebarSurface: getComputedStyle(document.documentElement).getPropertyValue('--mai-sidebar-surface').trim(),
          mainSurface: getComputedStyle(document.documentElement).getPropertyValue('--mai-main-surface').trim(),
          runtimeBackground: getComputedStyle(document.getElementById('runtime-switcher-button')).backgroundColor,
          primaryNavBackground: getComputedStyle(document.getElementById('new-chat-button')).backgroundColor,
          badgeBackground: getComputedStyle(document.getElementById('conversation-model-badge')).backgroundColor,
          privacyBackground: getComputedStyle(document.querySelector('.privacy-note')).backgroundColor,
          themeLoaded,
          codexThemeLoaded,
          bodyBackground: body.backgroundColor,
          bodyColor: body.color,
          surfaceBackground: surface.backgroundColor,
          surfaceBackgroundImage: surface.backgroundImage,
          surfaceColor: surface.color,
          surfaceBorder: surface.borderColor,
          surfaceBorderRadius: surface.borderRadius,
          surfaceBackdropFilter: surface.backdropFilter || surface.webkitBackdropFilter || '',
          surfaceBoxShadow: surface.boxShadow,
          overlayDisplay: overlay?.display || '',
          overlayOpacity: overlay?.opacity || '',
          overlayVisibility: overlay?.visibility || '',
          overlayWidth: overlayRect?.width || 0,
          overlayHeight: overlayRect?.height || 0,
          minimumTextContrast: contrastSamples.length ? Math.min(...contrastSamples.map((item) => item.ratio)) : 21,
          contrastSamples,
          documentTitle: document.title,
          identityTitle: document.querySelector('.identity h1')?.textContent.trim() || '',
          portraitTag: document.getElementById('portrait')?.tagName || '',
          portraitSrc: document.getElementById('portrait')?.getAttribute('src') || '',
          avatarOptionCount: document.querySelectorAll('#avatar-grid .avatar-option').length,
          hasLocalAvatarControls: Boolean(document.getElementById('choose-custom-avatar') && document.getElementById('clear-custom-avatar')),
          bubbleStyles,
          layoutColumns,
          labeledNavigationButtons: document.querySelectorAll('.header-actions [data-label]').length,
          workPreview: document.getElementById('workspace-preview-content')?.textContent || '',
          workPreviewVisible: !document.getElementById('workspace-preview-overlay')?.hidden,
          workOperationCards: document.querySelectorAll('.work-operation-result').length,
          workspaceTreeItems: document.querySelectorAll('#action-workspace-tree [role="treeitem"]').length,
          workspaceEmpty: document.getElementById('action-workspace-empty')?.textContent || '',
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth
        };
      })()`, true);
      assert.equal(state.themeLoaded, true, `${page.name}: light theme did not load`);
      assert.equal(state.codexThemeLoaded, true, `${page.name}: Codex visual system did not load`);
      const darkMaiPage = page.file === 'chat.html' && requestedTheme === 'dark';
      const autoMaiPage = page.file === 'chat.html' && requestedTheme === 'auto';
      if (darkMaiPage) {
        assert.equal(state.theme, 'dark', `${page.name}: ${requestedTheme} did not resolve to dark`);
        assert.equal(state.primaryTextToken, '#f6f1f5', `${page.name}: dark primary text token regressed`);
        assert.notEqual(state.sidebarSurface, state.mainSurface, `${page.name}: sidebar and conversation layers collapsed`);
      } else if (autoMaiPage) {
        assert.equal(state.theme, 'auto', `${page.name}: auto preference was not retained`);
      } else {
        assert.equal(
          state.bodyBackground,
          page.liquidGlass ? 'rgb(215, 219, 228)' : 'rgb(247, 245, 245)',
          `${page.name}: body does not use the expected visual canvas`
        );
        assert.equal(
          state.bodyColor,
          page.liquidGlass ? 'rgb(36, 35, 41)' : 'rgb(40, 38, 38)',
          `${page.name}: text is not high contrast`
        );
      }
      if (page.translucentSurface) {
        assert.notEqual(state.surfaceBackground, 'rgba(0, 0, 0, 0)', `${page.name}: readable surface is missing`);
        if (!darkMaiPage) {
          assert.match(state.surfaceBackground, /^rgba\([^)]*, 0\.[3-8]\d*\)$/, `${page.name}: readable translucent surface is missing`);
        }
        assert.match(state.surfaceBackdropFilter, /blur\(/, `${page.name}: backdrop blur is missing`);
        assert.match(state.surfaceBoxShadow, /inset/, `${page.name}: inner highlight shadow is missing`);
        assert.ok(parseFloat(state.surfaceBorderRadius) >= 14, `${page.name}: glass radius is too sharp`);
      } else {
        assert.equal(state.surfaceBackground, 'rgb(255, 255, 255)', `${page.name}: main surface is not white`);
      }
      if (!darkMaiPage) {
        assert.ok(state.minimumTextContrast >= 4.5, `${page.name}: text contrast is too low: ${JSON.stringify(state.contrastSamples)}`);
      }
      const expectedColumns = Number(page.expectedColumns || 0);
      if (expectedColumns > 0) {
        assert.ok(state.layoutColumns >= expectedColumns, `${page.name}: expected multi-column workspace`);
      }
      if (page.name === 'chat') {
        assert.equal(state.documentTitle, 'Mai Sakurajima');
        assert.equal(state.identityTitle, 'Mai Sakurajima');
        assert.equal(state.portraitTag, 'IMG');
        assert.equal(state.portraitSrc, '../assets/mai-profile.png');
        assert.notDeepEqual(state.bubbleStyles.user, state.bubbleStyles.assistant);
        assert.deepEqual(state.bubbleStyles.proactive, state.bubbleStyles.assistant);
        if (darkMaiPage) {
          assert.equal(state.surfaceColor, 'rgb(246, 241, 245)', `${page.name}: Mai message text is not readable in dark mode`);
        }
      }
      if (page.name === 'work') {
        assert.equal(state.workPreviewVisible, true, 'work: direct preview did not open');
        assert.match(state.workPreview, /Local preview\./, 'work: direct preview content is missing');
        assert.ok(state.workOperationCards >= 1, 'work: structured operation result is missing');
        assert.ok(state.workspaceTreeItems >= 3, 'work: Explorer tree did not render');
      }
      if (page.name === 'avatar-picker') {
        assert.equal(state.avatarOptionCount, 0);
        assert.equal(state.hasLocalAvatarControls, true);
      }
      assert.ok(state.scrollWidth <= state.clientWidth, `${page.name}: horizontal overflow`);
      const screenshot = path.join(outputDir, `${page.name}.png`);
      fs.writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
      results.push({ name: page.name, screenshot, ...state });
      window.destroy();
    }
    const report = { ok: true, results };
    fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    app.exit(0);
    setTimeout(() => process.exit(0), 300);
  } catch (error) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'error.txt'), error?.stack || String(error));
    console.error(error?.stack || error);
    process.exitCode = 1;
    app.exit(1);
    setTimeout(() => process.exit(1), 300);
  }
});
