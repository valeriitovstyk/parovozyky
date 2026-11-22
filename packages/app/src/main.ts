// ShortLine in the browser: the deterministic simulator driven by the real
// time (PLAN.md 3.2), the classic renderer, input and the PC speaker.
import { createSim, SIM_VERSION, type Sim } from '@shortline/sim';
import { Beeper } from './audio';
import { BrowserFileStore } from './files';
import { attachInput } from './input';
import { ClassicScreen } from './screen';

const MAX_STEP_US = 100_000;

interface Game {
  sim: Sim;
  files: BrowserFileStore;
  target: number;
}

declare global {
  interface Window {
    /** for tests and debugging */
    __shortline?: { game: () => Game | null; version: string };
  }
}

function playerName(): string {
  try {
    const n = localStorage.getItem('shortline.playerName');
    if (n) return n.slice(0, 19);
  } catch {
    /* storage may be unavailable */
  }
  return 'Unknown';
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  root.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.id = 'screen';
  root.appendChild(canvas);
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  root.appendChild(overlay);

  const screen = new ClassicScreen(canvas);
  const beeper = new Beeper();
  const files = await BrowserFileStore.open();
  let game: Game | null = null;

  const newGame = () => {
    overlay.textContent = '';
    overlay.hidden = true;
    const seed = (Date.now() ^ (Math.random() * 0x10000)) & 0xffff;
    const g: Game = {
      files,
      target: 0,
      sim: createSim({
        seed,
        files,
        playerName: playerName(),
        video: true,
        ubPolicy: 'recover',
        onSound: (freq, t) => beeper.set(freq, (t - (game?.target ?? t)) / 1e6),
      }),
    };
    game = g;
  };
  newGame();
  window.__shortline = { game: () => game, version: SIM_VERSION };

  attachInput(canvas, {
    gesture: () => beeper.start(),
    mouse: (flags, buttons, x, y) => {
      if (!game || game.sim.halted) return;
      game.sim.pushInput({ t: Math.max(game.target, game.sim.now), type: 'mouse', flags, buttons, x, y });
    },
    key: (scancode, down) => {
      if (!game || game.sim.halted) return;
      game.sim.pushInput({ t: Math.max(game.target, game.sim.now), type: 'key', scancode, down });
    },
  });

  let last = performance.now();
  const frame = (nowMs: number) => {
    const dt = Math.min((nowMs - last) * 1000, MAX_STEP_US);
    last = nowMs;
    if (game) {
      if (!document.hidden) {
        game.target += dt;
        game.sim.advanceTo(game.target);
      }
      screen.draw(game.sim);
      const h = game.sim.halted;
      if (h && overlay.hidden) {
        beeper.silence();
        overlay.hidden = false;
        overlay.innerHTML = '';
        const msg = document.createElement('p');
        msg.textContent = h.reason === 'exit' ? 'Bye!' : `The game stopped: ${h.reason} ${h.detail}`;
        const btn = document.createElement('button');
        btn.textContent = 'Play again';
        btn.onclick = newGame;
        overlay.append(msg, btn);
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void boot();
