// ゲーム全体の設定値
export const STAGE_DURATION = 30;        // 1ステージの長さ（秒）
export const TRANSITION_DURATION = 3.8;  // ステージ移動演出の長さ（秒）
export const SCORE_PER_SEC = 100;        // 生存1秒あたりの基本スコア
export const GRAZE_SCORE = 20;           // かすり1回あたりの基本スコア

export const DIFFICULTIES = {
  easy: {
    id: 'easy', label: '簡単', en: 'EASY',
    desc: '弾はゆっくり、密度も控えめ。まずはここから。',
    scoreMult: 1.0, speed: 0.72, density: 0.6, rate: 0.72, emit: 0, lives: 3,
  },
  normal: {
    id: 'normal', label: '普通', en: 'NORMAL',
    desc: '星屑の海に慣れたら。標準的な弾幕。',
    scoreMult: 1.6, speed: 1.0, density: 1.0, rate: 1.0, emit: 0.3, lives: 3,
  },
  hard: {
    id: 'hard', label: '難しい', en: 'HARD',
    desc: '高速・高密度。見切りと度胸が試される。',
    scoreMult: 2.5, speed: 1.22, density: 1.4, rate: 1.28, emit: 0.8, lives: 2,
  },
};

// スコアしきい値（上から判定）
export const RANKS = [
  { id: 'S', min: 150000, color: '#ffe066' },
  { id: 'A', min: 80000, color: '#ff8ad8' },
  { id: 'B', min: 40000, color: '#8ab4ff' },
  { id: 'C', min: 18000, color: '#7dffcf' },
  { id: 'D', min: 7000, color: '#c9d2ff' },
  { id: 'E', min: 2000, color: '#a3a9c9' },
  { id: 'F', min: 0, color: '#7a7f99' },
];

export function rankFor(score) {
  return RANKS.find(r => score >= r.min) || RANKS[RANKS.length - 1];
}

export function nextRank(score) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (RANKS[i].min > score) return RANKS[i];
  }
  return null;
}

// ステージごとの配色（弾は暗い背景に対して高コントラストな色）
export const PALETTES = [
  { name: 'ORION BELT', bullets: ['#ff5fa2', '#5fd4ff', '#ffd35f'], nebula: ['#2b3cff', '#7a2bff'] },
  { name: 'NEBULA DRIFT', bullets: ['#c77dff', '#7dffcf', '#ff9f5f'], nebula: ['#8a2bff', '#ff2b9a'] },
  { name: 'COMET LANE', bullets: ['#5fffb0', '#ff6b6b', '#8fb4ff'], nebula: ['#00a38c', '#2b6bff'] },
  { name: 'PULSAR GATE', bullets: ['#ffe45f', '#ff5fd8', '#5fe1ff'], nebula: ['#ff7a00', '#c02bff'] },
  { name: 'SUPERNOVA', bullets: ['#ff7b5f', '#fffd8a', '#a08bff'], nebula: ['#ff2a4a', '#ff9a2a'] },
  { name: 'EVENT HORIZON', bullets: ['#9effff', '#ff8ae2', '#ffffff'], nebula: ['#4a2aff', '#00c8ff'] },
];

export function paletteFor(stage) {
  return PALETTES[(stage - 1) % PALETTES.length];
}

export function stageName(stage) {
  const p = paletteFor(stage);
  const loop = Math.floor((stage - 1) / PALETTES.length);
  return loop > 0 ? `${p.name} ${'+'.repeat(loop)}` : p.name;
}

// ステージと難易度から弾幕の強さを算出
export function levelFor(diff, stage) {
  const s = Math.min(stage - 1, 12);
  return {
    speed: diff.speed * (1 + 0.045 * s),
    density: diff.density * (1 + 0.07 * s),
    rate: diff.rate * (1 + 0.06 * s),
  };
}

export function maxEmitters(diff, stage) {
  return Math.min(5, Math.floor(1 + stage * 0.5 + diff.emit));
}

export function stageMult(stage) {
  return 1 + 0.25 * (stage - 1);
}
