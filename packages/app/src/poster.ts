// The title picture: Lviv railway station in the style of the original poster
// (flat colours, black outlines, a limited palette, dithering), drawn at three
// times the original resolution. The game logic still loads the original
// poster into the emulated video memory; this picture covers it.
//
// Coordinates are physical pixels of the 640x480 screen (the 640x350 picture
// is shown on a 4:3 monitor), so circles stay round.

const PW = 640;
const PH = 480;
export const POSTER_SCALE = 3;
const CW = PW * POSTER_SCALE;
const CH = 350 * POSTER_SCALE;

/** EGA colours plus a few warm and stone tones */
const PALETTE = [
  '#000000', '#ffffff', '#555555', '#aaaaaa', '#c8c8c8', '#e4e4e4',
  '#55ffff', '#aaffff', '#9fbfd0', '#7f9fb4',
  '#0000aa', '#5555ff', '#88c8e8', '#4878a0',
  '#006600', '#00aa00', '#55ff55',
  '#aa0000', '#ff5555', '#aa5500', '#553300', '#7a4a20',
  '#ffff55', '#ddaa00', '#f0e0b0', '#d8c8a0', '#b8a478', '#fff8e0',
  '#5fa890', '#3f7868', '#e0b060', '#a8d8a0', '#f0a8a0', '#a8c8f0', '#aa3300',
  '#8fb8a0', '#6f9884',
];

type P = [number, number];
type Quad = [P, P, P, P]; // top-left, top-right, bottom-right, bottom-left

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const bil = (q: Quad, u: number, v: number): P => lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
const sub = (q: Quad, u0: number, v0: number, u1: number, v1: number): Quad => [bil(q, u0, v0), bil(q, u1, v0), bil(q, u1, v1), bil(q, u0, v1)];

class Painter {
  constructor(readonly g: CanvasRenderingContext2D) {}

  private patterns = new Map<string, CanvasPattern>();

  /** a 2x2 checker of two colours (EGA-style dithering) */
  dither(a: string, b: string, sparse = false): CanvasPattern {
    const key = `${a}${b}${sparse}`;
    let p = this.patterns.get(key);
    if (!p) {
      const c = document.createElement('canvas');
      c.width = c.height = sparse ? 4 : 2;
      const x = c.getContext('2d')!;
      x.fillStyle = a;
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = b;
      if (sparse) {
        x.fillRect(0, 0, 1, 1);
        x.fillRect(2, 2, 1, 1);
      } else {
        x.fillRect(0, 0, 1, 1);
        x.fillRect(1, 1, 1, 1);
      }
      p = this.g.createPattern(c, 'repeat')!;
      // one checker cell = one physical pixel
      p.setTransform(new DOMMatrix().scale(1 / POSTER_SCALE, 1 / POSTER_SCALE));
      this.patterns.set(key, p);
    }
    return p;
  }

  poly(pts: P[], fill: string | CanvasPattern | null, stroke: string | null = '#000', lw = 0.6): void {
    const g = this.g;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; ++i) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw;
      g.stroke();
    }
  }

  rect(x: number, y: number, w: number, h: number, fill: string | CanvasPattern | null, stroke: string | null = '#000', lw = 0.6): void {
    this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, stroke, lw);
  }

  circle(x: number, y: number, r: number, fill: string | CanvasPattern | null, stroke: string | null = '#000', lw = 0.6): void {
    const g = this.g;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw;
      g.stroke();
    }
  }

  ellipse(x: number, y: number, rx: number, ry: number, fill: string | null, stroke: string | null = '#000', lw = 0.6): void {
    const g = this.g;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw;
      g.stroke();
    }
  }

  line(a: P, b: P, color = '#000', lw = 0.6): void {
    const g = this.g;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.stroke();
  }

  /** an arched window: a rectangle with a round top */
  arch(x: number, y: number, w: number, h: number, glass: string, frame = '#000', mullions = true): void {
    const g = this.g;
    const r = w / 2;
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y + r);
    g.arc(x + r, y + r, r, Math.PI, 0);
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fillStyle = glass;
    g.fill();
    g.strokeStyle = frame;
    g.lineWidth = 0.6;
    g.stroke();
    if (mullions && w > 5) {
      this.line([x + r, y + 1], [x + r, y + h], '#fff8e0', 0.5);
      this.line([x, y + r + (h - r) * 0.35], [x + w, y + r + (h - r) * 0.35], '#fff8e0', 0.5);
    }
  }

  text(s: string, x: number, y: number, font: string, fill: string, align: CanvasTextAlign = 'center', stroke?: string): void {
    const g = this.g;
    g.font = font;
    g.textAlign = align;
    g.textBaseline = 'middle';
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = 1.2;
      g.lineJoin = 'round';
      g.strokeText(s, x, y);
    }
    g.fillStyle = fill;
    g.fillText(s, x, y);
  }

  /** draws inside the affine frame of a quad: (0..w, 0..h) maps to its corners */
  inQuad(q: Quad, w: number, h: number, fn: () => void): void {
    const g = this.g;
    g.save();
    const [tl, tr, , bl] = q;
    g.transform((tr[0] - tl[0]) / w, (tr[1] - tl[1]) / w, (bl[0] - tl[0]) / h, (bl[1] - tl[1]) / h, tl[0], tl[1]);
    fn();
    g.restore();
  }

  /** draws in a frame: x along `d`, y straight down, origin `o` */
  inFrame(o: P, d: P, fn: () => void): void {
    const g = this.g;
    g.save();
    g.transform(d[0], d[1], 0, 1, o[0], o[1]);
    fn();
    g.restore();
  }
}

// ---- the scene -------------------------------------------------------------------

const HORIZON = 258;

function sky(p: Painter): void {
  p.rect(0, 0, PW, HORIZON + 4, '#55ffff', null);
  p.rect(0, 200, PW, HORIZON - 196, p.dither('#55ffff', '#aaffff'), null);
  const cloud = (x: number, y: number, s: number) => {
    for (const [dx, dy, r] of [[0, 0, 9], [10, -5, 11], [22, 0, 9], [12, 4, 8], [-9, 3, 6], [31, 3, 6]] as const)
      p.circle(x + dx * s, y + dy * s, r * s, '#ffffff', null);
    p.rect(x - 14 * s, y + 4 * s, 50 * s, 5 * s, '#e4e4e4', null);
  };
  cloud(560, 96, 1);
  cloud(40, 30, 0.8);
  cloud(588, 30, 0.6);
}

