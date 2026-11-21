// game/savefile/{load_game,save_game}.cpp — the binary format of the original
// game (3830-byte header + rails + switch/semaphore states).
import { i16, i8, u16, u8 } from '../core/ints';
import { G, ub } from './globals';
import { connectRail, isVisible, railIndex } from './rail';
import { resetGameData } from './init';
import { updateSemaphores } from './semaphore';
import { toggleSwitch } from './switch';
import { showStatusMessage } from '../ui/statusBar';
import {
  type Color,
  DISABLED_SWITCH_PATH,
  HeaderFieldId,
  type Location,
  NORMAL_ENTRANCE_COUNT,
  type Rail,
  type StaticObjectKind,
  type CarriageType,
} from './types';

// game/savefile/common.h
const FILE_ENTRANCE_INFO_SIZE = 0x16;
const FILE_ENTRANCE_RAIL_OFFSET = 4;
const FILE_RAIL_SIZE = 0x12;
const FILE_RAIL_ARRAY_SIZE = FILE_RAIL_SIZE * 6 * 10 * 11;

// save_game.cpp: synthetic "addresses" of g_rails / g_entrances
const RAILS_VIRTUAL_OFFSET = 0x0e1f;
const ENTRANCES_VIRTUAL_OFFSET = 0xcafe;

/** Order of pointer values as in DOS (and the oracle, trace line `L 1`):
 *  nullptr < g_disabledSwitchPath < g_entrances[].rail < g_rails[][][] */
export function dosAddressOrder(r: Rail | null): number {
  if (!r) return 0;
  if (r === DISABLED_SWITCH_PATH) return 1;
  if (r.id >= 728) return 10 + (r.id - 728);
  return 100 + railIndex(r);
}

// ---------------------------------------------------------------------------
// loading

const COLORS_OK = (v: number) => v >= 0 && v <= 15;
const KIND_OK = (v: number) => v >= 0 && v <= 3;
const CARRIAGE_OK = (v: number) => v >= 0 && v <= 14;

class Reader {
  private pos = 0;
  private okFlag = true;
  private fail = false;
  private eof = false;

  constructor(private readonly data: Uint8Array) {}

  ok(): boolean {
    return this.okFlag && !this.fail && !this.eof;
  }

  private bytes(n: number): number[] | null {
    if (this.fail) return null;
    if (this.pos + n > this.data.length) {
      this.pos = this.data.length;
      this.eof = true;
      this.fail = true;
      return null;
    }
    const res = Array.from(this.data.subarray(this.pos, this.pos + n));
    this.pos += n;
    return res;
  }

  private int(n: number, signed: boolean): number {
    const b = this.bytes(n);
    if (!b || !this.ok()) {
      this.okFlag = false;
      return 0;
    }
    let v = 0;
    for (let i = n - 1; i >= 0; --i) v = v * 256 + b[i];
    if (signed) v = n === 1 ? i8(v) : i16(v);
    return v;
  }

  u8(): number {
    return this.int(1, false);
  }
  i8(): number {
    return this.int(1, true);
  }
  u16(): number {
    return this.int(2, false);
  }
  i16(): number {
    return this.int(2, true);
  }

  bool(): boolean {
    const v = this.u8();
    if (v !== 0 && v !== 1) {
      this.okFlag = false;
      return false;
    }
    return v === 1;
  }

  enumU8(valid: (v: number) => boolean): number {
    const v = this.u8();
    if (!valid(v)) {
      this.okFlag = false;
      return 0;
    }
    return v;
  }

  ignore(n: number): void {
    // File::ignore: reads while good()
    if (this.fail || this.eof) return;
    const m = Math.min(n, this.data.length - this.pos);
    this.pos += m;
    if (m < n) {
      this.eof = true;
      this.fail = true;
    }
  }

  readBytes(n: number): Uint8Array {
    if (this.fail) return new Uint8Array(n);
    const m = Math.min(n, this.data.length - this.pos);
    const res = new Uint8Array(n);
    res.set(this.data.subarray(this.pos, this.pos + m));
    this.pos += m;
    if (m < n) {
      this.eof = true;
      this.fail = true;
    }
    return res;
  }

