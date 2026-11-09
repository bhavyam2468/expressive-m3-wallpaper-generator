// Constraint-based composition: archetype -> place -> shapes -> color -> repair -> score; best of N.
import { makeRng, hashSeed, type Rng } from "./rng";
import { SHAPES, getShape } from "./shapes";
import { buildPalette, distinguish, shiftTone, pureInfo, type ColorInfo, type Palette } from "./color";
import { ARCHETYPES, getDims, PATTERNS, type ArchetypeId, type PatternId, type Settings } from "./types";

export type Role = "dominant" | "support" | "accent";

export type Layer = {
  shape: string;
  cx: number;
  cy: number;
  size: number; // px, box edge
  rot: number;
  role: Role;
  fillRole: string;
  fill: string;
  outline: boolean;
  shadow?: string;
  overlapWith: number[];
  overlapFill?: string;
};

export type Rect = { x: number; y: number; w: number; h: number };

export type ScoreBreakdown = {
  hierarchy: number;
  balance: number;
  focal: number;
  negativeSpace: number;
  spacing: number;
  contrast: number;
  colorArea: number;
  edges: number;
  clutter: number;
  total: number;
  coverage: number;
  centroid: [number, number];
};

export type Background = {
  hex: string;
  role: string;
  gradient?: { hex: string; cx: number; cy: number };
  pattern: PatternId;
  patternHex: string;
  patternOpacity: number;
  patternScale: number;
};

export type Composition = {
  w: number;
  h: number;
  archetype: ArchetypeId;
  layers: Layer[];
  bg: Background;
  score: ScoreBreakdown;
  attempt: number;
  keepOut: Rect[];
  focalPoints: [number, number][];
  balanceTarget: [number, number];
  seed: number;
  palette: Palette;
  usedRoles: string[];
};

type Placement = { cx: number; cy: number; size: number; role: Role; rot?: number; overlapIntent?: boolean };

type Plan = {
  placements: Placement[];
  focalPoints: [number, number][] | null;
  balanceTarget: [number, number];
  balanceTol: number;
  coverage: number; // target fraction
  flatHierarchy?: boolean;
  noRepairEdges?: number[];
};

type Ctx = { w: number; h: number; S: number; r: Rng; s: Settings; keepOut: Rect[] };

const PHI = 0.382;

