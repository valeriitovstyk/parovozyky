// ShortLine in the browser: the deterministic simulator driven by the real
// time (PLAN.md 3.2), the modern 3D renderer with the HTML HUD (default), the
// classic renderer (F2) and the overlay of both (F3), input and the PC speaker.
//
// URL parameters: ?view=modern|classic|overlay, ?seed=N, ?test=1 (the time
// does not run by itself: tests call window.__shortline.step(us)).
import { createSim, SIM_VERSION, type Sim, type SimEvent } from '@shortline/sim';
import { ModernRenderer, layoutFor, logicalToScreen, screenToLogical } from '@shortline/render';
import { Beeper } from './audio';
import { BrowserFileStore } from './files';
import { Hud } from './hud';
import { attachInput, ME_LEFTPRESSED, ME_LEFTRELEASED, ME_RIGHTPRESSED, ME_RIGHTRELEASED } from './input';
import { ClassicScreen } from './screen';
import { ReplayRecorder } from './replay';
import { Settings, loadSettings, saveSettings, type ViewMode } from './settings';

const MAX_STEP_US = 100_000;

interface Game {
  sim: Sim;
  files: BrowserFileStore;
  target: number;
  replay: ReplayRecorder;
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
      /** stop advancing the simulation with the real time */
      paused: boolean;
      /** advance the virtual time (test mode) and draw a frame */
      step: (us: number) => void;
      restart: () => void;
      /** the replay of the current session (JSON scenario) */
      exportReplay: () => string;
    };
  }
}