/** the High Castle hill: the mound with the flag and the TV tower */
function highCastle(p: Painter): void {
  const g = p.g;
  g.beginPath();
  g.moveTo(188, 262);
  g.bezierCurveTo(214, 200, 240, 152, 274, 148);
  g.bezierCurveTo(306, 145, 334, 178, 362, 262);
  g.closePath();
  g.fillStyle = '#8fb8a0';
  g.fill();
  // trees on the slopes
  for (let i = 0; i < 26; ++i) {
    const x = 200 + ((i * 37) % 150);
    const top = x < 274 ? 262 - ((x - 188) / 86) * 112 : 148 + ((x - 274) / 88) * 112;
    const y = top + 8 + ((i * 53) % 40);
    if (y < 258) p.circle(x, y, 3 + (i % 3), '#6f9884', null);
  }
  // ruins of the castle wall
  p.rect(250, 152, 12, 6, '#9fbfd0', null);
  p.rect(252, 148, 3, 4, '#9fbfd0', null);
  p.rect(258, 149, 3, 3, '#9fbfd0', null);
  // the mound with a flag
  p.poly([[264, 150], [272, 138], [280, 150]], '#6f9884', null);
  p.line([272, 138], [272, 120], '#000', 0.5);
  p.rect(272, 120, 11, 4, '#5555ff', null);
  p.rect(272, 124, 11, 4, '#ffff55', null);
  // the TV tower: a tapering red and white lattice
  const base = 156;
  const top = 92;
  const x0 = 312;
  const w = (y: number) => 2.5 + ((y - top) / (base - top)) * 4.5;
  const n = 8;
  for (let i = 0; i < n; ++i) {
    const y0 = top + ((base - top) * i) / n;
    const y1 = top + ((base - top) * (i + 1)) / n;
    const pts: P[] = [[x0 - w(y0), y0], [x0 + w(y0), y0], [x0 + w(y1), y1], [x0 - w(y1), y1]];
    p.poly(pts, null, i % 2 ? '#ffffff' : '#aa0000', 0.6);
    p.line(pts[0], pts[2], i % 2 ? '#ffffff' : '#aa0000', 0.4);
    p.line(pts[1], pts[3], i % 2 ? '#ffffff' : '#aa0000', 0.4);
  }
  p.rect(x0 - 3, top + 6, 6, 2, '#aa0000', null);
  p.line([x0, top], [x0, top - 12], '#aa0000', 0.8);
  p.circle(x0, top - 12, 0.8, '#ff5555', null);
}

/** distant Lviv: the town hall tower and church domes in haze */
function skyline(p: Painter): void {
  const c = '#9fbfd0';
  const d = '#7f9fb4';
  highCastle(p);
  // town hall
  p.rect(186, 150, 18, 110, c, null);
  p.rect(184, 146, 22, 6, d, null);
  p.rect(189, 128, 12, 18, c, null);
  p.poly([[187, 130], [195, 112], [203, 130]], d, null);
  p.line([195, 112], [195, 102], d, 0.8);
  p.circle(195, 160, 3, '#e4e4e4', null);
  // a cathedral and a church to the right
  p.rect(600, 175, 40, 90, c, null);
  p.ellipse(620, 175, 16, 14, d, null);
  p.rect(618, 152, 4, 10, d, null);
  p.line([620, 152], [620, 142], d, 0.8);
  p.rect(214, 188, 14, 70, c, null);
  p.poly([[213, 190], [221, 168], [229, 190]], d, null);
}

/** the glass and steel platform hall behind the station */
function shed(p: Painter): void {
  const g = p.g;
  const cx = 560;
  const rx = 72;
  const top = 150;
  const base = 205;
  g.beginPath();
  g.moveTo(cx - rx, base);
  g.ellipse(cx, base, rx, base - top, 0, Math.PI, 0);
  g.closePath();
  g.fillStyle = p.dither('#88c8e8', '#aaffff');
  g.fill();
  g.strokeStyle = '#000';
  g.lineWidth = 0.7;
  g.stroke();
  g.save();
  g.clip();
  for (let k = -6; k <= 6; ++k) {
    const a = Math.PI / 2 + (k / 7) * (Math.PI / 2);
    p.line([cx, base], [cx + Math.cos(a) * rx * 1.1, base - Math.sin(a) * (base - top) * 1.1], '#4878a0', 0.5);
  }
  for (const f of [0.35, 0.7]) {
    g.beginPath();
    g.ellipse(cx, base, rx * f, (base - top) * f, 0, Math.PI, 0);
    g.strokeStyle = '#4878a0';
    g.lineWidth = 0.5;
    g.stroke();
  }
  g.restore();
}

/** a dome with a lantern and a spire (towers and corner pavilions) */
function dome(p: Painter, cx: number, base: number, rx: number, h: number, spire: number): void {
  const g = p.g;
  g.beginPath();
  g.moveTo(cx - rx, base);
  g.bezierCurveTo(cx - rx, base - h * 0.9, cx - rx * 0.35, base - h, cx, base - h);
  g.bezierCurveTo(cx + rx * 0.35, base - h, cx + rx, base - h * 0.9, cx + rx, base);
  g.closePath();
  g.fillStyle = '#5fa890';
  g.fill();
  g.strokeStyle = '#000';
  g.lineWidth = 0.6;
  g.stroke();
  // ribs and a shadow side
  g.save();
  g.clip();
  p.rect(cx + rx * 0.25, base - h, rx, h, p.dither('#5fa890', '#3f7868'), null);
  for (const t of [-0.5, 0, 0.5]) p.line([cx + t * rx, base], [cx + t * rx * 0.3, base - h], '#3f7868', 0.4);
  g.restore();
  if (spire > 0) {
    const lw = Math.max(2, rx * 0.35);
    p.rect(cx - lw / 2, base - h - lw * 1.2, lw, lw * 1.2, '#f0e0b0');
    p.ellipse(cx, base - h - lw * 1.2, lw * 0.6, lw * 0.4, '#5fa890');
    p.line([cx, base - h - lw * 1.5], [cx, base - h - lw * 1.5 - spire], '#000', 0.6);
    p.circle(cx, base - h - lw * 1.5 - spire * 0.6, 0.9, '#ddaa00', '#000', 0.3);
  }
}

