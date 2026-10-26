(() => {
  'use strict';
  const catalog = window.MaiPetCatalog, sprites = window.MaiPetSprites, api = window.maiWardrobe;
  const byId = id => document.getElementById(id);
  const player = sprites.createPlayer(byId('preview').getContext('2d'));
  let selected = 'original', current = 'original', loaded = false, busy = false, generation = 0, paused = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function refresh() {
    byId('apply').disabled = busy || !loaded || selected === current || !api;
    byId('apply').textContent = busy ? '正在换装…' : selected === current ? '当前穿着' : '换上这套';
    byId('current-outfit').textContent = `当前穿着：${catalog.get(current).name}`;
    document.querySelectorAll('.outfit').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.outfit === selected));
      button.querySelector('small').textContent = button.dataset.outfit === current ? '当前穿着' : '预览';
      button.disabled = busy;
    });
  }
  async function select(id) {
    const request = ++generation; selected = id; loaded = false; refresh();
    const outfit = catalog.get(id);
    byId('outfit-name').textContent = outfit.name; byId('outfit-description').textContent = outfit.description;
    byId('action').replaceChildren();
    const actions = [['idle','待机'],['wave','挥手'],['runRight','向右走'],['runLeft','向左走'],['love','摸头回应'],['sleep','困倦'],['outfitPrimary',outfit.primary],['outfitSecondary',outfit.secondary]];
    if (id !== 'original') actions.splice(5, 0, ['lifted','被提起'],['land','落地']);
    for (const [value, name] of actions) byId('action').add(new Option(name, value));
    byId('status').textContent = '正在加载预览…';
    try {
      const asset = await sprites.load(id);
      if (request !== generation) return;
      player.setAsset(asset); loaded = true;
      byId('preview').hidden = false;
      byId('status').textContent = '预览不会改变桌宠。点击“换上这套”后保存。';
    } catch {
      if (request !== generation) return;
      byId('preview').hidden = true;
      byId('status').textContent = '这套服装暂时无法加载，当前装扮未改变。';
    }
    refresh();
  }
  for (const outfit of catalog.outfits) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'outfit'; button.dataset.outfit = outfit.id;
    const thumb = document.createElement('canvas'); thumb.width = 192; thumb.height = 208; thumb.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.textContent = outfit.name;
    const badge = document.createElement('small'); button.append(thumb, label, badge);
    button.addEventListener('click', () => { if (!busy) select(outfit.id); }); byId('outfits').append(button);
    sprites.load(outfit.id).then(asset => sprites.paint(thumb.getContext('2d'), asset, 0, 0)).catch(() => { badge.textContent = '素材不可用'; });
  }
  byId('apply').addEventListener('click', async () => {
    if (busy || !loaded || !api) return;
    busy = true; refresh();
    try { const state = await api.set(selected); current = catalog.normalize(state.outfitId); byId('status').textContent = '已保存装扮；若正在拖动，松手后切换。'; }
    catch { byId('status').textContent = '换装未保存，请检查素材或稍后重试。'; }
    finally { busy = false; refresh(); }
  });
  function replay() { player.setAction('idle', performance.now(), true); player.setAction(byId('action').value, performance.now(), true); }
  byId('action').addEventListener('change', () => player.setAction(byId('action').value));
  byId('replay').addEventListener('click', replay);
  byId('pause').addEventListener('click', () => { paused = !paused; byId('pause').setAttribute('aria-pressed', String(paused)); byId('pause').textContent = paused ? '继续' : '暂停'; if (!paused) replay(); });
  byId('close').addEventListener('click', () => window.close());
  document.addEventListener('keydown', event => { if (event.key === 'Escape') window.close(); });
  api?.onChanged(state => { current = catalog.normalize(state.outfitId); refresh(); });
  async function init() {
    try { if (api) current = catalog.normalize((await api.get()).outfitId); }
    catch { byId('status').textContent = '暂时无法读取当前装扮。'; }
    await select(current);
  }
  function draw(time) {
    const lowMotion = reduced.matches || ['off', 'reduced'].includes(document.body.dataset.maiMotion);
    if (!paused && loaded && !document.hidden) player.draw(time, lowMotion);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw); init();
})();
