// Bullet pattern emitters. Each factory (g, P) returns an updater (dt) => done:boolean.
// g = Game (fire, mark, player), P = { s: stage, dens, spd, gap, hues }
import { W, BT } from './config.js';

const PI = Math.PI, PI2 = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const aim = (g, x, y) => Math.atan2(g.player.y - y, g.player.x - x);

function radial(g, P) {
  const x = rnd(110, 370), y = rnd(70, 230);
  const h = pick(P.hues), h2 = pick(P.hues);
  const n = Math.round(12 * P.dens + P.s * 1.2);
  const rounds = 3 + (P.s > 3 ? 1 : 0) + (P.s > 6 ? 1 : 0);
  const gapT = 0.5, rot = rnd(0, PI2);
  let t = -0.7, k = 0;
  g.mark(x, y, h, 0.7);
  return (dt) => {
    t += dt;
    while (k < rounds && t >= k * gapT) {
      const sp = (118 + k * 22) * P.spd, off = rot + k * PI / n;
      for (let i = 0; i < n; i++) {
        g.fire(x, y, off + i * PI2 / n, sp, k % 2 ? BT.MID : BT.SMALL, k % 2 ? h2 : h);
      }
      k++;
    }
    return k >= rounds;
  };
}

function spiral(g, P) {
  const x = rnd(140, 340), y = rnd(60, 180);
  const arms = 2 + (P.s >= 3 ? 1 : 0) + (P.s >= 6 ? 1 : 0);
  const iv = 1 / (11 * P.dens), dur = 4.6;
  const dir = Math.random() < 0.5 ? 1 : -1, base = rnd(0, PI2);
  const h = pick(P.hues), h2 = pick(P.hues);
  let t = -0.7, acc = 0;
  g.mark(x, y, h, 0.7);
  return (dt) => {
    t += dt;
    if (t < 0) return false;
    acc += dt;
    while (acc >= iv) {
      acc -= iv;
      const a0 = base + dir * t * 1.7;
      for (let a = 0; a < arms; a++) {
        g.fire(x, y, a0 + a * PI2 / arms, (125 + (a % 2) * 18) * P.spd, a % 2 ? BT.MID : BT.SMALL, a % 2 ? h2 : h);
      }
    }
    return t > dur;
  };
}

function aimed(g, P) {
  const x = rnd(70, 410), y = rnd(30, 90);
  const cnt = 3 + 2 * Math.min(3, (P.s / 3) | 0);
  const volleys = 4 + (P.s > 4 ? 1 : 0), iv = 0.42, spread = 0.2;
  const h = pick(P.hues);
  let t = -0.7, k = 0;
  g.mark(x, y, h, 0.7);
  return (dt) => {
    t += dt;
    while (k < volleys && t >= k * iv) {
      const a = aim(g, x, y), sp = (170 + k * 10) * P.spd;
      for (let i = 0; i < cnt; i++) {
        g.fire(x, y, a + (i - (cnt - 1) / 2) * spread, sp, i % 2 ? BT.RICE : BT.DIAMOND, h);
      }
      k++;
    }
    return k >= volleys;
  };
}

function wave(g, P) {
  const ribbons = P.s >= 4 ? 3 : 2;
  const x0 = rnd(90, 190), dur = 4.2, iv = 0.075 / Math.max(0.75, P.dens);
  const h = pick(P.hues), h2 = pick(P.hues);
  const xs = [x0, W - x0, W / 2].slice(0, ribbons);
  const opts = xs.map((_, i) => ({ sw: (i % 2 ? -1 : 1) * 170, sf: 3.1, ph: 0 }));
  let t = -0.7, acc = 0;
  xs.forEach((x) => g.mark(x, 8, h, 0.7));
  return (dt) => {
    t += dt;
    if (t < 0) return false;
    acc += dt;
    for (let i = 0; i < xs.length; i++) xs[i] += clamp(g.player.x - xs[i], -1, 1) * 38 * dt;
    while (acc >= iv) {
      acc -= iv;
      for (let i = 0; i < xs.length; i++) g.fire(xs[i], -8, PI / 2, 150 * P.spd, i % 2 ? BT.SMALL : BT.MID, i % 2 ? h2 : h, opts[i]);
    }
    return t > dur;
  };
}

