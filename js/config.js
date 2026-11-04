// ============================================================
// STARDUST DODGE - tuning constants
// ============================================================

export const W = 480;           // logical play field width
export const H = 720;           // logical play field height
export const STEP = 1 / 120;    // fixed simulation step (120 Hz)
export const STAGE_TIME = 30;   // seconds per stage
export const TRANS_TIME = 3.4;  // stage transition length (seconds)
export const READY_TIME = 1.7;  // "READY" length at game start
export const MAX_BULLETS = 1500;

export const PLAYER = {
  r: 2.6,            // hitbox radius
  grazeR: 15,        // extra distance (from hit edge) that counts as graze
  speed: 270,        // keyboard speed (px/s)
  focus: 118,        // keyboard speed while focused
  mouseMax: 560,     // max follow speed for mouse
  touchMax: 1200,    // max catch-up speed for touch drag
  touchSens: 1.15,   // finger delta multiplier
  invuln: 2.2,       // invulnerability after a hit (s)
  clearRadius: 190,  // bullets cleared around player on hit
  startX: W / 2,
  startY: 620,
};

export const DIFFS = {
  easy: {
    key: 'easy', name: '簡単', en: 'EASY', lives: 3, mult: 1.0,
    dens: 0.72, spd: 0.86, gap: 1.3, color: '#6df0c2',
    tag: 'ゆったりした弾幕。まずは感触をつかもう。',
  },
  normal: {
    key: 'normal', name: '普通', en: 'NORMAL', lives: 2, mult: 1.6,
    dens: 1.0, spd: 1.0, gap: 1.05, color: '#ffd45e',
    tag: '標準的な弾幕。ライフは2つ。',
  },
  hard: {
    key: 'hard', name: '難しい', en: 'HARD', lives: 1, mult: 2.5,
    dens: 1.3, spd: 1.14, gap: 0.9, color: '#ff5d8f',
    tag: '濃密で速い弾幕。一発勝負。',
  },
};
export const DIFF_ORDER = ['easy', 'normal', 'hard'];

// score per second = perSec * (1 + stageGrowth*(stage-1)) * mult
export const SCORE = {
  perSec: 100,
  stageGrowth: 0.3,
  graze: 12,          // per graze, * (1 + 0.1*(stage-1)) * mult
  stageBonus: 1000,   // * stage * mult, at every stage clear
  perBullet: 3,       // bonus per bullet converted to sparkle, * mult
};

// Rank thresholds (score >= value). Checked top to bottom.
export const RANKS = [
  ['S', 120000],
  ['A', 55000],
  ['B', 25000],
  ['C', 12000],
  ['D', 5000],
  ['E', 1500],
  ['F', 0],
];
export const RANK_COLORS = {
  S: '#ffe066', A: '#ff8fa3', B: '#ffb36b', C: '#8be28b',
  D: '#6fd3ff', E: '#a99bff', F: '#8a90a8',
};
export function rankOf(score) {
  for (const [r, t] of RANKS) if (score >= t) return r;
  return 'F';
}
export function nextRank(score) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (score < RANKS[i][1]) return { rank: RANKS[i][0], need: Math.ceil(RANKS[i][1] - score) };
  }
  return null;
}

// Bullet types. r = visual half size, hr = hit radius.
export const BT = { SMALL: 0, MID: 1, BIG: 2, RICE: 3, DIAMOND: 4, STAR: 5, NEEDLE: 6 };
export const BULLET_DEFS = [
  { shape: 'orb',     r: 5,  hr: 3.6 },
  { shape: 'orb',     r: 7,  hr: 5.2 },
  { shape: 'orb',     r: 12, hr: 9.5 },
  { shape: 'rice',    r: 6.5, hr: 3.4 },
  { shape: 'diamond', r: 7.5, hr: 4.6 },
  { shape: 'star',    r: 8.5, hr: 4.8 },
  { shape: 'needle',  r: 12, hr: 3.2 },
];

export const ALL_PATTERNS = ['radial', 'spiral', 'aimed', 'wave', 'rain', 'beam', 'sweeper', 'gapwall', 'flower'];

// hue: nebula/accent tint; cols: bullet hues; pool: patterns used in this stage
export const THEMES = [
  { name: '星雲の門',   en: 'NEBULA GATE',   hue: 215, cols: [335, 45, 190],  pool: ['radial', 'aimed', 'rain'] },
  { name: '紅の漂流',   en: 'CRIMSON DRIFT', hue: 350, cols: [12, 48, 300],   pool: ['spiral', 'wave', 'aimed', 'radial'] },
  { name: '翠の潮流',   en: 'EMERALD TIDE',  hue: 150, cols: [140, 55, 200],  pool: ['gapwall', 'rain', 'flower', 'aimed'] },
  { name: '琥珀の嵐',   en: 'AMBER STORM',   hue: 35,  cols: [30, 350, 60],   pool: ['beam', 'sweeper', 'radial', 'wave'] },
  { name: '紫の深淵',   en: 'VIOLET ABYSS',  hue: 275, cols: [285, 320, 200], pool: ['spiral', 'flower', 'gapwall', 'sweeper'] },
  { name: '蒼の虚空',   en: 'AZURE VOID',    hue: 195, cols: [195, 235, 150], pool: ['beam', 'rain', 'aimed', 'spiral', 'wave'] },
  { name: '薔薇の蝕',   en: 'ROSE ECLIPSE',  hue: 320, cols: [320, 15, 270],  pool: ['sweeper', 'flower', 'beam', 'gapwall', 'radial'] },
  { name: '白の新星',   en: 'WHITE NOVA',    hue: 50,  cols: [50, 200, 330],  pool: ALL_PATTERNS },
];
export function themeOf(stage) { return THEMES[(stage - 1) % THEMES.length]; }