  skipPadding(n: number): void {
    const b = this.readBytes(n);
    if (!b.every((c) => c === 0)) this.okFlag = false;
  }

  isFinished(): boolean {
    if (!this.ok()) return false;
    this.ignore(1);
    return this.eof;
  }
}

/** a Location whose rail is still a raw 16-bit "pointer" from the file */
interface RawLocation {
  loc: Location;
  raw: number;
}

function readLocation(r: Reader, loc: Location, raws: RawLocation[]): void {
  loc.pathStep = r.u8();
  loc.forwardDirection = r.u8();
  raws.push({ loc, raw: r.u16() });
  loc.rail = null;
}

function fixLoadedRailPtr(p: number): Rail | null {
  if (p < G.railsLoadedOffset || p > G.railsLoadedOffset + FILE_RAIL_ARRAY_SIZE) return null;
  const offset = p - G.railsLoadedOffset;
  if (offset % FILE_RAIL_SIZE) return null;
  return G.rails[offset / FILE_RAIL_SIZE];
}

/* 1400:0061 */
function fixLoadedLocation(l: RawLocation): boolean {
  if (!l.raw) {
    l.loc.rail = null;
    return true;
  }
  const c = l.raw;
  const base = G.entrancesLoadedOffset + FILE_ENTRANCE_RAIL_OFFSET;
  if (c >= base && c <= base + FILE_ENTRANCE_INFO_SIZE * 5) {
    const offset = c - base;
    if (offset % FILE_ENTRANCE_INFO_SIZE) return false;
    l.loc.rail = G.entrances[offset / FILE_ENTRANCE_INFO_SIZE].rail;
  } else {
    const ptr = fixLoadedRailPtr(c);
    if (!ptr) return false;
    l.loc.rail = ptr;
  }
  return true;
}

interface LoadState {
  switchStates: Uint8Array;
  semaphoresAreRed: Uint8Array;
  trainLocations: RawLocation[][];
  entranceRawConnections: number[][];
}

/* 1400:041c */
function loadGameState(fileName: string, st: LoadState): boolean {
  const data = G.files.read(fileName);
  if (!data) return false;
  const r = new Reader(data);

  G.railsLoadedOffset = r.u16();
  G.entrancesLoadedOffset = r.u16();
  G.playerName.set(r.readBytes(20));
  for (const fld of G.headers) {
    fld.x = r.i16();
    fld.y = r.i16();
    fld.valueLimit = r.i16();
    fld.nDigits = r.i8();
    fld.curAnimatingDigit = r.i8();
    fld.value = r.i16();
    fld.yScroll = r.i16();
    for (let i = 0; i < 6; ++i) fld.digitValues[i] = u8(r.i8());
  }
  G.entranceCount = r.i16();
  for (let i = 0; i < NORMAL_ENTRANCE_COUNT; ++i) {
    const e = G.entrances[i];
    e.bgColor = r.enumU8(COLORS_OK) as Color;
    e.fgColor = r.enumU8(COLORS_OK) as Color;
    e.entranceRailInfoIdx = r.u8();
    e.waitingTrainsCount = r.u8();
    e.rail.x = r.i16();
    e.rail.y = r.i16();
    e.rail.type = u8(r.i8());
    e.rail.minPathStep = u8(r.i8());
    e.rail.maxPathStep = u8(r.i8());
    for (let k = 0; k < 3; ++k) e.rail.semSlotIdByDirection[k] = r.i8();
    const raws: number[] = [];
    for (const rc of e.rail.connections) {
      raws.push(r.u16());
      rc.rail = null;
      rc.slot = r.u16();
    }
    st.entranceRawConnections[i] = raws;
  }
  for (const so of G.staticObjects) {
    so.x = r.i16();
    so.y = r.i16();
    so.kind = r.enumU8(KIND_OK) as StaticObjectKind;
    so.type = r.u8();
    so.color = r.enumU8(COLORS_OK) as Color;
    so.creationYear = r.u8();
  }
  for (const t of G.trains) {
    const raws: RawLocation[] = [];
    t.isFreeSlot = r.bool();
    t.carriageCnt = r.u8();
    t.drawingChainIdx = r.u8();
    t.needToRedraw = r.bool();
    t.isActualPosition = r.bool();
    t.speed = r.u8();
    t.maxSpeed = r.u8();
    t.headCarriageIdx = r.u8();
    t.movementDebt = r.u8();
    r.skipPadding(1);
    t.year = r.i16();
    t.lastMovementTime = r.i16();
    for (const c of t.carriages) {
      r.ignore(2); // Carriage* next (garbage)
      c.next = null;
      c.drawingPriority = r.i16();
      r.ignore(2); // Train* (garbage)
      c.train = null;
      c.dstEntranceIdx = r.u8();
      c.type = r.enumU8(CARRIAGE_OK) as CarriageType;
      c.direction = r.u8();
      c.x_direction = r.u8();
      readLocation(r, c.location, raws);
      c.rect.x1 = r.i16();
      c.rect.y1 = r.i16();
      c.rect.x2 = r.i16();
      c.rect.y2 = r.i16();
    }
    readLocation(r, t.head, raws);
    readLocation(r, t.tail, raws);
    st.trainLocations.push(raws);
  }

  G.railRoadCount = r.u16();
  if (!r.ok()) return false;
  for (let i = 0; i < G.railRoadCount; ++i) {
    const ri = G.railRoad[i];
    if (!ri) ub('g_railRoad overflow while loading');
    ri.roadTypeMask = r.u8();
    ri.tileX = r.u8();
    ri.tileY = r.u8();
    ri.railType = r.u8();
    ri.year_8 = r.u8();
    r.skipPadding(1);
  }

  let cnt = r.u16();
  if (!r.ok()) return false;
  st.switchStates = r.readBytes(cnt);
  cnt = r.u16();
  st.semaphoresAreRed = r.readBytes(cnt);

  return r.isFinished();
}

