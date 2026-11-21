// Golden scenario definitions (deterministic: the same list every run).

import { DEMO_FILES } from '../scenario/files.mjs';

// DOS scan codes (system/keyboard.h)
export const KEY = {
  ESC: 1, K1: 2, K2: 3, K3: 4, Q: 16, W: 17, E: 18, R: 19, T: 20, Y: 21, U: 22, I: 23, O: 24, P: 25,
  A: 30, S: 31, D: 32, F: 33, G: 34, H: 35, J: 36, K: 37, L: 38, Z: 44, X: 45, C: 46, V: 47, B: 48,
  N: 49, M: 50, SPACE: 57,
};

// MOUSE.H flags / buttons
export const ME = { MOVED: 1, LP: 2, LR: 4, RP: 8, RR: 16 };
export const MB = { L: 1, R: 2 };

const S = 1_000_000;

function key(input, t, code, holdUs = 60_000) {
  input.push([t, 'key', code, 1], [t + holdUs, 'key', code, 0]);
}

// mulberry32: deterministic generator for bot inputs (not related to the game RNG)
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Skip the loading screen (click), wait for the main menu.
function intro(input) {
  input.push([1 * S, 'mouse', ME.LR, 0, 320, 175]);
}

export function demoScenarios() {
  const res = [];
  for (const demo of DEMO_FILES) {
    for (const seed of [1, 2, 3]) {
      const input = [];
      intro(input);
      key(input, 4 * S, KEY.D);
      res.push({
        name: `demo-${demo.slice(5)}-s${seed}`,
        seed,
        stopAtUs: 70 * S,
        dumpEveryUs: 1 * S,
        // the menu always starts with "demo_a": put the wanted demo under that name
        files: { demo_a: { from: demo } },
        input,
      });
    }
  }
  return res;
}

// Random "player": builds, clicks, toggles modes, changes speed, pauses.
// `cautious` bots keep the cursor away from the left/right screen edges (less
// building around entrances); the others ("-edges") use the whole screen.
export function botInput(seed, durationUs, { cautious = false } = {}) {
  const rnd = prng(seed * 7919 + 17);
  const input = [];
  intro(input);
  key(input, 4 * S, KEY.G);
  let t = 6 * S;
  let x = 320;
  let y = 190;
  const ri = (a, b) => a + Math.floor(rnd() * (b - a));
  while (t < durationUs) {
    t += ri(150_000, 1_500_000);
    const r = rnd();
    if (r < 0.40) {
      // move in a few steps
      const tx = cautious ? ri(110, 530) : ri(0, 640);
      const ty = ri(47, 334);
      const steps = ri(1, 4);
      for (let i = 1; i <= steps; ++i) {
        x = Math.round(x + ((tx - x) * i) / steps);
        y = Math.round(y + ((ty - y) * i) / steps);
        input.push([t, 'mouse', 0, 0, x, y]);
        t += ri(10_000, 60_000);
      }
    } else if (r < 0.62) {
      input.push([t, 'mouse', ME.LP, MB.L, x, y], [t + ri(30_000, 200_000), 'mouse', ME.LR, 0, x, y]);
    } else if (r < 0.84) {
      input.push([t, 'mouse', ME.RP, MB.R, x, y], [t + ri(30_000, 200_000), 'mouse', ME.RR, 0, x, y]);
    } else if (r < 0.90) {
      key(input, t, KEY.SPACE);
    } else if (r < 0.92) {
      // both buttons: toggle the mouse mode
      const t2 = t + ri(5_000, 40_000);
      input.push([t, 'mouse', ME.LP, MB.L, x, y], [t2, 'mouse', ME.RP, MB.L | MB.R, x, y],
        [t2 + 80_000, 'mouse', ME.LR, MB.R, x, y], [t2 + 100_000, 'mouse', ME.RR, 0, x, y]);
      t = t2 + 100_000;
    } else if (r < 0.96) {
      key(input, t, [KEY.K1, KEY.K2, KEY.K3][ri(0, 3)]);
    } else if (r < 0.985) {
      // pause, sometimes save, go on
      key(input, t, KEY.P);
      t += ri(1 * S, 3 * S);
      if (rnd() < 0.4) {
        key(input, t, KEY.S);
        t += ri(1 * S, 2 * S);
      }
      key(input, t, KEY.G);
    } else {
      // 'G' twice: starts a game when in the main menu, pause + go otherwise
      key(input, t, KEY.G);
      t += ri(1 * S, 2 * S);
      key(input, t, KEY.G);
    }
  }
  // releases may overlap the next action: keep the script sorted (stable)
  return input.map((e, i) => [e, i]).sort((a, b) => a[0][0] - b[0][0] || a[1] - b[1]).map(([e]) => e);
}

