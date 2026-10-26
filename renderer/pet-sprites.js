/* Shared sprite playback for the desktop pet and wardrobe preview. */
(() => {
  'use strict';
  const catalog = window.MaiPetCatalog;
  const cache = new Map();
  async function loadWalk(outfit) {
    const src = outfit.src.replace(/\.png$/, '-walk.png');
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('行走素材加载失败'));
      image.src = src;
    });
    const metadata = await (await fetch(src.replace(/\.png$/, '.json'))).json();
    if (metadata.frames?.length !== 4 || metadata.imageWidth !== image.naturalWidth || metadata.imageHeight !== image.naturalHeight) throw new Error('行走坐标无效');
    return { outfit: { ...outfit, columns: 4 }, image, metadata, width: image.naturalWidth / 2, height: image.naturalHeight / 2 };
  }
  async function load(id) {
    const outfit = catalog.get(id);
    if (!outfit) throw new Error('未知服装');
    if (!cache.has(id)) {
      const promise = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = async () => {
          if (!image.naturalWidth || !image.naturalHeight) return reject(new Error('服装图片无效'));
          try {
            const metadata = id === 'original' ? null : await (await fetch(outfit.src.replace(/\.png$/, '.json'))).json();
            if (metadata && (metadata.frames?.length !== 32 || metadata.imageWidth !== image.naturalWidth || metadata.imageHeight !== image.naturalHeight)) throw new Error('服装坐标无效');
            const walk = id === 'original' ? null : await loadWalk(outfit);
            resolve({ outfit, image, metadata, walk, width: image.naturalWidth / outfit.columns, height: image.naturalHeight / outfit.rows });
          } catch (error) { reject(error); }
        };
        image.onerror = () => reject(new Error('服装素材加载失败'));
        image.src = outfit.src;
      });
      cache.set(id, promise);
      promise.catch(() => cache.delete(id));
    }
    return cache.get(id);
  }
  function paint(ctx, asset, row, column, mirror = false) {
    if (row === 1 && asset.walk) return paint(ctx, asset.walk, 0, column, mirror);
    const { image, width, height } = asset;
    const scale = Math.min(ctx.canvas.width / width, ctx.canvas.height / height);
    const w = width * scale, h = height * scale;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (mirror) { ctx.translate(ctx.canvas.width, 0); ctx.scale(-1, 1); }
    const rect = asset.metadata?.frames[row * asset.outfit.columns + column];
    if (rect) {
      // One shared scale per outfit, with a fixed head anchor and foot baseline.
      // Never resize each frame to its individual bounds (that causes breathing heads).
      const spriteScale = 174 / asset.metadata.standingHeight;
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height,
        ctx.canvas.width / 2 - (rect.anchorX - rect.x) * spriteScale,
        198 - (rect.baseline - rect.y) * spriteScale,
        rect.width * spriteScale, rect.height * spriteScale);
    } else {
      ctx.drawImage(image, column * width, row * height, width, height, (ctx.canvas.width - w) / 2, ctx.canvas.height - h, w, h);
    }
    ctx.restore();
  }
  function createPlayer(ctx) {
    let asset, state = 'idle', started = 0, transition = null;
    function setAction(next, time = performance.now(), immediate = false) {
      if (next === state && !transition && !immediate) return;
      const old = asset && catalog.action(asset.outfit.id, state);
      if (!immediate && old?.exit.length) {
        transition = { config: old, next, started: time };
      } else { transition = null; state = next; started = time; }
    }
    return {
      setAsset(next) { asset = next; state = 'idle'; started = performance.now(); transition = null; },
      setAction,
      draw(time, reduced = false) {
        if (!asset) return;
        if (transition) {
          const index = Math.floor((time - transition.started) / transition.config.interval);
          if (index < transition.config.exit.length && !reduced) {
            paint(ctx, asset, transition.config.row, transition.config.exit[index]); return;
          }
          state = transition.next; started = time; transition = null;
        }
        const config = catalog.action(asset.outfit.id, state);
        const index = reduced ? 0 : Math.max(0, Math.floor((time - started) / config.interval));
        const frame = index < config.frames.length ? config.frames[index] : config.loop[(index - config.frames.length) % config.loop.length];
        paint(ctx, asset, config.row, frame, config.mirror);
      }
    };
  }
  window.MaiPetSprites = Object.freeze({ load, paint, createPlayer });
})();