/* 1400:009c */
export function loadSavedGame(fileName: string): boolean {
  resetGameData();
  const st: LoadState = {
    switchStates: new Uint8Array(0),
    semaphoresAreRed: new Uint8Array(0),
    trainLocations: [],
    entranceRawConnections: [],
  };
  if (!loadGameState(fileName, st)) return false;

  for (let ti = 0; ti < G.trains.length; ++ti) {
    const train = G.trains[ti];
    const raws = st.trainLocations[ti];
    if (train.isFreeSlot) {
      // clean the data for safety reasons - v0.93 wrote broken pointers here
      train.zero();
      train.isFreeSlot = true;
      for (const r of raws) r.raw = 0;
    }
    // raws: carriages 0..4, head, tail
    if (!fixLoadedLocation(raws[5]) || !fixLoadedLocation(raws[6])) return false;
    for (let i = 0; i < 5; ++i) {
      train.carriages[i].train = train;
      if (!fixLoadedLocation(raws[i])) return false;
    }
    train.lastMovementTime = i16(G.m.getTime());
  }

  for (let i = 0; i < NORMAL_ENTRANCE_COUNT; ++i) {
    const e = G.entrances[i];
    const [raw0, raw1] = st.entranceRawConnections[i];
    const ptr = fixLoadedRailPtr(raw0);
    if (!ptr) return false;
    e.rail.connections[0].rail = ptr;
    // connections[1] is not fixed by reSL: it must be nullptr in a valid file
    if (raw1) ub('entrance rail connections[1] is not null in the save file');
    const r = ptr;
    r.connections[isVisible(r) ? 1 : 0].rail = e.rail;
  }
  for (let i = 0; i < G.railRoadCount; ++i) {
    connectRail(G.railRoad[i]);
    updateSemaphores(G.railRoad[i]);
  }
  for (let i = 0; i < G.nSwitches; ++i) {
    const s = G.switches[i];
    const state = i < st.switchStates.length ? st.switchStates[i] : 0;
    const cur = dosAddressOrder(s.entry.rail) < dosAddressOrder(s.disabledPath.rail);
    if (cur !== (state !== 0)) toggleSwitch(s);
  }
  for (let i = 0; i < G.semaphoreCount; ++i) {
    G.semaphores[i].isRed = (i < st.semaphoresAreRed.length ? st.semaphoresAreRed[i] : 0) !== 0;
  }
  return true;
}

// ---------------------------------------------------------------------------
// saving

