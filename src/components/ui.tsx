import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-[28px] bg-[var(--sc)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--osv)]">{title}</h3>
        {right}
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

export function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, hint, format }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string; format?: (v: number) => string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block" title={hint}>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-[var(--os)]">{label}</span>
        <span className="font-mono text-xs tabular-nums text-[var(--osv)]">{format ? format(value) : Math.round(((value - min) / (max - min)) * 100)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="m3-slider w-full"
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
      />
      {hint && <p className="mt-1 text-[11px] leading-snug text-[var(--osv)] opacity-80">{hint}</p>}
    </label>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 text-left" title={hint}>
      <span>
        <span className="block text-sm text-[var(--os)]">{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-[var(--osv)] opacity-80">{hint}</span>}
      </span>
      <span className={cn("relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors", checked ? "border-[var(--p)] bg-[var(--p)]" : "border-[var(--ol)] bg-[var(--sch)]")}>
        <span
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-full transition-all duration-300 [transition-timing-function:cubic-bezier(.34,1.56,.64,1)]",
            checked ? "left-[22px] h-6 w-6 bg-[var(--op)]" : "left-[6px] h-4 w-4 bg-[var(--ol)]"
          )}
        />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
            value === o ? "bg-[var(--sc2)] text-[var(--osc2)] rounded-[10px]" : "bg-[var(--sch)] text-[var(--os)] hover:bg-[var(--schh)]"
          )}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-transparent bg-[var(--sc2)] text-[var(--osc2)]" : "border-[var(--olv)] text-[var(--os)] hover:bg-[var(--sch)]"
      )}
    >
      {active && <span>✓</span>}
      {children}
    </button>
  );
}

export function IconButton({ onClick, title, children, disabled, active }: { onClick: () => void; title: string; children: ReactNode; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cn(
        "grid h-10 w-10 place-items-center rounded-full text-lg transition-all disabled:opacity-35 active:scale-90",
        active ? "bg-[var(--sc2)] text-[var(--osc2)]" : "text-[var(--os)] hover:bg-[var(--sch)]"
      )}
    >
      {children}
    </button>
  );
}
