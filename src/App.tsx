import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { compose, type Composition } from "./lib/compose";
import { buildPalette, randomSeedHex, seedsFromImage, VARIANTS, type VariantName } from "./lib/color";
import { hashSeed, makeRng, randomSeed } from "./lib/rng";
import { FAMILY_LABEL, SHAPES, getShape, type Family } from "./lib/shapes";
import { ARCHETYPES, BG_STYLES, DEFAULT_SETTINGS, FORMATS, PATTERNS, getDims, type ArchetypeId, type Settings } from "./lib/types";
import { decodeSettings, dmsDeepLink, downloadJSON, downloadPNG, downloadSVG, encodeSettings } from "./lib/export";
import { Guides, Wallpaper } from "./components/Wallpaper";
import { Chip, IconButton, Section, Segmented, Slider, Toggle } from "./components/ui";
import { ScoreBadge, ScorePanel } from "./components/ScorePanel";
import { cn } from "./utils/cn";

type Fav = { id: string; settings: Settings; at: number };
type Tab = "compose" | "color" | "shapes" | "background" | "export" | "saved";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "compose", label: "Compose", icon: "◎" },
  { id: "color", label: "Color", icon: "◐" },
  { id: "shapes", label: "Shapes", icon: "✿" },
  { id: "background", label: "Backdrop", icon: "▦" },
  { id: "export", label: "Export", icon: "⤓" },
  { id: "saved", label: "Saved", icon: "♥" },
];

const loadFavs = (): Fav[] => {
  try {
    return JSON.parse(localStorage.getItem("kaleido.favs") || "[]");
  } catch {
    return [];
  }
};

function initialSettings(): Settings {
  const m = location.hash.match(/s=([^&]+)/);
  if (m) {
    const s = decodeSettings(m[1]);
    if (s) return s;
  }
  return DEFAULT_SETTINGS;
}

function Thumb({ s, archetype, onClick, active, label }: { s: Settings; archetype?: ArchetypeId; onClick: () => void; active?: boolean; label?: string }) {
  const comp = useMemo(() => compose({ ...s, attempts: Math.min(s.attempts, 14) }, archetype), [s, archetype]);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("group relative shrink-0 overflow-hidden rounded-2xl ring-2 transition-all hover:-translate-y-0.5", active ? "ring-[var(--p)]" : "ring-transparent hover:ring-[var(--olv)]")}
      style={{ aspectRatio: `${comp.w}/${comp.h}`, height: 88 }}
      title={label}
    >
      <Wallpaper comp={comp} depth={s.depth} autoCoordinate={s.autoCoordinate} className="h-full w-full" />
      <span className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
        {label && <span className="truncate rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white backdrop-blur">{label}</span>}
        <ScoreBadge total={comp.score.total} />
      </span>
    </button>
  );
}