class Writer {
  readonly out: number[] = [];
  u8(v: number): void {
    this.out.push(v & 0xff);
  }
  u16(v: number): void {
    this.out.push(v & 0xff, (v >> 8) & 0xff);
  }
  bytes(b: ArrayLike<number>): void {
    for (let i = 0; i < b.length; ++i) this.out.push(b[i] & 0xff);
  }
}

function railPtr(r: Rail | null): number {
  if (!r) return 0;
  if (r === DISABLED_SWITCH_PATH) return 1;
  if (r.id >= 728) return u16(ENTRANCES_VIRTUAL_OFFSET + FILE_ENTRANCE_RAIL_OFFSET + (r.id - 728) * FILE_ENTRANCE_INFO_SIZE);
  return u16(RAILS_VIRTUAL_OFFSET + railIndex(r) * FILE_RAIL_SIZE);
}

function writeLocation(w: Writer, l: Location): void {
  w.u8(l.pathStep);
  w.u8(l.forwardDirection);
  w.u16(railPtr(l.rail));
}

/** Serialises the current game state (save_game.cpp: saveGameState) */
export function serializeGame(): Uint8Array {
  const w = new Writer();
  w.u16(RAILS_VIRTUAL_OFFSET);
  w.u16(ENTRANCES_VIRTUAL_OFFSET);
  w.bytes(G.playerName);
  for (const fld of G.headers) {
    w.u16(fld.x);
    w.u16(fld.y);
    w.u16(fld.valueLimit);
    w.u8(fld.nDigits);
    w.u8(fld.curAnimatingDigit);
    w.u16(fld.value);
    w.u16(fld.yScroll);
    for (const v of fld.digitValues) w.u8(v);
  }
  w.u16(G.entranceCount);
  for (let i = 0; i < NORMAL_ENTRANCE_COUNT; ++i) {
    const e = G.entrances[i];
    w.u8(e.bgColor);
    w.u8(e.fgColor);
    w.u8(e.entranceRailInfoIdx);
    w.u8(e.waitingTrainsCount);
    w.u16(e.rail.x);
    w.u16(e.rail.y);
    w.u8(e.rail.type);
    w.u8(e.rail.minPathStep);
    w.u8(e.rail.maxPathStep);
    for (const s of e.rail.semSlotIdByDirection) w.u8(s);
    for (const rc of e.rail.connections) {
      w.u16(railPtr(rc.rail));
      w.u16(rc.slot);
    }
  }
  for (const so of G.staticObjects) {
    w.u16(so.x);
    w.u16(so.y);
    w.u8(so.kind);
    w.u8(so.type);
    w.u8(so.color);
    w.u8(so.creationYear);
  }
  for (const t of G.trains) {
    w.u8(t.isFreeSlot ? 1 : 0);
    w.u8(t.carriageCnt);
    w.u8(t.drawingChainIdx);
    w.u8(t.needToRedraw ? 1 : 0);
    w.u8(t.isActualPosition ? 1 : 0);
    w.u8(t.speed);
    w.u8(t.maxSpeed);
    w.u8(t.headCarriageIdx);
    w.u8(t.movementDebt);
    w.u8(0); // padding
    w.u16(t.year);
    w.u16(t.lastMovementTime);
    for (const c of t.carriages) {
      w.u16(0); // Carriage* pointer, ignored when loading
      w.u16(c.drawingPriority);
      w.u16(0); // Train* pointer, ignored when loading
      w.u8(c.dstEntranceIdx);
      w.u8(c.type);
      w.u8(c.direction);
      w.u8(c.x_direction);
      writeLocation(w, c.location);
      w.u16(c.rect.x1);
      w.u16(c.rect.y1);
      w.u16(c.rect.x2);
      w.u16(c.rect.y2);
    }
    writeLocation(w, t.head);
    writeLocation(w, t.tail);
  }
  if (w.out.length !== 3830) throw new Error(`save header size ${w.out.length} != 3830`);

  w.u16(G.railRoadCount);
  for (let i = 0; i < G.railRoadCount; ++i) {
    const ri = G.railRoad[i];
    w.u8(ri.roadTypeMask);
    w.u8(ri.tileX);
    w.u8(ri.tileY);
    w.u8(ri.railType);
    w.u8(ri.year_8);
    w.u8(0); // padding
  }
  w.u16(G.nSwitches);
  for (let i = 0; i < G.nSwitches; ++i) {
    const s = G.switches[i];
    w.u8(dosAddressOrder(s.entry.rail) < dosAddressOrder(s.disabledPath.rail) ? 1 : 0);
  }
  w.u16(G.semaphoreCount);
  for (let i = 0; i < G.semaphoreCount; ++i) w.u8(G.semaphores[i].isRed ? 1 : 0);
  return new Uint8Array(w.out);
}