function powerPoints(w: number, h: number): [number, number][] {
  const pts: [number, number][] = [];
  for (const fx of [1 / 3, 2 / 3, PHI, 1 - PHI]) for (const fy of [1 / 3, 2 / 3, PHI, 1 - PHI]) pts.push([fx * w, fy * h]);
  return pts;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const radiusOf = (l: { size: number; shape?: string }) => {
  const fill = l.shape ? getShape(l.shape).fill : 0.75;
  return (l.size / 2) * (0.55 + 0.45 * Math.sqrt((fill * 4) / Math.PI));
};

function inRectCircle(cx: number, cy: number, r: number, rc: Rect) {
  const nx = clamp(cx, rc.x, rc.x + rc.w), ny = clamp(cy, rc.y, rc.y + rc.h);
  return Math.hypot(cx - nx, cy - ny) < r;
}

function fits(c: Ctx, p: Placement, others: Placement[], gap: number, margin: number, allowOverlapWith?: Placement) {
  const r = p.size / 2;
  if (p.cx - r < margin || p.cx + r > c.w - margin || p.cy - r < margin || p.cy + r > c.h - margin) return false;
  for (const k of c.keepOut) if (inRectCircle(p.cx, p.cy, r * 0.9, k)) return false;
  for (const o of others) {
    if (o === allowOverlapWith) continue;
    if (Math.hypot(o.cx - p.cx, o.cy - p.cy) < r + o.size / 2 + gap) return false;
  }
  return true;
}

// ---------------- Archetypes ----------------

function hero(c: Ctx): Plan {
  const { w, h, S, r, s } = c;
  const scale = 1 - s.negativeSpace * 0.3;
  const pps = powerPoints(w, h).filter(([x, y]) => !c.keepOut.some((k) => inRectCircle(x, y, S * 0.2, k)));
  const anchor = r.pick(pps.length ? pps : powerPoints(w, h));
  const d = S * (0.6 + 0.25 * s.focal) * scale * r.range(0.92, 1.08);
  const dom: Placement = { cx: anchor[0] + r.gauss() * s.chaos * 0.03 * S, cy: anchor[1] + r.gauss() * s.chaos * 0.03 * S, size: d, role: "dominant" };
  const out: Placement[] = [dom];
  const count = Math.round(2 + s.density * 3 + r.range(-0.5, 0.5));
  const gap = S * 0.035;
  for (let i = 0; i < count; i++) {
    const role: Role = i < 1 + (s.density > 0.6 ? 1 : 0) ? "support" : "accent";
    const size = role === "support" ? d * r.range(0.26, 0.36) : d * r.range(0.09, 0.17);
    const onRim = role === "accent" && r.chance(0.35);
    for (let t = 0; t < 80; t++) {
      const a = r.range(0, Math.PI * 2);
      const dist = onRim ? d / 2 * r.range(0.82, 0.95) : d / 2 + size / 2 + gap * r.range(1.2, 3.5) + (role === "accent" ? r.range(0, S * 0.15) : 0);
      const p: Placement = { cx: dom.cx + Math.cos(a) * dist, cy: dom.cy + Math.sin(a) * dist, size, role, overlapIntent: onRim };
      if (fits(c, p, out, gap, S * 0.04, onRim ? dom : undefined)) {
        out.push(p);
        break;
      }
    }
  }
  return { placements: out, focalPoints: powerPoints(w, h), balanceTarget: [w / 2, h / 2], balanceTol: 0.32, coverage: 0.21 };
}

function diagonal(c: Ctx): Plan {
  const { w, h, S, r, s } = c;
  const flip = r.chance(0.5), rev = r.chance(0.5);
  let p0: [number, number] = [w * 0.2, h * 0.75], p1: [number, number] = [w * 0.8, h * 0.25];
  if (flip) { p0 = [w * 0.2, h * 0.25]; p1 = [w * 0.8, h * 0.75]; }
  if (rev) [p0, p1] = [p1, p0];
  const n = Math.round(3 + s.density * 3);
  const scale = 1 - s.negativeSpace * 0.3;
  const ratio = r.range(0.58, 0.72);
  let sizes = Array.from({ length: n }, (_, i) => S * (0.54 + 0.14 * s.focal) * scale * Math.pow(ratio, i));
  const gap = S * r.range(0.04, 0.08);
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  let chain = sizes.reduce((a, b) => a + b, 0) - sizes[0] / 2 - sizes[n - 1] / 2 + gap * (n - 1);
  if (chain > len) { const k = len / chain; sizes = sizes.map((x) => x * k); chain = len; }
  const ux = (p1[0] - p0[0]) / len, uy = (p1[1] - p0[1]) / len;
  const start = (len - chain) / 2 * r.range(0.3, 1);
  const ang = (Math.atan2(uy, ux) * 180) / Math.PI;
  const out: Placement[] = [];
  let t = start;
  for (let i = 0; i < n; i++) {
    if (i > 0) t += sizes[i - 1] / 2 + sizes[i] / 2 + gap;
    const wave = (i % 2 ? 1 : -1) * s.chaos * 0.08 * S;
    out.push({ cx: p0[0] + ux * t - uy * wave, cy: p0[1] + uy * t + ux * wave, size: sizes[i], role: i === 0 ? "dominant" : i < 3 ? "support" : "accent", rot: ang });
  }
  return { placements: out, focalPoints: null, balanceTarget: [w / 2, h / 2], balanceTol: 0.35, coverage: 0.2 };
}

function triptych(c: Ctx): Plan {
  const { w, h, r, s } = c;
  const horiz = w >= h;
  const axis = horiz ? w : h, cross = horiz ? h : w;
  const n = axis / cross > 2.6 && s.density > 0.4 ? 5 : axis / cross > 1.9 ? 4 : 3;
  const scale = 1 - s.negativeSpace * 0.3;
  const cell = axis / (n + 0.6);
  const base = Math.min(cell * 0.82, cross * 0.6) * scale;
  const hi = r.int(0, n - 1);
  const crossMid = cross * (c.keepOut.length && !horiz ? 0.62 : 0.5);
  const out: Placement[] = [];
  const offset = r.range(0.04, 0.12) * cross * (0.4 + s.chaos);
  for (let i = 0; i < n; i++) {
    const big = i === hi;
    const size = base * (big ? 1.0 + 0.3 * s.focal : r.range(0.72, 0.8));
    const a = cell * 0.8 + cell * i;
    const b = crossMid + (i % 2 ? offset : -offset) * (s.chaos > 0.15 ? 1 : 0);
    out.push({ cx: horiz ? a : b, cy: horiz ? b : a, size, role: big ? "dominant" : "support" });
  }
  // spread evenly across axis
  const first = horiz ? out[0].cx : out[0].cy, last = horiz ? out[n - 1].cx : out[n - 1].cy;
  const shift = (axis - (first + last)) / 2;
  out.forEach((p) => (horiz ? (p.cx += shift) : (p.cy += shift)));
  if (s.density > 0.55) {
    for (let i = 0; i < n - 1; i++) {
      if (!r.chance(s.density - 0.3)) continue;
      const p = out[i], q = out[i + 1];
      out.push({ cx: (p.cx + q.cx) / 2, cy: (p.cy + q.cy) / 2 + (horiz ? r.pick([-1, 1]) * base * 0.6 : 0), size: base * 0.16, role: "accent" });
    }
  }
  return { placements: out, focalPoints: null, balanceTarget: [w / 2, h / 2], balanceTol: 0.25, coverage: 0.17, flatHierarchy: true };
}

function corner(c: Ctx): Plan {
  const { w, h, S, r, s } = c;
  const cxs = r.chance(0.5), cys = r.chance(c.keepOut.length ? 0.15 : 0.5);
  const big = S * r.range(1.0, 1.3) * (0.85 + 0.2 * s.focal) * (1 - s.negativeSpace * 0.2);
  const inset = big * r.range(0.12, 0.2);
  const dom: Placement = { cx: cxs ? inset : w - inset, cy: cys ? inset : h - inset, size: big, role: "dominant" };
  const out: Placement[] = [dom];
  const ox = cxs ? w * 0.72 : w * 0.28, oy = cys ? h * 0.7 : h * 0.3;
  const sup: Placement = { cx: ox, cy: oy, size: S * r.range(0.16, 0.24), role: "support" };
  if (fits(c, sup, out, S * 0.05, S * 0.05)) out.push(sup);
  const n = Math.round(1 + s.density * 2);
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < 60; t++) {
      const p: Placement = { cx: ox + r.gauss() * S * 0.2, cy: oy + r.gauss() * S * 0.2, size: S * r.range(0.05, 0.09), role: "accent" };
      if (fits(c, p, out, S * 0.04, S * 0.05)) { out.push(p); break; }
    }
  }
  return { placements: out, focalPoints: null, balanceTarget: [w / 2 * 0.6 + dom.cx * 0.4, h / 2 * 0.6 + dom.cy * 0.4], balanceTol: 0.45, coverage: 0.25, noRepairEdges: [0] };
}

