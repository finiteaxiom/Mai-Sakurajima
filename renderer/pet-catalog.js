(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.MaiPetCatalog = catalog;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const outfits = Object.freeze([
    { id: 'original', name: '原版装扮', description: '熟悉的兔耳与深色制服', src: '../assets/spritesheet-original.png', columns: 8, rows: 11, primary: '学习', secondary: '发呆' },
    { id: 'school', name: '校服', description: '米色开衫 · 酒红领结', src: 'media/wardrobe/school.png', columns: 4, rows: 8, primary: '读书', secondary: '整理领结' },
    { id: 'home', name: '居家针织衫', description: '淡紫针织衫 · 柔软居家服', src: 'media/wardrobe/home.png', columns: 4, rows: 8, primary: '喝茶', secondary: '伸懒腰' },
    { id: 'winter', name: '冬季大衣', description: '驼色大衣 · 酒红围巾', src: 'media/wardrobe/winter.png', columns: 4, rows: 8, primary: '整理围巾', secondary: '暖手' }
  ].map(Object.freeze));
  const get = id => outfits.find(outfit => outfit.id === id);
  const normalize = id => get(id) ? id : 'original';
  const sequence = (row, frames, interval = 220, loop = frames, exit = []) => ({ row, frames, interval, loop, exit });
  function action(outfitId, name) {
    if (outfitId === 'original') {
      const actions = {
        idle: sequence(0, [0, 0, 0, 1, 2, 3, 4, 5], 235),
        wave: sequence(3, [0, 1, 2, 3, 2, 1], 165),
        love: sequence(3, [0, 1, 2, 3, 2, 1], 165),
        sleep: sequence(5, [2, 3, 4, 5, 4, 3], 520),
        runRight: sequence(1, [0, 1, 2, 3, 4, 5, 6, 7], 90),
        runLeft: sequence(2, [0, 1, 2, 3, 4, 5, 6, 7], 90),
        outfitPrimary: sequence(7, [0, 1, 2, 3, 4, 5], 250),
        outfitSecondary: sequence(6, [0, 1, 2, 3, 4, 5], 330)
      };
      return actions[name] || actions.idle;
    }
    const actions = {
      idle: sequence(0, [0, 0, 0, 0, 1, 2, 1, 3], 320),
      runRight: sequence(1, [0, 1, 2, 3], 150),
      runLeft: { ...sequence(1, [0, 1, 2, 3], 150), mirror: true },
      wave: sequence(2, [0, 1, 2, 3, 2, 3], 180, [2, 3, 2, 3], [1, 0]),
      love: sequence(3, [0, 1, 2, 2, 3], 230, [1, 2, 2, 3], [0]),
      lifted: sequence(4, [0, 1], 300),
      land: sequence(4, [2, 3], 180, [3]),
      jump: sequence(4, [2, 3], 180, [3]),
      sleep: sequence(5, [0, 1, 2, 3], 480, [2, 3, 2, 3], [1, 0]),
      outfitPrimary: sequence(6, [0, 1, 2, 3], 420, [2, 2, 3, 2], [1, 0]),
      outfitSecondary: sequence(7, [0, 1, 2, 3], 330, [0, 0, 1, 2, 3], [0])
    };
    if (name === 'study' && outfitId === 'school') return actions.outfitPrimary;
    // Unsupported legacy states keep this outfit on; never flash the old clothes.
    return actions[name] || actions.idle;
  }
  return Object.freeze({ outfits, get, normalize, action });
});
