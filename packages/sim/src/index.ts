// ShortLine deterministic simulator (no DOM, no wall clock, no Math.random).
export const SIM_VERSION = '0.1.0';
export { createSim, type Sim, type SimOptions } from './sim';
export { MemoryFileStore, type FileStore } from './files';
export type { InputEvent } from './core/machine';
export { FRAME_US } from './core/machine';
export { collectState, hashSections, sectionsJson, TraceRecorder, type Section } from './trace';
export type { SimEvent } from './game/globals';
export { serializeGame } from './game/savefile';
export { uiGlyphs } from './data/glyphs';
export * as tables from './data/tables';
export * as glyphTables from './data/glyphs';
export { Color, CarriageType, StaticObjectKind, INNER_ENTRANCE_RAIL_TYPE } from './game/types';
export type { World } from './game/globals';