const params = new URLSearchParams(location.search);
const TEST_MODE = params.get('test') === '1';

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  root.innerHTML = '';
  const gl = document.createElement('canvas');
  gl.id = 'gl';
  const classic = document.createElement('canvas');
  classic.id = 'screen';
  const field = document.createElement('div');
  field.id = 'field';
  const overlay = document.createElement('div');
  overlay.id = 'overlay';
  overlay.hidden = true;
  root.append(gl, classic, field, overlay);

  const settings = loadSettings();
  const view = params.get('view');
  if (view === 'classic' || view === 'overlay' || view === 'modern') settings.view = view;

  const screen = new ClassicScreen(classic);
  let modern: ModernRenderer | null = null;
  try {
    modern = new ModernRenderer(gl, { shadows: settings.shadows });
  } catch (e) {
    console.warn('WebGL is not available, using the classic renderer', e);
  }
  const mode = () => (modern ? settings.view : 'classic');
  const beeper = new Beeper();
  beeper.muted = !settings.sound;
  const files = await BrowserFileStore.open();
  let game: Game | null = null;
  const stats = { frames: 0, renderMs: 0 };
  let pointer: { x: number; y: number } | null = null;

  const layout = () => layoutFor(root.clientWidth, root.clientHeight);
  const place = () => {
    const l = layout();
    modern?.resize(l.width, l.height);
    // the classic 640x350 picture and the HUD cover exactly the logical field
    const tl = logicalToScreen(l, 0, 0);
    const br = logicalToScreen(l, 640, 350);
    for (const e of [classic, field])
      Object.assign(e.style, { left: `${tl.x}px`, top: `${tl.y}px`, width: `${br.x - tl.x}px`, height: `${br.y - tl.y}px` });
    field.style.setProperty("--u", String((br.x - tl.x) / 640));
  };
  new ResizeObserver(place).observe(root);
  place();

  const now = () => (game ? Math.max(game.target, game.sim.now) : 0);
  const sendMouse = (flags: number, buttons: number, x: number, y: number) => {
    if (!game || game.sim.halted) return;
    const t = now();
    game.replay.mouse(t, flags, buttons, x, y);
    game.sim.pushInput({ t, type: 'mouse', flags, buttons, x, y });
  };
  const sendKey = (scancode: number, down: boolean) => {
    if (!game || game.sim.halted) return;
    const t = now();
    game.replay.key(t, scancode, down);
    game.sim.pushInput({ t, type: 'key', scancode, down });
  };

  const hud = new Hud({
    key: (sc) => {
      sendKey(sc, true);
      sendKey(sc, false);
    },
    click: (x, y, button) => {
      sendMouse(0, 0, x, y);
      if (button === 'left') {
        sendMouse(ME_LEFTPRESSED, 1, x, y);
        sendMouse(ME_LEFTRELEASED, 0, x, y);
      } else {
        sendMouse(ME_RIGHTPRESSED, 2, x, y);
        sendMouse(ME_RIGHTRELEASED, 0, x, y);
      }
    },
  });
  field.append(hud.root);

  const onEvent = (e: SimEvent) => modern?.onEvent(e as never, performance.now());

  const newGame = () => {
    overlay.textContent = '';
    overlay.hidden = true;
    const seedParam = params.get('seed');
    const seed = seedParam !== null ? Number(seedParam) & 0xffff : (Date.now() ^ (Math.random() * 0x10000)) & 0xffff;
    beeper.silence();
    game = {
      files,
      target: 0,
      replay: new ReplayRecorder(seed, settings.playerName, files, files.userFiles()),
      sim: createSim({
        seed,
        files,
        playerName: settings.playerName,
        video: true,
        ubPolicy: 'recover',
        onEvent,
        onSound: (freq, t) => beeper.set(freq, (t - (game?.target ?? t)) / 1e6),
      }),
    };
  };
  newGame();

  const toolbar = new Settings(settings, {
    changed: (what) => {
      saveSettings(settings);
      beeper.muted = !settings.sound;
      if (!settings.sound) beeper.silence();
      if (what === 'shadows') modern?.setShadows(settings.shadows);
      // the player name is a command line argument of the original game:
      // it takes effect when the game starts again
      if (what === 'playerName') newGame();
    },
    exportReplay: () => {
      if (!game) return;
      const json = game.replay.export(game.sim.now, SIM_VERSION);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = `shortline-${JSON.parse(json).name}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    fullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void root.requestFullscreen?.();
    },
  });
  root.append(toolbar.root);
  for (const t of ['pointerdown', 'pointerup', 'pointermove'])
    for (const e of [toolbar.root, overlay]) e.addEventListener(t, (ev) => ev.stopPropagation());

  const draw = (nowMs: number) => {
    if (!game) return;
    const sim = game.sim;
    const sc = sim.world.video.screen;
    // pictures of the original (loading screen, game over) stay classic
    const fieldScreen = sc === 'game' || sc === 'menu' || sc === 'archive' || sc === 'manual' || sc === 'records';
    const m = mode();
    const show3d = m !== 'classic' && fieldScreen && modern !== null;
    gl.style.visibility = show3d ? 'visible' : 'hidden';
    const showClassic = !show3d || m === 'overlay';
    classic.style.visibility = showClassic ? 'visible' : 'hidden';
    classic.style.opacity = m === 'overlay' && show3d ? '0.45' : '1';
    field.style.visibility = show3d && m === 'modern' && !sim.halted ? 'visible' : 'hidden';
    root.classList.toggle('modern', show3d && m === 'modern');
    if (show3d) {
      const t0 = performance.now();
      modern!.pointer = pointer;
      modern!.render(sim, nowMs);
      stats.renderMs += performance.now() - t0;
      stats.frames++;
    }
    if (showClassic) screen.draw(sim, false);
    if (show3d && m === 'modern') hud.update(sim);
    const h = sim.halted;
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
  };

  window.__shortline = {
    game: () => game,
    version: SIM_VERSION,
    mode,
    setMode: (v) => {
      settings.view = v;
    },
    renderer: () => modern,
    stats,
    paused: TEST_MODE,
    step: (us) => {
      if (!game) return;
      game.target += us;
      game.sim.advanceTo(game.target);
      draw(game.target / 1000);
    },
    restart: newGame,
    exportReplay: () => (game ? game.replay.export(game.sim.now, SIM_VERSION) : ''),
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F2') {
      settings.view = settings.view === 'classic' ? 'modern' : 'classic';
      e.preventDefault();
    } else if (e.code === 'F3') {
      settings.view = settings.view === 'overlay' ? 'modern' : 'overlay';
      e.preventDefault();
    }
  });

  attachInput(
    root,
    {
      gesture: () => beeper.start(),
      mouse: (flags, buttons, x, y) => {
        pointer = { x, y };
        sendMouse(flags, buttons, x, y);
      },
      key: sendKey,
    },
    (px, py) => screenToLogical(layout(), px, py),
  );

  let last = performance.now();
  const frame = (nowMs: number) => {
    const dt = Math.min((nowMs - last) * 1000, MAX_STEP_US);
    last = nowMs;
    if (game && !document.hidden && !window.__shortline!.paused) {
      game.target += dt;
      game.sim.advanceTo(game.target);
    }
    if (!TEST_MODE) draw(nowMs);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void boot();
