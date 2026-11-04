import {
  W, H, STEP, STAGE_TIME, TRANS_TIME, READY_TIME, MAX_BULLETS,
  PLAYER, DIFFS, SCORE, BULLET_DEFS, ALL_PATTERNS, rankOf, themeOf,
} from './config.js';
import { getSprite, getDot, setSpriteScale } from './sprites.js';
import { Starfield } from './starfield.js';
import { PATTERNS } from './patterns.js';
import { input } from './input.js';
import { audio } from './audio.js';

const PI2 = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const MAX_PARTS = 3200;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.handlers = {};
    this.stars = new Starfield();
    this.bullets = []; this.free = [];
    this.parts = []; this.pfree = [];
    this.patterns = [];
    this.player = { x: PLAYER.startX, y: PLAYER.startY, fa: 0, visible: false };
    this.phase = 'idle';   // idle | ready | play | trans | over
    this.paused = false;
    this.dim = 0; this.dimT = 0;
    this.warp = 0;
    this.hue = 215; this.hueT = 215;
    this.shake = 0; this.flash = 0; this.flashHue = 0;
    this.time = 0;
    this.debugInvincible = false;
    this.reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    this.diff = DIFFS.normal;
    this.resetRun();
  }

  get reduced() { return this.reducedMq.matches; }
  get active() { return this.phase === 'ready' || this.phase === 'play' || this.phase === 'trans'; }
  get theme() { return themeOf(this.stage); }
  get rank() { return rankOf(Math.floor(this.score)); }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); }
  emit(name, data) { const h = this.handlers[name]; if (h) for (const f of h) f(data); }

  resetRun() {
    this.stage = 1; this.stageT = 0; this.totalT = 0;
    this.score = 0; this.lives = this.diff.lives; this.maxLives = this.diff.lives;
    this.graze = 0; this.invuln = 0;
    this.transT = 0; this.readyT = 0; this.overT = 0; this.resultSent = false;
    this.spawnT = 0.4; this.tev = {};
    this.P = this.makeP();
  }

  makeP() {
    const s = this.stage, d = this.diff;
    return {
      s,
      dens: d.dens * (1 + 0.06 * Math.min(s - 1, 14)),
      spd: d.spd * (1 + 0.035 * Math.min(s - 1, 12)),
      gap: d.gap * (1 - 0.015 * Math.min(s, 10)),
      hues: themeOf(s).cols,
    };
  }

  resize(cssW, cssH, dpr) {
    const c = this.canvas;
    c.width = Math.max(1, Math.round(cssW * dpr));
    c.height = Math.max(1, Math.round(cssH * dpr));
    this.scale = c.width / W;
    setSpriteScale(this.scale);
  }

  // ---------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------
  start(diffKey) {
    this.diff = DIFFS[diffKey] || DIFFS.normal;
    this.clearAll(true);
    this.resetRun();
    this.player.x = PLAYER.startX; this.player.y = H + 30; this.player.visible = true; this.player.fa = 0;
    this.phase = 'ready'; this.paused = false;
    this.dimT = 1;
    this.hueT = this.theme.hue;
    audio.setStage(1);
    this.emit('cue', { main: 'READY', sub: `STAGE 1  ${this.theme.name}`, ms: READY_TIME * 1000 });
    this.emit('lives');
  }

  toIdle() {
    this.clearAll(true);
    this.phase = 'idle'; this.paused = false;
    this.dimT = 0; this.warp = 0; this.hueT = 215;
    this.player.visible = false;
  }

  clearAll(toSparks) {
    if (toSparks) for (const b of this.bullets) this.sparkOf(b, false);
    for (const b of this.bullets) this.free.push(b);
    this.bullets.length = 0;
    this.patterns.length = 0;
  }

  // ---------------------------------------------------------------
  // spawning helpers (used by patterns)
  // ---------------------------------------------------------------
  fire(x, y, ang, spd, type, hue, o) {
    if (this.bullets.length >= MAX_BULLETS) return null;
    const p = this.player;
    const dx = x - p.x, dy = y - p.y;
    if (dx * dx + dy * dy < 3600) return null; // never spawn on top of the player
    const b = this.free.pop() || {};
    b.x = x; b.y = y;
    b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd;
    b.type = type; b.hue = hue; b.t = 0; b.grazed = false;
    if (o) {
      b.turn = o.turn || 0; b.tt = o.tt || 99; b.acc = o.acc || 0; b.maxs = o.maxs || 0;
      b.sw = o.sw || 0; b.sf = o.sf || 0; b.ph = o.ph || 0;
    } else { b.turn = 0; b.tt = 99; b.acc = 0; b.maxs = 0; b.sw = 0; b.sf = 0; b.ph = 0; }
    this.bullets.push(b);
    return b;
  }

  mark(x, y, hue, life) { this.part(x, y, 0, 0, life, 40, hue, 3); }

  part(x, y, vx, vy, life, size, hue, kind = 0) {
    if (this.parts.length >= MAX_PARTS) return null;
    const p = this.pfree.pop() || {};
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = p.max = life; p.size = size; p.hue = hue;
    p.kind = kind; p.delay = 0; p.tx = 0; p.ty = 0;
    this.parts.push(p);
    return p;
  }

  sparkOf(b, seek) {
    const p = this.part(b.x, b.y, b.vx * 0.3, b.vy * 0.3, seek ? 2.4 : rnd(0.4, 0.9), seek ? rnd(10, 16) : rnd(8, 14), b.hue, seek ? 2 : 0);
    if (p && seek) { p.delay = rnd(0, 0.45); p.tx = W / 2; p.ty = H * 0.42; }
  }

  burst(x, y, n, hue, speed, size = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * PI2, s = rnd(speed * 0.3, speed);
      this.part(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.35, 0.9), rnd(size * 0.6, size), Math.random() < 0.3 ? -1 : hue, 0);
    }
  }

  // ---------------------------------------------------------------
  // update (fixed step)
  // ---------------------------------------------------------------
  update(dt) {
    if (this.paused) return;
    this.time += dt;
    const k = 1 - Math.exp(-dt * 3.2);
    this.dim += (this.dimT - this.dim) * k;
    this.hue += (((this.hueT - this.hue + 540) % 360) - 180) * (1 - Math.exp(-dt * 1.5));
    this.shake *= Math.exp(-dt * 7);
    this.flash *= Math.exp(-dt * 4.5);
    if (this.phase !== 'trans') this.warp += (0 - this.warp) * (1 - Math.exp(-dt * 6));
    this.stars.update(dt, this.warp);

    switch (this.phase) {
      case 'ready': this.updateReady(dt); break;
      case 'play': this.updatePlay(dt); break;
      case 'trans': this.updateTrans(dt); break;
      case 'over': this.updateOver(dt); break;
    }
    this.updateParts(this.phase === 'over' ? dt * 0.4 : dt);
  }

  movePlayer(dt) {
    const p = this.player;
    const foc = input.focus;
    p.fa += ((foc ? 1 : 0) - p.fa) * Math.min(1, dt * 14);
    const ax = input.axis();
    if (ax.x || ax.y) {
      const sp = foc ? PLAYER.focus : PLAYER.speed;
      p.x += ax.x * sp * dt; p.y += ax.y * sp * dt;
    }
    const m = input.mouse;
    if (m.active) {
      const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
      if (d > 0.4) {
        const sp = Math.min(d * 14, PLAYER.mouseMax * (foc ? 0.36 : 1));
        const st = Math.min(d, sp * dt);
        p.x += dx / d * st; p.y += dy / d * st;
      }
    }
    const t = input.touch;
    const tl = Math.hypot(t.px, t.py);
    if (tl > 0.001) {
      const take = Math.min(tl, PLAYER.touchMax * dt);
      p.x += t.px / tl * take; p.y += t.py / tl * take;
      t.px -= t.px / tl * take; t.py -= t.py / tl * take;
    }
    p.x = clamp(p.x, 8, W - 8);
    p.y = clamp(p.y, 12, H - 12);
  }

  updateReady(dt) {
    this.readyT += dt;
    const p = this.player;
    if (this.readyT < 0.8) {
      const e = 1 - Math.pow(1 - this.readyT / 0.8, 3);
      p.y = (H + 30) + (PLAYER.startY - (H + 30)) * e;
    } else this.movePlayer(dt);
    if (this.readyT >= READY_TIME) {
      this.phase = 'play';
      this.invuln = 0.5;
      this.spawnT = 0.15;
      this.emit('cue', { main: 'GO!', sub: '', ms: 700 });
      audio.sfx('go');
    }
  }

  updatePlay(dt) {
    this.movePlayer(dt);
    this.stageT += dt; this.totalT += dt;
    const mult = this.diff.mult;
    this.score += SCORE.perSec * (1 + SCORE.stageGrowth * (this.stage - 1)) * mult * dt;
    if (this.invuln > 0) this.invuln -= dt;

    // pattern scheduler
    const pats = this.patterns;
    for (let i = pats.length - 1; i >= 0; i--) if (pats[i].u(dt)) pats.splice(i, 1);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.45;
      const s = this.stage;
      const maxConc = clamp(Math.round(1 + s * 0.45 + (this.diff.dens - 1) * 1.5), 1, 5);
      if (pats.length < maxConc && this.bullets.length < 420 + s * 45) this.startPattern();
    }

    this.updateBullets(dt, true);
    if (this.phase === 'play' && this.stageT >= STAGE_TIME) this.beginTransition();
  }

  startPattern() {
    const th = this.theme;
    const pool = this.stage > 8 ? ALL_PATTERNS : th.pool;
    const active = new Set(this.patterns.map((p) => p.n));
    const cand = pool.filter((n) => !active.has(n));
    if (!cand.length) return;
    const n = cand[(Math.random() * cand.length) | 0];
    this.patterns.push({ n, u: PATTERNS[n](this, this.P) });
  }

  updateBullets(dt, check) {
    const bs = this.bullets, p = this.player, pr = PLAYER.r;
    const canHit = check && this.invuln <= 0 && !this.debugInvincible;
    const canGraze = check && this.invuln <= 0;
    let hit = false;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      b.t += dt;
      if (b.turn && b.t < b.tt) {
        const c = Math.cos(b.turn * dt), s = Math.sin(b.turn * dt);
        const nx = b.vx * c - b.vy * s; b.vy = b.vx * s + b.vy * c; b.vx = nx;
      }
      if (b.acc) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        let ns = sp + b.acc * dt; if (b.maxs) ns = Math.min(ns, b.maxs);
        b.vx *= ns / sp; b.vy *= ns / sp;
      }
      let vx = b.vx, vy = b.vy;
      if (b.sw) {
        const sp = Math.hypot(vx, vy) || 1, w = b.sw * Math.cos(b.sf * b.t + b.ph);
        vx = b.vx - b.vy / sp * w; vy = b.vy + b.vx / sp * w;
      }
      b.x += vx * dt; b.y += vy * dt;
      if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40 || b.t > 14) {
        bs[i] = bs[bs.length - 1]; bs.pop(); this.free.push(b);
        continue;
      }
      if (canGraze) {
        const dx = b.x - p.x, dy = b.y - p.y;
        const d2 = dx * dx + dy * dy;
        const hr = BULLET_DEFS[b.type].hr + pr;
        if (d2 < hr * hr) { if (canHit) hit = true; }
        else if (!b.grazed) {
          const gr = hr + PLAYER.grazeR;
          if (d2 < gr * gr) { b.grazed = true; this.onGraze(dx, dy); }
        }
      }
    }
    if (hit) this.onHit();
  }

  onGraze(dx, dy) {
    this.graze++;
    this.score += SCORE.graze * (1 + 0.1 * (this.stage - 1)) * this.diff.mult;
    audio.sfx('graze');
    const p = this.player, a = Math.atan2(dy, dx);
    for (let i = 0; i < 3; i++) {
      const aa = a + rnd(-0.8, 0.8), s = rnd(60, 150);
      this.part(p.x + dx * 0.5, p.y + dy * 0.5, Math.cos(aa) * s, Math.sin(aa) * s, rnd(0.18, 0.35), rnd(6, 10), i ? 55 : -1, 0);
    }
  }

  onHit() {
    const p = this.player;
    this.lives--;
    audio.sfx('hit');
    this.shake = 14; this.flash = 1; this.flashHue = 350;
    this.burst(p.x, p.y, 28, 190, 260, 12);
    this.part(p.x, p.y, 520, 0, 0.55, 8, 350, 1);
    this.emit('lives');
    if (this.lives <= 0) { this.gameOver(); return; }
    audio.sfx('lifeLost');
    this.invuln = PLAYER.invuln;
    const r2 = PLAYER.clearRadius * PLAYER.clearRadius, bs = this.bullets;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i], dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy < r2) {
        this.sparkOf(b, false);
        bs[i] = bs[bs.length - 1]; bs.pop(); this.free.push(b);
      }
    }
  }

  gameOver() {
    const p = this.player;
    this.phase = 'over'; this.overT = 0;
    this.clearAll(true);
    this.burst(p.x, p.y, 90, 190, 420, 16);
    this.part(p.x, p.y, 700, 0, 0.9, 8, 190, 1);
    this.part(p.x, p.y, 380, 0, 1.2, 8, 330, 1);
    p.visible = false;
    this.shake = 20; this.flash = 1; this.flashHue = 350;
    audio.stopBgm();
    audio.sfx('gameOver');
    this.emit('over');
  }

  updateOver(dt) {
    this.overT += dt;
    if (!this.resultSent && this.overT >= 1.5) {
      this.resultSent = true;
      this.emit('result', this.stats());
    }
  }

  stats() {
    const score = Math.floor(this.score);
    return {
      score, rank: rankOf(score), time: this.totalT, stage: this.stage,
      graze: this.graze, diff: this.diff.key,
    };
  }

  // ---- stage transition -------------------------------------------
  beginTransition() {
    this.phase = 'trans'; this.transT = 0; this.tev = {};
    const n = this.bullets.length;
    for (const b of this.bullets) this.sparkOf(b, true);
    for (const b of this.bullets) this.free.push(b);
    this.bullets.length = 0;
    this.patterns.length = 0;
    const mult = this.diff.mult;
    const from = Math.floor(this.score);
    const bonus = Math.round(SCORE.stageBonus * this.stage * mult + n * SCORE.perBullet * mult);
    this.score += bonus;
    const score = Math.floor(this.score);
    const next = themeOf(this.stage + 1);
    this.hueT = next.hue;
    this.flash = 0.8; this.flashHue = 200;
    audio.sfx('stageClear');
    this.transInfo = {
      stage: this.stage, nextStage: this.stage + 1, nextName: next.name, nextEn: next.en,
      from, score, bonus, bullets: n, rank: rankOf(score), time: this.totalT,
    };
  }

  updateTrans(dt) {
    this.transT += dt;
    const t = this.transT;
    this.warp = clamp(t / 0.7, 0, 1) * clamp((TRANS_TIME - 0.15 - t) / 0.8, 0, 1);
    this.movePlayer(dt);
    const ev = this.tev;
    if (!ev.in && t >= 0.4) { ev.in = 1; this.emit('panelIn', this.transInfo); }
    if (!ev.out && t >= 2.65) { ev.out = 1; this.emit('panelOut'); }
    if (!ev.cue && t >= 2.85) {
      ev.cue = 1;
      const i = this.transInfo;
      this.emit('cue', { main: `STAGE ${i.nextStage}`, sub: `${i.nextName}  /  ${i.nextEn}`, ms: 1500 });
    }
    if (t >= TRANS_TIME) {
      this.stage++; this.stageT = 0;
      this.P = this.makeP();
      this.phase = 'play';
      this.invuln = 0.9;
      this.spawnT = 0.9;
      audio.setStage(this.stage);
      this.emit('stage');
    }
  }

  updateParts(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); this.pfree.push(p); continue; }
      switch (p.kind) {
        case 0: {
          const d = 1 - Math.min(1, 2.2 * dt);
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= d; p.vy *= d;
          break;
        }
        case 1: p.size += p.vx * dt; p.vx *= 1 - Math.min(1, 3 * dt); break;
        case 2: {
          if (p.delay > 0) { p.delay -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; break; }
          const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d * 1100 - dy / d * 650) * dt;
          p.vy += (dy / d * 1100 + dx / d * 650) * dt;
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > 760) { p.vx *= 760 / sp; p.vy *= 760 / sp; }
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (d < 14) p.life = 0;
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // render
  // ---------------------------------------------------------------
  render() {
    const ctx = this.ctx, s = this.scale, c = this.canvas;
    const red = this.reduced;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#04050c';
    ctx.fillRect(0, 0, c.width, c.height);

    let ox = 0, oy = 0;
    if (!red && this.shake > 0.15) { ox = (Math.random() - 0.5) * this.shake * s; oy = (Math.random() - 0.5) * this.shake * s; }
    ctx.setTransform(s, 0, 0, s, ox, oy);

    // background: bright on title, very faint in play
    const d = this.dim;
    const starA = (1 - d) * 0.95 + d * 0.15 + this.warp * 0.4;
    const nebA = (1 - d) * 0.8 + d * 0.1;
    this.stars.draw(ctx, starA, this.warp, this.hue, nebA);

    // telegraph marks & rings under bullets
    this.drawParts(ctx, true);

    // bullets
    const bs = this.bullets;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      const spr = getSprite(b.type, b.hue);
      const ty = b.type;
      if (ty < 3) {
        ctx.drawImage(spr.c, b.x - spr.half, b.y - spr.half, spr.size, spr.size);
      } else {
        const a = ty === 5 ? b.t * 3 : Math.atan2(b.vy, b.vx);
        const cs = Math.cos(a) * s, sn = Math.sin(a) * s;
        ctx.setTransform(cs, sn, -sn, cs, b.x * s + ox, b.y * s + oy);
        ctx.drawImage(spr.c, -spr.half, -spr.half, spr.size, spr.size);
      }
    }
    ctx.setTransform(s, 0, 0, s, ox, oy);

    this.drawPlayer(ctx);
    this.drawParts(ctx, false);

    // flash
    if (this.flash > 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `hsla(${this.flashHue},100%,${this.flashHue === 200 ? 85 : 60}%,${this.flash * 0.45 * (red ? 0.25 : 1)})`;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawPlayer(ctx) {
    const p = this.player;
    if (!p.visible) return;
    if (this.phase === 'play' && this.invuln > 0 && ((this.invuln * 14) | 0) % 2) return;
    const fa = p.fa, t = this.time;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalCompositeOperation = 'lighter';
    const g = getDot(190);
    ctx.globalAlpha = 0.55; ctx.drawImage(g.c, -26, -26, 52, 52);
    // engine flame
    const fl = 7 + Math.sin(t * 60) * 2.5 + Math.random() * 2;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#7ff';
    ctx.beginPath(); ctx.moveTo(-3, 7); ctx.lineTo(3, 7); ctx.lineTo(0, 7 + fl); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // body
    const grad = ctx.createLinearGradient(0, -13, 0, 10);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#4fe6ff');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#c9faff'; ctx.lineWidth = 1; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -13); ctx.lineTo(8, 9); ctx.lineTo(0, 4.5); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // focus halo + graze range
    if (fa > 0.02) {
      ctx.globalAlpha = 0.16 * fa;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(0, 0, PLAYER.r + 3.6 + PLAYER.grazeR, 0, PI2); ctx.stroke();
      ctx.globalAlpha = fa;
      ctx.globalCompositeOperation = 'lighter';
      const w = getDot(-1);
      ctx.drawImage(w.c, -13, -13, 26, 26);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ff4d8d'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, PLAYER.r + 4.2 + Math.sin(t * 10) * 0.6, 0, PI2); ctx.stroke();
    }
    // hitbox
    ctx.globalAlpha = 0.8 + 0.2 * fa;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, PLAYER.r + 0.4, 0, PI2); ctx.fill();
    ctx.strokeStyle = '#ff2d7a'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, 0, PLAYER.r + 1.3, 0, PI2); ctx.stroke();
    ctx.restore();
  }

  // pass 1: marks (kind 3) + rings (kind 1); pass 2: sparks
  drawParts(ctx, under) {
    const ps = this.parts;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const isUnder = p.kind === 3;
      if (isUnder !== under) continue;
      const a = p.life / p.max;
      if (p.kind === 3) {
        const r = 6 + 34 * a;
        ctx.globalAlpha = (1 - a) * 0.9 + 0.1;
        ctx.strokeStyle = `hsl(${p.hue},100%,70%)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, PI2); ctx.stroke();
        const d = getDot(p.hue);
        ctx.drawImage(d.c, p.x - 10, p.y - 10, 20, 20);
      } else if (p.kind === 1) {
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = `hsl(${p.hue},100%,75%)`;
        ctx.lineWidth = 2.5 * a + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.size), 0, PI2); ctx.stroke();
      } else {
        const al = p.kind === 2 ? Math.min(1, p.life / 0.35) : a;
        ctx.globalAlpha = al;
        const sz = p.size * (0.55 + 0.45 * al);
        const d = getDot(p.hue);
        ctx.drawImage(d.c, p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------
  // debug helpers
  // ---------------------------------------------------------------
  debugSkip(sec) {
    const prev = this.debugInvincible;
    this.debugInvincible = true;
    const n = Math.round(sec / STEP);
    for (let i = 0; i < n; i++) this.update(STEP);
    this.debugInvincible = prev;
  }
}
