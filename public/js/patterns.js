// 弾幕パターン定義
// fire(e, g, lv) は弾を発射し、次の発射までの秒数を返す。
// e: 発射源（星核） / g: Game / lv: levelFor() の戻り値
const TAU = Math.PI * 2;

export const PATTERNS = {
  // 全方位リング
  ring: {
    from: 1, weight: 3,
    fire(e, g, lv) {
      const n = Math.round(10 + 8 * lv.density);
      e.s.rot = (e.s.rot ?? Math.random() * TAU) + 0.19;
      for (let i = 0; i < n; i++) {
        g.shoot(e.x, e.y, e.s.rot + (i * TAU) / n, 105 * lv.speed, { r: 5, c: 0 });
      }
      g.shotSound();
      return 1.5 / lv.rate;
    },
  },

  // 自機狙いの扇状バースト
  aimed: {
    from: 1, weight: 3,
    fire(e, g, lv) {
      e.s.k = (e.s.k || 0) + 1;
      if (e.s.k % 4 === 1) e.s.a = g.aimAt(e);
      const spread = lv.density > 1.2 ? 5 : 3;
      for (let i = 0; i < spread; i++) {
        g.shoot(e.x, e.y, e.s.a + (i - (spread - 1) / 2) * 0.17, 175 * lv.speed, { r: 4, c: 1 });
      }
      g.shotSound();
      return e.s.k % 4 === 0 ? 1.5 / lv.rate : 0.14;
    },
  },

  // 回転スパイラル
  spiral: {
    from: 1, weight: 2,
    fire(e, g, lv) {
      const arms = lv.density > 1.2 ? 3 : 2;
      e.s.dir ??= Math.random() < 0.5 ? 1 : -1;
      e.s.a = (e.s.a ?? Math.random() * TAU) + 0.27 * e.s.dir;
      for (let i = 0; i < arms; i++) {
        g.shoot(e.x, e.y, e.s.a + (i * TAU) / arms, 115 * lv.speed, { r: 4, c: 2 });
      }
      return 0.12 / lv.rate;
    },
  },

  // 曲がる弾の花
  flower: {
    from: 2, weight: 2,
    fire(e, g, lv) {
      const n = Math.round(8 + 5 * lv.density);
      const off = Math.random() * TAU;
      for (let i = 0; i < n; i++) {
        const a = off + (i * TAU) / n;
        g.shoot(e.x, e.y, a, 95 * lv.speed, { r: 4.5, c: 0, curve: 0.75 });
        g.shoot(e.x, e.y, a + Math.PI / n, 95 * lv.speed, { r: 4.5, c: 2, curve: -0.75 });
      }
      g.shotSound();
      return 2.1 / lv.rate;
    },
  },

  // 揺れる下向きの帯
  wave: {
    from: 2, weight: 2,
    fire(e, g, lv) {
      const sway = Math.sin(e.age * 2.6) * 0.95;
      g.shoot(e.x, e.y, Math.PI / 2 + sway, 140 * lv.speed, { r: 4, c: 1 });
      g.shoot(e.x, e.y, Math.PI / 2 - sway, 140 * lv.speed, { r: 4, c: 1 });
      return 0.085 / lv.rate;
    },
  },

  // 加速リング
  accel: {
    from: 3, weight: 2,
    fire(e, g, lv) {
      const n = Math.round(12 + 6 * lv.density);
      const off = Math.random() * TAU;
      for (let i = 0; i < n; i++) {
        g.shoot(e.x, e.y, off + (i * TAU) / n, 22, {
          r: 5, c: 1, accel: 120 * lv.speed, max: 250 * lv.speed,
        });
      }
      g.shotSound();
      return 2.3 / lv.rate;
    },
  },

  // 炸裂弾
  split: {
    from: 4, weight: 2,
    fire(e, g, lv) {
      const a = g.aimAt(e);
      for (const d of [-0.55, 0, 0.55]) {
        g.shoot(e.x, e.y, a + d, 85 * lv.speed, {
          r: 10, c: 0,
          split: { t: 1.15, n: Math.round(7 + 4 * lv.density), speed: 110 * lv.speed, r: 4, c: 2 },
        });
      }
      g.shotSound();
      return 2.7 / lv.rate;
    },
  },

  // 風車状の十字ストリーム
  cross: {
    from: 4, weight: 2,
    fire(e, g, lv) {
      e.s.dir ??= Math.random() < 0.5 ? 1 : -1;
      e.s.a = (e.s.a ?? 0) + 0.085 * e.s.dir;
      for (let i = 0; i < 4; i++) {
        g.shoot(e.x, e.y, e.s.a + (i * TAU) / 4, 130 * lv.speed, { r: 4, c: 2 });
      }
      return 0.13 / lv.rate;
    },
  },
};

export function pickPattern(stage, exclude = []) {
  const pool = Object.entries(PATTERNS).filter(([, p]) => p.from <= stage);
  const preferred = pool.filter(([k]) => !exclude.includes(k));
  const list = preferred.length ? preferred : pool;
  const total = list.reduce((s, [, p]) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const [k, p] of list) {
    r -= p.weight;
    if (r <= 0) return k;
  }
  return list[0][0];
}