function orbital(c: Ctx): Plan {
  const { w, h, S, r, s } = c;
  const center: [number, number] = c.keepOut.length && h > w ? [w / 2, h * 0.62] : s.chaos > 0.5 && w > h * 1.4 ? [r.pick([w * 0.38, w * 0.62]), h / 2] : [w / 2, h / 2];
  const maxR = Math.min(center[0], w - center[0], center[1], h - center[1]) - S * 0.06;
  const dom = S * (0.3 + 0.12 * s.focal) * (1 - s.negativeSpace * 0.2);
  const R = Math.min(maxR - S * 0.06, dom / 2 + S * r.range(0.14, 0.2));
  const k = Math.round(5 + s.density * 5);
  const acc = Math.min(S * 0.13, ((2 * Math.PI * R) / k) * 0.5);
  const out: Placement[] = [{ cx: center[0], cy: center[1], size: dom, role: "dominant" }];
  const phase = r.range(0, Math.PI * 2);
  for (let i = 0; i < k; i++) {
    const a = phase + (i / k) * Math.PI * 2;
    const alt = s.chaos > 0.35 && i % 2 ? 0.6 : 1;
    out.push({ cx: center[0] + Math.cos(a) * R, cy: center[1] + Math.sin(a) * R, size: acc * alt, role: i % 3 === 0 && s.density > 0.5 ? "support" : "accent", rot: (a * 180) / Math.PI + 90 });
  }
  if (s.density > 0.6) {
    const R2 = R + acc * 1.3;
    if (R2 + acc * 0.25 < maxR + S * 0.04)
      for (let i = 0; i < k * 2; i++) {
        const a = phase + ((i + 0.5) / (k * 2)) * Math.PI * 2;
        out.push({ cx: center[0] + Math.cos(a) * R2, cy: center[1] + Math.sin(a) * R2, size: acc * 0.28, role: "accent", rot: (a * 180) / Math.PI + 90 });
      }
  }
  return { placements: out, focalPoints: [center], balanceTarget: [w / 2, h / 2], balanceTol: 0.3, coverage: 0.12 };
}

function minimal(c: Ctx): Plan {
  const { w, h, S, r, s } = c;
  const pps = powerPoints(w, h).filter(([x, y]) => !c.keepOut.some((k) => inRectCircle(x, y, S * 0.25, k)));
  const anchor = r.pick(pps.length ? pps : powerPoints(w, h));
  const dom: Placement = { cx: anchor[0], cy: anchor[1], size: S * r.range(0.58, 0.74) * (1 - s.negativeSpace * 0.25), role: "dominant" };
  const out: Placement[] = [dom];
  const rim = r.chance(0.4);
  for (let t = 0; t < 100; t++) {
    let p: Placement;
    if (rim) {
      const a = r.range(0, Math.PI * 2);
      p = { cx: dom.cx + Math.cos(a) * dom.size * 0.45, cy: dom.cy + Math.sin(a) * dom.size * 0.45, size: S * r.range(0.07, 0.11), role: "accent", overlapIntent: true };
    } else {
      p = { cx: w - anchor[0] + r.gauss() * S * 0.08, cy: h - anchor[1] + r.gauss() * S * 0.08, size: S * r.range(0.05, 0.09), role: "accent" };
    }
    if (fits(c, p, out, S * 0.04, S * 0.06, rim ? dom : undefined)) { out.push(p); break; }
  }
  if (s.density > 0.65) {
    for (let t = 0; t < 60; t++) {
      const p: Placement = { cx: r.range(0, w), cy: r.range(0, h), size: S * 0.035, role: "accent" };
      if (fits(c, p, out, S * 0.08, S * 0.08)) { out.push(p); break; }
    }
  }
  return { placements: out, focalPoints: powerPoints(w, h), balanceTarget: [w / 2, h / 2], balanceTol: 0.45, coverage: 0.12 };
}

