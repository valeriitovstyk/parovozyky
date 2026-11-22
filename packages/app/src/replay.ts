// Replay recording: seed + player name + the user files at the start + every
// input event with its virtual time = a complete, deterministic record of a
// session. The exported JSON is a scenario of tests/golden (tools/oracle/scenario.mjs):
// `pnpm replay <file>` runs it on the port and on the native oracle.
import type { FileStore } from '@parovozyky/sim';

type Event = [number, 'key', number, number] | [number, 'mouse', number, number, number, number];

function b64(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}

export class ReplayRecorder {
  private readonly input: Event[] = [];
  private readonly files: Record<string, { base64: string }> = {};

  constructor(
    readonly seed: number,
    readonly playerName: string,
    store: FileStore,
    userFiles: string[],
  ) {
    for (const n of userFiles) {
      const d = store.read(n);
      if (d) this.files[n] = { base64: b64(d) };
    }
  }

  mouse(t: number, flags: number, buttons: number, x: number, y: number): void {
    this.input.push([t, 'mouse', flags, buttons, x, y]);
  }

  key(t: number, scancode: number, down: boolean): void {
    this.input.push([t, 'key', scancode, down ? 1 : 0]);
  }

  /** a scenario that stops at `nowUs` */
  export(nowUs: number, version: string): string {
    const demos = Object.fromEntries('abcdefghijklmnopqrst'.split('').map((c) => [`demo_${c}`, { from: `demo_${c}` }]));
    return JSON.stringify(
      {
        name: `replay-${new Date().toISOString().replace(/[:.]/g, '-')}`,
        app: version,
        seed: this.seed,
        playerName: this.playerName,
        stopAtUs: Math.floor(nowUs),
        dumpEveryUs: 1000000,
        chainEveryUs: 1000000,
        files: { ...demos, ...this.files },
        input: this.input,
      },
      null,
      1,
    );
  }
}
