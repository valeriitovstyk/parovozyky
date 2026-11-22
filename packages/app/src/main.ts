// ShortLine in the browser: the deterministic simulator driven by the real
// time (PLAN.md 3.2), the modern 3D renderer (default), the classic renderer
// (F2) and the overlay of both (F3), input and the PC speaker.
import { createSim, SIM_VERSION, type Sim, type SimEvent } from '@shortline/sim';
import { ModernRenderer, layoutFor, logicalToScreen, screenToLogical } from '@shortline/render';
import { Beeper } from './audio';
import { BrowserFileStore } from './files';
import { attachInput } from './input';
import { ClassicScreen } from './screen';

const MAX_STEP_US = 100_000;

type ViewMode = 'modern' | 'classic' | 'overlay';

interface Game {
  sim: Sim;
  files: BrowserFileStore;
  target: number;
}

declare global {
  interface Window {
    /** for tests and debugging */
    __shortline?: {
      game: () => Game | null;
      version: string;
      mode: () => ViewMode;
      setMode: (m: ViewMode) => void;
      renderer: () => ModernRenderer | null;
      stats: { frames: number; renderMs: number };
      /** stop advancing the simulation (tests) */
      paused: boolean;
    };
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

function initialMode(): ViewMode {
  const q = new URLSearchParams(location.search).get('view');
  return q === 'classic' || q === 'overlay' ? q : 'modern';
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  root.innerHTML = '';
  const gl = document.createElement('canvas');
  gl.id = 'gl';
  const classic = document.createElement('canvas');
  classic.id = 'screen';
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  overlay.hidden = true;
  root.append(gl, classic, overlay);

  const screen = new ClassicScreen(classic);
  let modern: ModernRenderer | null = null;
  try {
    modern = new ModernRenderer(gl);
  } catch (e) {
    console.warn('WebGL is not available, using the classic renderer', e);
  }
  let mode: ViewMode = modern ? initialMode() : 'classic';
  const beeper = new Beeper();
  const files = await BrowserFileStore.open();
  let game: Game | null = null;
  const stats = { frames: 0, renderMs: 0 };

  const layout = () => layoutFor(root.clientWidth, root.clientHeight);
  const place = () => {
    const l = layout();
    modern?.resize(l.width, l.height);
    // the classic 640x350 picture covers exactly the logical field of the layout
    const tl = logicalToScreen(l, 0, 0);
    const br = logicalToScreen(l, 640, 350);
    Object.assign(classic.style, {
      left: `${tl.x}px`,
      top: `${tl.y}px`,
      width: `${br.x - tl.x}px`,
      height: `${br.y - tl.y}px`,
    });
  };
  new ResizeObserver(place).observe(root);
  place();

  const onEvent = (e: SimEvent) => modern?.onEvent(e as never, performance.now());

  const newGame = () => {
    overlay.textContent = '';
    overlay.hidden = true;
    const seed = (Date.now() ^ (Math.random() * 0x10000)) & 0xffff;
    game = {
      files,
      target: 0,
      sim: createSim({
        seed,
        files,
        playerName: playerName(),
        video: true,
        ubPolicy: 'recover',
        onEvent,
        onSound: (freq, t) => beeper.set(freq, (t - (game?.target ?? t)) / 1e6),
      }),
    };
  };
  newGame();

  const setMode = (m: ViewMode) => {
    mode = modern ? m : 'classic';
  };
  window.__shortline = { game: () => game, version: SIM_VERSION, mode: () => mode, setMode, renderer: () => modern, stats, paused: false };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F2') {
      setMode(mode === 'classic' ? 'modern' : 'classic');
      e.preventDefault();
    } else if (e.code === 'F3') {
      setMode(mode === 'overlay' ? 'modern' : 'overlay');
      e.preventDefault();
    }
  });

  attachInput(
    root,
    {
      gesture: () => beeper.start(),
      mouse: (flags, buttons, x, y) => {
        if (!game || game.sim.halted) return;
        game.sim.pushInput({ t: Math.max(game.target, game.sim.now), type: 'mouse', flags, buttons, x, y });
      },
      key: (scancode, down) => {
        if (!game || game.sim.halted) return;
        game.sim.pushInput({ t: Math.max(game.target, game.sim.now), type: 'key', scancode, down });
      },
    },
    (px, py) => screenToLogical(layout(), px, py),
  );

  let last = performance.now();
  const frame = (nowMs: number) => {
    const dt = Math.min((nowMs - last) * 1000, MAX_STEP_US);
    last = nowMs;
    if (game) {
      if (!document.hidden && !window.__shortline!.paused) {
        game.target += dt;
        game.sim.advanceTo(game.target);
      }
      const inGame = game.sim.world.video.screen === 'game';
      const show3d = mode !== 'classic' && inGame && modern !== null;
      gl.style.visibility = show3d ? 'visible' : 'hidden';
      classic.style.opacity = mode === 'overlay' && show3d ? '0.45' : '1';
      if (show3d) {
        const t0 = performance.now();
        modern!.render(game.sim, nowMs);
        stats.renderMs += performance.now() - t0;
        stats.frames++;
      }
      screen.draw(game.sim, show3d && mode === 'modern');
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