function grid(c: Ctx): Plan {
  const { w, h, S, r, s } = c;
  const cellT = S / (2.4 + s.density * 2.4);
  const cols = Math.max(2, Math.floor(w / cellT)), rows = Math.max(2, Math.floor(h / cellT));
  const cell = Math.min(w / (cols + 0.5), h / (rows + 0.5));
  const ox = (w - cols * cell) / 2, oy = (h - rows * cell) / 2;
  const out: Placement[] = [];
  const mi = r.int(0, cols - 2), mj = r.int(0, rows - 2);
  out.push({ cx: ox + (mi + 1) * cell, cy: oy + (mj + 1) * cell, size: cell * 1.72, role: "dominant" });
  const ang = r.pick([0, 0, 45, 90]);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if ((i === mi || i === mi + 1) && (j === mj || j === mj + 1)) continue;
      if (r.chance(s.negativeSpace * 0.55 + 0.05)) continue;
      const accent = r.chance(0.3);
      const jit = s.chaos * 0.12 * cell;
      const p: Placement = {
        cx: ox + (i + 0.5) * cell + r.gauss() * jit,
        cy: oy + (j + 0.5) * cell + r.gauss() * jit,
        size: cell * (accent ? 0.34 : 0.74) * (1 - s.chaos * 0.15 * r.next()),
        role: accent ? "accent" : "support",
        rot: ang,
      };
      if (!c.keepOut.some((k) => inRectCircle(p.cx, p.cy, p.size / 2, k))) out.push(p);
    }
  return { placements: out, focalPoints: null, balanceTarget: [w / 2, h / 2], balanceTol: 0.3, coverage: 0.23, flatHierarchy: true };
}

function cluster(c: Ctx): Plan {
  const { w, h, S, r, s } = c;
  const pps = powerPoints(w, h).filter(([x, y]) => !c.keepOut.some((k) => inRectCircle(x, y, S * 0.25, k)));
  const anchor = r.pick(pps.length ? pps : powerPoints(w, h));
  const dom: Placement = { cx: anchor[0], cy: anchor[1], size: S * (0.36 + 0.12 * s.focal), role: "dominant" };
  const out: Placement[] = [dom];
  const n = Math.round(6 + s.density * 8);
  const gap = S * 0.022;
  for (let i = 0; i < n; i++) {
    const role: Role = i < 3 ? "support" : "accent";
    const size = role === "support" ? S * r.range(0.14, 0.22) : S * r.range(0.04, 0.09);
    for (let t = 0; t < 80; t++) {
      const base = r.pick(out);
      const a = r.range(0, Math.PI * 2);
      const dd = base.size / 2 + size / 2 + gap * r.range(1, 1.8);
      const p: Placement = { cx: base.cx + Math.cos(a) * dd, cy: base.cy + Math.sin(a) * dd, size, role };
      if (Math.hypot(p.cx - dom.cx, p.cy - dom.cy) > S * 0.5) continue;
      if (fits(c, p, out, gap, S * 0.04)) { out.push(p); break; }
    }
  }
  const target: [number, number] = [w / 2 * 0.6 + anchor[0] * 0.4, h / 2 * 0.6 + anchor[1] * 0.4];
  return { placements: out, focalPoints: powerPoints(w, h), balanceTarget: target, balanceTol: 0.45, coverage: 0.15 };
}

// The reference tool's algorithm, faithfully reproduced for A/B comparison.
function scatter(c: Ctx): Plan {
  const { w, h, S, r } = c;
  const count = 2 + Math.floor(r.next() * 4);
  const axis = (ext: number, size: number) => (ext > size ? r.range(-0.35 * size, ext - size + 0.35 * size) : (ext - size) / 2);
  const out: Placement[] = [];
  for (let i = 0; i < count; i++) {
    const size = r.range(400, 860) * (S / 1080);
    out.push({ cx: axis(w, size) + size / 2, cy: axis(h, size) + size / 2, size, role: i === 0 ? "dominant" : "support", rot: r.range(0, 360) });
  }
  return { placements: out, focalPoints: null, balanceTarget: [w / 2, h / 2], balanceTol: 0.3, coverage: 0.35 };
}

const GENERATORS: Record<ArchetypeId, (c: Ctx) => Plan> = { hero, diagonal, triptych, corner, orbital, minimal, grid, cluster, scatter };

// ---------------- Shapes ----------------