function station(p: Painter): void {
  const wall = '#f0e0b0';
  const shadow = p.dither('#f0e0b0', '#d8c8a0');
  const stone = '#b8a478';
  const roof = p.dither('#555555', '#aaaaaa');
  const glass = '#4878a0';

  // wings: two floors of arched windows, a mansard roof
  for (const [x0, x1] of [[262, 352], [488, 578]]) {
    p.rect(x0, 184, x1 - x0, 8, roof);
    for (let x = x0 + 6; x < x1 - 4; x += 12) p.rect(x, 186, 3, 4, '#fff8e0', '#000', 0.4);
    p.rect(x0, 192, x1 - x0, HORIZON - 192, wall);
    p.rect(x0, 192, x1 - x0, 3, '#d8c8a0');
    p.rect(x0, 219, x1 - x0, 3, '#d8c8a0');
    p.rect(x0, 252, x1 - x0, 6, stone);
    const n = 7;
    const step = (x1 - x0) / n;
    for (let i = 0; i < n; ++i) {
      const x = x0 + step * i;
      p.arch(x + step / 2 - 3.5, 199, 7, 16, glass);
      p.arch(x + step / 2 - 5, 228, 10, 24, i % 3 === 1 ? '#553300' : glass);
      if (i > 0) p.line([x, 195], [x, 252], '#b8a478', 0.5);
    }
  }
  // corner pavilions
  for (const [x0, x1] of [[228, 262], [578, 612]]) {
    p.rect(x0, 176, x1 - x0, HORIZON - 176, wall);
    p.rect(x0, 174, x1 - x0, 4, '#d8c8a0');
    p.rect(x0, 252, x1 - x0, 6, stone);
    p.arch(x0 + 9, 186, 16, 30, glass);
    p.arch(x0 + 10, 226, 14, 26, glass);
    p.rect(x0 + (x1 - x0) * 0.62, 178, (x1 - x0) * 0.38, 74, shadow, null);
    dome(p, (x0 + x1) / 2, 174, 12, 14, 6);
  }
  // towers with clocks and domes
  for (const [x0, x1] of [[352, 374], [466, 488]]) {
    p.rect(x0, 120, x1 - x0, HORIZON - 120, wall);
    p.rect(x0 - 2, 118, x1 - x0 + 4, 4, '#d8c8a0');
    p.rect(x0, 252, x1 - x0, 6, stone);
    p.rect(x0 + (x1 - x0) * 0.6, 122, (x1 - x0) * 0.4, 130, shadow, null);
    p.circle((x0 + x1) / 2, 134, 6, '#ffffff');
    p.line([(x0 + x1) / 2, 134], [(x0 + x1) / 2, 130], '#000', 0.6);
    p.line([(x0 + x1) / 2, 134], [(x0 + x1) / 2 + 3, 135], '#000', 0.6);
    p.arch(x0 + 6, 148, 10, 28, glass);
    p.arch(x0 + 7, 188, 8, 22, glass);
    p.arch(x0 + 6, 226, 10, 26, glass);
    dome(p, (x0 + x1) / 2, 118, 13, 18, 12);
  }
  // the central block: a pediment, sculptures and the great arched window
  p.rect(374, 140, 92, HORIZON - 140, wall);
  p.g.beginPath();
  p.g.moveTo(372, 141);
  p.g.quadraticCurveTo(420, 112, 468, 141);
  p.g.closePath();
  p.g.fillStyle = '#d8c8a0';
  p.g.fill();
  p.g.strokeStyle = '#000';
  p.g.lineWidth = 0.6;
  p.g.stroke();
  // a sculpture group on the top
  for (const [x, h] of [[408, 9], [420, 13], [432, 9]] as const) {
    p.rect(x - 2, 124 - h, 4, h, '#e4e4e4', '#000', 0.4);
    p.circle(x, 124 - h - 1.8, 1.8, '#e4e4e4', '#000', 0.4);
  }
  p.rect(400, 124, 40, 3, '#c8c8c8', '#000', 0.4);
  p.text('ЛЬВІВ', 420, 134, 'bold 9px Georgia, serif', '#553300');
  // the arch
  const g = p.g;
  g.beginPath();
  g.moveTo(384, 236);
  g.lineTo(384, 178);
  g.arc(420, 178, 36, Math.PI, 0);
  g.lineTo(456, 236);
  g.closePath();
  g.fillStyle = '#d8c8a0';
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(388, 236);
  g.lineTo(388, 178);
  g.arc(420, 178, 32, Math.PI, 0);
  g.lineTo(452, 236);
  g.closePath();
  g.fillStyle = p.dither('#88c8e8', '#4878a0');
  g.fill();
  g.save();
  g.clip();
  for (let k = 0; k <= 8; ++k) {
    const a = Math.PI + (k / 8) * Math.PI;
    p.line([420, 178], [420 + Math.cos(a) * 40, 178 + Math.sin(a) * 40], '#000', 0.4);
  }
  p.circle(420, 178, 10, null, '#000', 0.4);
  for (let x = 396; x < 452; x += 8) p.line([x, 178], [x, 236], '#000', 0.4);
  for (const y of [192, 206, 220]) p.line([388, y], [452, y], '#000', 0.4);
  g.restore();
  g.stroke();
  // piers beside the arch
  for (const x of [376, 458]) p.arch(x, 196, 6, 14, '#b8a478', '#000', false);
  // entrance: a canopy and doors
  p.poly([[380, 232], [460, 232], [466, 238], [374, 238]], '#555555');
  p.text('ВОКЗАЛ', 420, 228, 'bold 6px Arial, sans-serif', '#000000');
  for (let x = 390; x < 450; x += 15) p.rect(x, 240, 10, 18, '#7a4a20');
  p.rect(374, 252, 92, 6, '#b8a478');
}

/** a chestnut tree */
function tree(p: Painter, x: number, y: number, r: number): void {
  p.rect(x - 2, y, 4, r * 1.5, '#553300');
  p.circle(x, y - r * 0.2, r, '#006600');
  for (const [dx, dy, rr] of [[-0.45, -0.3, 0.45], [0.35, -0.5, 0.4], [0.1, 0.1, 0.4], [-0.2, -0.75, 0.3]] as const)
    p.circle(x + dx * r, y + dy * r, rr * r, '#00aa00', null);
  for (let i = 0; i < 9; ++i) p.circle(x + Math.cos(i * 2.4) * r * 0.6, y - r * 0.3 + Math.sin(i * 2.4) * r * 0.55, 1, '#fff8e0', null);
}

