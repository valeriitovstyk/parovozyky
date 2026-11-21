// Data structures of reSL (game/*.h). Field widths are noted; every write
// goes through the helpers of core/ints.ts.

export enum Color {
  Green = 0,
  Black = 1,
  Gray = 2,
  DarkGray = 3,
  White = 4,
  Yellow = 5,
  Brown = 6,
  Blue = 7,
  DarkBlue = 8,
  Red = 9,
  DarkRed = 10,
  Cyan = 11,
  DarkCyan = 12,
  LightGreen = 13,
  DarkGreen = 14,
  BWBlinking = 15,
}

/** game/rail_info.h */
export class RailInfo {
  roadTypeMask = 0; // u8
  tileX = 0; // u8
  tileY = 0; // u8
  railType = 0; // u8
  year_8 = 0; // u8

  static copy(dst: RailInfo, src: RailInfo): RailInfo {
    dst.roadTypeMask = src.roadTypeMask;
    dst.tileX = src.tileX;
    dst.tileY = src.tileY;
    dst.railType = src.railType;
    dst.year_8 = src.year_8;
    return dst;
  }

  clone(): RailInfo {
    return RailInfo.copy(new RailInfo(), this);
  }

  copyFrom(src: RailInfo): void {
    RailInfo.copy(this, src);
  }
}

/** game/rail.h */
export class RailConnection {
  constructor(
    public rail: Rail | null = null,
    public slot = 0, // u16
  ) {}

  set(src: RailConnection): void {
    this.rail = src.rail;
    this.slot = src.slot;
  }

  clone(): RailConnection {
    return new RailConnection(this.rail, this.slot);
  }
}

export class Rail {
  x = 0; // i16
  y = 0; // i16
  type = 0; // u8
  minPathStep = 0; // u8
  maxPathStep = 0; // u8
  readonly semSlotIdByDirection = [0, 0, 0]; // i8[3]
  readonly connections: [RailConnection, RailConnection] = [new RailConnection(), new RailConnection()];

  /** pointer identity for traces: 0 null, 1 g_disabledSwitchPath, 2.. g_rails, 728.. entrances */
  constructor(readonly id: number) {}
}

/** `inline static Rail* const g_disabledSwitchPath = reinterpret_cast<Rail*>(1);` */
export const DISABLED_SWITCH_PATH = new Rail(1);

export const INNER_ENTRANCE_RAIL_TYPE = 6;

/** game/switch.h */
export class Switch {
  x = 0; // i16
  y = 0; // i16
  readonly exit = new RailConnection();
  readonly entry = new RailConnection();
  readonly disabledPath = new RailConnection();
  adjacentSwitchIdx = 0; // i16
}

/** game/semaphore.h */
export enum SemaphoreType {
  RightUp = 0,
  RightDown = 1,
  LeftUp = 2,
  LeftDown = 3,
  None = -1,
}

export class Semaphore {
  rail: Rail | null = null;
  type: SemaphoreType = SemaphoreType.RightUp; // i16
  isRed = false;
  isRightDirection = false;
  pixelX = 0; // i16
  pixelY = 0; // i16
  /** index into g_semaphoreGlyphs[2][2] (flattened), -1 = nullptr */
  glyph = -1;

  copyFrom(s: Semaphore): void {
    this.rail = s.rail;
    this.type = s.type;
    this.isRed = s.isRed;
    this.isRightDirection = s.isRightDirection;
    this.pixelX = s.pixelX;
    this.pixelY = s.pixelY;
    this.glyph = s.glyph;
  }
}

/** game/entrance.h */
export class Entrance {
  waitingTrainsCount = 0; // u8
  entranceRailInfoIdx = 0; // u8
  readonly rail: Rail;

  constructor(
    public bgColor: Color,
    public fgColor: Color,
    idx: number,
  ) {
    this.rail = new Rail(728 + idx);
  }
}

export const NORMAL_ENTRANCE_COUNT = 6;
export const SERVER_ENTRANCE_IDX = 6;
export const CRASHED_TRAIN_ENTRANCE_IDX = 7;
export const BLINKING_TRAIN_ENTRANCE_IDX = 8;

/** game/static_object.h */
export enum StaticObjectKind {
  None = 0,
  BuildingHouse = 1,
  House = 2,
  Tree = 3,
}

export class StaticObject {
  x = 0; // i16
  y = 0; // i16
  kind = StaticObjectKind.None; // u8
  type = 0; // u8
  color = Color.Green; // u8
  creationYear = 0; // u8

  copyFrom(o: StaticObject): void {
    this.x = o.x;
    this.y = o.y;
    this.kind = o.kind;
    this.type = o.type;
    this.color = o.color;
    this.creationYear = o.creationYear;
  }
}

/** game/train.h */
export enum CarriageType {
  Server = 0,
  AncientLocomotive = 1,
  SteamLocomotive = 2,
  Trolley = 3,
  DieselLocomotive = 4,
  ElectricLocomotive = 5,
  HighSpeedLocomotive = 6,
  AncientPassengerCarriage = 7,
  PassengerCarriage = 8,
  HighSpeedPassengerCarriage = 9,
  OpenFreightCarriage = 10,
  CoveredFreightCarriage = 11,
  PocketWagon = 12,
  TankWagon = 13,
  CrashedTrain = 14,
}

export class Location {
  pathStep = 0; // u8
  forwardDirection = 0; // u8 (bool)
  rail: Rail | null = null;

