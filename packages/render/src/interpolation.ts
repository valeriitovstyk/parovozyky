// Smooth movement between the discrete positions of the simulator. The
// logic moves a train at most once per 150 ms (15 ticks); the renderer
// glides from the previous position to the new one over the observed interval.
// It never writes into the simulator.
import * as THREE from 'three';

interface Track {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromHeading: number;
  toHeading: number;
  t0: number;
  duration: number;
  lastChange: number;
}

const SNAP_DISTANCE = 80;

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class TrainInterpolator {
  private readonly tracks = new Map<number, Track>();

  position(id: number, target: THREE.Vector3, heading: number, _simNow: number, nowMs: number) {
    let tr = this.tracks.get(id);
    if (!tr) {
      tr = { from: target.clone(), to: target.clone(), fromHeading: heading, toHeading: heading, t0: nowMs, duration: 1, lastChange: nowMs };
      this.tracks.set(id, tr);
    } else if (!tr.to.equals(target) || tr.toHeading !== heading) {
      const cur = this.sample(tr, nowMs);
      const interval = nowMs - tr.lastChange;
      tr.lastChange = nowMs;
      if (cur.pos.distanceTo(target) > SNAP_DISTANCE) {
        tr.from.copy(target);
        tr.fromHeading = heading;
      } else {
        tr.from.copy(cur.pos);
        tr.fromHeading = cur.heading;
      }
      tr.to.copy(target);
      tr.toHeading = heading;
      tr.t0 = nowMs;
      tr.duration = Math.min(400, Math.max(60, interval));
    }
    return this.sample(tr, nowMs);
  }

  private sample(tr: Track, nowMs: number) {
    const t = Math.min(1, (nowMs - tr.t0) / tr.duration);
    return { pos: tr.from.clone().lerp(tr.to, t), heading: lerpAngle(tr.fromHeading, tr.toHeading, t) };
  }

  forget(id: number): void {
    this.tracks.delete(id);
  }
}
