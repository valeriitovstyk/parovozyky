// All global variables of reSL (and file-local statics) in one object.
// `G` is replaced by createSim(); game code reads and writes it directly,
// mirroring the `g_*` globals of the C++ code.

import type { Machine } from '../core/machine';
import type { Rng } from '../core/rng';
import { MessageQueue, type Task } from '../core/scheduler';
import type { FileStore } from '../files';
import type { RecordView } from './records';
import { entranceColors, movementPaths } from '../data/tables';
import {
  type Color,
  type Dialog,
  Entrance,
  HeaderField,
  type HeaderValueChangeRequest,
  MouseAction,
  type MsgMouseEvent,
  Rail,
  RailInfo,
  Rectangle,
  Semaphore,
  StaticObject,
  Switch,
  Train,
  type Carriage,
} from './types';

export interface View {
  /** presentation hooks; the simulator works without them */
  event(e: SimEvent): void;
}

export type SimEvent =
  | { type: 'status'; text: string; yOffset: number }
  | { type: 'statusClear' }
  | { type: 'dialog'; dialog: number; yOffset: number }
  | { type: 'screen'; name: string }
  | { type: 'trainFinished'; x: number; y: number }
  | { type: 'explosion'; x: number; y: number }
  | { type: 'railStage'; tileX: number; tileY: number; railType: number; stage: number }
  | { type: 'exit'; message: string }
  | { type: 'save'; fileName: string }
  | { type: 'spawnCancelled'; reason: string };

/** Mouse cursor modes (game/mouse/mode.h): only the mutable part is kept here */
export interface Mode {
  readonly name: 'management' | 'construction';
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  x: number; // i16
  y: number; // i16
}

export class World {
  // ---- system ----
  readonly m: Machine;
  readonly rng: Rng;
  readonly files: FileStore;
  view: View | null = null;
  /** what to do on undefined behaviour of the original game (docs/fidelity.md U1) */
  ubPolicy: 'halt' | 'recover' = 'halt';
  /** set while spawnTrain / spawnServer place a new train */
  spawning = false;

  // system/keyboard.cpp
  lastKeyPressed = 0; // u8
  lastKeyCode = 0; // u8

  // ---- rail.cpp ----
  /** g_rails[11][11][6], flat: (x * 11 + y) * 6 + type */
  readonly rails: Rail[] = [];
  railRoadCount = 0; // u16
  readonly railRoad: RailInfo[] = Array.from({ length: 150 }, () => new RailInfo());
  /** g_railroadTypeMasks[11][11], flat: x * 11 + y */
  readonly railroadTypeMasks = new Array<number>(121).fill(0);

  // ---- switch.cpp ----
  nSwitches = 0; // u16
  readonly switches: Switch[] = Array.from({ length: 80 }, () => new Switch());

  // ---- semaphore.cpp ----
  readonly newSemaphores: Semaphore[] = Array.from({ length: 4 }, () => new Semaphore());
  readonly erasedSemaphores: Semaphore[] = Array.from({ length: 4 }, () => new Semaphore());
  newSemaphoreCount = 0; // i16
  erasedSemaphoreCount = 0; // i16
  readonly semaphores: Semaphore[] = Array.from({ length: 50 }, () => new Semaphore());
  semaphoreCount = 0; // u16

  // ---- entrance.cpp / resources/entrance.cpp ----
  entranceCount = 0; // i16
  readonly entrances: Entrance[] = entranceColors.map(([bg, fg], i) => new Entrance(bg as Color, fg as Color, i));

  // ---- static_object.cpp ----
  readonly staticObjects: StaticObject[] = Array.from({ length: 120 }, () => new StaticObject());
  readonly cuttingDownStaticObjectsByKind = [0, 0, 0, 0]; // u8[4]

