(() => {
  const button = document.getElementById('open-wardrobe');
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
