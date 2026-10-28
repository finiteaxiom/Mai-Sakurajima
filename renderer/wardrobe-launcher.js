(() => {
  const button = document.getElementById('open-wardrobe');
  document.getElementById('sidebar-wardrobe')?.addEventListener('click', async () => {
    try { await window.maiWardrobe.open(); }
    catch { if (typeof showNotice === 'function') showNotice('衣橱暂时无法打开，请稍后重试。'); }
  });
  button?.addEventListener('click', async () => {
    button.disabled = true;
    const status = document.getElementById('wardrobe-launch-status');
    try {
      if (!window.maiWardrobe) throw new Error('unavailable');
      await window.maiWardrobe.open(); status.textContent = '';
    } catch { status.textContent = '衣橱暂时无法打开，请稍后重试。'; }
    finally { button.disabled = false; }
  });
})();
