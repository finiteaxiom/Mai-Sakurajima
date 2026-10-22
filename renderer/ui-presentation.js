/* View-only helpers: no IPC, domain state, timers or capability decisions. */
(() => {
  const messages = document.getElementById('messages');
  const latest = document.getElementById('scroll-latest');
  let following = true;
  let batch = false;
  const nearBottom = () => messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
  function scrollLatest(force = false) {
    if (batch) return;
    if (force || following) messages.scrollTop = messages.scrollHeight;
    if (force) following = true;
    latest.hidden = nearBottom();
  }
  messages.addEventListener('scroll', () => { following = nearBottom(); latest.hidden = following; }, { passive: true });
  latest.addEventListener('click', () => scrollLatest(true));
  const resize = new ResizeObserver(() => scrollLatest());
  resize.observe(messages);
  const content = new MutationObserver(() => scrollLatest());
  content.observe(messages, { childList: true, subtree: true, characterData: true });

  // Modal ownership is only focus/presentation. Existing close buttons retain business semantics.
  const pairs = [
    ['settings-overlay', 'close-settings'], ['memory-overlay', 'close-memory'],
    ['shared-life-overlay', 'close-shared-life'], ['life-overlay', 'close-life'],
    ['moments-overlay', 'close-moments'], ['avatar-picker-overlay', 'close-avatar-picker'],
    ['input-dialog-overlay', 'input-dialog-close'], ['workspace-preview-overlay', 'close-workspace-preview'],
    ['history-sidebar', 'close-history'], ['companion-context', 'close-companion-inspector'],
    ['action-context', 'close-work-inspector'], ['voice-call-overlay', 'end-voice-call']
  ].map(([id, close]) => ({ element: document.getElementById(id), close: document.getElementById(close) }));
  let stack = [];
  let lastTrigger = null;
  const captureTrigger = (event) => { lastTrigger = event.target.closest('button, [tabindex], input, textarea, select'); };
  document.addEventListener('click', captureTrigger, true);
  const visible = (entry) => {
    const el = entry.element;
    if (el.hidden || el.classList.contains('overlay--hidden') || el.classList.contains('input-dialog-overlay--hidden') || el.classList.contains('history-sidebar--closed')) return false;
    if (el.id === 'companion-context' || el.id === 'action-context') {
      return el.getAttribute('aria-hidden') === 'false' && getComputedStyle(el).position === 'fixed' && getComputedStyle(el).display !== 'none';
    }
    return true;
  };
  const focusable = (el) => [...el.querySelectorAll('button, a[href], input, textarea, select, [tabindex]')]
    .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length && !node.closest('[hidden]'));
  const main = document.querySelector('.chat-app');
  function syncLayers() {
    const removed = stack.filter(entry => !visible(entry));
    stack = stack.filter(visible);
    for (const entry of pairs) {
      const open = visible(entry);
      const docked = entry.element.id === 'action-context' && getComputedStyle(entry.element).position === 'static';
      entry.element.inert = !open && !docked;
      if (open && !stack.includes(entry)) {
        entry.opener = lastTrigger || document.activeElement;
        stack.push(entry);
      }
    }
    const top = stack.at(-1);
    // Main's children can be inert independently when a drawer lives inside Main.
    main.inert = !!top && !main.contains(top.element);
    for (const child of main.children) child.inert = !!top && main.contains(top.element) && child !== top.element && !child.classList.contains('history-scrim');
    for (const entry of pairs) {
      const docked = entry.element.id === 'action-context' && getComputedStyle(entry.element).position === 'static';
      entry.element.inert = stack.includes(entry) ? entry !== top : !docked;
    }
    if (top && !top.element.contains(document.activeElement)) {
      const opener = removed.at(-1)?.opener;
      (opener?.isConnected && top.element.contains(opener) ? opener : focusable(top.element)[0] || top.close)?.focus({ preventScroll: true });
    } else if (!top && removed.length) {
      const opener = removed[0].opener;
      if (opener?.isConnected && opener.getClientRects().length && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    }
  }
  const layers = new MutationObserver(syncLayers);
  for (const { element } of pairs) layers.observe(element, { attributes: true, attributeFilter: ['class', 'hidden', 'aria-hidden'] });
  function onKey(event) {
    // The existing context-menu handler owns its Escape semantics above a drawer.
    if (!document.getElementById('conversation-context-menu').classList.contains('conversation-context-menu--hidden')) return;
    const top = stack.at(-1);
    if (!top) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); top.close.click();
    } else if (event.key === 'Tab') {
      const nodes = focusable(top.element);
      if (!nodes.length) { event.preventDefault(); return; }
      const index = nodes.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && (index < 0 || index === nodes.length - 1)) { event.preventDefault(); nodes[0].focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', syncLayers);
  window.addEventListener('pagehide', () => { resize.disconnect(); content.disconnect(); layers.disconnect(); document.removeEventListener('keydown', onKey, true); document.removeEventListener('click', captureTrigger, true); window.removeEventListener('resize', syncLayers); }, { once: true });
  window.maiPresentation = {
    scrollLatest,
    animateView(element) {
      const animations = element.getAnimations();
      const current = animations.length ? getComputedStyle(element) : null;
      const from = current ? { opacity: current.opacity, transform: current.transform } : { opacity: .4, transform: 'translateY(6px)' };
      animations.forEach(animation => animation.cancel());
      if (document.body.dataset.maiMotion !== 'full' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      element.animate([from, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
    },
    beginHistory() { batch = true; },
    endHistory({ preserve = false, top = 0, follow = true } = {}) {
      batch = false; following = preserve ? follow : true;
      if (preserve && !follow) messages.scrollTop = top;
      scrollLatest();
    },
    isFollowing: () => following
  };
})();
