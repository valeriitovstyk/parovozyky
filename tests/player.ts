// A simple "dispatcher" player for long automatic runs: for every train it
// finds a way to the train's entrance over the rail graph (any switch may be
// thrown) and throws the first switch ahead of the train when needed. It only
// sends mouse clicks, like a person would.
//
// Self-contained on purpose (no imports, no outer variables): the browser test
// injects `makePlayer.toString()` into the page.

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PlayerClick {
  x: number;
  y: number;
  /** what the click is for (statistics) */
  what: 'switch' | 'semaphore' | 'server';
  /** the right button (call the server); the left one otherwise */
  right?: boolean;
}

export interface Player {
  /** clicks to send now (management mode, left button) */
  act(): PlayerClick[];
  readonly stats: { switches: number; semaphores: number; servers: number };
}

export function makePlayer(world: any, opts: { lookahead?: number; greenSemaphores?: boolean } = {}): Player {
  const LOOKAHEAD = opts.lookahead ?? 8;
  const DISABLED = 1; // the id of g_disabledSwitchPath
  const SERVER = 0; // CarriageType.Server
  const BLINKING = 8; // BLINKING_TRAIN_ENTRANCE_IDX
  const stats = { switches: 0, semaphores: 0, servers: 0 };
  const CRASHED = 14; // CarriageType.CrashedTrain
  // act() calls: a server is called at most once per 40 calls
  let calls = 0;
  let lastServerCall = -1e9;
  const key = (rail: any, slot: number) => rail.id * 2 + slot;

  interface Edge {
    rail: any;
    dir: number;
    sw: number;
    /** the switch must be thrown to take this edge */
    toggle: boolean;
  }

  function act(): PlayerClick[] {
    const w = world;
    if (w.mode !== w.modeManagement || w.video.screen !== 'game') return [];
    const out: PlayerClick[] = [];

    if (opts.greenSemaphores ?? true)
      for (let i = 0; i < w.semaphoreCount; ++i) {
        const s = w.semaphores[i];
        if (s.isRed) {
          out.push({ x: s.pixelX, y: s.pixelY - 12, what: 'semaphore' });
          stats.semaphores++;
          return out; // one click per call
        }
      }

    // the switch ends: exit (common), entry (set), disabled (the other branch)
    const exitOf = new Map<number, number>();
    const entryOf = new Map<number, number>();
    const disabledOf = new Map<number, number>();
    for (let i = 0; i < w.nSwitches; ++i) {
      const s = w.switches[i];
      exitOf.set(key(s.exit.rail, s.exit.slot), i);
      entryOf.set(key(s.entry.rail, s.entry.slot), i);
      disabledOf.set(key(s.disabledPath.rail, s.disabledPath.slot), i);
    }

    // (rail, dir): on `rail`, heading to its end `dir`
    const edges = (rail: any, dir: number): Edge[] => {
      const k = key(rail, dir);
      const res: Edge[] = [];
      const sx = exitOf.get(k);
      if (sx !== undefined) {
        const s = w.switches[sx];
        res.push({ rail: s.entry.rail, dir: s.entry.slot ^ 1, sw: sx, toggle: false });
        res.push({ rail: s.disabledPath.rail, dir: s.disabledPath.slot ^ 1, sw: sx, toggle: true });
        return res;
      }
      const se = entryOf.get(k);
      if (se !== undefined) {
        const s = w.switches[se];
        return [{ rail: s.exit.rail, dir: s.exit.slot ^ 1, sw: se, toggle: false }];
      }
      const sd = disabledOf.get(k);
      if (sd !== undefined) {
        const s = w.switches[sd];
        return [{ rail: s.exit.rail, dir: s.exit.slot ^ 1, sw: sd, toggle: true }];
      }
      const c = rail.connections[dir];
      if (c.rail && c.rail.id !== DISABLED) res.push({ rail: c.rail, dir: c.slot ^ 1, sw: -1, toggle: false });
      return res;
    };

    // the first switch decision on the shortest way to a target rail
    const plan = (rail: any, dir: number, targets: Set<any>): { sw: number; toggle: boolean; dist: number } | null => {
      const start = key(rail, dir);
      const prev = new Map<number, { from: number; e: Edge | null }>([[start, { from: -1, e: null }]]);
      const queue: [any, number, number][] = [[rail, dir, start]];
      for (let qi = 0; qi < queue.length && qi < 4000; ++qi) {
        const [r, d, k] = queue[qi];
        if (targets.has(r)) {
          // walk back to the first switch on the way
          let first: { sw: number; toggle: boolean; dist: number } | null = null;
          let depth = 0;
          for (let cur = k; cur !== start; ) {
            const p = prev.get(cur)!;
            if (p.e!.sw >= 0) first = { sw: p.e!.sw, toggle: p.e!.toggle, dist: 0 };
            cur = p.from;
            ++depth;
          }
          if (!first) return null;
          // the distance (in rails) to that switch
          let dist = 0;
          for (let cur = k, seen = false; cur !== start; ) {
            const p = prev.get(cur)!;
            if (seen) ++dist;
            if (p.e!.sw === first.sw && !seen) seen = true;
            cur = p.from;
          }
          void depth;
          first.dist = dist;
          return first;
        }
        for (const e of edges(r, d)) {
          const nk = key(e.rail, e.dir);
          if (prev.has(nk)) continue;
          prev.set(nk, { from: k, e });
          queue.push([e.rail, e.dir, nk]);
        }
      }
      return null;
    };

    const entranceRails = new Set<any>();
    for (let i = 0; i < w.entranceCount; ++i) entranceRails.add(w.entrances[i].rail);
    // wrecks block the way until a server clears them
    const wrecks = new Set<any>();
    let servers = 0;
    for (const t of w.trains) {
      if (t.isFreeSlot || !t.carriageCnt) continue;
      if (t.carriages[0].type === SERVER) ++servers;
      for (let i = 0; i < t.carriageCnt; ++i) if (t.carriages[i].type === CRASHED && t.carriages[i].location.rail) wrecks.add(t.carriages[i].location.rail);
    }
    const now = ++calls;
    if (wrecks.size && !servers && w.headers[1].value > 50 && now - lastServerCall > 40) {
      // from an entrance that has a way to a wreck
      for (let i = 0; i < w.entranceCount; ++i) {
        const e = w.entrances[i];
        if (plan(e.rail, 1, wrecks) || plan(e.rail, 0, wrecks)) {
          out.push({ x: e.rail.x, y: e.rail.y, what: 'server', right: true });
          stats.servers++;
          lastServerCall = now;
          break;
        }
      }
    }

    const wants: { sw: number; toggle: boolean; dist: number }[] = [];
    for (const t of w.trains) {
      if (t.isFreeSlot || !t.carriageCnt || !t.head.rail || t.head.rail.id === DISABLED) continue;
      const c0 = t.carriages[0];
      const targets =
        c0.type === SERVER && wrecks.size
          ? wrecks
          : c0.type === SERVER || c0.dstEntranceIdx === BLINKING
          ? entranceRails
          : c0.dstEntranceIdx < w.entranceCount
            ? new Set([w.entrances[c0.dstEntranceIdx].rail])
            : null;
      if (!targets) continue;
      const p = plan(t.head.rail, t.head.forwardDirection, targets);
      if (p && p.dist <= LOOKAHEAD) wants.push(p);
    }
    // the nearest train decides; one click per switch
    wants.sort((a, b) => a.dist - b.dist);
    const decided = new Set<number>();
    for (const p of wants) {
      if (decided.has(p.sw)) continue;
      decided.add(p.sw);
      if (!p.toggle) continue;
      const s = w.switches[p.sw];
      out.push({ x: s.x, y: s.y, what: 'switch' });
      stats.switches++;
    }
    return out;
  }

  return { act, stats };
}