function rain(g, P) {
  const dur = 5.5, rate = 7.5 * P.dens + P.s * 0.8;
  const hs = P.hues;
  let t = -0.4, acc = 0;
  return (dt) => {
    t += dt;
    if (t < 0) return false;
    acc += dt * rate;
    while (acc >= 1) {
      acc -= 1;
      g.fire(rnd(10, W - 10), -10, PI / 2 + rnd(-0.07, 0.07), rnd(150, 250) * P.spd, BT.RICE, hs[(Math.random() * hs.length) | 0]);
    }
    return t > dur;
  };
}

function beam(g, P) {
  const x = rnd(150, 330), y = rnd(90, 200);
  const rays = clamp(Math.round((2 + P.s * 0.35) * Math.pow(P.dens, 0.7)), 2, 6);
  const omega = (Math.random() < 0.5 ? 1 : -1) * (0.36 + Math.min(P.s, 10) * 0.02);
  const dur = 5, iv = 0.06, base = rnd(0, PI2), h = pick(P.hues);
  let t = -0.9, acc = 0;
  g.mark(x, y, h, 0.9);
  return (dt) => {
    t += dt;
    if (t < 0) return false;
    acc += dt;
    while (acc >= iv) {
      acc -= iv;
      const a0 = base + omega * t;
      for (let r = 0; r < rays; r++) g.fire(x, y, a0 + r * PI2 / rays, 175 * P.spd, BT.NEEDLE, h);
    }
    return t > dur;
  };
}

function sweeper(g, P) {
  const dir = Math.random() < 0.5 ? 1 : -1, y = rnd(36, 70), dur = 4.5;
  const iv = 0.32 / Math.sqrt(P.dens), n = 5 + Math.min(4, (P.s / 2) | 0) * 2;
  const h = pick(P.hues), h2 = pick(P.hues);
  const x0 = dir > 0 ? 40 : W - 40;
  let t = -0.6, acc = 0, shot = 0;
  g.mark(x0, y, h, 0.6);
  return (dt) => {
    t += dt;
    if (t < 0) return false;
    acc += dt;
    const x = x0 + dir * (W - 80) * clamp(t / dur, 0, 1);
    while (acc >= iv) {
      acc -= iv; shot++;
      g.mark(x, y, h, 0.3);
      for (let i = 0; i < n; i++) {
        g.fire(x, y, PI / 2 + (i - (n - 1) / 2) * (1.3 / (n - 1)), 150 * P.spd, i % 2 ? BT.DIAMOND : BT.MID, i % 2 ? h2 : h);
      }
      if (shot % 3 === 0) {
        const a = aim(g, x, y);
        for (let i = -1; i <= 1; i++) g.fire(x, y, a + i * 0.12, 200 * P.spd, BT.RICE, h2);
      }
    }
    return t > dur;
  };
}

function gapwall(g, P) {
  const rows = 3 + (P.s > 4 ? 1 : 0) + (P.s > 8 ? 1 : 0);
  const gapW = 95 * P.gap + 15, iv = 1.2 / P.spd;
  const h = pick(P.hues);
  let gc = clamp(g.player.x + rnd(-120, 120), 70 + gapW / 2, W - 70 - gapW / 2);
  let t = -0.6, k = 0;
  return (dt) => {
    t += dt;
    while (k < rows && t >= k * iv) {
      if (k) gc = clamp(gc + rnd(-170, 170), 70 + gapW / 2, W - 70 - gapW / 2);
      for (let x = 12; x < W; x += 24) {
        if (Math.abs(x - gc) > gapW / 2) g.fire(x, -12, PI / 2, 125 * P.spd, BT.MID, h);
      }
      k++;
    }
    return k >= rows;
  };
}

function flower(g, P) {
  const x = rnd(120, 360), y = rnd(70, 200);
  const n = clamp(10 + ((P.s / 2) | 0) * 2 + Math.round((P.dens - 1) * 6), 8, 22);
  const rounds = 3, iv = 0.55, h = pick(P.hues);
  const O1 = { turn: 1.15, tt: 1.3 }, O2 = { turn: -1.15, tt: 1.3 };
  let t = -0.7, k = 0;
  g.mark(x, y, h, 0.7);
  return (dt) => {
    t += dt;
    while (k < rounds && t >= k * iv) {
      for (let i = 0; i < n; i++) g.fire(x, y, i * PI2 / n + k * 0.3, 135 * P.spd, BT.STAR, h, k % 2 ? O1 : O2);
      k++;
    }
    return k >= rounds;
  };
}

export const PATTERNS = { radial, spiral, aimed, wave, rain, beam, sweeper, gapwall, flower };
