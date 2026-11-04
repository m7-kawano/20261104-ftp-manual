// UI と画面遷移の制御
import { DIFFICULTIES, nextRank } from './config.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { initAudio, sfx, isMuted, setMuted } from './audio.js';

const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('en-US');
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------- ベストスコア ----------------
const BEST_KEY = 'stardust.best.v1';
function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch { return {}; }
}
function saveBest(b) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}
let best = loadBest();

// ---------------- 画面管理 ----------------
const screens = {
  title: $('screen-title'),
  difficulty: $('screen-difficulty'),
  pause: $('screen-pause'),
  result: $('screen-result'),
};
let current = 'title';

function show(name, focusSel) {
  for (const [k, el] of Object.entries(screens)) {
    el.classList.toggle('active', k === name);
    el.setAttribute('aria-hidden', k === name ? 'false' : 'true');
  }
  current = name;
  if (name) {
    const el = screens[name];
    const target = (focusSel && el.querySelector(focusSel)) || el.querySelector('[data-nav]');
    setTimeout(() => { if (current === name) target?.focus({ preventScroll: true }); }, 180);
  } else if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
}

const hud = $('hud');
function showHud(on) { hud.classList.toggle('show', on); }
function setPlaying(on) { document.body.classList.toggle('playing', on); }

