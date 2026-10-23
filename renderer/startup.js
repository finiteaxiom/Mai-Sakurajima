(() => {
  const video = document.getElementById('startup-video');
  const finish = () => window.close();
  video.addEventListener('ended', finish, { once: true });
  video.addEventListener('error', finish, { once: true });
  document.getElementById('skip-startup').addEventListener('click', finish);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') finish();
  });
  // Start only once visible so loading the hidden window cannot consume the film.
  let started = false;
  const start = () => {
    if (document.hidden || started) return;
    started = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
    video.play().catch(finish);
  };
  document.addEventListener('visibilitychange', start);
  start();
})();
