// Cooperative scheduler: a port of reSL tasks/{task,scheduler}.{h,cpp} and
// tasks/message_queue.h with C++20 coroutines replaced by generators.
//
// A task is a generator yielding effects:
//   sleep  - SleepAwaitable: set m_sleepUntil and return to the scheduler
//   pop    - MessageQueue::pop() on an empty queue: suspend until push()
//   call   - `co_await subTask()`: the C++ semantics are kept exactly (an extra
//            scheduler round trip before the inner task starts and after it ends)
//   block  - a blocking wait inside the task (waitVerticalRetrace, activeSleep):
//            the virtual clock jumps forward, no other task runs
//
// Blocking waits are generators too (`yield* waitVerticalRetrace()`): they
// must be able to return control to the host when the virtual time runs ahead
// of the real time.

export type Effect =
  | { readonly k: 'sleep'; readonly until: number }
  | { readonly k: 'pop'; readonly q: MessageQueue<unknown> }
  | { readonly k: 'call'; readonly g: TaskGen }
  | { readonly k: 'block'; readonly until: number };

export type TaskGen = Generator<Effect, void, void>;
/** A function that may block (yield `block` effects) and returns T */
export type Blocking<T = void> = Generator<Effect, T, void>;

export interface Clock {
  now: number;
}

interface Level {
  gen: TaskGen;
  done: boolean;
}

export class Task {
  // Context
  sleepUntil = 0; // a newly created task has the highest priority: epoch
  suspended = false;
  readonly levels: Level[];
  alive = true;

  constructor(
    gen: TaskGen,
    readonly priority: number,
    readonly id: number,
    readonly name: string,
  ) {
    this.levels = [{ gen, done: false }];
  }
}

/** Thrown to abort the simulation (stop time reached, exit, undefined behaviour) */
export class SimHalt extends Error {
  constructor(readonly reason: 'stop' | 'exit' | 'ub', readonly detail = '') {
    super(`${reason}${detail ? `: ${detail}` : ''}`);
  }
}

export interface SchedulerHooks {
  onTaskAdded(task: Task): void;
  onTaskResumed(task: Task): void;
}

// AwakeTimeCompare: the queue front is the task with the smallest sleepUntil,
// and among those the highest priority. Priorities are unique, so the choice
// does not depend on the heap implementation.
function before(a: Task, b: Task): boolean {
  if (a.sleepUntil === b.sleepUntil) return a.priority > b.priority;
  return a.sleepUntil < b.sleepUntil;
}

export class Scheduler {
  readonly tasks: Task[] = []; // m_tasks (insertion order)
  private readonly queue: Task[] = []; // m_queue (as a set; front = min by `before`)
  private nextTaskId = 0;
  current: Task | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly hooks: SchedulerHooks,
  ) {}

  addTask(gen: TaskGen, name: string): Task {
    // The original game has logic that relies on a new task being launched next.
    let highestPriority = 0;
    for (const t of this.tasks) if (highestPriority < t.priority) highestPriority = t.priority;
    const task = new Task(gen, highestPriority + 1, ++this.nextTaskId, name);
    this.tasks.push(task);
    this.queue.push(task);
    this.hooks.onTaskAdded(task);
    return task;
  }

  stopTask(task: Task | null): boolean {
    if (!task) return false;
    const idx = this.tasks.indexOf(task);
    if (idx < 0) return false;
    this.tasks.splice(idx, 1);
    const qi = this.queue.indexOf(task);
    if (qi >= 0) this.queue.splice(qi, 1);
    task.alive = false;
    // task.destroy(): destructors of the outer coroutine's locals run (finally
    // blocks); inner coroutines (m_inner) are leaked by reSL and are not destroyed.
    task.levels[0].gen.return();
    return true;
  }

  resumeTask(task: Task): void {
    // reSL asserts that the task is alive (a dangling handle would be UB)
    if (!task.alive) throw new SimHalt('ub', `resumeTask: task ${task.id} (${task.name}) is destroyed`);
    if (!task.suspended) return;
    task.suspended = false;
    task.sleepUntil = this.clock.now;
    this.queue.push(task);
  }

  suspendTask(task: Task): void {
    if (task.suspended) return;
    task.suspended = true;
    const qi = this.queue.indexOf(task);
    if (qi >= 0) this.queue.splice(qi, 1);
  }

  /** Front of the heap (or null) */
  front(): Task | null {
    let best: Task | null = null;
    for (const t of this.queue) if (!best || before(t, best)) best = t;
    return best;
  }

  takeFront(): Task {
    const t = this.front()!;
    this.queue.splice(this.queue.indexOf(t), 1);
    return t;
  }

  pushBack(task: Task): void {
    this.queue.push(task);
  }

  hasTasks(): boolean {
    return this.tasks.length > 0;
  }

  /** Called after a resumption finished (the task returned to the scheduler) */
  finishResume(task: Task): void {
    if (task.levels[0].done) {
      const idx = this.tasks.indexOf(task);
      if (idx >= 0) this.tasks.splice(idx, 1);
      task.alive = false;
    } else if (!task.suspended && task.alive) {
      this.queue.push(task);
    }
    this.hooks.onTaskResumed(task);
  }
}

// ---- message queue --------------------------------------------------------

export class MessageQueue<T> {
  readonly items: T[] = [];
  waitingTask: Task | null = null;

  constructor(private readonly sched: () => Scheduler) {}

  push(msg: T): void {
    this.items.push(msg);
    if (this.waitingTask) this.sched().resumeTask(this.waitingTask);
  }

  clear(): void {
    this.items.length = 0;
    if (this.waitingTask) {
      // the task was moved to the execution queue because a message was pushed;
      // the queue is cleared => cancel the spurious wake up
      this.sched().suspendTask(this.waitingTask);
    }
  }

  /** await_resume */
  take(): T {
    if (this.items.length === 0) throw new Error('MessageQueue: pop from an empty queue');
    const res = this.items.shift()!;
    this.waitingTask = null;
    return res;
  }
}

/** `co_await queue.pop()` */
export function* pop<T>(q: MessageQueue<T>): Generator<Effect, T, void> {
  if (q.items.length === 0) yield { k: 'pop', q: q as MessageQueue<unknown> };
  return q.take();
}
