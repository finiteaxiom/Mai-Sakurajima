(() => {
  const DEFAULTS = {
    theme: 'auto', glassIntensity: 'balanced', transparency: 72,
    uiScale: 100, chatDensity: 'comfortable', motion: 'full'
  };

  function normalize(input = {}) {
    const theme = ['auto', 'light', 'dark'].includes(input.theme) ? input.theme : DEFAULTS.theme;
    const glassIntensity = ['soft', 'balanced', 'clear'].includes(input.glassIntensity)
      ? input.glassIntensity : DEFAULTS.glassIntensity;
    const chatDensity = ['comfortable', 'compact', 'relaxed'].includes(input.chatDensity)
      ? input.chatDensity : DEFAULTS.chatDensity;
    const motion = ['off', 'full', 'reduced'].includes(input.motion) ? input.motion : DEFAULTS.motion;
    const transparency = Math.min(90, Math.max(58, Number(input.transparency) || DEFAULTS.transparency));
    const uiScale = Math.min(110, Math.max(90, Number(input.uiScale) || DEFAULTS.uiScale));
    return { theme, glassIntensity, transparency, uiScale, chatDensity, motion };
  }

  function applyAppearance(input) {
    const preference = normalize(input);
    const root = document.documentElement;
    const body = document.body;
    root.dataset.maiTheme = preference.theme;
    body.dataset.maiDensity = preference.chatDensity;
    body.dataset.maiMotion = preference.motion;
    body.dataset.maiGlass = preference.glassIntensity;
    const glassFactor = { soft: 1.16, balanced: 1, clear: 0.78 }[preference.glassIntensity];
    const scale = preference.uiScale / 100;
    root.style.setProperty('--mai-ui-scale', String(preference.uiScale / 100));
    root.style.setProperty('--mai-control-height', `${Math.round(42 * scale)}px`);
    root.style.setProperty('--mai-icon-button-size', `${Math.round(36 * scale)}px`);
    root.style.setProperty('--mai-composer-min-height', `${Math.round(72 * scale)}px`);
    root.style.setProperty('--mai-conversation-padding', `clamp(${Math.round(30 * scale)}px, 7vw, ${Math.round(98 * scale)}px)`);
    root.style.setProperty('--mai-glass-opacity', `${Math.round(Math.min(0.94, (preference.transparency / 100) * glassFactor) * 100)}%`);
    return preference;
  }

  window.maiAppearance = { apply: applyAppearance, normalize };
  applyAppearance();
  window.maiPet?.getSettings?.().then((settings) => applyAppearance(settings?.appearance)).catch(() => {});
})();