function lamp(p: Painter, x: number, base: number, h: number): void {
  p.rect(x - 1.2, base - h, 2.4, h, '#000000', null);
  p.rect(x - 3, base - 3, 6, 3, '#000000', null);
  p.line([x - 7, base - h + 4], [x + 7, base - h + 4], '#000', 1);
  for (const dx of [-7, 0, 7]) p.circle(x + dx, base - h + (dx ? 1 : -2), 3, '#ffffff', '#000', 0.5);
}

function person(p: Painter, x: number, y: number, coat: string, hat = false): void {
  p.rect(x - 2, y - 11, 4, 8, coat, '#000', 0.4);
  p.rect(x - 1.6, y - 3, 1.2, 3, '#000', null);
  p.rect(x + 0.4, y - 3, 1.2, 3, '#000', null);
  p.circle(x, y - 13, 1.8, '#f0c8a0', '#000', 0.4);
  if (hat) p.rect(x - 2.4, y - 15.5, 4.8, 1.4, '#000', null);
}

/** the square: cobbles, tram tracks, a tram, lamps, trees, people */
function square(p: Painter): void {
  p.rect(0, HORIZON, PW, PH - HORIZON, p.dither('#c8c8c8', '#aaaaaa', true), null);
  p.rect(220, HORIZON, 420, 7, '#e4e4e4', null);
  // overhead wire
  p.line([200, 236], [640, 236], '#000', 0.4);
  for (const y of [282, 287]) p.line([200, y], [640, y], '#555555', 0.8);
  tree(p, 240, 236, 20);
  tree(p, 626, 232, 18);
  for (const x of [384, 470, 556]) lamp(p, x, 272, 40);
  // a tram: cream and red, the route board
  const x0 = 252;
  const x1 = 360;
  p.line([x0 + 24, 248], [x0 + 38, 236], '#000', 0.6);
  p.line([x0 + 38, 236], [x0 + 52, 248], '#000', 0.6);
  p.rect(x0 + 6, 247, x1 - x0 - 12, 3, '#555555');
  p.g.beginPath();
  p.g.moveTo(x0 + 4, 282);
  p.g.lineTo(x0, 262);
  p.g.quadraticCurveTo(x0 + 1, 250, x0 + 8, 250);
  p.g.lineTo(x1, 250);
  p.g.lineTo(x1, 282);
  p.g.closePath();
  p.g.fillStyle = '#fff8e0';
  p.g.fill();
  p.g.stroke();
  p.rect(x0 + 1, 270, x1 - x0 - 1, 10, '#aa0000');
  for (let x = x0 + 12; x < x1 - 6; x += 12) p.rect(x, 255, 9, 11, '#4878a0');
  p.rect(x0 + 3, 254, 6, 12, '#4878a0');
  p.rect(x0 + 10, 251, 22, 4, '#000000', null);
  p.text('1 ВОКЗАЛ', x0 + 21, 253.2, 'bold 3.4px Arial, sans-serif', '#ffff55');
  p.text('ЛЬВІВ', (x0 + x1) / 2 + 6, 275, 'bold 6px Georgia, serif', '#ffff55');
  for (const x of [x0 + 18, x0 + 34, x1 - 30, x1 - 14]) p.circle(x, 283, 3.5, '#555555');
  // people on the square
  const coats = ['#aa0000', '#0000aa', '#553300', '#555555', '#006600', '#aa5500', '#5555ff', '#7a4a20'];
  const spots: [number, number][] = [[392, 276], [404, 280], [430, 270], [446, 278], [500, 272], [512, 276], [548, 280], [584, 270], [606, 276], [372, 296], [232, 300]];
  spots.forEach(([x, y], i) => person(p, x, y, coats[i % coats.length], i % 3 === 0));
}

