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

/** distant Lviv: the town hall tower and church domes in haze */
function skyline(p: Painter): void {
  const c = '#9fbfd0';
  const d = '#7f9fb4';
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

/** across a track: from the near rail away from the viewer (screen units per unit of depth) */
const AWAY: P = [-0.27, -0.36];
const ALONG: P = [1, -0.2];

/** a track: ballast, sleepers and two rails; `y0` is the near rail at x = 0 */
function track(p: Painter, y0: number): void {
  const at = (x: number, depth: number): P => [x + AWAY[0] * depth, y0 + ALONG[1] * x + AWAY[1] * depth];
  p.poly([at(-40, -6), at(700, -6), at(700, 20), at(-40, 20)], p.dither('#aaaaaa', '#555555', true), null);
  for (let x = -40; x < 700; x += 8) p.line(at(x, -3), at(x, 17), '#553300', 1.6);
  for (const d of [0, 14]) {
    p.line(at(-40, d), at(700, d), '#000', 1.1);
    p.line(at(-40, d - 0.6), at(700, d - 0.6), '#c8c8c8', 0.4);
  }
}

/** spoked wheel */
function wheel(p: Painter, x: number, y: number, r: number, rim = '#ddaa00'): void {
  p.circle(x, y, r, rim);
  p.circle(x, y, r * 0.78, '#000000', null);
  const n = r > 10 ? 12 : 8;
  for (let i = 0; i < n; ++i) {
    const a = (i / n) * Math.PI * 2;
    p.line([x, y], [x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78], rim, r > 10 ? 1.1 : 0.7);
  }
  p.circle(x, y, r * 0.18, rim);
}

/** the top (roof) face of a box seen from above: a parallelogram away from the viewer */
function topFace(p: Painter, s0: number, s1: number, y: number, depth: number, fill: string | CanvasPattern): void {
  const a: P = [s0, y];
  const b: P = [s1, y];
  const dx = AWAY[0] * depth;
  // inside the train frame the y axis is unskewed: undo the along-slope for the depth vector
  const dy = AWAY[1] * depth;
  p.poly([a, b, [b[0] + dx, b[1] + dy - ALONG[1] * dx], [a[0] + dx, a[1] + dy - ALONG[1] * dx]], fill);
}

function passengerCar(p: Painter, s0: number, len: number, color: string, dark: string, label: string): void {
  const s1 = s0 + len;
  topFace(p, s0 + 2, s1 - 2, -64, 24, p.dither('#555555', '#aaaaaa'));
  p.rect(s0 + 2, -68, len - 4, 6, '#555555');
  p.rect(s0, -62, len, 40, color);
  p.rect(s0, -38, len, 8, p.dither(color, dark));
  // windows and doors at both ends
  for (let x = s0 + 18; x < s1 - 22; x += 12.5) p.rect(x, -56, 8, 12, '#88c8e8');
  for (const x of [s0 + 4, s1 - 13]) p.rect(x, -58, 9, 34, dark);
  p.text(label, s0 + len / 2, -33.6, 'bold 7.5px Georgia, serif', '#ffff55', 'center', '#000000');
  p.rect(s0 - 3, -26, len + 6, 4, '#000000', null);
  for (const x of [s0 + 18, s0 + 34, s1 - 34, s1 - 18]) wheel(p, x, -7, 7, '#555555');
  p.rect(s0 + 12, -12, 28, 3, '#000000', null);
  p.rect(s1 - 40, -12, 28, 3, '#000000', null);
}

/** the steam engine and its train on the near track, going left */
function nearTrain(p: Painter, o: P): void {
  p.inFrame(o, ALONG, () => {
    passengerCar(p, 214, 140, '#aa0000', '#553300', 'ЛЬВІВ — КИЇВ');
    passengerCar(p, 360, 140, '#00aa00', '#006600', 'ОДЕСА — ЛЬВІВ');
    // tender: coal and the railway emblem
    topFace(p, 152, 204, -58, 24, p.dither('#000000', '#555555'));
    p.rect(150, -58, 56, 34, '#0000aa');
    p.rect(150, -58, 56, 4, '#5555ff');
    p.circle(178, -42, 8, '#ddaa00');
    p.text('УЗ', 178, -41.6, 'bold 8px Georgia, serif', '#0000aa');
    for (const x of [162, 192]) wheel(p, x, -9, 9, '#ddaa00');
    // cab
    topFace(p, 103, 148, -92, 26, '#555555');
    p.rect(103, -92, 45, 5, '#000000');
    p.rect(106, -88, 40, 62, '#0000aa');
    p.rect(112, -82, 26, 18, '#88c8e8');
    p.line([125, -82], [125, -64], '#000', 0.6);
    p.rect(110, -52, 32, 10, '#ddaa00');
    p.text('Л-1', 126, -46.8, 'bold 8px Georgia, serif', '#000000');
    // boiler with bands, domes, the chimney and the headlight
    topFace(p, 8, 106, -62, 22, '#5555ff');
    p.rect(8, -62, 98, 34, '#0000aa');
    p.rect(8, -60, 98, 6, '#5555ff', null);
    for (const x of [32, 58, 84]) p.rect(x, -62, 3, 34, '#ddaa00');
    // smokebox and the round front of the boiler (seen at an angle)
    p.rect(2, -62, 14, 34, '#000000');
    p.ellipse(0.5, -49, 4.5, 17, '#555555');
    p.ellipse(0.5, -49, 3, 13, '#000000', '#aaaaaa', 0.5);
    p.text('★', 0.6, -49, 'bold 6px Georgia, serif', '#ddaa00');
    p.g.beginPath();
    p.g.moveTo(52, -62);
    p.g.quadraticCurveTo(52, -76, 61, -76);
    p.g.quadraticCurveTo(70, -76, 70, -62);
    p.g.fillStyle = '#ddaa00';
    p.g.fill();
    p.g.stroke();
    p.rect(80, -70, 12, 8, '#ddaa00');
    // a diamond stack like the old engines
    p.poly([[25, -62], [29, -62], [31, -78], [37, -90], [17, -90], [23, -78]], '#000000');
    p.rect(16, -92, 22, 3, '#555555');
    p.rect(5, -72, 10, 9, '#000000');
    p.rect(2, -71, 3, 7, '#ffff55');
    // running board, cylinder, wheels and rods
    p.rect(4, -28, 140, 5, '#000000');
    p.rect(14, -26, 22, 14, '#555555');
    for (const x of [20, 40]) wheel(p, x, -8, 8);
    for (const x of [72, 112]) wheel(p, x, -17, 17);
    p.line([30, -19], [112, -21], '#c8c8c8', 1.6);
    p.line([72, -21], [112, -21], '#aa0000', 1.6);
    // cowcatcher
    p.poly([[4, -18], [-14, -1], [6, -1]], '#aa0000');
    for (let k = -10; k < 6; k += 4) p.line([k, -1], [4, -18 + (k + 14) * 0.4], '#000', 0.5);
    // a little puff by the cylinder
    p.circle(8, -6, 4, '#ffffff', null);
    p.circle(2, -4, 3, '#e4e4e4', null);
  });
}

/** a train waiting at the platform on the far track */
function farTrain(p: Painter, o: P): void {
  p.inFrame(o, ALONG, () => {
    // a mail van and a passenger car
    topFace(p, 2, 118, -60, 22, p.dither('#555555', '#aaaaaa'));
    p.rect(0, -60, 120, 38, '#ddaa00');
    p.rect(0, -60, 120, 4, '#ffff55', null);
    for (const x of [20, 70]) p.rect(x, -54, 22, 28, '#aa5500');
    p.text('ПОШТА', 60, -38, 'bold 9px Georgia, serif', '#aa0000', 'center', '#000000');
    for (const x of [14, 30, 90, 106]) wheel(p, x, -7, 7, '#555555');
    passengerCar(p, 126, 140, '#0000aa', '#000055', 'УЖГОРОД');
  });
}

/** the platform: an edge, the station name board and a signal */
function platform(p: Painter): void {
  const edge = (x: number) => 392 - 0.2 * (x - 214);
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

/** the chimney of the engine (physical pixels), for the animated smoke */
const NEAR_TRAIN: P = [236, 508 - 0.2 * 236];
const CHIMNEY: P = [NEAR_TRAIN[0] + 27, NEAR_TRAIN[1] + ALONG[1] * 27 - 92];

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
  track(p, 446);
  farTrain(p, [330, 446 - 0.2 * 330]);
  track(p, 508);
  nearTrain(p, [NEAR_TRAIN[0], NEAR_TRAIN[1]]);
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
