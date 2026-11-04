import { W, H, STEP } from './config.js';
import { Game } from './game.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { initUI } from './ui.js';

const canvas = document.getElementById('cv');
const stage = document.getElementById('stage');
const game = new Game(canvas);
input.attach(canvas);
const ui = initUI(game);

function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.floor(Math.min(vw, vh * (W / H)));
  const h = Math.floor(w * (H / W));
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  stage.style.setProperty('--u', String(w / W));
  input.cssPerUnit = w / W;
  game.resize(w, h, Math.min(window.devicePixelRatio || 1, 2.5));
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// fixed-timestep loop (120 Hz), independent of display refresh rate
let last = performance.now();
let acc = 0;
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  acc += dt;
  while (acc >= STEP) { game.update(STEP); acc -= STEP; }
  game.render();
  ui.updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).get('debug') === '1') {
  window.__game = { game, ui, audio, input };
}
