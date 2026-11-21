// The "hardware": virtual clock, scheduler runner, timer (system/time.cpp),
// VGA frame timing (headless VGAEmulation::flush / waitVerticalRetrace),
// mouse driver, keyboard, PC speaker and the input queue.
// This mirrors the oracle's headless driver (tools/oracle/patches/P0, P1, P4).

import { u16 } from './ints';
import { type Blocking, type Clock, type Effect, Scheduler, SimHalt, type Task, type TaskGen } from './scheduler';

/** reSL uses 60 FPS (docs/fidelity.md, D1) */
export const FPS = 60;
export const FRAME_US = Math.trunc(1000000 / FPS); // 16666
export const MS_PER_TICK = 10;

export const LOGICAL_SCREEN_WIDTH = 640;
export const LOGICAL_SCREEN_HEIGHT = 350;

export type InputEvent =
  | { readonly t: number; readonly type: 'mouse'; readonly flags: number; readonly buttons: number; readonly x: number; readonly y: number }
  | { readonly t: number; readonly type: 'key'; readonly scancode: number; readonly down: boolean };

export interface MachineObserver {
  onTaskAdded?(task: Task, now: number): void;
  onTaskResumed?(task: Task, now: number): void;
  onFrame?(now: number): void;
  onSound?(freq: number, now: number): void;
  onInput?(ev: InputEvent, now: number): void;
  onHalt?(halt: SimHalt, now: number): void;
}

export class MouseEvent {
  propagation = true;
  constructor(
    readonly flags: number,
    readonly buttonState: number,
    readonly x: number,
    readonly y: number,
  ) {}

  stopPropagation(): void {
    this.propagation = false;
  }
}

/**
 * Mouse handlers run inside VGAEmulation::flush() (SDL event polling). Some of
 * them block (MenuButton/CloseButton::click wait for 8 frames), and a blocking
 * wait polls events again: input delivery is re-entrant, as in reSL.
 */
export type MouseHandler = (e: MouseEvent) => void | Blocking;

/** MouseDriver::HandlerHolder */
export interface HandlerHolder {
  remove(): void;
}

export class MouseDriver {
  /** front = most recently added (std::list::push_front) */
  private readonly handlers: MouseHandler[] = [];
  buttonState = 0;
  cursorX = 0;
  cursorY = 0;
  cursorVisible = false;

  addHandler(h: MouseHandler): HandlerHolder {
    this.handlers.unshift(h);
    let removed = false;
    return {
      remove: () => {
        if (removed) return;
        removed = true;
        const i = this.handlers.indexOf(h);
        if (i >= 0) this.handlers.splice(i, 1);
      },
    };
  }

  setCursorVisibility(v: boolean): void {
    this.cursorVisible = v;
  }

  isTouchDevice(): boolean {
    return false;
  }

  private *handle(flags: number, btnState: number, x: number, y: number): Blocking {
    if (this.handlers.length === 0) return;
    const e = new MouseEvent(flags, btnState, x, y);
    // iterate over a snapshot: handlers are added/removed only by task code,
    // which never runs while handlers are being called
    for (const h of [...this.handlers]) {
      const r = h(e);
      if (r) yield* r;
      if (!e.propagation) break;
    }
  }

  private *onMouseMove(x: number, y: number): Blocking {
    x = Math.min(x, LOGICAL_SCREEN_WIDTH);
    y = Math.min(y, LOGICAL_SCREEN_HEIGHT);
    yield* this.handle(0, this.buttonState, x, y);
    this.cursorX = x;
    this.cursorY = y;
  }

  /** reSL issues a motion event manually here (the demo mode relies on it) */
  *setPosition(x: number, y: number): Blocking {
    yield* this.onMouseMove(x, y);
  }

  *inputEvent(flags: number, buttons: number, x: number, y: number): Blocking {
    this.buttonState = buttons;
    if (!flags) yield* this.onMouseMove(x, y);
    else yield* this.handle(flags, this.buttonState, x, y);
  }
}

