import { STAGE_TIME, DIFFS, RANK_COLORS, rankOf, nextRank } from './config.js';
import { audio } from './audio.js';
import { input } from './input.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const BEST_KEY = 'sd_best_v1';

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (_) { return {}; }
}
function saveBest(b) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (_) { /* ignore */ }
}

export function initUI(game) {
  const app = $('app');
  const screens = { title: $('title'), select: $('select'), pause: $('pause'), result: $('result'), sc: $('stageclear') };
  const cue = $('cue');
  let state = 'title';             // title | select | play | pause | result
  let lastDiff = 'normal';
  let best = loadBest();
  let quiet = false;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  let counters = [];

  const show = (id) => screens[id].classList.add('on');
  const hide = (id) => screens[id].classList.remove('on');
  const focusDefault = (id) => {
    const el = screens[id].querySelector('[data-default]') || screens[id].querySelector('button');
    if (!el) return;
    quiet = true; el.focus({ preventScroll: true }); quiet = false;
  };
  const swap = (fromId, toId, nextState) => {
    state = nextState;
    hide(fromId);
    later(() => { show(toId); focusDefault(toId); }, 230);
  };

  // ---- helpers --------------------------------------------------
  function countUp(el, from, to, ms, delay = 0, fmtFn = fmt) {
    el.textContent = fmtFn(from);
    let cancelled = false;
    const t0 = performance.now() + delay;
    const step = (now) => {
      if (cancelled) return;
      const k = Math.min(1, Math.max(0, (now - t0) / ms));
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtFn(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    const c = () => { cancelled = true; };
    counters.push(c);
    return c;
  }
  const stopCounters = () => { counters.forEach((c) => c()); counters = []; };

  function pop(el, rank) {
    el.textContent = rank;
    el.style.setProperty('--rc', RANK_COLORS[rank]);
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  function resetPop(el) { el.classList.remove('pop'); el.style.opacity = '0'; void el.offsetWidth; el.style.opacity = ''; }

  function showCue(main, sub, ms) {
    cue.querySelector('.cue-main').textContent = main;
    cue.querySelector('.cue-sub').textContent = sub || '';
    cue.style.setProperty('--cue-ms', ms + 'ms');
    cue.classList.remove('go'); void cue.offsetWidth; cue.classList.add('go');
  }
  const hideCue = () => cue.classList.remove('go');

  function refreshBests() {
    document.querySelectorAll('[data-best]').forEach((el) => {
      const v = best[el.dataset.best];
      el.textContent = v ? fmt(v) : '---';
    });
  }

  function buildLives() {
    const box = $('h-lives');
    box.textContent = '';
    for (let i = 0; i < game.maxLives; i++) {
      const el = document.createElement('i');
      if (i >= game.lives) el.className = 'off';
      box.appendChild(el);
    }
  }

  // ---- flow ------------------------------------------------------
  function startGame(diff) {
    lastDiff = diff;
    audio.unlock();
    audio.sfx('start');
    clearTimers(); stopCounters();
    hide('select'); hide('result'); hide('sc');
    state = 'play';
    app.classList.remove('st-title', 'paused');
    app.classList.add('playing');
    $('h-diff').textContent = DIFFS[diff].en;
    $('h-score').textContent = '0';
    last.score = -1; last.rank = ''; last.stage = 0; last.time = -1;
    input.reset();
    audio.startBgm(1);
    audio.setStage(1);
    audio.duck(false);
    game.start(diff);
    buildLives();
  }

  function toTitle(fromId) {
    clearTimers(); stopCounters();
    hide('sc'); hide('pause'); hide('result');
    hideCue();
    game.toIdle();
    app.classList.remove('playing', 'paused');
    app.classList.add('st-title');
    audio.duck(false);
    audio.setStage(0);
    audio.startBgm(0);
    state = 'title';
    later(() => { show('title'); focusDefault('title'); }, 260);
  }

  function toSelect(fromId) {
    clearTimers(); stopCounters();
    hide('sc'); hide('pause'); hide('result');
    hideCue();
    game.toIdle();
    app.classList.remove('playing', 'paused');
    app.classList.add('st-title');
    audio.duck(false); audio.setStage(0); audio.startBgm(0);
    refreshBests();
    state = 'select';
    later(() => { show('select'); focusDefault('select'); }, 260);
  }

  function pause() {
    if (state !== 'play' || !game.active || game.paused) return;
    game.paused = true;
    state = 'pause';
    app.classList.add('paused');
    audio.duck(true);
    audio.sfx('pause');
    input.reset();
    show('pause'); focusDefault('pause');
  }
  function resume() {
    if (state !== 'pause') return;
    hide('pause');
    state = 'play';
    game.paused = false;
    app.classList.remove('paused');
    audio.duck(false);
    audio.sfx('resume');
    input.reset();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  // ---- HUD -------------------------------------------------------
  const last = { score: -1, rank: '', stage: 0, time: -1, bar: -1 };
  const hScore = $('h-score'), hRank = $('h-rank'), hStage = $('h-stage'), hTime = $('h-time'), hBar = $('h-bar').firstElementChild;
  function updateHud() {
    if (!(game.active || game.phase === 'over')) return;
    const sc = Math.floor(game.score);
    if (sc !== last.score) {
      last.score = sc; hScore.textContent = fmt(sc);
      const r = rankOf(sc);
      if (r !== last.rank) { last.rank = r; hRank.textContent = r; hRank.style.setProperty('--rc', RANK_COLORS[r]); }
    }
    if (game.stage !== last.stage) { last.stage = game.stage; hStage.textContent = `STAGE ${game.stage}`; }
    const t = Math.floor(game.totalT);
    if (t !== last.time) { last.time = t; hTime.textContent = fmtTime(t); }
    const bar = game.phase === 'trans' ? 1 : Math.min(1, game.stageT / STAGE_TIME);
    if (Math.abs(bar - last.bar) > 0.002) { last.bar = bar; hBar.style.transform = `scaleX(${bar})`; }
  }

  // ---- game events ----------------------------------------------
  game.on('cue', (c) => showCue(c.main, c.sub, c.ms));
  game.on('lives', buildLives);
  game.on('over', () => { app.classList.remove('playing'); });
  game.on('panelIn', (i) => {
    const sc = screens.sc;
    $('sc-n').textContent = i.stage;
    $('sc-next').textContent = `STAGE ${i.nextStage}  ${i.nextName}`;
    $('sc-bonus').textContent = '+' + fmt(i.bonus);
    $('sc-time').textContent = fmtTime(i.time);
    const rk = $('sc-rank');
    resetPop(rk); rk.textContent = i.rank; rk.style.setProperty('--rc', RANK_COLORS[i.rank]);
    sc.classList.remove('out'); sc.classList.add('on');
    countUp($('sc-score'), i.from, i.score, 1000, 450);
    later(() => { pop(rk, i.rank); audio.sfx('rank'); }, 1250);
  });
  game.on('panelOut', () => {
    const sc = screens.sc;
    sc.classList.add('out'); sc.classList.remove('on');
    later(() => sc.classList.remove('out'), 800);
  });
  game.on('result', (st) => showResult(st));

  function showResult(st) {
    const prev = best[st.diff] || 0;
    const isNew = st.score > 0 && st.score > prev;
    if (isNew) { best[st.diff] = st.score; saveBest(best); }
    state = 'result';
    $('r-time').textContent = fmtTime(st.time);
    $('r-stage').textContent = st.stage;
    $('r-graze').textContent = fmt(st.graze);
    $('r-diff').textContent = DIFFS[st.diff].en;
    $('r-best').textContent = fmt(Math.max(prev, st.score));
    const nx = nextRank(st.score);
    $('r-next').textContent = nx ? `次のランク ${nx.rank} まであと ${fmt(nx.need)} pt` : 'RANK S 達成!';
    const badge = $('r-new');
    badge.classList.remove('show');
    resetPop($('r-rank'));
    $('r-rank').textContent = st.rank;
    $('r-rank').style.setProperty('--rc', RANK_COLORS[st.rank]);
    refreshBests();
    show('result');
    focusDefault('result');
    stopCounters();
    countUp($('r-score'), 0, st.score, 1400, 450);
    later(() => { pop($('r-rank'), st.rank); audio.sfx('rank'); }, 1700);
    if (isNew) later(() => { badge.classList.add('show'); audio.sfx('newRecord'); }, 2500);
  }

  // ---- buttons & keys -------------------------------------------
  $('btn-start').addEventListener('click', () => { audio.unlock(); audio.sfx('select'); refreshBests(); swap('title', 'select', 'select'); });
  $('btn-select-back').addEventListener('click', () => { audio.sfx('back'); swap('select', 'title', 'title'); });
  document.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => startGame(c.dataset.diff)));
  $('btn-pause').addEventListener('click', () => (state === 'pause' ? resume() : pause()));
  $('btn-resume').addEventListener('click', resume);
  $('btn-pause-title').addEventListener('click', () => { audio.sfx('back'); toTitle(); });
  $('btn-retry').addEventListener('click', () => { startGame(lastDiff); });
  $('btn-res-select').addEventListener('click', () => { audio.sfx('select'); toSelect(); });
  $('btn-res-title').addEventListener('click', () => { audio.sfx('back'); toTitle(); });

  const muteBtn = $('btn-mute');
  const syncMute = () => app.classList.toggle('muted', audio.muted);
  audio.onMuteChange = syncMute; syncMute();
  muteBtn.addEventListener('click', () => { audio.unlock(); audio.toggleMute(); muteBtn.blur(); });

  const focusBtn = $('btn-focus');
  focusBtn.addEventListener('click', () => {
    input.touchFocus = !input.touchFocus;
    focusBtn.setAttribute('aria-pressed', String(input.touchFocus));
    focusBtn.blur();
  });

  // hover / focus sounds
  document.querySelectorAll('.btn, .card, .icon-btn').forEach((el) => {
    el.addEventListener('mouseenter', () => audio.sfx('hover'));
    el.addEventListener('focus', () => { if (!quiet) audio.sfx('hover'); });
  });

  const menuScreen = () => ({ title: screens.title, select: screens.select, pause: screens.pause, result: screens.result }[state] || null);
  window.addEventListener('keydown', (e) => {
    const scr = menuScreen();
    if (!scr) return;
    const btns = [...scr.querySelectorAll('button')];
    const k = e.code;
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(k)) {
      e.preventDefault();
      const dir = (k === 'ArrowDown' || k === 'ArrowRight' || k === 'KeyS' || k === 'KeyD') ? 1 : -1;
      let i = btns.indexOf(document.activeElement);
      i = i < 0 ? 0 : (i + dir + btns.length) % btns.length;
      btns[i].focus({ preventScroll: true });
    } else if (k === 'Enter' || k === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      audio.unlock();
      const t = btns.includes(document.activeElement) ? document.activeElement : (scr.querySelector('[data-default]') || btns[0]);
      t && t.click();
    }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') { if (menuScreen()) e.preventDefault(); } });

  input.onPause = () => {
    audio.unlock();
    if (state === 'play') pause();
    else if (state === 'pause') resume();
    else if (state === 'select') { audio.sfx('back'); swap('select', 'title', 'title'); }
  };
  input.onMute = () => { audio.unlock(); audio.toggleMute(); };

  // auto pause
  const autoPause = () => { if (state === 'play') pause(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
  window.addEventListener('blur', autoPause);

  // unlock audio on first gesture and start the menu BGM
  const unlock = () => {
    audio.unlock();
    if (audio.ctx && audio.ctx.state === 'running' && !audio.bgmOn && (state === 'title' || state === 'select')) {
      audio.setStage(0); audio.startBgm(0);
    }
  };
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));

  refreshBests();
  later(() => focusDefault('title'), 400);

  return { updateHud, pause, resume, startGame, get state() { return state; } };
}
