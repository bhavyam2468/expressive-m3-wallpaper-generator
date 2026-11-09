import type { ScoreBreakdown } from "../lib/compose";

const ROWS: { k: keyof ScoreBreakdown; label: string; tip: string }[] = [
  { k: "hierarchy", label: "Hierarchy", tip: "Dominant clearly biggest (area ≥ 2× the next)" },
  { k: "balance", label: "Balance", tip: "Visual-weight centroid near target" },
  { k: "focal", label: "Focal", tip: "Dominant sits on a thirds / φ power point" },
  { k: "negativeSpace", label: "Neg. space", tip: "Coverage in range, keep-out zones respected" },
  { k: "spacing", label: "Spacing", tip: "No near-kisses or sliver overlaps" },
  { k: "contrast", label: "Contrast", tip: "Every shape legible against its real backdrop" },
  { k: "colorArea", label: "Color area", tip: "One color owns most of the shape area" },
  { k: "edges", label: "Edges", tip: "Contained with margin, or committed bleed ≥ 25%" },
];

export function ScorePanel({ score, compact }: { score: ScoreBreakdown; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      {ROWS.map((r) => {
        const v = score[r.k] as number;
        return (
          <div key={r.k} className="flex items-center gap-2" title={r.tip}>
            <span className="w-[78px] shrink-0 text-[11px] text-[var(--osv)]">{r.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--schh)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(4, v * 100)}%`, background: v > 0.75 ? "var(--p)" : v > 0.45 ? "var(--t)" : "var(--err)" }}
              />
            </div>
            <span className="w-7 text-right font-mono text-[10px] tabular-nums text-[var(--osv)]">{Math.round(v * 100)}</span>
          </div>
        );
      })}
      {score.clutter > 0 && <p className="text-[11px] text-[var(--err)]">Clutter penalty: competing focal points</p>}
    </div>
  );
}

export function ScoreBadge({ total, label }: { total: number; label?: string }) {
  const tone = total >= 85 ? "var(--p)" : total >= 65 ? "var(--t)" : "var(--err)";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
      <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
      {label && <span className="font-normal opacity-80">{label}</span>}
      {Math.round(total)}
    </span>
  );
}
