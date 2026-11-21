// Canonical state dump and trace recorder: the same lines as the oracle
// (tools/oracle/patches/P0: state_dump.cpp, oracle.cpp; docs/trace-format.md).
import { fnv, fnvInit } from './core/ints';
import type { InputEvent, MachineObserver } from './core/machine';
import type { SimHalt, Task } from './core/scheduler';
import type { World } from './game/globals';
import type { Carriage, Location, Rail, RailConnection, RailInfo, Train } from './game/types';

export type Section = [name: string, values: number[]];

function railId(r: Rail | null): number {
  return r ? r.id : 0;
}

function carriageId(c: Carriage | null): number {
  return c ? c.id : 0;
}

function trainIdx(t: Train | null): number {
  return t ? t.idx : -1;
}

/** Collects the canonical state (state_dump.cpp: collect) */
export function collectState(G: World): Section[] {
  const out: Section[] = [];
  let cur: number[] = [];
  const section = (name: string) => {
    cur = [];
    out.push([name, cur]);
  };
  const put = (v: number | boolean) => cur.push(typeof v === 'boolean' ? (v ? 1 : 0) : v | 0);
  const putRail = (r: Rail) => {
    put(r.x);
    put(r.y);
    put(r.type);
    put(r.minPathStep);
    put(r.maxPathStep);
    for (let i = 0; i < 3; ++i) put(r.semSlotIdByDirection[i]);
    for (let i = 0; i < 2; ++i) {
      put(railId(r.connections[i].rail));
      put(r.connections[i].slot);
    }
  };
  const putLocation = (l: Location) => {
    put(l.pathStep);
    put(l.forwardDirection);
    put(railId(l.rail));
  };
  const putConnection = (c: RailConnection) => {
    put(railId(c.rail));
    put(c.slot);
  };
  const putRailInfo = (ri: RailInfo) => {
    put(ri.roadTypeMask);
    put(ri.tileX);
    put(ri.tileY);
    put(ri.railType);
    put(ri.year_8);
  };

  const m = G.m;
  section('sys');
  put(m.timer.startValue);
  put(m.timer.enabled);
  put(m.timer.multiplier);
  put(m.timer.startTime % 4294967296);
  put(Math.floor(m.timer.startTime / 4294967296));
  put(G.rng.seed);
  put(G.lastKeyPressed);
  put(G.lastKeyCode);
  put(m.mouse.buttonState);
  put(m.mouse.cursorX);
  put(m.mouse.cursorY);
  put(m.mouse.cursorVisible);

  section('game');
  put(G.gameTime);
  put(G.isDemoMode);
  put(G.gameOver);
  put(G.soundEnabled);
  put(G.previousMouseButtonState);
  put(G.footerMessageTimeout);
  put(G.lastProcessedTrain);
  for (const v of G.lastProcessedCarriages) put(v);
  put(G.entranceCount);
  put(G.railRoadCount);
  put(G.nSwitches);
  put(G.semaphoreCount);
  put(G.newSemaphoreCount);
  put(G.erasedSemaphoreCount);
  for (const v of G.cuttingDownStaticObjectsByKind) put(v);
  put(G.demoFileLetter);
  put(G.demoMouseMsg.action);
  put(G.demoMouseMsg.x);
  put(G.demoMouseMsg.y);
  put(G.mode === null ? 0 : G.mode === G.modeManagement ? 1 : 2);
  put(G.modeManagement.x);
  put(G.modeManagement.y);
  put(G.modeConstruction.x);
  put(G.modeConstruction.y);
  putRailInfo(G.railCursorState);
  for (const c of G.playerName) put(c);

  section('headers');
  for (const h of G.headers) {
    put(h.x);
    put(h.y);
    put(h.valueLimit);
    put(h.nDigits);
    put(h.curAnimatingDigit);
    put(h.value);
    put(h.yScroll);
    for (const d of h.digitValues) put(d);
  }

  section('queues');
  put(G.mouseMsgQueue.items.length);
  put(G.mouseMsgQueue.waitingTask !== null);
  for (const e of G.mouseMsgQueue.items) {
    put(e.action);
    put(e.x);
    put(e.y);
  }
  put(G.railConstructionMsgQueue.items.length);
  put(G.railConstructionMsgQueue.waitingTask !== null);
  for (const ri of G.railConstructionMsgQueue.items) putRailInfo(ri);
  put(G.headerAnimationTaskQueue.items.length);
  put(G.headerAnimationTaskQueue.waitingTask !== null);
  for (const r of G.headerAnimationTaskQueue.items) {
    put(r.delta);
    put(r.fieldId);
    put(r.value);
  }

  section('dialogs');
  for (const d of G.dialogs) {
    put(d.x);
    for (const y of d.itemY) put(y);
    put(d.itemWidth);
  }
  {
    const item = G.dialogs[3].itemNames[1];
    put(item === 'Save' ? 0 : item === '  OK' ? 1 : 2);
  }

  section('rails');
  for (const r of G.rails) putRail(r);

  section('road');
  for (let i = 0; i < G.railRoadCount; ++i) putRailInfo(G.railRoad[i]);
  for (const v of G.railroadTypeMasks) put(v);

  section('switches');
  for (let i = 0; i < G.nSwitches; ++i) {
    const s = G.switches[i];
    put(s.x);
    put(s.y);
    putConnection(s.exit);
    putConnection(s.entry);
    putConnection(s.disabledPath);
    put(s.adjacentSwitchIdx);
  }

  section('semaphores');
  for (let i = 0; i < G.semaphoreCount; ++i) {
    const s = G.semaphores[i];
    put(railId(s.rail));
    put(s.type);
    put(s.isRed);
    put(s.isRightDirection);
    put(s.pixelX);
    put(s.pixelY);
    put(s.glyph);
  }

  section('entrances');
  for (const e of G.entrances) {
    put(e.bgColor);
    put(e.fgColor);
    put(e.entranceRailInfoIdx);
    put(e.waitingTrainsCount);
    putRail(e.rail);
  }

  section('objects');
  for (const o of G.staticObjects) {
    put(o.x);
    put(o.y);
    put(o.kind);
    put(o.type);
    put(o.color);
    put(o.creationYear);
  }

  section('trains');
  for (const t of G.trains) {
    put(t.isFreeSlot);
    put(t.carriageCnt);
    put(t.drawingChainIdx);
    put(t.needToRedraw);
    put(t.isActualPosition);
    put(t.speed);
    put(t.maxSpeed);
    put(t.headCarriageIdx);
    put(t.movementDebt);
    put(t.year);
    put(t.lastMovementTime);
    putLocation(t.head);
    putLocation(t.tail);
    for (const c of t.carriages) {
      put(carriageId(c.next));
      put(c.drawingPriority);
      put(trainIdx(c.train));
      put(c.dstEntranceIdx);
      put(c.type);
      put(c.direction);
      put(c.x_direction);
      putLocation(c.location);
      put(c.rect.x1);
      put(c.rect.y1);
      put(c.rect.x2);
      put(c.rect.y2);
    }
  }

  section('chains');
  put(G.collidedTrainsArrayLen);
  for (let i = 0; i < G.collidedTrainsArrayLen; ++i) {
    put(carriageId(G.collidedTrainsArray[i][0]));
    put(carriageId(G.collidedTrainsArray[i][1]));
  }
  put(G.trainDrawingChainLen);
  for (let i = 0; i < G.trainDrawingChainLen; ++i) {
    let guard = 0;
    for (let c = G.trainDrawingChains[i]; c && guard < 200; c = c.next, ++guard) put(carriageId(c));
    put(0);
  }
  put(G.needToRedrawTrains);
  return out;
}