export type KeyboardHandler = (keycode: number) => void;

/** system/time.cpp: Timer */
export class Timer {
  startValue = 0; // TimeT (u16)
  startTime = 0; // virtual us
  multiplier = 1;
  enabled = false;

  constructor(private readonly clock: Clock) {}

  time(): number {
    if (!this.enabled) return this.startValue;
    const ms = Math.trunc((this.clock.now - this.startTime) / 1000);
    return u16(this.startValue + Math.trunc((ms * this.multiplier) / MS_PER_TICK));
  }

  start(): void {
    if (!this.enabled) {
      this.startTime = this.clock.now;
      this.enabled = true;
    }
  }

  stop(): void {
    if (this.enabled) {
      this.startValue = this.time();
      this.enabled = false;
    }
  }

  setTimeAcceleration(m: number): void {
    this.stop();
    this.multiplier = m;
    this.start();
  }
}

interface Resumption {
  task: Task;
  level: number;
  pendingBlockUntil: number | null;
}

export class Machine implements Clock {
  now = 0;
  readonly sched: Scheduler;
  readonly timer: Timer;
  readonly mouse = new MouseDriver();
  keyboardHandler: KeyboardHandler | null = null;
  nextFrameTime = 0;
  stopAt = Infinity;
  halted: SimHalt | null = null;
  /** current PC speaker frequency (0 = silent), for the presentation */
  soundFreq = 0;

  private readonly input: InputEvent[] = [];
  private inputPos = 0;
  private cur: Resumption | null = null;

  constructor(readonly observer: MachineObserver = {}) {
    this.sched = new Scheduler(this, {
      onTaskAdded: (t) => this.observer.onTaskAdded?.(t, this.now),
      onTaskResumed: (t) => {
        this.observer.onTaskResumed?.(t, this.now);
        this.checkStop();
      },
    });
    this.timer = new Timer(this);
  }

  // ---- time ----------------------------------------------------------------

  /** getTime() (1c61:000e) */
  getTime(): number {
    return this.timer.time();
  }

  /** SleepAwaitable(time * MsPerTick / getTimeAcceleration()) — `co_await sleep(t)` */
  sleep(ticks: number): Effect {
    const ms = Math.trunc((ticks * MS_PER_TICK) / this.timer.multiplier);
    return { k: 'sleep', until: this.now + ms * 1000 };
  }

  /** `co_await yield()` = 1 ms */
  yieldEffect(): Effect {
    return { k: 'sleep', until: this.now + 1000 };
  }

  // ---- input ---------------------------------------------------------------

  /** Events must be pushed in non-decreasing time order */
  pushInput(ev: InputEvent): void {
    const last = this.input[this.input.length - 1];
    if (last && ev.t < last.t) throw new Error('input events must be sorted by time');
    this.input.push(ev);
  }

  private *deliverInput(): Blocking {
    while (this.inputPos < this.input.length && this.input[this.inputPos].t <= this.now) {
      const ev = this.input[this.inputPos++];
      this.observer.onInput?.(ev, this.now);
      if (ev.type === 'key') {
        if (this.keyboardHandler && ev.scancode) this.keyboardHandler((ev.scancode | (ev.down ? 0 : 0x80)) & 0xff);
      } else yield* this.mouse.inputEvent(ev.flags, ev.buttons, ev.x, ev.y);
    }
  }

  // ---- VGA frame -----------------------------------------------------------

  /** VGAEmulation::flush */
  *flush(): Blocking {
    if (this.now < this.nextFrameTime) return;
    this.nextFrameTime = this.now + FRAME_US;
    this.observer.onFrame?.(this.now);
    this.checkStop();
    yield* this.deliverInput(); // Driver::pollEvent
  }

  /** VGAEmulation::waitVerticalRetrace */
  *waitVerticalRetrace(): Blocking {
    if (this.now < this.nextFrameTime) yield { k: 'block', until: this.nextFrameTime };
    yield* this.flush();
  }