function assignShapes(c: Ctx, pl: Placement[]): string[] {
  const { r, s } = c;
  const allowed = SHAPES.filter((x) => s.families.includes(x.family));
  const pool = allowed.length ? allowed : SHAPES.slice(0, 12);
  const soft = pool.filter((x) => x.sharp < 0.45), sharp = pool.filter((x) => x.sharp >= 0.45);
  const pickFrom = (arr: typeof pool) => r.pick(arr.length ? arr : pool).id;
  const domSoft = r.chance(1 - s.tension * 0.35);
  const maxDistinct = 2 + Math.round(s.chaos * 4);
  const chosen: Record<Role, string[]> = { dominant: [], support: [], accent: [] };
  return pl.map((p) => {
    if (p.role === "dominant") {
      if (s.blobs && r.chance(0.22)) return `blob:${Math.floor(r.next() * 1e9)}`;
      return pickFrom(domSoft ? soft : sharp);
    }
    const list = chosen[p.role];
    // Reuse for rhythm unless chaos lets us add more variety.
    if (list.length && (list.length >= Math.ceil(maxDistinct / 2) || r.chance(0.65 - s.chaos * 0.5))) return r.pick(list);
    const contrastP = s.tension * (p.role === "accent" ? 0.95 : 0.6);
    const wantSharp = domSoft ? r.chance(contrastP) : !r.chance(contrastP);
    let id = pickFrom(wantSharp ? sharp : soft);
    if (s.blobs && p.role === "support" && r.chance(0.12)) id = `blob:${Math.floor(r.next() * 1e9)}`;
    list.push(id);
    return id;
  });
}

// ---------------- Color ----------------

const FIELD = ["primaryContainer", "secondaryContainer", "tertiaryContainer", "primaryFixedDim", "secondaryFixedDim", "tertiaryFixedDim", "inversePrimary"];
const STRONG = ["primary", "secondary", "tertiary"];
const DEEP = ["onPrimaryContainer", "onSecondaryContainer", "onTertiaryContainer", "inverseSurface"];

function chooseBackground(c: Ctx, pal: Palette): Background {
  const { r, s } = c;
  const style = s.bgStyle === "auto" ? r.weighted(["surface", "container", "tinted", "deep", "gradient"] as const, [3, 2, 2, 1.2, 1.5]) : s.bgStyle;
  const R = pal.roles;
  let role = "surface";
  let hex = R.surface.hex;
  let gradient: Background["gradient"];
  if (style === "container") { role = pal.isDark ? "surfaceContainer" : "surfaceContainerHigh"; }
  else if (style === "tinted") { role = r.pick(["primaryContainer", "secondaryContainer", "tertiaryContainer"]); }
  else if (style === "deep") { role = pal.isDark ? "surfaceContainerLowest" : "onPrimaryContainer"; }
  else if (style === "gradient") {
    role = "surface";
    const g = r.pick(["primaryContainer", "tertiaryContainer", "secondaryContainer"]);
    const pp = powerPoints(c.w, c.h);
    const p = r.pick(pp);
    gradient = { hex: R[g].hex, cx: p[0] / c.w, cy: p[1] / c.h };
  } else if (style === "amoled") {
    role = "amoled";
  }
  hex = role === "amoled" ? "#000000" : R[role].hex;
  // pattern
  let pattern: PatternId = s.pattern === "auto" ? r.weighted(PATTERNS, [3, 1.2, 1, 1, 1, 1, 1, 1, 1, 0.8, 1, 1]) : s.pattern;
  if (s.archetype === "scatter") pattern = r.pick(PATTERNS);
  const bgInfo = role === "amoled" ? pureInfo("#000000") : R[role];
  const patternHex = shiftTone(bgInfo, bgInfo.tone > 50 ? -14 : 14);
  return { hex, role, gradient, pattern, patternHex, patternOpacity: 0.3 + s.patternStrength * 0.7, patternScale: 0.5 + s.patternScale * 1.5 };
}