/** the row of town houses on the left in perspective */
function houses(p: Painter): void {
  const vx = 345;
  const vy = 262;
  const base = (x: number) => 360 + (vy - 360) * (x / vx);
  const top = (y0: number) => (x: number) => y0 + (vy - y0) * (x / vx);
  // sidewalk
  p.poly([[0, base(0)], [230, base(230)], [236, base(230) + 8], [0, base(0) + 16]], '#e4e4e4');
  const specs: { x0: number; x1: number; y0: number; color: string; sign: string; floors: number }[] = [
    { x0: 0, x1: 70, y0: 40, color: '#e0b060', sign: "КАВ'ЯРНЯ", floors: 3 },
    { x0: 70, x1: 125, y0: 70, color: '#a8d8a0', sign: 'ПОШТА', floors: 3 },
    { x0: 125, x1: 175, y0: 52, color: '#f0a8a0', sign: 'АПТЕКА', floors: 3 },
    { x0: 175, x1: 218, y0: 92, color: '#a8c8f0', sign: 'ГАЗЕТИ', floors: 2 },
  ];
  for (const [i, h] of specs.entries()) {
    const t = top(h.y0);
    const q: Quad = [[h.x0, t(h.x0)], [h.x1, t(h.x1)], [h.x1, base(h.x1)], [h.x0, base(h.x0)]];
    // roof: tiles leaning back, chimneys
    const rh = (x: number) => 15 * (1 - x / vx);
    p.poly([q[0], q[1], [h.x1 + 4, t(h.x1) - rh(h.x1)], [h.x0 + 4, t(h.x0) - rh(h.x0)]], p.dither('#aa3300', '#553300'));
    const cx = h.x0 + (h.x1 - h.x0) * 0.6;
    p.rect(cx, t(cx) - rh(cx) - 6, 4, rh(cx) + 4, '#aa5500');
    p.poly(q, h.color);
    // cornice and the ground floor line
    p.poly(sub(q, 0, 0, 1, 0.04), '#fff8e0');
    p.poly(sub(q, 0, 0.66, 1, 0.69), '#fff8e0');
    // windows: tall, with white frames and a cross
    const cols = Math.max(2, Math.round((h.x1 - h.x0) / 17));
    for (let f = 0; f < h.floors; ++f) {
      const v0 = 0.08 + (f * 0.56) / h.floors;
      const v1 = v0 + (0.56 / h.floors) * 0.68;
      for (let c = 0; c < cols; ++c) {
        const u0 = (c + 0.25) / cols;
        const u1 = (c + 0.75) / cols;
        const w = sub(q, u0, v0, u1, v1);
        p.poly(sub(q, u0 - 0.04, v0 - 0.01, u1 + 0.04, v1 + 0.015), '#fff8e0', '#000', 0.4);
        p.poly(w, '#4878a0', '#000', 0.5);
        p.line(bil(w, 0.5, 0), bil(w, 0.5, 1), '#fff8e0', 0.5);
        p.line(bil(w, 0, 0.4), bil(w, 1, 0.4), '#fff8e0', 0.5);
        if (f === 0 && i % 2 === 0) p.poly(sub(q, u0 - 0.06, v1 + 0.01, u1 + 0.06, v1 + 0.04), '#000000', null);
      }
    }
    // shop: a sign board, shop windows and a door
    const board = sub(q, 0.06, 0.7, 0.94, 0.78);
    p.poly(board, i === 1 ? '#0000aa' : '#000000');
    const bw = 100;
    p.inQuad(board, bw, 20, () => p.text(h.sign, bw / 2, 10.5, `bold ${h.sign.length > 6 ? 14 : 16}px Arial, sans-serif`, i === 1 ? '#ffff55' : '#ffffff'));
    if (i === 0) {
      // a striped awning
      for (let s = 0; s < 8; ++s) {
        const a = sub(q, 0.04 + s * 0.115, 0.79, 0.04 + (s + 1) * 0.115, 0.85);
        p.poly([a[0], a[1], [a[2][0] + 4, a[2][1]], [a[3][0] + 4, a[3][1]]], s % 2 ? '#ffffff' : '#aa0000', '#000', 0.3);
      }
    }
    p.poly(sub(q, 0.08, 0.86, 0.55, 0.98), '#88c8e8', '#000', 0.5);
    p.poly(sub(q, 0.66, 0.84, 0.88, 1), '#553300', '#000', 0.5);
    if (i === 1) {
      // a projecting telegraph sign
      const a = bil(q, 0.96, 0.12);
      p.rect(a[0], a[1], 15, 22, '#ffffff');
      p.g.save();
      p.g.translate(a[0] + 7.5, a[1] + 11);
      p.g.rotate(-Math.PI / 2);
      p.text('ТЕЛЕГРАФ', 0, 0, 'bold 3.6px Arial, sans-serif', '#aa0000');
      p.g.restore();
    }
  }
}

// ---- trains: a small 3D projection ------------------------------------------------
//
// x runs along the track (to the right and slightly up), y is up, z goes away
// from the viewer (up and to the left). Boxes show their near side, top and
// left end; cylinders show the faces turned to the viewer, shaded by light.

const ALONG: P = [1, -0.2];
const DEPTH: P = [-0.42, -0.4];
/** the direction that projects to a point: a face is visible when its normal points against it */
const VIEW: [number, number, number] = [-DEPTH[0], ALONG[1] * -DEPTH[0] - DEPTH[1], 1];

type Shade = string | CanvasPattern;

class Iso {
  constructor(
    readonly p: Painter,
    readonly o: P,
  ) {}

  pt(x: number, y: number, z: number): P {
    return [this.o[0] + x * ALONG[0] + z * DEPTH[0], this.o[1] + x * ALONG[1] - y + z * DEPTH[1]];
  }

  face(pts: [number, number, number][], fill: Shade | null, stroke: string | null = '#000', lw = 0.5): void {
    this.p.poly(
      pts.map(([x, y, z]) => this.pt(x, y, z)),
      fill,
      stroke,
      lw,
    );
  }

  /** a box: the left end, the top and the near side */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, side: Shade, top: Shade, end: Shade): void {
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], end);
    this.face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], top);
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], side);
  }

  /** a rectangle on the plane z (windows, doors, plates) */
  rect(x0: number, x1: number, y0: number, y1: number, z: number, fill: Shade, stroke: string | null = '#000'): void {
    this.face([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], fill, stroke, 0.4);
  }

  /**
   * A prism along x around (yc, zc): angle 0 is straight up. `shades` go from
   * the darkest to the lightest; `cap` draws the left end.
   */
  cylinderX(x0: number, x1: number, yc: number, zc: number, r: number, shades: Shade[], cap: Shade | null, a0 = -Math.PI, a1 = Math.PI, n = 16): void {
    const at = (a: number, x: number): [number, number, number] => [x, yc + Math.cos(a) * r, zc - Math.sin(a) * r];
    const seg = (a1 - a0) / n;
    if (cap) {
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= n; ++i) pts.push(at(a0 + i * seg, x0));
      this.face(pts, cap);
    }
    for (let i = 0; i < n; ++i) {
      const a = a0 + i * seg;
      const m = a + seg / 2;
      const ny = Math.cos(m);
      const nz = -Math.sin(m);
      if (ny * VIEW[1] + nz * VIEW[2] >= 0) continue;
      // light from the top left and the viewer
      const light = Math.max(0, Math.min(0.999, 0.5 + ny * 0.45 - nz * 0.15));
      const s = shades[Math.floor(light * shades.length)];
      this.face([at(a, x0), at(a, x1), at(a + seg, x1), at(a + seg, x0)], s, null);
    }
    // outline of the silhouette
    this.p.line(this.pt(x0, yc + r, zc), this.pt(x1, yc + r, zc), '#000', 0.5);
    this.p.line(this.pt(x0, yc - r * 0.2, zc - r), this.pt(x1, yc - r * 0.2, zc - r), '#000', 0.3);
  }

  /** a vertical cylinder or a cone frustum (chimneys, domes) */
  cylinderY(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, side: Shade, top: Shade): void {
    const ring = (y: number, r: number) => Array.from({ length: 20 }, (_, i) => this.pt(cx + Math.cos((i / 20) * Math.PI * 2) * r, y, cz + Math.sin((i / 20) * Math.PI * 2) * r));
    this.p.poly(hull([...ring(y0, r0), ...ring(y1, r1)]), side, '#000', 0.5);
    this.p.poly(ring(y1, r1), top, '#000', 0.5);
  }

  /** a spoked wheel in the plane z */
  wheel(x: number, y: number, z: number, r: number, rim: string): void {
    const circle = (rr: number) => Array.from({ length: 24 }, (_, i) => this.pt(x + Math.cos((i / 24) * Math.PI * 2) * rr, y + Math.sin((i / 24) * Math.PI * 2) * rr, z));
    this.p.poly(circle(r), rim, '#000', 0.6);
    this.p.poly(circle(r * 0.8), '#000000', null);
    const n = r > 10 ? 14 : 8;
    for (let i = 0; i < n; ++i) {
      const a = (i / n) * Math.PI * 2;
      this.p.line(this.pt(x, y, z), this.pt(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, z), rim, r > 10 ? 1 : 0.6);
    }
    this.p.poly(circle(r * 0.2), rim, '#000', 0.4);
  }

  /** draws in the plane z with x to the right and y down (text on the sides) */
  onPlane(z: number, fn: () => void): void {
    const o = this.pt(0, 0, z);
    const g = this.p.g;
    g.save();
    g.transform(ALONG[0], ALONG[1], 0, 1, o[0], o[1]);
    fn();
    g.restore();
  }
}

