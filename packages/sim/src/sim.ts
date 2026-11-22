// Public simulator API (PLAN.md 3.1).
import { type InputEvent, Machine, type MachineObserver } from './core/machine';
import { Rng } from './core/rng';
import { SimHalt, type TaskGen } from './core/scheduler';
import type { FileStore } from './files';
import { G, type GlobalsHolder, type SimEvent, World, cstr, setGlobals, strcpy } from './game/globals';
import { initGameData } from './game/init';
import { taskGameMainLoop } from './game/mainLoop';
import { handleMouseInput, taskMouseEventHandling } from './game/mouse';
import { taskSpawnTrains } from './game/train';
import { TraceRecorder, type TraceOptions } from './trace';
import { Vga } from './gfx/vga';

export interface SimOptions {
  seed: number;
  files: FileStore;
  /** argv[1] of the original game ("Unknown" by default) */
  playerName?: string;
  /** stop the simulation at this virtual time (like RESL_STOP_AT) */
  stopAtUs?: number;
  /** record a trace in the oracle format */
  trace?: TraceOptions;
  /** presentation events (status messages, dialogs, explosions...) */
  onEvent?: (e: SimEvent) => void;
  /**
   * Undefined behaviour of the original game (docs/fidelity.md U1): 'halt'
   * stops like the oracle (default, tests); 'recover' cancels the spawn of a
   * train that would walk into a dead end (the playable game).
   */
  ubPolicy?: 'halt' | 'recover';
  /** emulate the VGA video memory (classic renderer, screenshot tests) */
  video?: boolean;
  /** called at every frame boundary (VGAEmulation::flush with a new frame) */
  onFrame?: (t: number) => void;
  /** sound(freq) / nosound() with the virtual time */
  onSound?: (freq: number, t: number) => void;
}

export interface Sim {
  readonly world: World;
  /** virtual time (us); may run ahead of the host while the logic blocks */
  readonly now: number;
  readonly halted: SimHalt | null;
  pushInput(ev: InputEvent): void;
  advanceTo(us: number): void;
  /** the visible 640x350 screen as ARGB (needs `video: true`) */
  renderScreen(dst: Uint32Array): boolean;
  readonly trace: TraceRecorder | null;
}

/* main.cpp: sdlLoop — a helper task for handling SDL events */
function* sdlLoop(): TaskGen {
  for (;;) {
    yield* G.m.flush();
    yield G.m.sleep(2);
  }
}

export function createSim(opts: SimOptions): Sim {
  let trace: TraceRecorder | null = null;
  let world: GlobalsHolder | null = null;
  const observer: MachineObserver = {};
  const m = new Machine(observer);
  if (opts.trace) {
    trace = new TraceRecorder(() => world!, opts.trace);
    Object.assign(observer, {
      onTaskAdded: trace.onTaskAdded.bind(trace),
      onTaskResumed: trace.onTaskResumed.bind(trace),
      onInput: trace.onInput.bind(trace),
      onHalt: trace.onHalt.bind(trace),
    } satisfies MachineObserver);
  }
  observer.onSound = (freq, t) => {
    trace?.onSound(freq, t);
    opts.onSound?.(freq, t);
  };
  if (opts.stopAtUs !== undefined) m.stopAt = opts.stopAtUs;
  if (opts.onFrame) observer.onFrame = opts.onFrame;

  const rng = new Rng();
  world = Object.assign(new World(m, rng, opts.files), {
    ubHandler(what: string): never {
      trace?.onUB(what, m.now);
      throw new SimHalt('ub', what);
    },
    statusHook(text: string): void {
      trace?.onStatus(text, m.now);
    },
  }) as GlobalsHolder;
  if (opts.onEvent) world.view = { event: opts.onEvent };
  world.ubPolicy = opts.ubPolicy ?? 'halt';
  if (opts.video) world.vga = new Vga();
  setGlobals(world);

  // main(): the SDL helper task is added first
  m.addTask(sdlLoop(), 'sdlLoop');

  // resl::main (15ab:0018)
  rng.srand(opts.seed);
  if (opts.playerName !== undefined) strcpy(world.playerName, cstr(opts.playerName, 20));
  initGameData();
  m.timer.start(); // initTimer()
  m.keyboardHandler = (keycode: number) => {
    // keyboardInterruptionHandler (14af:06e7)
    if (!(keycode & 0x80)) world!.lastKeyPressed = keycode;
    world!.lastKeyCode = keycode;
  };
  m.mouse.addHandler((e) => handleMouseInput(e));

  // initTasks (1c75:027c)
  m.addTask(taskSpawnTrains(), 'taskSpawnTrains');
  m.addTask(taskMouseEventHandling(), 'taskMouseEventHandling');
  world.taskGameMainLoop = m.addTask(taskGameMainLoop(), 'taskGameMainLoop');

  const w = world;
  return {
    world: w,
    get now() {
      return m.now;
    },
    get halted() {
      return m.halted;
    },
    pushInput: (ev) => m.pushInput(ev),
    renderScreen(dst: Uint32Array): boolean {
      if (!w.vga) return false;
      w.vga.renderScreen(dst, w.video.frameOriginY, w.video.lineCompare);
      return true;
    },
    advanceTo(us: number) {
      setGlobals(w);
      m.advanceTo(us);
    },
    trace,
  };
}
