import {
  Hct,
  argbFromHex,
  hexFromArgb,
  QuantizerCelebi,
  Score,
  SchemeTonalSpot,
  SchemeVibrant,
  SchemeExpressive,
  SchemeNeutral,
  SchemeContent,
  SchemeFidelity,
  SchemeMonochrome,
  SchemeRainbow,
  SchemeFruitSalad,
  DynamicScheme,
} from "@material/material-color-utilities";

export const VARIANTS = [
  "TonalSpot",
  "Vibrant",
  "Expressive",
  "Neutral",
  "Content",
  "Fidelity",
  "Monochrome",
  "Rainbow",
  "FruitSalad",
] as const;
export type VariantName = (typeof VARIANTS)[number];
export type Spec = "2021" | "2025";

const CTORS: Record<VariantName, new (h: Hct, dark: boolean, c: number, spec?: Spec) => DynamicScheme> = {
  TonalSpot: SchemeTonalSpot as never,
  Vibrant: SchemeVibrant as never,
  Expressive: SchemeExpressive as never,
  Neutral: SchemeNeutral as never,
  Content: SchemeContent as never,
  Fidelity: SchemeFidelity as never,
  Monochrome: SchemeMonochrome as never,
  Rainbow: SchemeRainbow as never,
  FruitSalad: SchemeFruitSalad as never,
};

// Roles shapes can wear. Grouped by how they should be spent on area.
export const FILL_ROLES = [
  "primary",
  "secondary",
  "tertiary",
  "primaryContainer",
  "secondaryContainer",
  "tertiaryContainer",
  "primaryFixedDim",
  "secondaryFixedDim",
  "tertiaryFixedDim",
  "inversePrimary",
  "onPrimaryContainer",
  "onSecondaryContainer",
  "onTertiaryContainer",
  "inverseSurface",
] as const;
export type FillRole = (typeof FILL_ROLES)[number];

export const BG_ROLES = [
  "surface",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceDim",
  "primaryContainer",
  "secondaryContainer",
  "tertiaryContainer",
  "onPrimaryContainer",
  "inverseSurface",
] as const;

export type ColorInfo = { hex: string; argb: number; tone: number; chroma: number; hue: number };
export type Palette = {
  roles: Record<string, ColorInfo>;
  isDark: boolean;
};

export type ColorSettings = {
  seedHex: string;
  variant: VariantName;
  spec: Spec;
  dark: boolean;
  contrast: number;
};

function info(argb: number): ColorInfo {
  const h = Hct.fromInt(argb);
  return { hex: hexFromArgb(argb), argb, tone: h.tone, chroma: h.chroma, hue: h.hue };
}

const ALL_ROLES = Array.from(new Set<string>([...FILL_ROLES, ...BG_ROLES, "outline", "outlineVariant", "onSurface", "onSurfaceVariant", "onPrimary", "error", "onTertiary", "shadow", "surfaceContainerHighest", "surfaceContainerLowest", "surfaceBright"]));

const paletteCache = new Map<string, Palette>();
export function buildPalette(c: ColorSettings): Palette {
  const key = `${c.seedHex}|${c.variant}|${c.spec}|${c.dark}|${c.contrast}`;
  const hit = paletteCache.get(key);
  if (hit) return hit;
  const Ctor = CTORS[c.variant];
  const scheme = new Ctor(Hct.fromInt(argbFromHex(c.seedHex)), c.dark, c.contrast, c.spec);
  const roles: Record<string, ColorInfo> = {};
  for (const r of ALL_ROLES) {
    const v = (scheme as unknown as Record<string, number>)[r];
    if (typeof v === "number") roles[r] = info(v);
  }
  const p = { roles, isDark: c.dark };
  paletteCache.set(key, p);
  if (paletteCache.size > 200) paletteCache.delete(paletteCache.keys().next().value as string);
  return p;
}

export const pureInfo = (hex: string) => info(argbFromHex(hex));

/** Perceptual distinguishability in HCT: tone dominates, chroma-vector distance helps. */
export function distinguish(a: ColorInfo, b: ColorInfo): number {
  const dT = Math.abs(a.tone - b.tone);
  const ax = a.chroma * Math.cos((a.hue * Math.PI) / 180), ay = a.chroma * Math.sin((a.hue * Math.PI) / 180);
  const bx = b.chroma * Math.cos((b.hue * Math.PI) / 180), by = b.chroma * Math.sin((b.hue * Math.PI) / 180);
  const dC = Math.hypot(ax - bx, ay - by);
  return dT + 0.45 * dC;
}

export function shiftTone(c: ColorInfo, delta: number): string {
  const h = Hct.from(c.hue, c.chroma, Math.max(0, Math.min(100, c.tone + delta)));
  return hexFromArgb(h.toInt());
}

export function hexFromHct(hue: number, chroma: number, tone: number) {
  return hexFromArgb(Hct.from(hue, chroma, tone).toInt());
}

/** Extract up to 5 ranked seed colors from an image using Celebi quantizer + MCU score. */
export async function seedsFromImage(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const size = 128;
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const pixels: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 255) continue;
      pixels.push(((255 << 24) | (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) >>> 0);
    }
    const q = QuantizerCelebi.quantize(pixels, 128);
    return Score.score(q, { desired: 5 }).map((a) => hexFromArgb(a));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function randomSeedHex(rand: () => number) {
  return hexFromHct(rand() * 360, 36 + rand() * 50, 50);
}