  set(src: Location): void {
    this.pathStep = src.pathStep;
    this.forwardDirection = src.forwardDirection;
    this.rail = src.rail;
  }

  clone(): Location {
    const l = new Location();
    l.set(this);
    return l;
  }
}

export class Rectangle {
  x1 = 0; // i16
  y1 = 0; // i16
  x2 = 0; // i16
  y2 = 0; // i16

  set(r: Rectangle): void {
    this.x1 = r.x1;
    this.y1 = r.y1;
    this.x2 = r.x2;
    this.y2 = r.y2;
  }
}

/* 1a65:050b */
export function setEmptyRectangle(r: Rectangle): void {
  r.x1 = 10000;
  r.x2 = -10000;
  r.y1 = 10000;
  r.y2 = -10000;
}

export class Carriage {
  next: Carriage | null = null;
  drawingPriority = 0; // i16
  train: Train | null = null;
  dstEntranceIdx = 0; // u8
  type = CarriageType.Server; // u8
  direction = 0; // u8
  x_direction = 0; // u8
  readonly location = new Location();
  readonly rect = new Rectangle();

  constructor(readonly id: number) {}

  /** `train.carriages[0] = c` (struct copy) */
  copyFrom(c: Carriage): void {
    this.next = c.next;
    this.drawingPriority = c.drawingPriority;
    this.train = c.train;
    this.dstEntranceIdx = c.dstEntranceIdx;
    this.type = c.type;
    this.direction = c.direction;
    this.x_direction = c.x_direction;
    this.location.set(c.location);
    this.rect.set(c.rect);
  }
}

export class Train {
  isFreeSlot = false;
  carriageCnt = 0; // u8
  drawingChainIdx = 0; // u8
  needToRedraw = false;
  isActualPosition = false;
  speed = 0; // u8
  maxSpeed = 0; // u8
  headCarriageIdx = 0; // u8
  movementDebt = 0; // u8
  year = 0; // i16
  lastMovementTime = 0; // i16
  readonly carriages: Carriage[];
  readonly head = new Location();
  readonly tail = new Location();

  constructor(readonly idx: number) {
    this.carriages = [0, 1, 2, 3, 4].map((i) => new Carriage(idx * 5 + i + 1));
  }

  /** memset(&train, 0, sizeof(train)) */
  zero(): void {
    this.isFreeSlot = false;
    this.carriageCnt = 0;
    this.drawingChainIdx = 0;
    this.needToRedraw = false;
    this.isActualPosition = false;
    this.speed = 0;
    this.maxSpeed = 0;
    this.headCarriageIdx = 0;
    this.movementDebt = 0;
    this.year = 0;
    this.lastMovementTime = 0;
    for (const c of this.carriages) {
      c.next = null;
      c.drawingPriority = 0;
      c.train = null;
      c.dstEntranceIdx = 0;
      c.type = CarriageType.Server;
      c.direction = 0;
      c.x_direction = 0;
      c.location.pathStep = 0;
      c.location.forwardDirection = 0;
      c.location.rail = null;
      c.rect.x1 = c.rect.y1 = c.rect.x2 = c.rect.y2 = 0;
    }
    for (const l of [this.head, this.tail]) {
      l.pathStep = 0;
      l.forwardDirection = 0;
      l.rail = null;
    }
  }
}

/** game/header_field.h */
export enum HeaderFieldId {
  Trains = 0,
  Money = 1,
  Year = 2,
  Level = 3,
}

export class HeaderField {
  curAnimatingDigit = 0; // i8
  value = 0; // i16
  yScroll = 0; // i16
  readonly digitValues = [0, 0, 0, 0, 0, 0]; // u8[6]

  constructor(
    public x: number, // i16
    public y: number, // i16
    public valueLimit: number, // i16
    public nDigits: number, // i8
  ) {}
}

export interface HeaderValueChangeRequest {
  delta: number; // i8
  fieldId: HeaderFieldId;
  value: number; // i16
}

/** game/mouse/mouse.h */
export enum MouseAction {
  None = 0,
  ToggleSound = 3,
  BuildRails = 5,
  ToggleNextRailType = 6,
  ToggleMouseMode = 7,
  CallServer = 8,
  MouseClick = 10,
}

export interface MsgMouseEvent {
  action: MouseAction; // u8
  x: number; // i16
  y: number; // i16
}

/** ui/components/dialog.h */
export enum DialogType {
  MainMenu = 0,
  Archive = 1,
  Confirmation = 2,
  Pause = 3,
  Alert = 4,
}

export interface Dialog {
  title: string;
  itemNames: (string | null)[]; // 7 entries, null = nullptr
  x: number; // i16
  readonly itemY: number[]; // i16[7]
  itemWidth: number; // i16
}

/** system/mouse.h */
export const ME_MOVED = 1;
export const ME_LEFTPRESSED = 2;
export const ME_LEFTRELEASED = 4;
export const ME_RIGHTPRESSED = 8;
export const ME_RIGHTRELEASED = 16;
export const ME_CENTERPRESSED = 32;
export const ME_CENTERRELEASED = 64;
export const MB_NONE = 0;
export const MB_LEFT = 1;
export const MB_RIGHT = 2;
export const MB_MIDDLE = 4;

/** system/keyboard.h */
export const KEY_RELEASED_FLAG = 0x80;
export const KEY_ESCAPE = 1;
export const KEY_1 = 2;
export const KEY_2 = 3;
export const KEY_3 = 4;
export const KEY_SPACE = 57;