  /** Driver::sleep(ms) == activeSleep(ticks) (1 tick ~= 1 ms there) */
  *driverSleep(ms: number): Blocking {
    yield { k: 'block', until: this.now + ms * 1000 };
    yield* this.flush();
  }

  // ---- PC speaker ----------------------------------------------------------

  sound(freq: number): void {
    this.soundFreq = freq;
    this.observer.onSound?.(freq, this.now);
  }

  nosound(): void {
    this.soundFreq = 0;
    this.observer.onSound?.(0, this.now);
  }

  // ---- halting ---------------------------------------------------------------

  private checkStop(): void {
    if (this.now >= this.stopAt) throw new SimHalt('stop');
  }

  // ---- scheduler runner (Scheduler::run) -------------------------------------

  /**
   * Runs the scheduler while its virtual time does not exceed `target`.
   * The clock only takes exact values (task wake-up times, frame times);
   * it never jumps to `target` itself.
   */
  advanceTo(target: number): void {
    if (this.halted) return;
    try {
      this.loop(target);
    } catch (e) {
      if (e instanceof SimHalt) {
        this.halted = e;
        this.observer.onHalt?.(e, this.now);
        return;
      }
      throw e;
    }
  }

  private loop(target: number): void {
    for (;;) {
      if (this.cur) {
        if (!this.continueResume(target)) return;
        continue;
      }
      if (!this.sched.hasTasks()) return;
      const front = this.sched.front();
      if (front && front.sleepUntil <= this.now) {
        const task = this.sched.takeFront();
        this.cur = { task, level: this.activeLevel(task), pendingBlockUntil: null };
        this.sched.current = task;
        continue;
      }
      const t = front ? front.sleepUntil : this.now + 10000;
      if (t > target) return;
      this.now = t;
    }
  }

  /** Task::resume: find the coroutine to resume (destroying finished inner ones) */
  private activeLevel(task: Task): number {
    let i = 0;
    while (i + 1 < task.levels.length) {
      if (!task.levels[i + 1].done) {
        ++i;
        continue;
      }
      task.levels.length = i + 1; // m_inner.destroy()
      break;
    }
    return i;
  }

  /** Returns false if the resumption is blocked beyond `target` */
  private continueResume(target: number): boolean {
    const cur = this.cur!;
    const task = cur.task;
    if (cur.pendingBlockUntil !== null) {
      if (cur.pendingBlockUntil > target) return false;
      if (cur.pendingBlockUntil > this.now) this.now = cur.pendingBlockUntil;
      cur.pendingBlockUntil = null;
    }
    const level = task.levels[cur.level];
    for (;;) {
      const r = level.gen.next();
      if (r.done) {
        level.done = true;
        break;
      }
      const e = r.value;
      if (e.k === 'block') {
        if (e.until <= target) {
          if (e.until > this.now) this.now = e.until;
          continue;
        }
        cur.pendingBlockUntil = e.until;
        return false;
      }
      if (e.k === 'sleep') {
        task.sleepUntil = e.until;
        break;
      }
      if (e.k === 'pop') {
        task.suspended = true;
        e.q.waitingTask = task;
        break;
      }
      // 'call': the outer coroutine suspends, the inner one starts on the next resume
      task.levels.push({ gen: e.g, done: false });
      break;
    }
    this.cur = null;
    this.sched.current = null;
    this.sched.finishResume(task);
    return true;
  }

  /** The time the machine needs to reach before it can make progress */
  nextEventTime(): number {
    if (this.halted) return Infinity;
    if (this.cur) return this.cur.pendingBlockUntil ?? this.now;
    const front = this.sched.front();
    return front ? Math.max(front.sleepUntil, this.now) : this.now + 10000;
  }

  addTask(gen: TaskGen, name: string): Task {
    return this.sched.addTask(gen, name);
  }
}