// ---------------- 難易度カード ----------------
const diffList = $('diff-list');
function renderDiffCards() {
  diffList.innerHTML = '';
  for (const d of Object.values(DIFFICULTIES)) {
    const b = best[d.id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'diff-card';
    card.dataset.diff = d.id;
    card.dataset.nav = '';
    card.innerHTML = `
      <span class="diff-ja">${d.label}</span>
      <span class="diff-en">${d.en}</span>
      <span class="diff-desc">${d.desc}</span>
      <span class="diff-meta">SCORE ×${d.scoreMult.toFixed(1)} · LIFE ${d.lives}</span>
      <span class="diff-best"><span>BEST <b>${b ? fmt(b.score) : '—'}</b></span><span class="r">${b ? b.rank : ''}</span></span>`;
    card.addEventListener('click', () => chooseDifficulty(d.id, card));
    diffList.appendChild(card);
  }
}
renderDiffCards();

// ---------------- HUD ----------------
const el = {
  score: $('hud-score'), stage: $('hud-stage'), bar: $('hud-bar'), rank: $('hud-rank'),
  lives: $('hud-lives'), diff: $('hud-diff'), time: $('hud-time'),
};
const hudCache = {};
function setText(key, node, v) {
  if (hudCache[key] === v) return;
  hudCache[key] = v;
  node.textContent = v;
}
function renderLives(lives, max) {
  const k = `${lives}/${max}`;
  if (hudCache.lives === k) return;
  hudCache.lives = k;
  if (el.lives.children.length !== max) {
    el.lives.innerHTML = '';
    for (let i = 0; i < max; i++) el.lives.appendChild(document.createElement('i'));
  }
  [...el.lives.children].forEach((n, i) => n.classList.toggle('lost', i >= lives));
}
function setRankEl(node, rank, pop) {
  node.textContent = rank.id;
  node.style.setProperty('--rc', rank.color);
  if (pop) {
    node.classList.remove('pop', 'up');
    void node.offsetWidth;
    node.classList.add(node.id === 'hud-rank' ? 'pop' : 'up');
  }
}
function bump(node) {
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

// ---------------- カウントダウン / バナー ----------------
const cdEl = $('countdown');
function countdown(n) {
  cdEl.innerHTML = '';
  const s = document.createElement('span');
  s.textContent = n;
  if (n === 'GO') s.className = 'go';
  cdEl.appendChild(s);
}
const bannerEl = $('stage-banner');
function banner(stage, name) {
  bannerEl.innerHTML = `<div class="b"><span class="b1">STAGE ${stage}</span><span class="b2">${name}</span></div>`;
}

// ---------------- ステージ移動演出 ----------------
const so = {
  root: $('stage-overlay'), stage: $('so-stage'), score: $('so-score'), bonus: $('so-bonus'),
  rank: $('so-rank'), next: $('so-next'), hint: $('so-hint'),
};
let soTimers = [];
let numAnim = 0;
function animateNumber(node, from, to, dur, prefix = '') {
  const id = ++numAnim;
  node._anim = id;
  const t0 = performance.now();
  const stepFn = now => {
    if (node._anim !== id) return;
    const k = Math.min(1, (now - t0) / (dur * 1000));
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = prefix + fmt(from + (to - from) * e);
    if (k < 1) { sfx.tick(); requestAnimationFrame(stepFn); }
  };
  requestAnimationFrame(stepFn);
}
function clearSoTimers() { soTimers.forEach(clearTimeout); soTimers = []; }

function stageClear(info) {
  clearSoTimers();
  so.stage.textContent = `STAGE ${info.stage}`;
  so.score.textContent = fmt(info.prevScore);
  so.bonus.textContent = '+0';
  setRankEl(so.rank, info.rankBefore, false);
  so.next.textContent = `NEXT ▸ STAGE ${info.next} — ${info.nextName}`;
  const nr = nextRank(info.score);
  so.hint.textContent = nr ? `NEXT RANK ${nr.id} まで ${fmt(nr.min - info.score)}` : 'MAX RANK 到達！';
  so.root.classList.remove('hide');
  so.root.classList.add('show');
  hud.classList.add('dim');
  const total = info.stageBonus + info.clearBonus;
  soTimers.push(setTimeout(() => {
    animateNumber(so.bonus, 0, total, 0.7, '+');
    animateNumber(so.score, info.prevScore, info.score, 1.1);
  }, 650));
  soTimers.push(setTimeout(() => {
    setRankEl(so.rank, info.rank, info.rank.id !== info.rankBefore.id);
    if (info.rank.id !== info.rankBefore.id) sfx.rankUp();
  }, 1700));
  soTimers.push(setTimeout(() => {
    so.root.classList.add('hide');
    hud.classList.remove('dim');
  }, (info.duration - 0.75) * 1000));
  soTimers.push(setTimeout(() => {
    so.root.classList.remove('show', 'hide');
  }, (info.duration - 0.2) * 1000));
}
function hideStageOverlay() {
  clearSoTimers();
  so.root.classList.remove('show', 'hide');
  hud.classList.remove('dim');
}

// ---------------- リザルト ----------------
const res = {
  rank: $('res-rank'), score: $('res-score'), diff: $('res-diff'), time: $('res-time'),
  stage: $('res-stage'), graze: $('res-graze'), best: $('res-best'), record: $('res-record'),
};
let resultTimers = [];
function gameOver(r) {
  setPlaying(false);
  hideStageOverlay();
  const prev = best[r.diff.id];
  const isRecord = !prev || r.score > prev.score;
  if (isRecord) {
    best[r.diff.id] = { score: r.score, rank: r.rank.id, time: Math.floor(r.time), stage: r.stage };
    saveBest(best);
    renderDiffCards();
  }
  res.rank.classList.remove('reveal');
  res.rank.textContent = r.rank.id;
  res.rank.style.setProperty('--rc', r.rank.color);
  res.score.textContent = '0';
  res.diff.textContent = `${r.diff.label}（×${r.diff.scoreMult.toFixed(1)}）`;
  res.time.textContent = fmtTime(r.time);
  res.stage.textContent = r.stage;
  res.graze.textContent = fmt(r.grazes);
  res.best.textContent = fmt(Math.max(r.score, prev?.score || 0));
  res.record.classList.remove('show');
  resultTimers.forEach(clearTimeout);
  resultTimers = [];
  setTimeout(() => {
    showHud(false);
    show('result', '#btn-retry');
    resultTimers.push(setTimeout(() => animateNumber(res.score, 0, r.score, 1.2), 500));
    resultTimers.push(setTimeout(() => { res.rank.classList.add('reveal'); sfx.rank(r.rank.id); }, 1800));
    if (isRecord && r.score > 0) resultTimers.push(setTimeout(() => { res.record.classList.add('show'); sfx.record(); }, 2700));
  }, 300);
}

// ---------------- ゲーム ----------------
const canvas = $('game');
const input = new Input(canvas);
let scoreAnchor = null;
const game = new Game(canvas, input, {
  onHud(h) {
    setText('score', el.score, fmt(h.score));
    setText('stage', el.stage, String(h.stage));
    setText('time', el.time, fmtTime(h.time));
    el.bar.style.transform = `scaleX(${h.progress.toFixed(3)})`;
    renderLives(h.lives, h.maxLives);
    if (hudCache.rank !== h.rank.id) {
      const pop = hudCache.rank !== undefined && h.state !== 'countdown';
      hudCache.rank = h.rank.id;
      setRankEl(el.rank, h.rank, pop);
    }
  },
  onCountdown: n => countdown(n),
  onStageStart(info) { banner(info.stage, info.name); },
  onStageClear(info) { stageClear(info); bump(el.score); },
  onHit() { bump(el.score); },
  onGameOver: r => gameOver(r),
  scoreAnchor() {
    const r = el.score.getBoundingClientRect();
    scoreAnchor = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    return scoreAnchor;
  },
});
if (new URLSearchParams(location.search).has('debug')) window.__game = game;

let lastDiff = 'normal';
function startGame(diffId) {
  lastDiff = diffId;
  resultTimers.forEach(clearTimeout);
  hideStageOverlay();
  for (const k of Object.keys(hudCache)) delete hudCache[k];
  el.diff.textContent = DIFFICULTIES[diffId].en;
  show(null);
  showHud(true);
  setPlaying(true);
  $('curtain').classList.remove('pulse');
  void $('curtain').offsetWidth;
  $('curtain').classList.add('pulse');
  sfx.start();
  game.start(diffId);
}

function chooseDifficulty(id, card) {
  initAudio();
  card.classList.add('chosen');
  sfx.select();
  setTimeout(() => { card.classList.remove('chosen'); startGame(id); }, 380);
}

function toTitle() {
  game.toIdle();
  hideStageOverlay();
  showHud(false);
  setPlaying(false);
  cdEl.innerHTML = '';
  bannerEl.innerHTML = '';
  show('title', '#btn-start');
}

function pause(on) {
  if (!game.setPaused(on)) return;
  if (on) {
    setPlaying(false);
    show('pause', '#btn-resume');
    hud.classList.add('dim');
  } else {
    show(null);
    setPlaying(true);
    if (!so.root.classList.contains('show')) hud.classList.remove('dim');
  }
}

// ---------------- ボタン ----------------
const on = (id, fn) => $(id).addEventListener('click', fn);
on('btn-start', () => { initAudio(); sfx.select(); show('difficulty', `.diff-card[data-diff="${lastDiff}"]`); });
on('btn-diff-back', () => { sfx.back(); show('title', '#btn-start'); });
on('btn-resume', () => pause(false));
on('btn-pause-retry', () => { game.paused = false; sfx.select(); startGame(lastDiff); });
on('btn-pause-title', () => { game.paused = false; sfx.back(); toTitle(); });
on('btn-retry', () => { sfx.select(); startGame(lastDiff); });
on('btn-res-diff', () => { sfx.select(); game.toIdle(); show('difficulty', `.diff-card[data-diff="${lastDiff}"]`); });
on('btn-res-title', () => { sfx.back(); toTitle(); });
on('btn-pause', () => pause(true));

const muteBtn = $('btn-mute');
function syncMute() { muteBtn.classList.toggle('muted', isMuted()); }
syncMute();
muteBtn.addEventListener('click', () => { initAudio(); setMuted(!isMuted()); syncMute(); muteBtn.blur(); });

// ホバー・フォーカス音
document.addEventListener('pointerover', e => {
  const b = e.target.closest?.('[data-nav]');
  if (b && b !== document.activeElement && current) { b.focus({ preventScroll: true }); sfx.hover(); }
});

// 最初の操作でオーディオを有効化
['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, initAudio, { passive: true }));

// ---------------- キーボード操作（メニュー） ----------------
window.addEventListener('keydown', e => {
  if (e.code === 'KeyM') { initAudio(); setMuted(!isMuted()); syncMute(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (current === 'pause') { pause(false); return; }
    if (!current && game.playing) { pause(true); return; }
    if (current === 'difficulty' && e.code === 'Escape') { sfx.back(); show('title', '#btn-start'); return; }
  }
  if (!current) return;
  const scr = screens[current];
  const items = [...scr.querySelectorAll('[data-nav]')];
  if (!items.length) return;
  const idx = items.indexOf(document.activeElement);
  const dirs = { ArrowDown: 1, ArrowRight: 1, KeyS: 1, KeyD: 1, ArrowUp: -1, ArrowLeft: -1, KeyW: -1, KeyA: -1 };
  if (dirs[e.code]) {
    e.preventDefault();
    const n = idx < 0 ? 0 : (idx + dirs[e.code] + items.length) % items.length;
    items[n].focus({ preventScroll: true });
    sfx.hover();
  } else if ((e.code === 'Enter' || e.code === 'Space') && idx < 0) {
    e.preventDefault();
    items[0].click();
  }
});

// タブ非表示・フォーカス喪失時は自動ポーズ
document.addEventListener('visibilitychange', () => { if (document.hidden && game.playing && !current) pause(true); });
window.addEventListener('blur', () => { if (game.playing && !current) pause(true); });