/** convex hull (monotone chain) */
function hull(pts: P[]): P[] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P[] = [];
  for (const q of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: P[] = [];
  for (let i = s.length - 1; i >= 0; --i) {
    const q = s[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const GAUGE = 20;
/** the near rails of the two tracks at x = 0 and where the engine's front is */
const FAR_Y = 446;
const NEAR_Y = 508;
const NEAR_X = 236;

/** a track: ballast, sleepers and two rails along y = 0 */
function track(t: Iso): void {
  const p = t.p;
  t.face([[-80, 0, -9], [800, 0, -9], [800, 0, GAUGE + 9], [-80, 0, GAUGE + 9]], p.dither('#aaaaaa', '#555555', true), null);
  for (let x = -80; x < 800; x += 7) t.face([[x, 0.6, -5], [x + 3, 0.6, -5], [x + 3, 0.6, GAUGE + 5], [x, 0.6, GAUGE + 5]], '#553300', null);
  for (const z of [0, GAUGE]) {
    t.face([[-80, 0, z - 0.8], [800, 0, z - 0.8], [800, 2.2, z - 0.8], [-80, 2.2, z - 0.8]], '#555555', null);
    p.line(t.pt(-80, 2.2, z - 0.4), t.pt(800, 2.2, z - 0.4), '#e4e4e4', 0.6);
  }
}

const ROOF = ['#555555', '#555555', '#aaaaaa', '#c8c8c8'];

/** a passenger car (x0..x0+len): body, arched roof, windows, doors, bogies */
function passengerCar(t: Iso, x0: number, len: number, color: string, light: string, dark: string, label: string): void {
  const x1 = x0 + len;
  const p = t.p;
  // bogies and wheels under the body
  for (const bx of [x0 + 26, x1 - 26]) {
    t.box(bx - 16, bx + 16, 5, 9, 1, 21, '#555555', '#555555', '#000000');
    for (const dx of [-9, 9]) t.wheel(bx + dx, 6.5, -0.5, 6.5, '#aaaaaa');
  }
  t.box(x0 + 44, x1 - 44, 6, 10, 4, 18, '#000000', '#000000', '#000000');
  // body: the near side has two tones and a lining
  t.box(x0, x1, 10, 42, 0, 22, color, light, p.dither(color, dark));
  t.rect(x0, x1, 10, 18, -0.05, p.dither(color, dark), null);
  t.rect(x0, x1, 18, 19.5, -0.06, '#ddaa00', null);
  // roof
  t.cylinderX(x0 - 2, x1 + 2, 38, 11, 13, ROOF, '#aaaaaa', -1.2, 1.2, 8);
  // windows and the end doors
  const n = Math.floor((len - 40) / 13);
  for (let i = 0; i < n; ++i) {
    const wx = x0 + 22 + i * 13;
    t.rect(wx, wx + 9, 24, 36, -0.1, '#fff8e0');
    t.rect(wx + 1, wx + 8, 25, 35, -0.15, '#4878a0', null);
    t.rect(wx + 1, wx + 8, 31, 35, -0.16, '#88c8e8', null);
  }
  for (const dx of [x0 + 5, x1 - 15]) {
    t.rect(dx, dx + 10, 11, 39, -0.1, dark);
    t.rect(dx + 2, dx + 8, 28, 36, -0.15, '#4878a0');
  }
  // end: a door and a gangway
  t.face([[x0, 12, 6], [x0, 12, 16], [x0, 36, 16], [x0, 36, 6]], dark);
  // the route board
  t.onPlane(-0.2, () => {
    p.rect(x0 + len / 2 - 32, -17.2, 64, 7, '#fff8e0', '#000', 0.4);
    p.text(label, x0 + len / 2, -13.5, 'bold 5.6px Georgia, serif', '#000000');
  });
}

const BLUE = ['#000000', '#0000aa', '#0000aa', '#5555ff', '#5555ff'];
const BLACK = ['#000000', '#000000', '#555555', '#aaaaaa'];
const GOLD = ['#aa5500', '#ddaa00', '#ddaa00', '#ffff55'];

/** a steam engine and its tender going left (front at x = 0) */
function engine(t: Iso, ox: number): void {
  const p = t.p;
  const X = (x: number) => ox + x;
  // tender
  for (const x of [162, 194]) t.wheel(X(x), 9, -0.5, 9, '#ddaa00');
  t.box(X(152), X(206), 14, 58, 0, 22, '#0000aa', '#5555ff', '#000055');
  t.rect(X(152), X(206), 54, 58, -0.05, '#5555ff', null);
  // coal heap
  t.face([[X(156), 58, 3], [X(202), 58, 3], [X(198), 64, 11], [X(160), 64, 11]], p.dither('#000000', '#555555'));
  t.face([[X(160), 64, 11], [X(198), 64, 11], [X(202), 58, 19], [X(156), 58, 19]], '#000000');
  t.onPlane(-0.1, () => {
    p.circle(X(179), -36, 9, '#ddaa00', '#000', 0.5);
    p.text('УЗ', X(179), -35.6, 'bold 8px Georgia, serif', '#0000aa');
  });
  // frame and running board
  t.box(X(-2), X(150), 20, 26, -2, 24, '#000000', '#555555', '#000000');
  // cylinders
  t.cylinderX(X(12), X(36), 18, 2, 6, BLACK, '#555555');
  // cab (behind the boiler)
  t.box(X(108), X(148), 26, 88, -1, 23, '#0000aa', '#5555ff', '#000055');
  t.box(X(104), X(152), 88, 92, -4, 26, '#555555', '#aaaaaa', '#555555');
  t.rect(X(114), X(140), 58, 80, -1.1, '#fff8e0');
  t.rect(X(116), X(138), 60, 78, -1.15, '#4878a0', null);
  t.rect(X(116), X(138), 70, 78, -1.16, '#88c8e8', null);
  t.rect(X(112), X(142), 36, 46, -1.1, '#ddaa00');
  t.onPlane(-1.2, () => p.text('Л-1', X(127), -41, 'bold 8px Georgia, serif', '#000000'));
  // boiler: bands, the smokebox and its round door
  const bands = [26, 54, 82];
  let x = 14;
  for (const b of [...bands, 108]) {
    t.cylinderX(X(x), X(b), 46, 11, 15, BLUE, x === 14 ? '#0000aa' : null);
    if (b < 108) t.cylinderX(X(b), X(b + 3), 46, 11, 15.4, GOLD, null);
    x = b + 3;
  }
  t.cylinderX(X(2), X(14), 46, 11, 15.6, BLACK, '#555555');
  {
    const c = t.pt(X(2), 46, 11);
    p.ellipse(c[0], c[1], 5.2, 12, '#000000', '#aaaaaa', 0.6);
    p.text('★', c[0], c[1], 'bold 6px Georgia, serif', '#ddaa00');
  }
  // domes, the chimney and the headlight
  t.cylinderY(X(62), 11, 58, 66, 6, 5, p.dither('#ddaa00', '#aa5500'), '#ffff55');
  t.cylinderY(X(88), 11, 59, 64, 4, 3.5, '#0000aa', '#5555ff');
  t.cylinderY(X(24), 11, 58, 72, 3.5, 4, '#000000', '#555555');
  t.cylinderY(X(24), 11, 72, 84, 4, 8, '#000000', '#555555');
  t.box(X(4), X(14), 62, 70, 6, 16, '#000000', '#555555', '#000000');
  t.face([[X(4), 63, 8], [X(4), 63, 14], [X(4), 69, 14], [X(4), 69, 8]], '#ffff55');
  // wheels and rods
  for (const x of [22, 42]) t.wheel(X(x), 8, -2.5, 8, '#ddaa00');
  for (const x of [72, 110]) t.wheel(X(x), 17, -2.5, 17, '#ddaa00');
  p.line(t.pt(X(72), 12, -3.5), t.pt(X(110), 12, -3.5), '#aa0000', 1.6);
  p.line(t.pt(X(30), 18, -3.5), t.pt(X(72), 12, -3.5), '#c8c8c8', 1.2);
  // cowcatcher
  t.face([[X(-14), 1, 1], [X(2), 16, 1], [X(2), 16, 21], [X(-14), 1, 21]], '#aa0000');
  t.face([[X(-14), 1, 1], [X(2), 1, 1], [X(2), 16, 1]], '#550000' as string);
  for (let z = 4; z < 21; z += 4) p.line(t.pt(X(-14), 1, z), t.pt(X(2), 16, z), '#000', 0.5);
}

/** the steam engine and its train on the near track */
function nearTrain(t: Iso): void {
  // far cars first: they are behind the ones on the left
  passengerCar(t, NEAR_X + 360, 140, '#00aa00', '#55ff55', '#006600', 'ОДЕСА — ЛЬВІВ');
  passengerCar(t, NEAR_X + 214, 140, '#aa0000', '#ff5555', '#550000', 'ЛЬВІВ — КИЇВ');
  engine(t, NEAR_X);
}

/** a train waiting at the platform on the far track */
function farTrain(t: Iso): void {
  const x0 = 330;
  passengerCar(t, x0 + 126, 140, '#0000aa', '#5555ff', '#000055', 'УЖГОРОД — ЛЬВІВ');
  // a mail van
  const p = t.p;
  for (const bx of [x0 + 22, x0 + 98]) {
    t.box(bx - 14, bx + 14, 5, 9, 1, 21, '#555555', '#555555', '#000000');
    for (const dx of [-8, 8]) t.wheel(bx + dx, 6.5, -0.5, 6.5, '#aaaaaa');
  }
  t.box(x0, x0 + 120, 10, 42, 0, 22, '#ddaa00', '#ffff55', p.dither('#ddaa00', '#aa5500'));
  t.cylinderX(x0 - 2, x0 + 122, 38, 11, 13, ROOF, '#aaaaaa', -1.2, 1.2, 8);
  for (const dx of [18, 78]) t.rect(x0 + dx, x0 + dx + 24, 12, 38, -0.1, '#aa5500');
  t.onPlane(-0.2, () => p.text('ПОШТА', x0 + 60, -26, 'bold 9px Georgia, serif', '#aa0000', 'center', '#000000'));
}

/** the platform: an edge, the station name board and a signal */
function platform(p: Painter): void {
  // just behind the far track
  const edge = (x: number) => FAR_Y - 0.2 * x - 13;
  p.poly([[150, edge(150) - 25], [640, edge(640) - 25], [640, edge(640)], [150, edge(150)]], '#e4e4e4', null);
  p.line([150, edge(150)], [640, edge(640)], '#ffffff', 1.2);
  p.line([150, edge(150) + 1], [640, edge(640) + 1], '#555555', 0.6);
  // name board on two posts
  p.rect(246, 349, 2, 24, '#000000', null);
  p.rect(290, 345, 2, 24, '#000000', null);
  p.rect(238, 334, 62, 15, '#0000aa', '#000', 0.8);
  p.rect(240, 336, 58, 11, null, '#ffffff', 0.5);
  p.text('ЛЬВІВ', 269, 342, 'bold 10px Arial, sans-serif', '#ffffff');
}

/** the corner of the square by the houses: a signal, a bench, a porter's cart */
function corner(p: Painter): void {
  // a semaphore signal
  p.rect(62, 330, 2.4, 90, '#000000', null);
  p.poly([[64, 336], [92, 330], [92, 335], [64, 341]], '#ffffff');
  p.poly([[78, 333], [92, 330], [92, 335], [78, 338]], '#aa0000', null);
  p.circle(63, 332, 2.4, '#ff5555');
  p.rect(56, 418, 14, 4, '#555555');
  // a bench with a reader
  p.rect(110, 396, 30, 3, '#7a4a20');
  p.rect(110, 388, 30, 3, '#7a4a20');
  for (const x of [112, 136]) p.rect(x, 399, 2, 6, '#000000', null);
  person(p, 122, 398, '#5555ff', true);
  p.rect(118, 383, 9, 6, '#ffffff', '#000', 0.4);
  // a porter's cart with suitcases on the platform
  p.rect(160, 386, 34, 4, '#553300');
  for (const x of [166, 188]) p.circle(x, 392, 3.5, '#555555');
  p.rect(162, 376, 14, 10, '#aa5500');
  p.rect(176, 379, 14, 7, '#aa0000');
  p.rect(166, 370, 10, 6, '#006600');
  p.line([194, 388], [204, 378], '#000', 0.8);
  person(p, 208, 390, '#0000aa', true);
  person(p, 22, 426, '#aa0000');
  person(p, 34, 429, '#553300', true);
  person(p, 232, 384, '#006600');
}

function ribbon(p: Painter): void {
  // the title ribbon with folded tails (as in the original poster)
  for (const s of [-1, 1]) {
    const x = 328 + s * 178;
    const tail: P[] = [[x, 30], [x + s * 42, 26], [x + s * 30, 52], [x + s * 42, 84], [x, 80]];
    p.poly(tail, '#e4e4e4');
    p.poly([[x, 72], [x + s * 10, 80], [x, 80]], '#aaaaaa');
  }
  p.poly([[150, 18], [506, 18], [506, 74], [150, 74]], '#ffffff', '#000', 0.8);
  p.line([156, 22], [500, 22], '#c8c8c8', 0.5);
  p.line([156, 70], [500, 70], '#c8c8c8', 0.5);
  p.text('Паровозики', 328, 47, 'italic bold 40px Georgia, "Times New Roman", serif', '#111111');
}

/** snaps every pixel to the palette (crisp edges, no anti-aliasing) */
function quantize(g: CanvasRenderingContext2D): void {
  const img = g.getImageData(0, 0, CW, CH);
  const d = img.data;
  const pal = PALETTE.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const cache = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    const key = ((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2);
    let best = cache.get(key);
    if (best === undefined) {
      let bd = Infinity;
      best = 0;
      for (let k = 0; k < pal.length; ++k) {
        const dr = d[i] - pal[k][0];
        const dg = d[i + 1] - pal[k][1];
        const db = d[i + 2] - pal[k][2];
        const dist = dr * dr * 3 + dg * dg * 4 + db * db * 2;
        if (dist < bd) {
          bd = dist;
          best = k;
        }
      }
      cache.set(key, best);
    }
    const c = pal[best];
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/** the chimney top of the engine (physical pixels), for the animated smoke */
const CHIMNEY: P = [NEAR_X + 24 + 11 * DEPTH[0], NEAR_Y + ALONG[1] * (NEAR_X + 24) - 84 + 11 * DEPTH[1]];

let cached: HTMLCanvasElement | null = null;

/** the static picture (drawn once) */
export function posterImage(): HTMLCanvasElement {
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const g = c.getContext('2d')!;
  g.setTransform(POSTER_SCALE, 0, 0, (POSTER_SCALE * 350) / 480, 0, 0);
  const p = new Painter(g);
  sky(p);
  skyline(p);
  shed(p);
  station(p);
  square(p);
  platform(p);
  houses(p);
  corner(p);
  const far = new Iso(p, [0, FAR_Y]);
  track(far);
  farTrain(far);
  const near = new Iso(p, [0, NEAR_Y]);
  track(near);
  nearTrain(near);
  ribbon(p);
  g.setTransform(1, 0, 0, 1, 0, 0);
  quantize(g);
  cached = c;
  return c;
}

/** the smoke area (physical pixels): the chimney and up to where the puffs fade */
const SMOKE = { x: CHIMNEY[0] - 12, y: 250, w: 110, h: CHIMNEY[1] - 250 + 12 };

/**
 * The title picture as DOM: the static image (drawn once) and a small canvas
 * with the animated smoke on top of it.
 */
export class PosterView {
  readonly root = document.createElement('div');
  private readonly smoke = document.createElement('canvas');
  private lastMs = NaN;

  constructor() {
    const img = posterImage();
    img.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    const k = 350 / 480;
    this.smoke.width = SMOKE.w * POSTER_SCALE;
    this.smoke.height = Math.ceil(SMOKE.h * k * POSTER_SCALE);
    this.smoke.style.cssText = `position:absolute;left:${(SMOKE.x / PW) * 100}%;top:${((SMOKE.y * k) / 350) * 100}%;width:${(SMOKE.w / PW) * 100}%;height:${((SMOKE.h * k) / 350) * 100}%`;
    this.root.append(img, this.smoke);
  }

  /** smoke at the presentation time `nowMs` */
  update(nowMs: number): void {
    if (nowMs === this.lastMs) return;
    this.lastMs = nowMs;
    const g = this.smoke.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.smoke.width, this.smoke.height);
    g.setTransform(POSTER_SCALE, 0, 0, (POSTER_SCALE * 350) / 480, -SMOKE.x * POSTER_SCALE, (-SMOKE.y * POSTER_SCALE * 350) / 480);
    const p = new Painter(g);
    // puffs leave the chimney and drift back and up (the train goes left)
    const period = 2600;
    const n = 7;
    for (let k = n - 1; k >= 0; --k) {
      const age = ((((nowMs + (k * period) / n) % period) + period) % period) / period;
      const x = CHIMNEY[0] + age * 70 + Math.sin(age * 6 + k) * 3;
      const y = CHIMNEY[1] - age * 62;
      const r = 4 + age * 15;
      p.circle(x, y, r, age > 0.6 ? '#e4e4e4' : '#ffffff', '#555555', 0.4);
      p.circle(x - r * 0.3, y - r * 0.3, r * 0.45, '#ffffff', null);
    }
  }
}