function assignColors(c: Ctx, layers: Layer[], pal: Palette, bg: Background) {
  const { r, s } = c;
  const R = pal.roles;
  const bgInfo = bg.role === "amoled" ? pureInfo("#000000") : R[bg.role];
  const minD = 14 + s.punch * 30;

  if (s.archetype === "scatter") {
    const opts = ["primary", "secondary", "tertiary", "primaryContainer", "secondaryContainer", "tertiaryContainer", "inversePrimary", "black"];
    layers.forEach((l, i) => {
      const role = r.pick(opts);
      l.fillRole = role;
      l.fill = role === "black" ? "#000000" : R[role].hex;
      if (i > 0 && r.chance(0.75)) {
        l.overlapWith = layers.slice(0, i).map((_, j) => j);
        const o = r.pick(opts);
        l.overlapFill = o === "black" ? "#000000" : R[o].hex;
      }
    });
    return;
  }

  const get = (role: string): ColorInfo => (role === "black" ? pureInfo("#000000") : R[role]);
  const rank = (cands: string[], against: ColorInfo[], need: number, bias: (x: string) => number) =>
    cands
      .filter((x) => R[x])
      .map((x) => {
        const dmin = Math.min(...against.map((a) => distinguish(get(x), a)));
        const extreme = get(x).tone < 15 ? -0.9 : 0;
        return { x, v: (dmin >= need ? 1 : dmin / need - 0.5) + bias(x) + extreme + r.next() * 0.35 };
      })
      .sort((a, b) => b.v - a.v)
      .map((o) => o.x);

  const strongBias = s.spec === "2025" ? 0.15 : 0;
  const A = rank([...FIELD, ...STRONG], [bgInfo], minD, (x) => (STRONG.includes(x) ? strongBias : 0.1))[0];
  const B = rank([...FIELD, ...STRONG, ...DEEP].filter((x) => x !== A), [bgInfo, get(A)], minD * 0.8, (x) => (DEEP.includes(x) ? -0.35 : 0))[0];
  const C = rank([...STRONG, "inversePrimary", ...FIELD, ...DEEP].filter((x) => x !== A && x !== B), [bgInfo, get(A)], minD * 1.1, (x) => (STRONG.includes(x) ? 0.25 : DEEP.includes(x) ? -0.2 : 0))[0];
  const D = rank([...STRONG, ...DEEP, ...FIELD].filter((x) => x !== A && x !== C), [get(A), get(C)], minD, () => 0)[0];
  const groups: Record<Role, string> = { dominant: A, support: B, accent: C };

  layers.forEach((l, i) => {
    let role = groups[l.role];
    // Real backdrop: whichever earlier (lower) layer this shape overlaps most, else background.
    const backs: ColorInfo[] = [bgInfo];
    for (let j = 0; j < i; j++) {
      const o = layers[j];
      if (Math.hypot(o.cx - l.cx, o.cy - l.cy) < radiusOf(o) + radiusOf(l) * 0.4) backs.push(get(o.fillRole));
    }
    const ok = (x: string) => backs.every((b) => distinguish(get(x), b) >= minD * 0.85);
    if (!ok(role)) {
      const alt = [A, B, C, D, ...STRONG, ...DEEP].find((x) => x && ok(x));
      if (alt) role = alt;
    }
    l.fillRole = role;
    l.fill = get(role).hex;
    if (s.outlines && l.role === "accent" && r.chance(0.5)) l.outline = true;
  });

  if (s.overlapAccents) {
    layers.forEach((l, i) => {
      const w: number[] = [];
      for (let j = 0; j < i; j++) {
        const o = layers[j];
        const gap = Math.hypot(o.cx - l.cx, o.cy - l.cy) - (radiusOf(o) + radiusOf(l));
        const mr = Math.min(radiusOf(o), radiusOf(l));
        if (gap < -0.3 * mr && gap > -1.9 * mr) w.push(j);
      }
      if (w.length && !l.outline) {
        l.overlapWith = w;
        const cand = [D, C, B].find((x) => x && x !== l.fillRole && w.every((j) => layers[j].fillRole !== x));
        l.overlapFill = cand ? get(cand).hex : undefined;
        if (!cand) l.overlapWith = [];
      }
    });
  }

  if (s.depth > 0) layers.forEach((l) => (l.shadow = shiftTone(get(l.fillRole), pal.isDark ? -18 : -22)));
}

// ---------------- Repair ----------------

function repair(c: Ctx, layers: Layer[], plan: Plan) {
  const { w, h, S } = c;
  const minGap = S * 0.025;
  for (let it = 0; it < 5; it++) {
    for (let i = 0; i < layers.length; i++)
      for (let j = i + 1; j < layers.length; j++) {
        const a = layers[i], b = layers[j];
        const ra = radiusOf(a), rb = radiusOf(b);
        let dx = b.cx - a.cx, dy = b.cy - a.cy;
        let d = Math.hypot(dx, dy);
        if (d < 1e-3) { dx = 1; dy = 0; d = 1; }
        const gap = d - ra - rb;
        const mr = Math.min(ra, rb);
        if (gap < minGap && gap > -0.2 * mr) {
          // near-kiss or sliver: push apart (or commit deeper into an intentional overlap)
          const target = gap < -0.1 * mr ? -0.45 * mr : minGap;
          const move = target - gap;
          const mover = a.size < b.size ? a : b;
          const sign = mover === b ? 1 : -1;
          mover.cx += (dx / d) * move * sign;
          mover.cy += (dy / d) * move * sign;
        }
      }
    layers.forEach((l, idx) => {
      if (plan.noRepairEdges?.includes(idx)) return;
      const rr = l.size / 2;
      const m = S * 0.03;
      // per axis: either contained with margin, or bled by >= 25% of diameter
      const fix = (pos: number, ext: number) => {
        const lo = pos - rr, hi = pos + rr;
        if (lo < m && lo > -0.5 * rr) return lo > -0.22 * rr ? rr + m : -0.5 * rr + rr;
        if (hi > ext - m && hi < ext + 0.5 * rr) return hi < ext + 0.22 * rr ? ext - m - rr : ext + 0.5 * rr - rr;
        return pos;
      };
      if (l.size < Math.min(w, h) * 0.9) {
        l.cx = fix(l.cx, w);
        l.cy = fix(l.cy, h);
      }
    });
  }
}

// ---------------- Scoring ----------------