export default function App() {
  const [hist, setHist] = useState<{ past: Settings[]; present: Settings; future: Settings[] }>(() => ({ past: [], present: initialSettings(), future: [] }));
  const s = hist.present;
  const lastPush = useRef(0);
  const set = useCallback((patch: Partial<Settings>, forceRecord = false) => {
    setHist((h) => {
      const now = Date.now();
      const record = forceRecord || now - lastPush.current > 600;
      lastPush.current = now;
      const next = { ...h.present, ...patch };
      return record ? { past: [...h.past.slice(-60), h.present], present: next, future: [] } : { ...h, present: next };
    });
  }, []);
  const undo = useCallback(() => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h)), []);
  const redo = useCallback(() => setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)), []);

  const deferred = useDeferredValue(s);
  const comp: Composition = useMemo(() => compose(deferred), [deferred]);
  const naive: Composition = useMemo(() => compose(deferred, "scatter"), [deferred]);
  const { w, h } = getDims(s);

  const [tab, setTab] = useState<Tab>("compose");
  const [guides, setGuides] = useState(false);
  const [compare, setCompare] = useState(false);
  const [strip, setStrip] = useState<"variations" | "archetypes">("variations");
  const [locks, setLocks] = useState({ color: false, layout: false, background: false });
  const [favs, setFavs] = useState<Fav[]>(loadFavs);
  const [imgSeeds, setImgSeeds] = useState<string[]>([]);
  const [scale, setScale] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 2200);
  };

  useEffect(() => localStorage.setItem("kaleido.favs", JSON.stringify(favs)), [favs]);
  useEffect(() => {
    const t = setTimeout(() => history.replaceState(null, "", `#s=${encodeSettings(s)}`), 300);
    return () => clearTimeout(t);
  }, [s]);

  // UI theme follows the wallpaper's seed (dark UI, tinted surfaces)
  const ui = useMemo(() => buildPalette({ seedHex: s.seedHex, variant: s.variant === "Monochrome" ? "Monochrome" : "TonalSpot", spec: "2025", dark: true, contrast: 0 }).roles, [s.seedHex, s.variant]);
  const vars = {
    "--s": ui.surface.hex,
    "--scl": ui.surfaceContainerLow.hex,
    "--sc": ui.surfaceContainer.hex,
    "--sch": ui.surfaceContainerHigh.hex,
    "--schh": ui.surfaceContainerHighest.hex,
    "--os": ui.onSurface.hex,
    "--osv": ui.onSurfaceVariant.hex,
    "--ol": ui.outline.hex,
    "--olv": ui.outlineVariant.hex,
    "--p": ui.primary.hex,
    "--op": ui.onPrimary.hex,
    "--pc": ui.primaryContainer.hex,
    "--opc": ui.onPrimaryContainer.hex,
    "--sc2": ui.secondaryContainer.hex,
    "--osc2": ui.onSecondaryContainer.hex,
    "--t": ui.tertiary.hex,
    "--tc": ui.tertiaryContainer.hex,
    "--otc": ui.onTertiaryContainer.hex,
    "--err": ui.error.hex,
  } as React.CSSProperties;

  const surprise = useCallback(() => {
    const seed = randomSeed();
    const r = makeRng(seed);
    const patch: Partial<Settings> = { seed };
    if (!locks.color) {
      patch.seedHex = randomSeedHex(r.next);
      patch.variant = r.weighted(["Expressive", "Vibrant", "TonalSpot", "FruitSalad", "Rainbow", "Content", "Fidelity", "Neutral", "Monochrome"] as VariantName[], [4, 3, 3, 1.5, 1, 1, 1, 0.5, 0.4]);
      patch.dark = r.chance(0.38);
    }
    if (!locks.layout) patch.archetype = "auto";
    if (!locks.background) {
      patch.pattern = "auto";
      patch.bgStyle = "auto";
    }
    set(patch, true);
  }, [locks, set]);

  const mutate = useCallback(() => set({ seed: hashSeed(s.seed, "mutate", Date.now()), archetype: comp.archetype }, true), [s.seed, comp.archetype, set]);

  const saveFav = useCallback(() => {
    setFavs((f) => [{ id: `${s.seed}-${Date.now()}`, settings: { ...s, archetype: comp.archetype }, at: Date.now() }, ...f].slice(0, 60));
    notify("Saved to favorites ♥");
  }, [s, comp.archetype]);

  const exportPNG = useCallback(async () => {
    if (!svgRef.current) return;
    notify("Rendering PNG…");
    await downloadPNG(svgRef.current, w, h, scale, `kaleido-${comp.archetype}-${s.seed}`);
  }, [w, h, scale, comp.archetype, s.seed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") return void (e.preventDefault(), redo());
      if (mod) return;
      if (e.key === " ") { e.preventDefault(); surprise(); }
      else if (e.key === "m") mutate();
      else if (e.key === "f") saveFav();
      else if (e.key === "g") setGuides((v) => !v);
      else if (e.key === "c") setCompare((v) => !v);
      else if (e.key === "e") exportPNG();
      else if (e.key === "0") set({ archetype: "auto" }, true);
      else if (/^[1-8]$/.test(e.key)) set({ archetype: ARCHETYPES[Number(e.key) - 1].id }, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [surprise, mutate, saveFav, exportPNG, undo, redo, set]);

  const variations = useMemo(() => Array.from({ length: 6 }, (_, i) => hashSeed(s.seed, "alt", i)), [s.seed]);
  const roleSwatches = ["primary", "secondary", "tertiary", "primaryContainer", "secondaryContainer", "tertiaryContainer", "inversePrimary", "onPrimaryContainer", "surface", "surfaceContainerHigh"];
  const archLabel = ARCHETYPES.find((a) => a.id === comp.archetype)?.label ?? comp.archetype;
  const toggleFamily = (f: Family) => set({ families: s.families.includes(f) ? s.families.filter((x) => x !== f) : [...s.families, f] }, true);

  return (
    <div style={vars} className="min-h-screen bg-[var(--s)] font-[Roboto_Flex,system-ui,sans-serif] text-[var(--os)] transition-colors duration-500">
      {/* Top app bar */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 bg-[var(--s)]/90 px-4 py-3 backdrop-blur lg:px-6">
        <div className="mr-2 flex items-center gap-2.5">
          <svg viewBox="-1.1 -1.1 2.2 2.2" className="h-9 w-9 animate-[spin_24s_linear_infinite]">
            <path d={getShape("cookie9").d} fill="var(--pc)" />
            <path d={getShape("sunny").d} transform="scale(0.5)" fill="var(--t)" />
          </svg>
          <div className="leading-tight">
            <h1 className="text-xl font-bold tracking-tight">Kaleido</h1>
            <p className="text-[11px] text-[var(--osv)]">M3 Expressive wallpaper composer</p>
          </div>
        </div>
        <button
          type="button"
          onClick={surprise}
          className="group inline-flex h-12 items-center gap-2 rounded-[16px] bg-[var(--pc)] px-5 font-semibold text-[var(--opc)] shadow-lg transition-all hover:rounded-[24px] active:scale-95"
          title="Surprise me (Space)"
        >
          <span className="text-lg transition-transform duration-500 group-hover:rotate-180">✦</span> Surprise me
        </button>
        <button type="button" onClick={mutate} title="Mutate: new seed, same archetype (M)" className="h-12 rounded-full bg-[var(--sc2)] px-4 text-sm font-medium text-[var(--osc2)] transition-all active:scale-95">
          ↻ Mutate
        </button>
        <div className="ml-1 flex items-center">
          <IconButton title="Undo (Ctrl+Z)" onClick={undo} disabled={!hist.past.length}>↶</IconButton>
          <IconButton title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!hist.future.length}>↷</IconButton>
          <IconButton title="Save favorite (F)" onClick={saveFav}>♥</IconButton>
          <IconButton title="Composition guides (G)" onClick={() => setGuides((v) => !v)} active={guides}>⊞</IconButton>
          <IconButton title="A/B vs reference scatter (C)" onClick={() => setCompare((v) => !v)} active={compare}>⇆</IconButton>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-[var(--osv)]">
          <span className="hidden md:inline">Locks on Surprise:</span>
          {(["color", "layout", "background"] as const).map((k) => (
            <Chip key={k} active={locks[k]} onClick={() => setLocks((l) => ({ ...l, [k]: !l[k] }))}>
              {locks[k] ? "🔒" : "🔓"} {k}
            </Chip>
          ))}
        </div>
      </header>

      <main className="grid gap-4 px-4 pb-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-6">
        {/* Stage */}
        <div className="min-w-0 space-y-4">
          <div className={cn("grid gap-4", compare && "md:grid-cols-2")}>
            <figure className="relative">
              <div className="relative mx-auto overflow-hidden rounded-[28px] bg-[var(--scl)] shadow-2xl" style={{ aspectRatio: `${w}/${h}`, maxHeight: compare ? "60vh" : "68vh", maxWidth: "100%" }}>
                <Wallpaper ref={svgRef} comp={comp} depth={s.depth} autoCoordinate={s.autoCoordinate} className="h-full w-full" />
                <Guides comp={comp} showGrid={guides} showClock={s.safeArea} />
                <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                  <ScoreBadge total={comp.score.total} label="Kaleido" />
                  <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white backdrop-blur">{archLabel}</span>
                </div>
              </div>
              {compare && <figcaption className="mt-2 text-center text-xs text-[var(--osv)]">Constraint-based composition · best of {s.attempts} (picked #{comp.attempt + 1})</figcaption>}
            </figure>
            {compare && (
              <figure className="relative">
                <div className="relative mx-auto overflow-hidden rounded-[28px] shadow-2xl" style={{ aspectRatio: `${w}/${h}`, maxHeight: "60vh", maxWidth: "100%" }}>
                  <Wallpaper comp={naive} depth={0} autoCoordinate={false} className="h-full w-full" />
                  <Guides comp={naive} showGrid={guides} showClock={false} />
                  <div className="absolute left-3 top-3">
                    <ScoreBadge total={naive.score.total} label="Reference scatter" />
                  </div>
                </div>
                <figcaption className="mt-2 text-center text-xs text-[var(--osv)]">Same seed &amp; palette, the reference's uniform-random "Surprise me"</figcaption>
              </figure>
            )}
          </div>

          {/* Strip */}
          <div className="rounded-[28px] bg-[var(--scl)] p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <Segmented options={["variations", "archetypes"] as const} value={strip} onChange={setStrip} labels={{ variations: "Variations", archetypes: "All archetypes" }} />
              <span className="hidden text-[11px] text-[var(--osv)] sm:block">Click to adopt · every tile is best-of-N scored</span>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1 pt-1">
              {strip === "variations"
                ? variations.map((seed, i) => <Thumb key={seed} s={{ ...deferred, seed }} onClick={() => set({ seed }, true)} label={`Seed ${i + 1}`} />)
                : ARCHETYPES.map((a, i) => (
                    <Thumb key={a.id} s={deferred} archetype={a.id} active={comp.archetype === a.id} onClick={() => set({ archetype: a.id }, true)} label={`${i + 1} · ${a.label}`} />
                  ))}
            </div>
          </div>

          {/* Insight row */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[28px] bg-[var(--scl)] p-4 md:col-span-1">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--osv)]">Fitness</h3>
                <span className="text-2xl font-bold tabular-nums text-[var(--p)]">{Math.round(comp.score.total)}</span>
              </div>
              <ScorePanel score={comp.score} />
              <p className="mt-3 text-[11px] text-[var(--osv)]">
                Coverage {Math.round(comp.score.coverage * 100)}% · {comp.layers.length} shapes · reference would score <b>{Math.round(naive.score.total)}</b>
              </p>
            </div>
            <div className="rounded-[28px] bg-[var(--scl)] p-4">
              <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--osv)]">Palette roles in use</h3>
              <div className="grid grid-cols-5 gap-2">
                {roleSwatches.map((r) => {
                  const c = comp.palette.roles[r];
                  const used = comp.usedRoles.includes(r) || comp.bg.role === r;
                  return (
                    <div key={r} title={`${r} · ${c.hex} · T${Math.round(c.tone)}`} className="text-center">
                      <div className={cn("mx-auto aspect-square w-full rounded-2xl transition-all", used ? "ring-2 ring-[var(--os)] ring-offset-2 ring-offset-[var(--scl)]" : "opacity-60")} style={{ background: c.hex }} />
                      <span className="mt-1 block truncate text-[9px] text-[var(--osv)]">{r.replace("Container", "C").replace("surface", "srf")}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-[var(--osv)]">
                Area budget: dominant → <b>{comp.layers[0]?.fillRole}</b>, backdrop → <b>{comp.bg.role}</b>. Contrast guard ΔHCT ≥ {Math.round(14 + s.punch * 30)}.
              </p>
            </div>
            <div className="rounded-[28px] bg-[var(--scl)] p-4 text-[12px] leading-relaxed text-[var(--osv)]">
              <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em]">Keyboard</h3>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                {[
                  ["Space", "Surprise me"],
                  ["M", "Mutate"],
                  ["1–8 / 0", "Archetype / auto"],
                  ["G", "Guides"],
                  ["C", "A/B compare"],
                  ["F", "Favorite"],
                  ["E", "Export PNG"],
                  ["⌘Z / ⇧⌘Z", "Undo / redo"],
                ].map(([k, v]) => (
                  <li key={k} className="flex items-center gap-2">
                    <kbd className="rounded-md bg-[var(--sch)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--os)]">{k}</kbd>
                    <span className="truncate">{v}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                Seed{" "}
                <input
                  className="w-28 rounded-lg bg-[var(--sch)] px-2 py-1 font-mono text-[var(--os)] outline-none focus:ring-2 focus:ring-[var(--p)]"
                  value={s.seed}
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(/\D/g, ""));
                    if (Number.isFinite(v)) set({ seed: v >>> 0 }, true);
                  }}
                />{" "}
                — same seed, same wallpaper.
              </p>
            </div>
          </div>
        </div>

        {/* Control panel */}
        <aside className="min-w-0 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-92px)] lg:overflow-y-auto lg:pr-1">
          <nav className="mb-3 grid grid-cols-6 gap-1 rounded-[24px] bg-[var(--scl)] p-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn("flex flex-col items-center gap-0.5 rounded-[18px] py-2 text-[10px] font-medium transition-all", tab === t.id ? "bg-[var(--sc2)] text-[var(--osc2)]" : "text-[var(--osv)] hover:bg-[var(--sc)]")}
              >
                <span className="text-base leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="space-y-3">
            {tab === "compose" && (
              <>
                <Section title="Layout archetype">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => set({ archetype: "auto" }, true)} className={cn("col-span-2 rounded-2xl px-3 py-2 text-left text-sm", s.archetype === "auto" ? "bg-[var(--pc)] text-[var(--opc)]" : "bg-[var(--sch)]")}>
                      <b>Auto</b> <span className="text-xs opacity-75">— seeded pick ({archLabel})</span>
                    </button>
                    {ARCHETYPES.map((a, i) => (
                      <button
                        key={a.id}
                        type="button"
                        title={a.blurb}
                        onClick={() => set({ archetype: a.id }, true)}
                        className={cn("rounded-2xl px-3 py-2 text-left text-xs transition-all", s.archetype === a.id ? "bg-[var(--pc)] text-[var(--opc)]" : "bg-[var(--sch)] hover:bg-[var(--schh)]")}
                      >
                        <span className="font-mono opacity-60">{i + 1}</span> {a.label}
                      </button>
                    ))}
                  </div>
                </Section>
                <Section title="Composition">
                  <Slider label="Density" value={s.density} onChange={(v) => set({ density: v })} hint="How many supporting & accent shapes" />
                  <Slider label="Negative space" value={s.negativeSpace} onChange={(v) => set({ negativeSpace: v })} hint="Reserved breathing room; shrinks sizes & coverage target" />
                  <Slider label="Focal strength" value={s.focal} onChange={(v) => set({ focal: v })} hint="Scale of the dominant vs. the rest" />
                  <Slider label="Chaos ↔ Order" value={s.chaos} onChange={(v) => set({ chaos: v })} hint="Rotation jitter, shape variety, rhythm breaks" />
                  <Slider label="Tension" value={s.tension} onChange={(v) => set({ tension: v })} hint="Mix sharp + round families (M3: “embrace tension”)" />
                  <Slider label="Depth (2.5D)" value={s.depth} onChange={(v) => set({ depth: v })} hint="Offset tonal shadow layer" />
                  <Slider label="Search effort" value={s.attempts} min={1} max={80} step={1} format={(v) => `best of ${v}`} onChange={(v) => set({ attempts: v })} hint="Candidates generated, repaired & scored" />
                </Section>
                <Section title="Format">
                  <select value={s.format} onChange={(e) => { const f = e.target.value; set({ format: f, portrait: f === "phone" ? true : f === "watch" || f === "square" ? false : s.portrait, safeArea: f === "phone" ? true : s.safeArea }, true); }} className="w-full rounded-xl bg-[var(--sch)] px-3 py-2.5 text-sm outline-none">
                    {["Desktop", "Mobile", "Other"].map((g) => (
                      <optgroup key={g} label={g}>
                        {FORMATS.filter((f) => f.group === g).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <Segmented options={["landscape", "portrait"] as const} value={s.portrait ? "portrait" : "landscape"} onChange={(v) => set({ portrait: v === "portrait" }, true)} labels={{ landscape: "▭ Landscape", portrait: "▯ Portrait" }} />
                  <Toggle label="Clock / widget safe area" checked={s.safeArea} onChange={(v) => set({ safeArea: v }, true)} hint="Keep-out zone the composer protects (lock-screen clock or desktop widgets)" />
                </Section>
              </>
            )}

            {tab === "color" && (
              <>
                <Section title="Seed color">
                  <div className="flex items-center gap-3">
                    <label className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-2xl ring-2 ring-[var(--olv)]" style={{ background: s.seedHex }}>
                      <input type="color" value={s.seedHex} onChange={(e) => set({ seedHex: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                    </label>
                    <div className="flex-1">
                      <input value={s.seedHex} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && set({ seedHex: e.target.value })} className="w-full rounded-xl bg-[var(--sch)] px-3 py-2 font-mono text-sm uppercase outline-none" />
                      <button type="button" onClick={() => set({ seedHex: randomSeedHex(Math.random) }, true)} className="mt-1.5 text-xs text-[var(--p)]">⟳ Random hue</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["#6750A4", "#B3261E", "#386A20", "#006A6A", "#7D5260", "#E8710A", "#1A73E8", "#C2185B", "#5D4037", "#FBC02D"].map((c) => (
                      <button key={c} type="button" onClick={() => set({ seedHex: c }, true)} className="h-7 w-7 rounded-full ring-2 ring-transparent hover:ring-[var(--os)]" style={{ background: c }} title={c} />
                    ))}
                  </div>
                  <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-2xl border border-dashed border-[var(--ol)] px-3 py-3 text-sm hover:bg-[var(--sch)]">
                    🖼 Seed from image (Celebi quantizer + MCU score)
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        const seeds = await seedsFromImage(f);
                        setImgSeeds(seeds);
                        if (seeds[0]) set({ seedHex: seeds[0] }, true);
                        notify(`Extracted ${seeds.length} seed colors`);
                      } catch {
                        notify("Couldn't read that image");
                      }
                      e.target.value = "";
                    }}
                  />
                  {imgSeeds.length > 0 && (
                    <div className="flex gap-2">
                      {imgSeeds.map((c) => (
                        <button key={c} type="button" onClick={() => set({ seedHex: c }, true)} className={cn("h-9 flex-1 rounded-xl ring-2", s.seedHex.toLowerCase() === c.toLowerCase() ? "ring-[var(--os)]" : "ring-transparent")} style={{ background: c }} title={c} />
                      ))}
                    </div>
                  )}
                </Section>
                <Section title="Scheme">
                  <Segmented options={VARIANTS} value={s.variant} onChange={(v) => set({ variant: v }, true)} />
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-20 text-[var(--osv)]">Spec</span>
                    <Segmented options={["2021", "2025"] as const} value={s.spec} onChange={(v) => set({ spec: v }, true)} labels={{ "2021": "2021 · You", "2025": "2025 · Expressive" }} />
                  </div>
                  <Toggle label="Dark scheme" checked={s.dark} onChange={(v) => set({ dark: v }, true)} />
                  <Slider label="Scheme contrast" value={s.contrast} min={-1} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set({ contrast: v })} hint="MCU contrast level (−1 … 1)" />
                  <Slider label="Figure/ground punch" value={s.punch} onChange={(v) => set({ punch: v })} hint="Minimum HCT distinguishability between each shape and its real backdrop" />
                </Section>
              </>
            )}

            {tab === "shapes" && (
              <>
                <Section title="Shape families">
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(FAMILY_LABEL) as Family[]).map((f) => (
                      <Chip key={f} active={s.families.includes(f)} onClick={() => toggleFamily(f)}>
                        {FAMILY_LABEL[f]}
                      </Chip>
                    ))}
                  </div>
                  <Toggle label="Organic blobs" checked={s.blobs} onChange={(v) => set({ blobs: v }, true)} hint="Seeded harmonic blobs for dominant / support" />
                  <Toggle label="Designed overlap accents" checked={s.overlapAccents} onChange={(v) => set({ overlapAccents: v }, true)} hint="Intentional overlaps get a deliberate intersection color" />
                  <Toggle label="Outline accents" checked={s.outlines} onChange={(v) => set({ outlines: v }, true)} hint="Some accents become strokes" />
                </Section>
                <Section title={`Library · ${SHAPES.length} shapes`}>
                  <div className="grid grid-cols-6 gap-1.5">
                    {SHAPES.map((sh) => (
                      <div key={sh.id} title={`${sh.label} · ${FAMILY_LABEL[sh.family]}`} className={cn("rounded-xl bg-[var(--sch)] p-1.5", !s.families.includes(sh.family) && "opacity-30")}>
                        <svg viewBox="-1.1 -1.1 2.2 2.2" className="aspect-square w-full">
                          <path d={getShape(sh.id).d} fill={sh.sharp >= 0.45 ? "var(--t)" : "var(--p)"} />
                        </svg>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-[var(--osv)]"><span className="text-[var(--p)]">●</span> soft · <span className="text-[var(--t)]">●</span> sharp — tension mixes the two.</p>
                </Section>
              </>
            )}

            {tab === "background" && (
              <>
                <Section title="Backdrop">
                  <Segmented options={BG_STYLES} value={s.bgStyle} onChange={(v) => set({ bgStyle: v }, true)} />
                </Section>
                <Section title="Pattern">
                  <Segmented options={["auto", ...PATTERNS] as const} value={s.pattern} onChange={(v) => set({ pattern: v }, true)} />
                  <Slider label="Pattern scale" value={s.patternScale} onChange={(v) => set({ patternScale: v })} />
                  <Slider label="Pattern strength" value={s.patternStrength} onChange={(v) => set({ patternStrength: v })} />
                  <Toggle label="Coordinate with shapes" checked={s.autoCoordinate} onChange={(v) => set({ autoCoordinate: v }, true)} hint="Auto-dims the pattern as shape coverage rises, so busy-on-busy never happens" />
                  <p className="text-[11px] text-[var(--osv)]">Current: <b>{comp.bg.pattern}</b> on <b>{comp.bg.role}</b>{comp.bg.gradient ? " + radial glow" : ""}</p>
                </Section>
              </>
            )}

            {tab === "export" && (
              <>
                <Section title="Image">
                  <div className="flex items-center gap-2">
                    <Segmented options={["1", "2", "3"] as const} value={String(scale) as "1" | "2" | "3"} onChange={(v) => setScale(Number(v))} labels={{ "1": "1×", "2": "2×", "3": "3×" }} />
                    <span className="font-mono text-xs text-[var(--osv)]">{w * scale}×{h * scale}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={exportPNG} className="rounded-full bg-[var(--p)] py-2.5 text-sm font-semibold text-[var(--op)] active:scale-95">PNG</button>
                    <button type="button" onClick={() => svgRef.current && downloadSVG(svgRef.current, `kaleido-${s.seed}`)} className="rounded-full bg-[var(--sc2)] py-2.5 text-sm font-semibold text-[var(--osc2)] active:scale-95">SVG (vector)</button>
                  </div>
                </Section>
                <Section title="Live wallpaper (Dux Shell)">
                  <p className="text-[12px] text-[var(--osv)]">Role-based JSON layout: centre fractions, size as fraction of the short side — follows the system theme live.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => downloadJSON(comp, `kaleido-${s.seed}`)} className="rounded-full bg-[var(--sch)] py-2.5 text-sm active:scale-95">DMS JSON</button>
                    <button type="button" onClick={() => navigator.clipboard.writeText(dmsDeepLink(comp)).then(() => notify("dms:// link copied"))} className="rounded-full bg-[var(--sch)] py-2.5 text-sm active:scale-95">Copy dms:// link</button>
                  </div>
                </Section>
                <Section title="Share">
                  <button type="button" onClick={() => navigator.clipboard.writeText(location.href.split("#")[0] + "#s=" + encodeSettings(s)).then(() => notify("Share URL copied"))} className="w-full rounded-full bg-[var(--tc)] py-2.5 text-sm font-semibold text-[var(--otc)] active:scale-95">
                    Copy shareable URL
                  </button>
                  <p className="text-[11px] text-[var(--osv)]">The whole wallpaper is encoded in the URL (settings + seed → deterministic).</p>
                </Section>
              </>
            )}

            {tab === "saved" && (
              <Section title={`Favorites · ${favs.length}`} right={favs.length ? <button type="button" className="text-xs text-[var(--err)]" onClick={() => setFavs([])}>Clear</button> : undefined}>
                {favs.length === 0 && <p className="text-sm text-[var(--osv)]">Press <kbd className="rounded bg-[var(--sch)] px-1">F</kbd> or ♥ to save the current wallpaper.</p>}
                <div className="grid grid-cols-2 gap-2">
                  {favs.map((f) => (
                    <div key={f.id} className="relative">
                      <Thumb s={f.settings} onClick={() => set(f.settings, true)} />
                      <button type="button" onClick={() => setFavs((x) => x.filter((y) => y.id !== f.id))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-xs text-white" title="Remove">✕</button>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </aside>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[var(--schh)] px-4 py-3 text-sm text-[var(--os)] shadow-2xl">{toast}</div>
      )}
    </div>
  );
}