  // ---- train.cpp ----
  readonly trains: Train[] = Array.from({ length: 20 }, (_, i) => new Train(i));
  collidedTrainsArrayLen = 0; // u16
  readonly collidedTrainsArray: [Carriage | null, Carriage | null][] = Array.from({ length: 20 }, () => [null, null]);
  trainDrawingChainLen = 0; // u16
  readonly trainDrawingChains: (Carriage | null)[] = new Array(20).fill(null);
  needToRedrawTrains = false;
  /** g_areaToRedraw (drawing.cpp): drawing only, kept because code computes it */
  readonly areaToRedraw = new Rectangle();
  /** g_carriagesBoundingBoxes: written by drawTrainList, used for redrawing only */
  readonly carriagesBoundingBoxes: Rectangle[] = Array.from({ length: 100 }, () => new Rectangle());
  lastProcessedTrain = 0; // u8 (accelerateTrains static)
  readonly lastProcessedCarriages = new Array<number>(20).fill(0); // u8[20]

  // ---- tasks ----
  taskMoveAndRedrawTrains: Task | null = null;
  taskHeaderFieldAnimation: Task | null = null;
  taskRoadConstruction: Task | null = null;
  taskGameMainLoop: Task | null = null;
  taskDemoAI: Task | null = null;

  // ---- header.cpp ----
  readonly headerAnimationTaskQueue: MessageQueue<HeaderValueChangeRequest>;
  readonly headers: HeaderField[] = [
    new HeaderField(16, 25, -1, 5), // trains
    new HeaderField(136, 25, -1, 4), // money
    new HeaderField(272, 25, 2000, 4), // year
    new HeaderField(376, 25, 100, 2), // level
  ];

  // ---- road_construction.cpp ----
  readonly railConstructionMsgQueue: MessageQueue<RailInfo>;

  // ---- main_loop.cpp ----
  gameTime = 0; // i16

  // ---- demo.cpp ----
  isDemoMode = false;
  /** g_demoFileName = "demo_a"; only the last letter changes */
  demoFileLetter = 'a'.charCodeAt(0);
  readonly demoMouseMsg: MsgMouseEvent = { action: MouseAction.None, x: 0, y: 0 };

  // ---- mouse ----
  previousMouseButtonState = 0; // u8
  readonly mouseMsgQueue: MessageQueue<MsgMouseEvent>;
  readonly modeManagement: Mode = { name: 'management', minX: 0, maxX: 628, minY: 0, maxY: 318, x: 320, y: 200 };
  // g_footerYPos = 334 (maxY of the construction mode); x/y stay 0 (see construction_mode.cpp)
  readonly modeConstruction: Mode = { name: 'construction', minX: -10, maxX: 650, minY: 0, maxY: 334, x: 0, y: 0 };
  /** mouse::g_state.mode */
  mode: Mode | null = null;
  readonly railCursorState: RailInfo = Object.assign(new RailInfo(), { tileX: 5, tileY: 5 });
  /** GridOverlay visibility (presentation) */
  gridVisible = false;

  // ---- melody.cpp ----
  soundEnabled = true;

  // ---- ui ----
  gameOver = false;
  /** char g_playerName[20] = "Unknown" (a raw buffer: strcpy keeps trailing bytes) */
  readonly playerName = cstr('Unknown', 20);
  footerMessageTimeout = 1; // i8
  textSpacing = 1; // i16 (graphics/text.cpp)
  readonly dialogs: Dialog[] = [
    dialog('MAIN  MENU', ['Manual', 'Demo', 'Go!', 'Archive', 'Records', 'Bye']),
    dialog('ARCHIVE', ['View', 'Next', 'Go!', 'Delete', 'Bye']),
    dialog('Sure?', ['Yes', 'No']),
    dialog('PAUSE', ['Go!', '', 'Bye']),
    dialog('?', []),
  ];

  /** VGA scrolling registers and other presentation state (not part of the logic) */
  readonly video = {
    frameOriginY: 0,
    lineCompare: 0,
    copies: 0,
    blinkingColor: 0xffffffff,
    screen: 'none',
    loadingTitle: 0,
    manualPage: 0,
    records: null as null | { byTrains: RecordView[]; byYears: RecordView[] },
  };

  // ---- savefile ----
  railsLoadedOffset = 0; // u16
  entrancesLoadedOffset = 0; // u16
  searchStarted = false; // findNextSaveFile statics
  curPath = 0;
  /** FileSearch state */
  searchEntries: string[] = [];
  searchPos = 0;

