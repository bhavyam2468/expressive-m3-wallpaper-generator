// Material 3 Expressive-inspired shape library, built from rounded polygons
// and smooth polar functions. Every shape is normalised to fit the [-1,1] box.
import { makeRng } from "./rng";

type Pt = [number, number];

export type Family = "geometric" | "cookie" | "burst" | "clover" | "organic" | "pixel";

export const FAMILY_LABEL: Record<Family, string> = {
  geometric: "Geometric",
  cookie: "Cookies",
  burst: "Stars & bursts",
  clover: "Clovers & flowers",
  organic: "Organic & puffy",
  pixel: "Pixel",
};

// "sharpness" 0 = soft/round, 1 = sharp/pointy — used for tension mixing.
export type ShapeDef = { id: string; label: string; family: Family; sharp: number; build: () => Pt[] };

const TAU = Math.PI * 2;

function roundedPolygon(verts: Pt[], radius: number | number[], seg = 10): Pt[] {
  const out: Pt[] = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const P = verts[(i - 1 + n) % n];
    const V = verts[i];
    const N = verts[(i + 1) % n];
    const r = Array.isArray(radius) ? radius[i] : radius;
    const d1x = P[0] - V[0], d1y = P[1] - V[1];
    const d2x = N[0] - V[0], d2y = N[1] - V[1];
    const l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
    const u1: Pt = [d1x / l1, d1y / l1];
    const u2: Pt = [d2x / l2, d2y / l2];
    const cos = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
    const ang = Math.acos(cos);
    let t = r / Math.tan(ang / 2);
    t = Math.min(t, l1 * 0.5, l2 * 0.5);
    const A: Pt = [V[0] + u1[0] * t, V[1] + u1[1] * t];
    const B: Pt = [V[0] + u2[0] * t, V[1] + u2[1] * t];
    for (let s = 0; s <= seg; s++) {
      const k = s / seg;
      const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
      out.push([a * A[0] + b * V[0] + c * B[0], a * A[1] + b * V[1] + c * B[1]]);
    }
  }
  return out;
}

function regular(n: number, rot = -Math.PI / 2, r = 1): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * TAU;
    return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
  });
}

function star(n: number, inner: number, rot = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const r = i % 2 === 0 ? 1 : inner;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function polar(fn: (a: number) => number, samples = 240): Pt[] {
  return Array.from({ length: samples }, (_, i) => {
    const a = (i / samples) * TAU - Math.PI / 2;
    const r = fn(a);
    return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
  });
}

function pixelize(test: (x: number, y: number) => boolean, grid: number): Pt[] {
  // Trace the outline of a pixel mask (simple marching around filled cells).
  const cells: boolean[][] = [];
  for (let j = 0; j < grid; j++) {
    cells.push([]);
    for (let i = 0; i < grid; i++) {
      const x = ((i + 0.5) / grid) * 2 - 1;
      const y = ((j + 0.5) / grid) * 2 - 1;
      cells[j].push(test(x, y));
    }
  }
  // build edge set
  const edges = new Map<string, Pt>();
  const key = (p: Pt) => `${p[0]},${p[1]}`;
  const filled = (i: number, j: number) => j >= 0 && j < grid && i >= 0 && i < grid && cells[j][i];
  for (let j = 0; j < grid; j++)
    for (let i = 0; i < grid; i++) {
      if (!cells[j][i]) continue;
      if (!filled(i, j - 1)) edges.set(key([i, j]), [i + 1, j]);
      if (!filled(i + 1, j)) edges.set(key([i + 1, j]), [i + 1, j + 1]);
      if (!filled(i, j + 1)) edges.set(key([i + 1, j + 1]), [i, j + 1]);
      if (!filled(i - 1, j)) edges.set(key([i, j + 1]), [i, j]);
    }
  const startKey = edges.keys().next().value as string;
  const out: Pt[] = [];
  let k = startKey;
  let guard = 0;
  do {
    const [x, y] = k.split(",").map(Number);
    out.push([(x / grid) * 2 - 1, (y / grid) * 2 - 1]);
    const nx = edges.get(k)!;
    k = key(nx);
  } while (k !== startKey && guard++ < 4000);
  return out;
}

function ghost(): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI + (i / 40) * Math.PI;
    pts.push([Math.cos(a) * 0.85, -0.15 + Math.sin(a) * 0.85]);
  }
  pts.push([0.85, 0.7]);
  for (let i = 0; i <= 60; i++) {
    const x = 0.85 - (i / 60) * 1.7;
    pts.push([x, 0.78 + Math.cos((i / 60) * TAU * 1.5) * 0.12]);
  }
  pts.push([-0.85, 0.7]);
  return pts;
}

