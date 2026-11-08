// Keep avatar geometry when a local image is missing or cannot be decoded.
(() => {
  const fallback = new URL('avatar-placeholder.svg', location.href).href;
  function recover(image) {
    if (!(image instanceof HTMLImageElement) || !image.matches('#portrait, #agent-portrait, #user-avatar, .message-avatar, .moment-avatar, .companion-presence-card img, .ui-assistant .hero img')) return;
    if (image.src !== fallback) image.src = fallback;
  }
  document.addEventListener('error', event => recover(event.target), true);
  document.querySelectorAll('img').forEach(image => {
    if (image.complete && !image.naturalWidth) recover(image);
  });
})();
