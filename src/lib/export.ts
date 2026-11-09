import type { Composition } from "./compose";
import { getShape } from "./shapes";
import { DEFAULT_SETTINGS, type Settings } from "./types";

export function svgString(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadSVG(svg: SVGSVGElement, name: string) {
  download(new Blob([svgString(svg)], { type: "image/svg+xml" }), `${name}.svg`);
}

export async function renderPNG(svg: SVGSVGElement, w: number, h: number, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svgString(svg)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * scale);
    cv.height = Math.round(h * scale);
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadPNG(svg: SVGSVGElement, w: number, h: number, scale: number, name: string) {
  download(await renderPNG(svg, w, h, scale), `${name}.png`);
}

/** DMS / Dux Shell-style live layout: centre fractions, size as fraction of the short side, role-based fills. */
export function dmsLayout(comp: Composition) {
  const S = Math.min(comp.w, comp.h);
  return {
    version: 1,
    generator: "kaleido",
    archetype: comp.archetype,
    aspect: comp.w / comp.h,
    background: { role: comp.bg.role, pattern: comp.bg.pattern, strength: +comp.bg.patternOpacity.toFixed(2) },
    shapes: comp.layers.map((l) => ({
      kind: l.shape.startsWith("blob:") ? "blob" : "shape",
      shape: l.shape.startsWith("blob:") ? undefined : l.shape,
      path: l.shape.startsWith("blob:") ? getShape(l.shape).d : undefined,
      x: +(l.cx / comp.w).toFixed(4),
      y: +(l.cy / comp.h).toFixed(4),
      size: +(l.size / S).toFixed(4),
      rotation: +l.rot.toFixed(1),
      role: l.role,
      fill: l.fillRole,
      style: l.outline ? "outline" : "fill",
      opacity: 1,
    })),
  };
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

export const dmsDeepLink = (comp: Composition) => `dms://wallpaper/install/${b64url(JSON.stringify(dmsLayout(comp)))}`;

export function downloadJSON(comp: Composition, name: string) {
  download(new Blob([JSON.stringify(dmsLayout(comp), null, 2)], { type: "application/json" }), `${name}.json`);
}

export function encodeSettings(s: Settings): string {
  const diff: Record<string, unknown> = {};
  for (const k of Object.keys(s) as (keyof Settings)[]) {
    if (JSON.stringify(s[k]) !== JSON.stringify(DEFAULT_SETTINGS[k])) diff[k] = s[k];
  }
  return b64url(JSON.stringify(diff));
}

export function decodeSettings(hash: string): Settings | null {
  try {
    const obj = JSON.parse(unb64url(hash));
    return { ...DEFAULT_SETTINGS, ...obj };
  } catch {
    return null;
  }
}