  constructor(m: Machine, rng: Rng, files: FileStore) {
    this.m = m;
    this.rng = rng;
    this.files = files;
    for (let i = 0; i < 11 * 11 * 6; ++i) this.rails.push(new Rail(2 + i));
    const sched = () => this.m.sched;
    this.headerAnimationTaskQueue = new MessageQueue(sched);
    this.railConstructionMsgQueue = new MessageQueue(sched);
    this.mouseMsgQueue = new MessageQueue(sched);
  }

  /** g_rails[x][y][type] with C flat indexing (no per-axis bound checks) */
  rail(x: number, y: number, type: number): Rail {
    const idx = (x * 11 + y) * 6 + type;
    const r = this.rails[idx];
    if (!r) ub(`g_rails index out of range: [${x}][${y}][${type}]`);
    return r;
  }

  /** g_railroadTypeMasks[x][y] read with C flat indexing */
  mask(x: number, y: number): number {
    const idx = x * 11 + y;
    if (idx < 0 || idx >= 121) ub(`g_railroadTypeMasks index out of range: [${x}][${y}]`);
    return this.railroadTypeMasks[idx];
  }

  setMask(x: number, y: number, v: number): void {
    const idx = x * 11 + y;
    if (idx < 0 || idx >= 121) ub(`g_railroadTypeMasks index out of range: [${x}][${y}]`);
    this.railroadTypeMasks[idx] = v & 0xff;
  }

  pathSize(type: number): number {
    return movementPaths[type][0];
  }

  emit(e: SimEvent): void {
    this.view?.event(e);
  }
}

/** A zero-padded C char buffer */
export function cstr(s: string, size: number): Uint8Array {
  const b = new Uint8Array(size);
  for (let i = 0; i < s.length && i < size; ++i) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

/** The C string stored in a char buffer */
export function cstrValue(b: Uint8Array): string {
  let s = '';
  for (const c of b) {
    if (!c) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** strcpy(dst, src): copies up to and including the NUL, keeps the rest of dst */
export function strcpy(dst: Uint8Array, src: Uint8Array): void {
  for (let i = 0; i < dst.length; ++i) {
    dst[i] = src[i] ?? 0;
    if (!dst[i]) return;
  }
  throw new Error('strcpy: no terminating NUL within the buffer');
}

function dialog(title: string, items: string[]): Dialog {
  const itemNames: (string | null)[] = new Array(7).fill(null);
  items.forEach((s, i) => (itemNames[i] = s));
  return { title, itemNames, x: 0, itemY: new Array(7).fill(0), itemWidth: 0 };
}

/**
 * docs/fidelity.md U1: a train being spawned walks into a dead end. With the
 * 'recover' policy (the playable game) the spawn is cancelled; with 'halt'
 * (oracle parity, tests) the simulation stops like the oracle does.
 */
export class SpawnCancelled extends Error {}

/** Undefined behaviour of the original program (docs/fidelity.md) */
export function ub(what: string): never {
  if (G.ubPolicy === 'recover' && G.spawning) throw new SpawnCancelled(what);
  G.ubHandler(what);
  throw new Error(`undefined behaviour: ${what}`);
}

export interface GlobalsHolder extends World {
  ubHandler(what: string): never;
  statusHook(text: string): void;
}

export let G: GlobalsHolder;

export function setGlobals(w: GlobalsHolder): void {
  G = w;
}

/** PathStep of g_movementPaths[type].data[step] */
export function pathStep(type: number, step: number): { dx: number; dy: number; angle: number } {
  const p = movementPaths[type];
  if (step < 0 || step >= 255) ub(`g_movementPaths[${type}].data[${step}]`);
  if (step >= p[0]) {
    // reads beyond `size`: still inside data[255] (zero-initialised) for every
    // path except the last one of the original array (see docs/fidelity.md U2)
    return { dx: 0, dy: 0, angle: 0 };
  }
  return { dx: p[1 + step * 3], dy: p[2 + step * 3], angle: p[3 + step * 3] };
}
