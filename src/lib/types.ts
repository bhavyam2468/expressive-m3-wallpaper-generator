import type { Family } from "./shapes";
import type { Spec, VariantName } from "./color";

export const ARCHETYPES = [
  { id: "hero", label: "Hero + satellites", blurb: "One dominant on a power point, orbiting accents" },
  { id: "diagonal", label: "Diagonal flow", blurb: "Decreasing sizes along a vector, aligned rotation" },
  { id: "triptych", label: "Triptych / stack", blurb: "Rhythmic columns or rows, editorial calm" },
  { id: "corner", label: "Corner anchor", blurb: "Big bleed off a corner, open frame" },
  { id: "orbital", label: "Orbital / radial", blurb: "Elements around a centre, pointing outward" },
  { id: "minimal", label: "Big-field minimal", blurb: "One large shape, one tiny accent, vast space" },
  { id: "grid", label: "Modular grid", blurb: "Loose grid with a merged hero cell" },
  { id: "cluster", label: "Cluster + void", blurb: "Dense Gestalt group balanced by emptiness" },
] as const;
export type ArchetypeId = (typeof ARCHETYPES)[number]["id"] | "scatter";

export const PATTERNS = [
  "none",
  "dots",
  "plus",
  "waves",
  "seigaiha",
  "topographic",
  "wavylines",
  "halftone",
  "rings",
  "truchet",
  "flow",
  "grain",
] as const;
export type PatternId = (typeof PATTERNS)[number];

export const BG_STYLES = ["auto", "surface", "container", "tinted", "deep", "gradient", "amoled"] as const;
export type BgStyle = (typeof BG_STYLES)[number];

export type FormatPreset = { id: string; label: string; group: string; w: number; h: number };
export const FORMATS: FormatPreset[] = [
  { id: "16:9", label: "16:9 · 1920×1080", group: "Desktop", w: 1920, h: 1080 },
  { id: "16:10", label: "16:10 · 1920×1200", group: "Desktop", w: 1920, h: 1200 },
  { id: "21:9", label: "21:9 · 2560×1080", group: "Desktop", w: 2560, h: 1080 },
  { id: "32:9", label: "32:9 · 5120×1440", group: "Desktop", w: 5120, h: 1440 },
  { id: "3:2", label: "3:2 · 2160×1440", group: "Desktop", w: 2160, h: 1440 },
  { id: "4:3", label: "4:3 · 1600×1200", group: "Desktop", w: 1600, h: 1200 },
  { id: "phone", label: "Phone · 1080×2400", group: "Mobile", w: 2400, h: 1080 },
  { id: "tablet", label: "Tablet · 2560×1600", group: "Mobile", w: 2560, h: 1600 },
  { id: "watch", label: "Watch · 480×480", group: "Mobile", w: 480, h: 480 },
  { id: "square", label: "Square · 2048×2048", group: "Other", w: 2048, h: 2048 },
];

export type Settings = {
  seed: number;
  archetype: ArchetypeId | "auto";
  format: string;
  portrait: boolean;
  // color
  seedHex: string;
  variant: VariantName;
  spec: Spec;
  dark: boolean;
  contrast: number;
  bgStyle: BgStyle;
  // composition
  density: number;
  negativeSpace: number;
  chaos: number;
  tension: number;
  focal: number;
  depth: number;
  punch: number;
  attempts: number;
  // shapes
  families: Family[];
  blobs: boolean;
  overlapAccents: boolean;
  outlines: boolean;
  // background
  pattern: PatternId | "auto";
  patternScale: number;
  patternStrength: number;
  autoCoordinate: boolean;
  // guides
  safeArea: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  seed: 20250513,
  archetype: "auto",
  format: "16:9",
  portrait: false,
  seedHex: "#6750A4",
  variant: "Expressive",
  spec: "2025",
  dark: false,
  contrast: 0,
  bgStyle: "auto",
  density: 0.45,
  negativeSpace: 0.5,
  chaos: 0.3,
  tension: 0.55,
  focal: 0.6,
  depth: 0,
  punch: 0.45,
  attempts: 28,
  families: ["geometric", "cookie", "burst", "clover", "organic"],
  blobs: true,
  overlapAccents: true,
  outlines: false,
  pattern: "auto",
  patternScale: 0.5,
  patternStrength: 0.5,
  autoCoordinate: true,
  safeArea: false,
};

export function getDims(s: Settings): { w: number; h: number } {
  const f = FORMATS.find((x) => x.id === s.format) ?? FORMATS[0];
  const long = Math.max(f.w, f.h), short = Math.min(f.w, f.h);
  return s.portrait ? { w: short, h: long } : { w: long, h: short };
}