export function botScenarios() {
  const res = [];
  const levels = [1, 6, 12];
  for (let i = 0; i < 30; ++i) {
    const level = levels[i % 3];
    const seed = 100 + i;
    // a normal installation: all demo files are present (the main menu runs a
    // demo on timeout; a missing demo file leaves a half-reset world behind)
    const files = Object.fromEntries(DEMO_FILES.map((d) => [d, { from: d }]));
    if (level > 1) files['results.tbl'] = { records: [{ name: 'Unknown', level }] };
    res.push({
      name: `bot-${String(i).padStart(2, '0')}-l${level}${i % 3 !== 2 ? '' : '-edges'}`,
      seed,
      stopAtUs: 30 * 60 * S,
      dumpEveryUs: 10 * S,
      chainEveryUs: 1 * S,
      files,
      input: botInput(seed, 30 * 60 * S, { cautious: i % 3 !== 2 }),
    });
  }
  return res;
}

// A saved game shortly before 2000, played at x3 until the next world.
export function year2000Scenario() {
  const input = [];
  intro(input);
  key(input, 4 * S, KEY.A); // Archive: loads the first save file
  key(input, 7 * S, KEY.G); // Go!
  key(input, 9 * S, KEY.K3); // x3
  return {
    name: 'year2000-x3',
    seed: 11,
    stopAtUs: 200 * S,
    dumpEveryUs: 2 * S,
    chainEveryUs: 1 * S,
    // header layout: 2+2+20 bytes, then 4 x 18-byte fields; value at +8.
    // Money (field 1) = 300, Year (field 2) = 1993
    files: {
      ...Object.fromEntries(DEMO_FILES.map((d) => [d, { from: d }])),
      'aaaaaaaa.aa_': { from: 'demo_c', patch: [{ offset: 24 + 18 + 8, u16: 300 }, { offset: 24 + 36 + 8, u16: 1993 }] },
    },
    input,
  };
}

// Archive: browse the saved games of resources/extra (View, Next...), start the last one.
export function archiveScenario() {
  const extra = ['017EN815.25_', '048hl949.02_', '050BT866.01_', '077TE805.01_', '203sg999.01_'];
  const input = [];
  intro(input);
  key(input, 4 * S, KEY.A);
  let t = 7 * S;
  for (let i = 0; i < extra.length - 1; ++i) {
    key(input, t, KEY.V); // view
    t += 2 * S;
    input.push([t, 'mouse', ME.LR, 0, 300, 200]); // close the preview
    t += 2 * S;
    key(input, t, KEY.N); // next
    t += 4 * S;
  }
  key(input, t, KEY.G);
  t += 3 * S;
  key(input, t, KEY.K2);
  key(input, t + 60 * S, KEY.P); // pause, save, bye
  key(input, t + 63 * S, KEY.S);
  key(input, t + 66 * S, KEY.B);
  return {
    name: 'archive-extra',
    seed: 5,
    stopAtUs: t + 75 * S,
    dumpEveryUs: 1 * S,
    files: Object.fromEntries(extra.map((f) => [f, { from: f, dir: 'extra' }])),
    input,
  };
}

export function allScenarios() {
  return [...demoScenarios(), ...botScenarios(), year2000Scenario(), archiveScenario()];
}