export function evaluate(c: { w: number; h: number; keepOut: Rect[] }, layers: Layer[], plan: Pick<Plan, "focalPoints" | "balanceTarget" | "balanceTol" | "coverage" | "flatHierarchy">, pal: Palette, bg: Background, punch: number, negSpace: number): ScoreBreakdown {
  const { w, h } = c;
  const S = Math.min(w, h);
  const bgInfo = bg.role === "amoled" ? pureInfo("#000000") : pal.roles[bg.role];
  const info = (hex: string) => pureInfo(hex);
  const area = (l: Layer) => getShape(l.shape).fill * l.size * l.size;
  const sorted = [...layers].sort((a, b) => area(b) - area(a));

  // hierarchy
  let hierarchy = 1;
  if (sorted.length > 1) {
    const ratio = area(sorted[0]) / area(sorted[1]);
    hierarchy = clamp((ratio - 1) / (plan.flatHierarchy ? 0.4 : 1.0));
  }

  // coverage raster + per-color visible area
  const G = 64;
  const gx = w >= h ? G : Math.max(8, Math.round((G * w) / h)), gy = w >= h ? Math.max(8, Math.round((G * h) / w)) : G;
  let covered = 0, keepCells = 0, keepHit = 0;
  const colorArea = new Map<string, number>();
  for (let j = 0; j < gy; j++)
    for (let i = 0; i < gx; i++) {
      const x = ((i + 0.5) / gx) * w, y = ((j + 0.5) / gy) * h;
      const inKeep = c.keepOut.some((k) => x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h);
      if (inKeep) keepCells++;
      for (let k = layers.length - 1; k >= 0; k--) {
        const l = layers[k];
        const req = l.size * Math.sqrt(getShape(l.shape).fill / Math.PI);
        if (Math.hypot(x - l.cx, y - l.cy) < req) {
          covered++;
          if (inKeep) keepHit++;
          colorArea.set(l.fill, (colorArea.get(l.fill) ?? 0) + 1);
          break;
        }
      }
    }
  const coverage = covered / (gx * gy);
  const aspect = Math.max(w, h) / Math.min(w, h);
  const targetCov = plan.coverage * (1.25 - negSpace * 0.5) * Math.pow(1.78 / Math.max(1, aspect), 0.6);
  let negativeSpace = clamp(1 - Math.max(0, Math.abs(coverage - targetCov) - 0.08) / 0.2);
  if (keepCells) negativeSpace *= 1 - clamp(keepHit / keepCells * 3);

  // balance (visual weight = area x contrast x chroma)
  let sw = 0, sx = 0, sy = 0;
  for (const l of layers) {
    const ci = info(l.fill);
    const vis = clamp((Math.min(w, l.cx + l.size / 2) - Math.max(0, l.cx - l.size / 2)) / l.size) * clamp((Math.min(h, l.cy + l.size / 2) - Math.max(0, l.cy - l.size / 2)) / l.size);
    const wt = area(l) * vis * (0.4 + distinguish(ci, bgInfo) / 60) * (1 + ci.chroma / 120);
    sw += wt; sx += wt * clamp(l.cx, 0, w); sy += wt * clamp(l.cy, 0, h);
  }
  const centroid: [number, number] = sw ? [sx / sw, sy / sw] : [w / 2, h / 2];
  const bd = Math.hypot((centroid[0] - plan.balanceTarget[0]) / w, (centroid[1] - plan.balanceTarget[1]) / h);
  const balance = clamp(1 - Math.max(0, bd - plan.balanceTol * 0.4) / (plan.balanceTol));

  // focal
  let focal = 1;
  if (plan.focalPoints && sorted.length) {
    const d = sorted[0];
    const nd = Math.min(...plan.focalPoints.map(([x, y]) => Math.hypot(x - d.cx, y - d.cy)));
    focal = clamp(1 - nd / (S * 0.18));
  }

  // spacing
  let pairs = 0, viol = 0;
  for (let i = 0; i < layers.length; i++)
    for (let j = i + 1; j < layers.length; j++) {
      pairs++;
      const a = layers[i], b = layers[j];
      const gap = Math.hypot(a.cx - b.cx, a.cy - b.cy) - radiusOf(a) - radiusOf(b);
      const mr = Math.min(radiusOf(a), radiusOf(b));
      if (gap < S * 0.018 && gap > -0.2 * mr) viol++;
    }
  const spacing = pairs ? clamp(1 - viol * 0.22) : 1;

  // contrast vs actual backdrop
  const minD = 14 + punch * 30;
  let worst = Infinity;
  layers.forEach((l, i) => {
    let back = bgInfo;
    for (let j = i - 1; j >= 0; j--) {
      const o = layers[j];
      if (Math.hypot(o.cx - l.cx, o.cy - l.cy) < radiusOf(o) - radiusOf(l) * 0.2) { back = info(o.fill); break; }
    }
    worst = Math.min(worst, distinguish(info(l.fill), back));
  });
  const contrast = layers.length ? clamp(worst / minD) : 1;

  // color area: one color should own the area
  const totalC = [...colorArea.values()].reduce((a, b) => a + b, 0) || 1;
  const share = Math.max(0, ...colorArea.values()) / totalC;
  const colorAreaS = clamp((share - 0.3) / 0.25);

  // edges: contained-with-margin or committed bleed
  let awk = 0;
  for (const l of layers) {
    const rr = l.size / 2;
    for (const dist of [l.cx, w - l.cx, l.cy, h - l.cy]) {
      const over = (rr - dist) / (2 * rr);
      if ((over > -0.01 && over < 0.12) || (dist - rr > 0 && dist - rr < S * 0.012)) { awk++; break; }
    }
  }
  const edges = layers.length ? clamp(1 - awk / layers.length * 1.5) : 1;

  // clutter: competing focal points
  let comp = 0;
  if (!plan.flatHierarchy && sorted.length > 1) comp = sorted.slice(1).filter((l) => area(l) > area(sorted[0]) * 0.55).length;
  const clutter = clamp(comp * 0.5);

  const W = { hierarchy: 1.2, balance: 1.1, focal: 0.6, negativeSpace: 1, spacing: 1.3, contrast: 1.2, colorArea: 0.7, edges: 1 };
  const sum = hierarchy * W.hierarchy + balance * W.balance + focal * W.focal + negativeSpace * W.negativeSpace + spacing * W.spacing + contrast * W.contrast + colorAreaS * W.colorArea + edges * W.edges;
  const tw = Object.values(W).reduce((a, b) => a + b, 0);
  const total = clamp(sum / tw - clutter * 0.15) * 100;
  return { hierarchy, balance, focal, negativeSpace, spacing, contrast, colorArea: colorAreaS, edges, clutter, total, coverage, centroid };
}