function pad3(v: number): string {
  // snprintf("%03d")
  const neg = v < 0;
  let s = String(Math.abs(v));
  while (s.length < (neg ? 2 : 3)) s = '0' + s;
  return (neg ? '-' : '') + s;
}

/* 1400:05a6 */
function generateFileName(): string {
  const buf: string[] = new Array(16).fill('\0');
  const put = (at: number, s: string) => {
    for (let i = 0; i < s.length; ++i) buf[at + i] = s[i];
    buf[at + s.length] = '\0';
  };
  put(0, pad3(G.headers[HeaderFieldId.Money].value));
  buf[3] = String.fromCharCode(97 + G.rng.genRandomNumber(26));
  buf[4] = String.fromCharCode(97 + G.rng.genRandomNumber(26));
  put(5, pad3(G.headers[HeaderFieldId.Year].value - 1000));
  buf[8] = '.';
  {
    const lv = G.headers[HeaderFieldId.Level].value;
    let s = String(Math.abs(lv));
    while (s.length < (lv < 0 ? 1 : 2)) s = '0' + s;
    put(9, (lv < 0 ? '-' : '') + s);
  }
  buf[11] = '_';
  buf[12] = '\0';
  return buf.slice(0, buf.indexOf('\0')).join('');
}

/* 1400:0004 */
export function saveGame(): boolean {
  showStatusMessage('SAVING ...      ');
  const fileName = generateFileName();
  G.files.write(fileName, serializeGame());
  G.emit({ type: 'save', fileName });
  showStatusMessage('SAVING ... DONE ');
  // drawStatusBarWithCopyright(0): drawing only
  return true;
}

// ---------------------------------------------------------------------------
// archive (load_game.cpp: findNextSaveFile, system/filesystem.cpp: FileSearch)

function matchPattern(name: string, pattern: string): boolean {
  if (name.length !== pattern.length) return false;
  for (let i = 0; i < pattern.length; ++i) if (pattern[i] !== '?' && pattern[i] !== name[i]) return false;
  return true;
}

/* 12b1:0006 — sorted by name (docs/fidelity.md, D2; oracle P6) */
function findFirst(pattern: string): number {
  G.searchEntries = G.files
    .list()
    .filter((n) => matchPattern(n, pattern))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  G.searchPos = 0;
  return G.searchEntries.length ? 0 : 1;
}

/* 12b1:001d */
function findNext(): number {
  return ++G.searchPos < G.searchEntries.length ? 0 : 1;
}

export interface FileInfo {
  fileTime: number;
  fileDate: number;
  fileName: string;
}

/* 1000:12a8 — a fixed date: 1992-06-15 12:00:00 */
export function lastSearchResult(): FileInfo {
  return {
    fileName: G.searchEntries[G.searchPos],
    fileDate: 15 | (6 << 5) | ((1992 - 1980) << 9),
    fileTime: 12 << 11,
  };
}

/* 1400:0638 */
export function findNextSaveFile(): number {
  const searchPaths = ['????????.??_'];
  let err: number;
  if (!G.searchStarted) {
    const initialPath = G.curPath;
    do {
      err = findFirst(searchPaths[G.curPath]);
      if (!err) {
        G.searchStarted = true;
        break;
      }
      G.curPath = (G.curPath + 1) % searchPaths.length;
    } while (G.curPath !== initialPath);
  } else {
    err = findNext();
    if (err) {
      G.curPath = (G.curPath + 1) % searchPaths.length;
      G.searchStarted = false;
      err = findNextSaveFile();
    }
  }
  return err;
}