function heart(): Pt[] {
  return Array.from({ length: 220 }, (_, i) => {
    const t = (i / 220) * TAU;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    return [x / 17, y / 17] as Pt;
  });
}

const lobes = (n: number, base: number, amp: number, p = 0.6) => (a: number) =>
  base + amp * Math.pow((1 + Math.cos(n * (a + Math.PI / 2))) / 2, p);

export const SHAPES: ShapeDef[] = [
  { id: "circle", label: "Circle", family: "geometric", sharp: 0, build: () => polar(() => 1) },
  { id: "square", label: "Square", family: "geometric", sharp: 0.4, build: () => roundedPolygon(regular(4, Math.PI / 4), 0.35) },
  { id: "pill", label: "Pill", family: "geometric", sharp: 0.1, build: () => roundedPolygon([[-1, -0.5], [1, -0.5], [1, 0.5], [-1, 0.5]], 0.5, 16) },
  { id: "oval", label: "Oval", family: "geometric", sharp: 0, build: () => polar((a) => 1 / Math.sqrt(Math.cos(a) ** 2 + (Math.sin(a) / 0.66) ** 2)) },
  { id: "triangle", label: "Triangle", family: "geometric", sharp: 0.85, build: () => roundedPolygon(regular(3), 0.22) },
  { id: "diamond", label: "Diamond", family: "geometric", sharp: 0.8, build: () => roundedPolygon([[0, -1], [0.78, 0], [0, 1], [-0.78, 0]], 0.18) },
  { id: "pentagon", label: "Pentagon", family: "geometric", sharp: 0.55, build: () => roundedPolygon(regular(5), 0.25) },
  { id: "semicircle", label: "SemiCircle", family: "geometric", sharp: 0.4, build: () => roundedPolygon([...Array.from({ length: 30 }, (_, i) => { const a = Math.PI + (i / 29) * Math.PI; return [Math.cos(a), 0.35 + Math.sin(a)] as Pt; })], 0.02, 2) },
  { id: "arch", label: "Arch", family: "geometric", sharp: 0.35, build: () => [...Array.from({ length: 40 }, (_, i) => { const a = Math.PI + (i / 39) * Math.PI; return [Math.cos(a) * 0.8, -0.2 + Math.sin(a) * 0.8] as Pt; }), [0.8, 0.86], [0.66, 1], [-0.66, 1], [-0.8, 0.86]] },
  { id: "slanted", label: "Slanted", family: "geometric", sharp: 0.6, build: () => roundedPolygon([[-0.5, -0.9], [1, -0.9], [0.5, 0.9], [-1, 0.9]], 0.3) },
  { id: "clamshell", label: "ClamShell", family: "geometric", sharp: 0.5, build: () => roundedPolygon([[-0.6, -0.9], [0.6, -0.9], [1, 0], [0.6, 0.9], [-0.6, 0.9], [-1, 0]], 0.3) },
  { id: "arrow", label: "Arrow", family: "geometric", sharp: 0.9, build: () => roundedPolygon([[0, -1], [1, 0.8], [0, 0.35], [-1, 0.8]], [0.2, 0.25, 0.15, 0.25]) },
  { id: "cookie4", label: "Cookie 4", family: "cookie", sharp: 0.2, build: () => roundedPolygon(regular(4, Math.PI / 4), 0.6, 18) },
  { id: "cookie6", label: "Cookie 6", family: "cookie", sharp: 0.15, build: () => polar(lobes(6, 0.86, 0.14, 0.9)) },
  { id: "cookie7", label: "Cookie 7", family: "cookie", sharp: 0.15, build: () => polar(lobes(7, 0.87, 0.13, 0.9)) },
  { id: "cookie9", label: "Cookie 9", family: "cookie", sharp: 0.15, build: () => polar(lobes(9, 0.89, 0.11, 0.9)) },
  { id: "cookie12", label: "Cookie 12", family: "cookie", sharp: 0.2, build: () => polar(lobes(12, 0.9, 0.1, 0.9)) },
  { id: "sunny", label: "Sunny", family: "burst", sharp: 0.5, build: () => roundedPolygon(star(8, 0.8), 0.12, 8) },
  { id: "verysunny", label: "VerySunny", family: "burst", sharp: 0.65, build: () => roundedPolygon(star(8, 0.66), 0.1, 8) },
  { id: "burst", label: "Burst", family: "burst", sharp: 0.9, build: () => roundedPolygon(star(12, 0.7), 0.04, 5) },
  { id: "softburst", label: "SoftBurst", family: "burst", sharp: 0.55, build: () => roundedPolygon(star(10, 0.72), 0.14, 8) },
  { id: "boom", label: "Boom", family: "burst", sharp: 1, build: () => roundedPolygon(star(15, 0.56), 0.03, 4) },
  { id: "softboom", label: "SoftBoom", family: "burst", sharp: 0.6, build: () => roundedPolygon(star(16, 0.68), 0.1, 6) },
  { id: "clover4", label: "Clover 4", family: "clover", sharp: 0.2, build: () => polar(lobes(4, 0.5, 0.5, 0.55)) },
  { id: "clover8", label: "Clover 8", family: "clover", sharp: 0.3, build: () => polar(lobes(8, 0.64, 0.36, 0.6)) },
  { id: "flower", label: "Flower", family: "clover", sharp: 0.3, build: () => polar(lobes(8, 0.78, 0.22, 0.45)) },
  { id: "gem", label: "Gem", family: "clover", sharp: 0.6, build: () => roundedPolygon([[0, -1], [0.8, -0.45], [0.8, 0.45], [0, 1], [-0.8, 0.45], [-0.8, -0.45]], 0.28) },
  { id: "puffy", label: "Puffy", family: "organic", sharp: 0.1, build: () => polar((a) => 0.82 + 0.18 * Math.pow(Math.abs(Math.cos(3 * a)), 0.5)) },
  { id: "puffydiamond", label: "PuffyDiamond", family: "organic", sharp: 0.3, build: () => polar((a) => (0.7 + 0.3 * Math.pow(Math.abs(Math.cos(2 * a + Math.PI / 4 * 0)), 2)) * (0.9 + 0.1 * Math.abs(Math.cos(6 * a)))) },
  { id: "ghostish", label: "Ghostish", family: "organic", sharp: 0.1, build: ghost },
  { id: "bun", label: "Bun", family: "organic", sharp: 0, build: () => polar((a) => 0.62 + 0.38 * Math.pow(Math.abs(Math.cos(a)), 0.7) - 0.08 * Math.pow(Math.abs(Math.sin(a)), 8)) },
  { id: "heart", label: "Heart", family: "organic", sharp: 0.35, build: heart },
  { id: "pixelcircle", label: "PixelCircle", family: "pixel", sharp: 0.7, build: () => pixelize((x, y) => x * x + y * y < 0.95, 10) },
  { id: "pixeltriangle", label: "PixelTriangle", family: "pixel", sharp: 0.9, build: () => pixelize((x, y) => y > -0.95 && Math.abs(x) < (y + 1) * 0.5, 10) },
];