// ---------------- Main loop ----------------

export function keepOutZones(s: Settings, w: number, h: number): Rect[] {
  if (!s.safeArea) return [];
  if (h > w) return [{ x: w * 0.1, y: h * 0.08, w: w * 0.8, h: h * 0.22 }]; // lock-screen clock
  return [{ x: w * 0.06, y: h * 0.12, w: w * 0.32, h: h * 0.3 }]; // desktop widgets / clock
}

export function compose(s: Settings, archetypeOverride?: ArchetypeId): Composition {
  const { w, h } = getDims(s);
  const S = Math.min(w, h);
  const pal = buildPalette(s);
  const keepOut = keepOutZones(s, w, h);
  const naive = (archetypeOverride ?? s.archetype) === "scatter";
  const N = naive ? 1 : Math.max(1, s.attempts);
  let best: Composition | null = null;
  const archR = makeRng(hashSeed(s.seed, "arch"));
  const autoArch = archR.weighted(
    ARCHETYPES.map((a) => a.id),
    [3, 1.6, 1.3, 1.5, 1.1, 1.4, 1, 1.3]
  ) as ArchetypeId;
  const archetype: ArchetypeId = archetypeOverride ?? (s.archetype === "auto" ? autoArch : s.archetype);
  const bgR = makeRng(hashSeed(s.seed, "bg"));
  const bg = chooseBackground({ w, h, S, r: bgR, s: { ...s, archetype }, keepOut }, pal);

  for (let attempt = 0; attempt < N; attempt++) {
    const r = makeRng(hashSeed(s.seed, archetype, attempt));
    const c: Ctx = { w, h, S, r, s: { ...s, archetype }, keepOut };
    const plan = GENERATORS[archetype](c);
    const shapes = assignShapes(c, plan.placements);
    const g = r.pick([0, 0, 0, 15, -15, 30, 45, 22.5]);
    let layers: Layer[] = plan.placements.map((p, i) => ({
      shape: shapes[i],
      cx: p.cx,
      cy: p.cy,
      size: p.size,
      rot: naive ? (p.rot ?? 0) : (p.rot ?? g) + r.gauss() * s.chaos * 22,
      role: p.role,
      fillRole: "primary",
      fill: "#000",
      outline: false,
      overlapWith: [],
    }));
    // paint big to small (dominant at the back) — except naive scatter keeps random order
    if (!naive) {
      const idx = layers.map((_, i) => i).sort((a, b) => layers[b].size - layers[a].size);
      layers = idx.map((i) => layers[i]);
      const noRep = plan.noRepairEdges?.map((k) => idx.indexOf(k));
      repair(c, layers, { ...plan, noRepairEdges: noRep });
    }
    assignColors(c, layers, pal, bg);
    const score = evaluate({ w, h, keepOut }, layers, plan, pal, bg, s.punch, s.negativeSpace);
    if (!best || score.total > best.score.total) {
      best = {
        w, h, archetype, layers, bg, score, attempt, keepOut,
        focalPoints: plan.focalPoints ?? [],
        balanceTarget: plan.balanceTarget,
        seed: s.seed,
        palette: pal,
        usedRoles: Array.from(new Set(layers.map((l) => l.fillRole))),
      };
    }
    if (score.total > 97) break;
  }
  return best!;
}
