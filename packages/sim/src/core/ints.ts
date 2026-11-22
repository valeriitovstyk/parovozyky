// Fixed-width integer helpers. Every assignment to a field that has an
// explicit C width goes through one of these (see ).

export const i8 = (v: number): number => (v << 24) >> 24;
export const u8 = (v: number): number => v & 0xff;
export const i16 = (v: number): number => (v << 16) >> 16;
export const u16 = (v: number): number => v & 0xffff;
export const i32 = (v: number): number => v | 0;
export const u32 = (v: number): number => v >>> 0;

/** C integer division (truncation towards zero) */
export const idiv = (a: number, b: number): number => Math.trunc(a / b);

/** C remainder (sign of the dividend) */
export const irem = (a: number, b: number): number => a % b;

/** arithmetic shift right (utility/sar.h) */
export const sar = (v: number, n: number): number => v >> n;

export const fnvInit = 2166136261;
export function fnv(h: number, v: number): number {
  return Math.imul((h ^ v) >>> 0, 16777619) >>> 0;
}
