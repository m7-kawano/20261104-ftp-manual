// ゲーム本体：更新ループ・弾・発射源・自機・描画
import {
  DIFFICULTIES, STAGE_DURATION, TRANSITION_DURATION, SCORE_PER_SEC, GRAZE_SCORE,
  paletteFor, stageName, rankFor, levelFor, maxEmitters, stageMult,
} from './config.js';
import { PATTERNS, pickPattern } from './patterns.js';
import { sfx, bgm } from './audio.js';
import { Starfield } from './starfield.js';

const TAU = Math.PI * 2;
const STEP = 1 / 120;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const DIM_PLAY = 0.2;  // プレイ中の背景の明るさ（十分に薄く）
const DIM_MENU = 1;

function hexRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function rgba(rgb, a) { return `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a})`; }

export class Game {
  constructor(canvas, input, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.hooks = hooks;
    this.stars = new Starfield();
    this.bullets = [];
    this.particles = [];
    this.emitters = [];
    this.texts = [];
    this.sprites = new Map();
    this.state = 'idle';
    this.paused = false;
    this.time = 0;
    this.bgDim = DIM_MENU; this.bgDimTarget = DIM_MENU;
    this.warp = 0; this.warpTarget = 0;
    this.shake = 0; this.flash = 0; this.flashColor = '255,255,255';
    this.bulletAlpha = 1;
    this.stage = 1;
    const p = paletteFor(1);
    this.neb = [hexRgb(p.nebula[0]), hexRgb(p.nebula[1])];
    this.nebTarget = [hexRgb(p.nebula[0]), hexRgb(p.nebula[1])];
    this.player = null;
    this.W = 0; this.H = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.last = performance.now();
    this.acc = 0;
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  // ---------------- 画面サイズ ----------------
  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.W && this.H) {
      const sx = W / this.W, sy = H / this.H;
      for (const o of [...this.bullets, ...this.emitters, ...this.particles]) { o.x *= sx; o.y *= sy; }
      for (const e of this.emitters) { e.tx *= sx; e.ty *= sy; }
      if (this.player) { this.player.x *= sx; this.player.y *= sy; }
    }
    this.W = W; this.H = H; this.dpr = dpr;
    this.u = Math.min(W, H) / 600;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.sprites.clear();
  }

  sprite(color, r) {
    const pr = Math.max(1, Math.round(r * this.u * this.dpr));
    const key = color + '|' + pr;
    let c = this.sprites.get(key);
    if (c) return c;
    const R = Math.ceil(pr * 2.2);
    c = document.createElement('canvas');
    c.width = c.height = R * 2;
    const g = c.getContext('2d');
    const rgb = hexRgb(color);
    const grd = g.createRadialGradient(R, R, 0, R, R, R);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop((pr * 0.5) / R, '#ffffff');
    grd.addColorStop((pr * 0.78) / R, color);
    grd.addColorStop((pr * 1.0) / R, rgba(rgb, 0.85));
    grd.addColorStop(Math.min(1, (pr * 1.3) / R), rgba(rgb, 0.28));
    grd.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, R * 2, R * 2);
    c.half = R / this.dpr;
    this.sprites.set(key, c);
    return c;
  }

  // ---------------- 状態遷移 ----------------
  start(diffId) {
    this.diff = DIFFICULTIES[diffId];
    this.score = 0;
    this.stage = 1;
    this.stageTime = 0;
    this.totalTime = 0;
    this.lives = this.diff.lives;
    this.grazes = 0;
    this.hits = 0;
    this.sparkle(this.bullets);
    this.bullets.length = 0;
    for (const e of this.emitters) e.leaving = true;
    this.texts.length = 0;
    this.bulletAlpha = 1;
    this.player = {
      x: this.W / 2, y: this.H * 0.78, inv: 0, visible: true, slow: false,
      vx: 0, tilt: 0, appear: 0,
    };
    this.lv = levelFor(this.diff, 1);
    this.setPalette(1);
    this.spawnCd = 0.4;
    this.rainCd = 1;
    this.state = 'countdown';
    this.cd = 3.2;
    this.cdShown = null;
    this.bgDimTarget = DIM_PLAY;
    this.warpTarget = 0;
    this.input.capture = true;
    this.paused = false;
    this.hooks.onHud?.(this.hud());
  }

  toIdle() {
    this.state = 'idle';
    this.paused = false;
    this.sparkle(this.bullets);
    this.bullets.length = 0;
    for (const e of this.emitters) e.leaving = true;
    this.bgDimTarget = DIM_MENU;
    this.warpTarget = 0;
    this.input.capture = false;
    if (this.player) this.player.visible = false;
    bgm.stop();
  }

  setPaused(p) {
    if (!['countdown', 'play', 'transition'].includes(this.state)) return false;
    if (this.paused === p) return false;
    this.paused = p;
    this.input.capture = !p;
    bgm.duck(p);
    if (p) sfx.pause(); else sfx.resume();
    this.last = performance.now();
    return true;
  }

  get playing() { return ['countdown', 'play', 'transition'].includes(this.state); }

  setPalette(stage) {
    this.palette = paletteFor(stage);
    this.nebTarget = [hexRgb(this.palette.nebula[0]), hexRgb(this.palette.nebula[1])];
  }

  hud() {
    return {
      score: this.score,
      stage: this.stage,
      progress: clamp(this.stageTime / STAGE_DURATION, 0, 1),
      lives: this.lives,
      maxLives: this.diff?.lives ?? 3,
      rank: rankFor(this.score),
      time: this.totalTime,
      grazes: this.grazes,
      state: this.state,
    };
  }

  result() {
    return {
      diff: this.diff,
      score: Math.floor(this.score),
      rank: rankFor(this.score),
      time: this.totalTime,
      stage: this.stage,
      grazes: this.grazes,
    };
  }

  // ---------------- 弾・発射源 ----------------
  shoot(x, y, angle, speed, o = {}) {
    if (this.bullets.length > 1400) return;
    const off = 10 * this.u;
    this.bullets.push({
      x: x + Math.cos(angle) * off,
      y: y + Math.sin(angle) * off,
      angle, speed,
      r: o.r ?? 4,
      color: this.palette.bullets[o.c ?? 0],
      accel: o.accel || 0,
      max: o.max || 999,
      curve: o.curve || 0,
      split: o.split || null,
      age: 0,
      grazed: false,
    });
  }

  aimAt(e) {
    const p = this.player;
    return Math.atan2(p.y - e.y, p.x - e.x);
  }

  shotSound() { sfx.shot(); }

  spawnEmitter() {
    const exclude = this.emitters.filter(e => !e.leaving).map(e => e.pattern);
    const pattern = pickPattern(this.stage, exclude);
    const W = this.W, H = this.H;
    // 既存の発射源と離れた位置を選ぶ
    let tx = 0, ty = 0, best = -1;
    for (let i = 0; i < 8; i++) {
      const cx = rand(W * 0.14, W * 0.86);
      const cy = rand(H * 0.1, H * 0.42);
      let d = Infinity;
      for (const e of this.emitters) if (!e.leaving) d = Math.min(d, Math.hypot(e.tx - cx, e.ty - cy));
      if (this.player) d = Math.min(d, Math.hypot(this.player.x - cx, this.player.y - cy) * 1.4);
      if (d > best) { best = d; tx = cx; ty = cy; }
    }
    const fromSide = Math.random() < 0.3;
    this.emitters.push({
      x: fromSide ? (tx < W / 2 ? -40 : W + 40) : tx,
      y: fromSide ? ty : -50,
      tx, ty,
      age: 0,
      life: rand(6.5, 10),
      pattern,
      s: {},
      fireT: 0,
      leaving: false,
      phase: Math.random() * TAU,
      color: this.palette.bullets[Math.floor(Math.random() * 3)],
      spin: Math.random() < 0.5 ? 1 : -1,
    });
  }

  updateEmitters(dt) {
    const u = this.u;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.age += dt;
      if (!e.leaving) {
        const k = 1 - Math.exp(-dt * 2.4);
        const dx = Math.sin(e.age * 0.7 + e.phase) * 30 * u;
        const dy = Math.cos(e.age * 0.5 + e.phase) * 12 * u;
        e.x += (e.tx + dx - e.x) * k;
        e.y += (e.ty + dy - e.y) * k;
        if (this.state === 'play' && e.age > 1.0) {
          e.fireT -= dt;
          let guard = 0;
          while (e.fireT <= 0 && guard++ < 8) e.fireT += PATTERNS[e.pattern].fire(e, this, this.lv);
        }
        if (e.age > e.life) e.leaving = true;
      } else {
        e.leaveT = (e.leaveT || 0) + dt;
        e.y -= (60 + e.leaveT * 500) * u * dt;
        if (e.y < -80 * u) this.emitters.splice(i, 1);
      }
    }
  }

  updateBullets(dt) {
    const u = this.u, W = this.W, H = this.H, margin = 40 * u;
    const p = this.player;
    const canHit = this.state === 'play' && p && p.visible && p.inv <= 0;
    const hitR = 2.6 * u, grazeR = 17 * u;
    let hit = false;
    const list = this.bullets;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.age += dt;
      if (b.accel) b.speed = Math.min(b.max, b.speed + b.accel * dt);
      if (b.curve) b.angle += b.curve * dt;
      b.x += Math.cos(b.angle) * b.speed * u * dt;
      b.y += Math.sin(b.angle) * b.speed * u * dt;

      if (b.split && b.age >= b.split.t) {
        const s = b.split;
        const off = Math.random() * TAU;
        const pal = this.palette;
        list[i] = list[list.length - 1]; list.pop();
        for (let k = 0; k < s.n; k++) {
          const a = off + (k * TAU) / s.n;
          list.push({ x: b.x, y: b.y, angle: a, speed: s.speed, r: s.r, color: pal.bullets[s.c], accel: 0, max: 999, curve: 0, split: null, age: 0, grazed: false });
        }
        sfx.shot();
        continue;
      }

      if (b.x < -margin || b.x > W + margin || b.y < -margin || b.y > H + margin || b.age > 16) {
        list[i] = list[list.length - 1]; list.pop();
        continue;
      }

      if (p && p.visible && this.state === 'play') {
        const dx = b.x - p.x, dy = b.y - p.y;
        const d2 = dx * dx + dy * dy;
        const br = b.r * u * 0.72;
        if (canHit && d2 < (hitR + br) * (hitR + br)) {
          hit = true;
        } else if (!b.grazed && d2 < (grazeR + br) * (grazeR + br)) {
          b.grazed = true;
          this.grazes++;
          this.score += GRAZE_SCORE * this.diff.scoreMult;
          sfx.graze();
          this.burst(b.x * 0.5 + p.x * 0.5, b.y * 0.5 + p.y * 0.5, 2, '#ffffff', 60, 0.25, 1.2);
        }
      }
    }
    if (hit) this.onHit();
  }

  updateRain(dt) {
    if (this.stage < 3 || this.state !== 'play') return;
    this.rainCd -= dt;
    if (this.rainCd > 0) return;
    const rate = Math.min(4, 0.9 * (this.stage - 2)) * this.diff.density;
    this.rainCd = 1 / rate;
    this.shoot(rand(0, this.W), -12 * this.u, Math.PI / 2 + rand(-0.18, 0.18), rand(65, 105) * this.lv.speed, { r: 3, c: 2 });
  }

  // ---------------- パーティクル ----------------
  burst(x, y, n, color, speed, life, size = 2) {
    if (this.particles.length > 900) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * rand(0.3, 1) * this.u;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size: size * rand(0.6, 1.2), color });
    }
  }

  // 弾を星屑に変えて消す（target 指定時はスコアへ吸い込まれる）
  sparkle(bullets, target) {
    for (const b of bullets) {
      if (this.particles.length > 1200) break;
      const a = Math.random() * TAU;
      const s = rand(20, 90) * this.u;
      this.particles.push({
        x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: target ? rand(1.1, 1.7) : rand(0.4, 0.8), max: 0, size: b.r * 0.6,
        color: b.color, home: target || null, delay: target ? rand(0.15, 0.5) : 0,
      });
      const p = this.particles[this.particles.length - 1];
      p.max = p.life;
    }
  }

  updateParticles(dt) {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) { list[i] = list[list.length - 1]; list.pop(); continue; }
      if (p.home && p.max - p.life > p.delay) {
        const k = 1 - Math.exp(-dt * 5);
        p.x += (p.home.x - p.x) * k;
        p.y += (p.home.y - p.y) * k;
        if (Math.abs(p.home.x - p.x) + Math.abs(p.home.y - p.y) < 12) p.life = Math.min(p.life, 0.05);
      } else {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 1 - dt * 2.2; p.vy *= 1 - dt * 2.2;
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt; t.y -= 24 * this.u * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  // ---------------- 被弾 ----------------
  onHit() {
    const p = this.player;
    this.lives--;
    this.hits++;
    this.burst(p.x, p.y, 40, '#ffffff', 260, 0.7, 2.5);
    this.burst(p.x, p.y, 24, '#ff6b9a', 180, 0.9, 2);
    this.shake = 0.6;
    this.flash = 0.22; this.flashColor = '255,90,140';
    if (this.lives <= 0) {
      this.die();
    } else {
      sfx.hit();
      this.sparkle(this.bullets);
      this.bullets.length = 0;
      p.inv = 2.4;
      this.texts.push({ x: p.x, y: p.y - 26 * this.u, text: `LIFE ${this.lives}`, life: 1.2, max: 1.2, color: '#ff8ab4' });
    }
    this.hooks.onHit?.(this.lives);
  }

  die() {
    const p = this.player;
    this.state = 'dying';
    this.dieT = 0;
    p.visible = false;
    this.burst(p.x, p.y, 120, '#ffffff', 420, 1.4, 3);
    this.burst(p.x, p.y, 60, '#7ce7ff', 260, 1.8, 2.5);
    this.shake = 1;
    this.flash = 0.25; this.flashColor = '255,255,255';
    this.bgDimTarget = 0.45;
    this.input.capture = false;
    sfx.explode();
    bgm.stop(1.2);
  }

  // ---------------- ステージ移動 ----------------
  beginTransition() {
    const mult = this.diff.scoreMult;
    const cleared = this.bullets.length;
    const stageBonus = Math.round(1000 * this.stage * mult);
    const clearBonus = Math.round(cleared * 5 * mult);
    const prevScore = this.score;
    const rankBefore = rankFor(prevScore);
    this.score += stageBonus + clearBonus;
    const anchor = this.hooks.scoreAnchor?.() || { x: 80, y: 40 };
    this.sparkle(this.bullets, anchor);
    this.bullets.length = 0;
    for (const e of this.emitters) e.leaving = true;
    this.state = 'transition';
    this.tt = 0;
    this.warpTarget = 1;
    this.bgDimTarget = 0.75;
    this.player.inv = Math.max(this.player.inv, 0.1);
    sfx.stageClear();
    bgm.filter(900, 0.4);
    this.setPalette(this.stage + 1);
    this.hooks.onStageClear?.({
      stage: this.stage,
      prevScore, score: this.score,
      stageBonus, clearBonus, cleared,
      rankBefore, rank: rankFor(this.score),
      next: this.stage + 1,
      nextName: stageName(this.stage + 1),
      time: this.totalTime,
      lives: this.lives,
      duration: TRANSITION_DURATION,
    });
  }

  endTransition() {
    this.stage++;
    this.stageTime = 0;
    this.lv = levelFor(this.diff, this.stage);
    this.state = 'play';
    this.spawnCd = 0.5;
    this.rainCd = 1.5;
    this.bgDimTarget = DIM_PLAY;
    this.player.inv = Math.max(this.player.inv, 1.0);
    bgm.setStage(this.stage);
    bgm.filter(5200, 0.5);
    this.hooks.onStageStart?.({ stage: this.stage, name: stageName(this.stage) });
  }

  // ---------------- 自機 ----------------
  updatePlayer(dt) {
    const p = this.player;
    if (!p || !p.visible) return;
    const u = this.u;
    const ax = this.input.axis();
    p.slow = ax.slow;
    const px0 = p.x;
    if (ax.x || ax.y) {
      const sp = (ax.slow ? 125 : 290) * u;
      p.x += ax.x * sp * dt;
      p.y += ax.y * sp * dt;
    } else if (this.input.mouseActive && this.input.mouse) {
      const mx = this.input.mouse.x, my = this.input.mouse.y;
      const dx = mx - p.x, dy = my - p.y;
      const d = Math.hypot(dx, dy);
      const maxStep = (ax.slow ? 140 : 560) * u * dt;
      if (d > 0.01) {
        const s = Math.min(d, maxStep, d * (1 - Math.exp(-dt * 22)) + 0.5);
        p.x += (dx / d) * s;
        p.y += (dy / d) * s;
      }
    }
    const t = this.input.takeTouch();
    if (t.x || t.y) {
      p.x += t.x * 1.25;
      p.y += t.y * 1.25;
    }
    const m = 8 * u;
    p.x = clamp(p.x, m, this.W - m);
    p.y = clamp(p.y, m, this.H - m);
    p.vx = (p.x - px0) / dt;
    p.tilt += (clamp(p.vx / (300 * u), -1, 1) - p.tilt) * (1 - Math.exp(-dt * 10));
    if (p.inv > 0) p.inv -= dt;
    p.appear = Math.min(1, p.appear + dt * 2.5);
  }

  // ---------------- メインループ ----------------
  frame(now) {
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 14) { this.update(STEP); this.acc -= STEP; n++; }
      if (n >= 14) this.acc = 0;
    }
    this.render();
  }

  update(dt) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 2.2);
    this.bgDim += (this.bgDimTarget - this.bgDim) * k;
    this.warp += (this.warpTarget - this.warp) * (1 - Math.exp(-dt * 3.2));
    for (let j = 0; j < 2; j++) for (let c = 0; c < 3; c++) {
      this.neb[j][c] += (this.nebTarget[j][c] - this.neb[j][c]) * (1 - Math.exp(-dt * 0.8));
    }
    this.stars.update(dt, 1 + this.warp * 28);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 0.9);

    switch (this.state) {
      case 'countdown': {
        this.updatePlayer(dt);
        this.cd -= dt;
        const n = Math.ceil(this.cd - 0.2);
        if (n !== this.cdShown) {
          this.cdShown = n;
          if (n >= 1 && n <= 3) { this.hooks.onCountdown?.(n); sfx.count(); }
          if (n === 0) {
            this.hooks.onCountdown?.('GO');
            sfx.go();
            bgm.start(1);
            this.state = 'play';
            this.hooks.onStageStart?.({ stage: 1, name: stageName(1), first: true });
          }
        }
        this.updateEmitters(dt);
        this.updateBullets(dt);
        break;
      }
      case 'play': {
        this.updatePlayer(dt);
        this.stageTime += dt;
        this.totalTime += dt;
        this.score += SCORE_PER_SEC * this.diff.scoreMult * stageMult(this.stage) * dt;
        this.spawnCd -= dt;
        const active = this.emitters.filter(e => !e.leaving).length;
        if (this.spawnCd <= 0 && active < maxEmitters(this.diff, this.stage) && this.stageTime < STAGE_DURATION - 3) {
          this.spawnEmitter();
          this.spawnCd = rand(1.6, 3.0) / (1 + 0.08 * this.stage);
        }
        this.updateEmitters(dt);
        this.updateBullets(dt);
        this.updateRain(dt);
        if (this.state === 'play' && this.stageTime >= STAGE_DURATION) this.beginTransition();
        break;
      }
      case 'transition': {
        this.updatePlayer(dt);
        this.tt += dt;
        if (this.tt > TRANSITION_DURATION - 1.1 && this.warpTarget > 0) {
          this.warpTarget = 0;
          sfx.warpOut();
        }
        this.updateEmitters(dt);
        this.updateBullets(dt);
        if (this.tt >= TRANSITION_DURATION) this.endTransition();
        break;
      }
      case 'dying': {
        this.dieT += dt;
        const slow = dt * 0.25;
        this.updateEmitters(slow);
        this.updateBullets(slow);
        if (this.dieT > 1.7) {
          this.state = 'over';
          for (const e of this.emitters) e.leaving = true;
          sfx.gameOver();
          this.hooks.onGameOver?.(this.result());
        }
        break;
      }
      case 'over': {
        this.updateEmitters(dt * 0.5);
        this.updateBullets(dt * 0.3);
        this.bulletAlpha = Math.max(0, this.bulletAlpha - dt * 0.7);
        if (this.bulletAlpha <= 0 && this.bullets.length) this.bullets.length = 0;
        break;
      }
      default:
        this.updateEmitters(dt);
        this.updateBullets(dt);
    }
    if (this.state !== 'over' && this.state !== 'dying') this.bulletAlpha = 1;
    this.updateParticles(this.state === 'dying' ? dt * 0.5 : dt);
    if (this.state !== 'idle' && this.diff) this.hooks.onHud?.(this.hud());
  }

  // ---------------- 描画 ----------------
  render() {
    const ctx = this.ctx, W = this.W, H = this.H, u = this.u, t = this.time;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#03040b';
    ctx.fillRect(0, 0, W, H);

    // 星雲（ごく薄く）
    const nebA = 0.16 * this.bgDim + 0.08 * this.warp;
    if (nebA > 0.003) {
      const r = Math.max(W, H) * 0.75;
      const x1 = W * (0.25 + 0.08 * Math.sin(t * 0.05)), y1 = H * (0.3 + 0.06 * Math.cos(t * 0.04));
      let g = ctx.createRadialGradient(x1, y1, 0, x1, y1, r);
      g.addColorStop(0, rgba(this.neb[0], nebA));
      g.addColorStop(1, rgba(this.neb[0], 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const x2 = W * (0.78 + 0.06 * Math.cos(t * 0.045)), y2 = H * (0.72 + 0.05 * Math.sin(t * 0.06));
      g = ctx.createRadialGradient(x2, y2, 0, x2, y2, r * 0.8);
      g.addColorStop(0, rgba(this.neb[1], nebA * 0.8));
      g.addColorStop(1, rgba(this.neb[1], 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    this.stars.draw(ctx, W, H, 0.85 * this.bgDim + 0.3 * this.warp, this.warp, t);

    ctx.save();
    if (this.shake > 0) {
      const s = this.shake * this.shake * 10 * u;
      ctx.translate(rand(-s, s), rand(-s, s));
    }

    // 発射源（星核）
    for (const e of this.emitters) this.drawEmitter(ctx, e);

    // パーティクル（加算合成）
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      const spr = this.sprite(p.color, Math.max(1, p.size));
      const h = spr.half * (0.6 + 0.4 * a);
      ctx.drawImage(spr, p.x - h, p.y - h, h * 2, h * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // 弾
    const ba = this.bulletAlpha;
    for (const b of this.bullets) {
      const spr = this.sprite(b.color, b.r);
      let h = spr.half;
      let a = ba;
      if (b.age < 0.12) { const k = b.age / 0.12; a *= k; h *= 1.6 - 0.6 * k; }
      if (b.split) h *= 1 + 0.12 * Math.sin(b.age * 18);
      ctx.globalAlpha = a;
      ctx.drawImage(spr, b.x - h, b.y - h, h * 2, h * 2);
    }
    ctx.globalAlpha = 1;

    this.drawPlayer(ctx);

    // フローティングテキスト
    if (this.texts.length) {
      ctx.textAlign = 'center';
      ctx.font = `700 ${Math.round(13 * Math.max(1, u))}px Orbitron, sans-serif`;
      for (const tx of this.texts) {
        ctx.globalAlpha = clamp(tx.life / tx.max, 0, 1);
        ctx.fillStyle = tx.color;
        ctx.fillText(tx.text, tx.x, tx.y);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawEmitter(ctx, e) {
    const u = this.u;
    const t = this.time;
    const appear = clamp(e.age / 0.6, 0, 1);
    const charge = clamp(e.age / 1.0, 0, 1);
    const R = 14 * u * appear;
    ctx.save();
    ctx.translate(e.x, e.y);
    // 発射前の予告リング
    if (charge < 1 && !e.leaving) {
      ctx.globalAlpha = 0.5 * charge;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, (1 - charge) * 50 * u + R, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.75;
    const spr = this.sprite(e.color, 9);
    const h = spr.half * appear * (1 + 0.08 * Math.sin(t * 6 + e.phase));
    ctx.drawImage(spr, -h, -h, h * 2, h * 2);
    // 4 方向に光る星形
    ctx.rotate(t * 0.8 * e.spin + e.phase);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = e.color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8;
      const rr = i % 2 === 0 ? R * 1.6 : R * 0.35;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawPlayer(ctx) {
    const p = this.player;
    if (!p || !p.visible) return;
    const u = this.u, t = this.time;
    if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) ctx.globalAlpha = 0.35;
    else ctx.globalAlpha = 1;
    ctx.globalAlpha *= p.appear;
    ctx.save();
    ctx.translate(p.x, p.y);

    // かすり判定範囲（低速時のみ薄く表示）
    if (p.slow) {
      ctx.save();
      ctx.globalAlpha *= 0.35;
      ctx.strokeStyle = '#7ce7ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.rotate(t * 1.5);
      ctx.beginPath();
      ctx.arc(0, 0, 17 * u, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // エンジン炎
    const fl = 0.7 + 0.3 * Math.sin(t * 40);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createLinearGradient(0, 6 * u, 0, (14 + 6 * fl) * u);
    fg.addColorStop(0, 'rgba(124,231,255,0.9)');
    fg.addColorStop(1, 'rgba(124,231,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-3 * u, 6 * u);
    ctx.lineTo(3 * u, 6 * u);
    ctx.lineTo(0, (14 + 6 * fl) * u);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 機体
    const sx = 1 - Math.abs(p.tilt) * 0.25;
    ctx.save();
    ctx.scale(sx, 1);
    ctx.shadowColor = '#7ce7ff';
    ctx.shadowBlur = 10 * u;
    ctx.fillStyle = '#0b1a2e';
    ctx.strokeStyle = '#9ff0ff';
    ctx.lineWidth = 1.6 * Math.max(1, u * 0.8);
    ctx.beginPath();
    ctx.moveTo(0, -12 * u);
    ctx.lineTo(9 * u, 8 * u);
    ctx.lineTo(0, 4 * u);
    ctx.lineTo(-9 * u, 8 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 当たり判定（常に表示）
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ff5fa2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 2.6 * u + 1, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