export function hashSections(sections: Section[]): number {
  let h = fnvInit;
  for (const [, v] of sections) {
    h = fnv(h, v.length);
    for (const x of v) h = fnv(h, x >>> 0);
  }
  return h;
}

export function sectionsJson(sections: Section[]): string {
  return '{' + sections.map(([n, v]) => `"${n}":[${v.join(',')}]`).join(',') + '}';
}

const hex8 = (h: number) => h.toString(16).padStart(8, '0');

export interface TraceOptions {
  dumpEveryUs: number;
  chainEveryUs: number;
}

/** Produces the oracle trace format line by line */
export class TraceRecorder implements MachineObserver {
  readonly lines: string[] = ['V shortline-trace 1', 'L 1'];
  private lastHash = 0;
  private haveHash = false;
  private nextDump = 0;
  private lastDelta: Section[] = [];
  private chain = fnvInit;
  private chainSteps = 0;
  private nextChain = 0;
  finished = false;

  constructor(
    private readonly world: () => World,
    private readonly opts: TraceOptions,
  ) {}

  onTaskAdded(task: Task, now: number): void {
    this.lines.push(`T ${now} ${task.id}`);
  }

  onTaskResumed(task: Task, now: number): void {
    const sections = collectState(this.world());
    const h = hashSections(sections);
    if (!this.haveHash || h !== this.lastHash) {
      if (this.opts.chainEveryUs > 0) {
        this.chain = fnv(this.chain, now % 4294967296);
        this.chain = fnv(this.chain, Math.floor(now / 4294967296));
        this.chain = fnv(this.chain, task.id);
        this.chain = fnv(this.chain, h);
        ++this.chainSteps;
      } else this.lines.push(`H ${now} ${task.id} ${hex8(h)}`);
      this.lastHash = h;
      this.haveHash = true;
    }
    if (this.opts.chainEveryUs > 0 && now >= this.nextChain) {
      this.lines.push(`C ${now} ${this.chainSteps} ${hex8(this.chain)}`);
      while (this.nextChain <= now) this.nextChain += this.opts.chainEveryUs;
    }
    if (this.opts.dumpEveryUs > 0 && now >= this.nextDump) {
      const changed = sections.filter(
        (s, i) => i >= this.lastDelta.length || !sameArray(this.lastDelta[i][1], s[1]),
      );
      this.lines.push(`D ${now} ${sectionsJson(changed)}`);
      this.lastDelta = sections;
      while (this.nextDump <= now) this.nextDump += this.opts.dumpEveryUs;
    }
  }

  onSound(freq: number, now: number): void {
    this.lines.push(`S ${now} ${freq}`);
  }

  onStatus(text: string, now: number): void {
    this.lines.push(`M ${now} ${text}`);
  }

  onInput(ev: InputEvent, now: number): void {
    if (ev.type === 'key') this.lines.push(`I ${now} key ${ev.scancode} ${ev.down ? 1 : 0} 0 0`);
    else this.lines.push(`I ${now} mouse ${ev.flags} ${ev.buttons} ${ev.x} ${ev.y}`);
  }

  onUB(what: string, now: number): void {
    this.lines.push(`U ${now} ${what}`);
  }

  onHalt(halt: SimHalt, now: number): void {
    if (this.finished) return;
    this.finished = true;
    const sections = collectState(this.world());
    this.lines.push(`F ${now} ${sectionsJson(sections)}`);
    if (this.opts.chainEveryUs > 0) this.lines.push(`C ${now} ${this.chainSteps} ${hex8(this.chain)}`);
    this.lines.push(`E ${now} ${halt.reason} ${hex8(hashSections(sections))}`);
  }
}

function sameArray(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) if (a[i] !== b[i]) return false;
  return true;
}
