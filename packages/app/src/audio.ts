// PC speaker: a square oscillator following sound(freq) / nosound().
export class Beeper {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  muted = false;

  /** must be called from a user gesture */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.osc = this.ctx.createOscillator();
      this.osc.type = 'square';
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.osc.connect(this.gain).connect(this.ctx.destination);
      this.osc.start();
    } catch {
      this.ctx = null;
    }
  }

  /** `delaySec` from now (sounds produced while the logic runs ahead are delayed) */
  set(freq: number, delaySec: number): void {
    if (!this.ctx || !this.osc || !this.gain) return;
    const when = this.ctx.currentTime + Math.max(0, delaySec);
    if (freq > 0 && !this.muted) {
      this.osc.frequency.setValueAtTime(Math.min(freq, 20000), when);
      this.gain.gain.setValueAtTime(0.06, when);
    } else this.gain.gain.setValueAtTime(0, when);
  }

  silence(): void {
    if (this.ctx && this.gain) this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
  }
}