export const SHAPE_BY_ID: Record<string, ShapeDef> = Object.fromEntries(SHAPES.map((s) => [s.id, s]));

function normalise(pts: Pt[]): Pt[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const s = 2 / Math.max(maxX - minX, maxY - minY);
  return pts.map(([x, y]) => [(x - cx) * s, (y - cy) * s]);
}

function areaOf(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

export type ShapeGeom = { d: string; pts: Pt[]; fill: number /* area / box area */ };
const cache = new Map<string, ShapeGeom>();

function toGeom(raw: Pt[]): ShapeGeom {
  const pts = normalise(raw);
  const d = "M" + pts.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join("L") + "Z";
  return { d, pts, fill: areaOf(pts) / 4 };
}

export function getShape(id: string): ShapeGeom {
  const hit = cache.get(id);
  if (hit) return hit;
  let geom: ShapeGeom;
  if (id.startsWith("blob:")) {
    geom = toGeom(blobPoints(Number(id.slice(5))));
  } else {
    geom = toGeom((SHAPE_BY_ID[id] ?? SHAPES[0]).build());
  }
  cache.set(id, geom);
  return geom;
}

// Organic blob: low-frequency harmonics in polar coordinates.
function blobPoints(seed: number): Pt[] {
  const r = makeRng(seed);
  const harmonics = Array.from({ length: 4 }, (_, i) => ({
    k: i + 2,
    amp: r.range(0.03, 0.16) / (i * 0.6 + 1),
    ph: r.range(0, TAU),
  }));
  return polar((a) => 0.8 + harmonics.reduce((s, h) => s + h.amp * Math.cos(h.k * a + h.ph), 0), 200);
}
