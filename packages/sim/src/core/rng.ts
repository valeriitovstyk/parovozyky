// Turbo C runtime rand()/srand() (docs/fidelity.md, F1).
//   rand():  seed = seed * 22695477 + 1; return (seed >> 16) & 0x7FFF
//   srand(): seed = (unsigned 16-bit) s
import { i16 } from './ints';

export class Rng {
  seed = 1;

  rand(): number {
    this.seed = (Math.imul(this.seed, 22695477) + 1) >>> 0;
    return (this.seed >>> 16) & 0x7fff;
  }

  srand(s: number): void {
    this.seed = s & 0xffff;
  }

  /* 1ca7:000a */
  genRandomNumber(max: number): number {
    // std::rand() % max, result as int16
    return i16(this.rand() % max);
  }

  /* 1594:0091 */
  symmetricRand(max: number): number {
    return i16(max - this.genRandomNumber(i16(max * 2 - 1)));
  }
}
