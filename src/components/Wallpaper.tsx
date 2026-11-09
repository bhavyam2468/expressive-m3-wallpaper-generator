import { forwardRef, useId, useMemo, type ReactNode } from "react";
import type { Composition, Layer } from "../lib/compose";
import { getShape } from "../lib/shapes";
import { makeRng, hashSeed } from "../lib/rng";

type Props = {
  comp: Composition;
  depth: number;
  autoCoordinate: boolean;
  className?: string;
  style?: React.CSSProperties;
};

const tf = (l: Layer, dx = 0, dy = 0) => `translate(${(l.cx + dx).toFixed(2)} ${(l.cy + dy).toFixed(2)}) rotate(${l.rot.toFixed(2)}) scale(${(l.size / 2).toFixed(3)})`;

function Pattern({ comp, uid, opacity }: { comp: Composition; uid: string; opacity: number }) {
  const { w, h, bg } = comp;
  const u = (Math.min(w, h) / 1080) * bg.patternScale;
  const col = bg.patternHex;
  const r = makeRng(hashSeed(comp.seed, "pattern"));
  const sw = Math.max(1, 2.2 * u);
  let body: ReactNode = null;
  switch (bg.pattern) {
    case "dots": {
      const s = 34 * u;
      body = (
        <>
          <defs>
            <pattern id={`${uid}p`} width={s} height={s} patternUnits="userSpaceOnUse">
              <circle cx={s / 2} cy={s / 2} r={3.2 * u} fill={col} />
            </pattern>
          </defs>
          <rect width={w} height={h} fill={`url(#${uid}p)`} />
        </>
      );
      break;
    }
    case "plus": {
      const s = 48 * u, a = 7 * u;
      body = (
        <>
          <defs>
            <pattern id={`${uid}p`} width={s} height={s} patternUnits="userSpaceOnUse">
              <path d={`M${s / 2 - a} ${s / 2}H${s / 2 + a}M${s / 2} ${s / 2 - a}V${s / 2 + a}`} stroke={col} strokeWidth={sw} strokeLinecap="round" />
            </pattern>
          </defs>
          <rect width={w} height={h} fill={`url(#${uid}p)`} />
        </>
      );
      break;
    }
    case "waves": {
      const tw = 90 * u, th = 30 * u;
      body = (
        <>
          <defs>
            <pattern id={`${uid}p`} width={tw} height={th} patternUnits="userSpaceOnUse">
              <path d={`M0 ${th / 2} Q ${tw / 4} 0 ${tw / 2} ${th / 2} T ${tw} ${th / 2}`} fill="none" stroke={col} strokeWidth={sw} />
            </pattern>
          </defs>
          <rect width={w} height={h} fill={`url(#${uid}p)`} />
        </>
      );
      break;
    }
    case "seigaiha": {
      const R = 56 * u;
      const rows: ReactNode[] = [];
      let ri = 0;
      for (let y = -R; y < h + R; y += R / 2, ri++) {
        for (let x = ri % 2 ? R : 0; x < w + R * 2; x += R * 2) {
          rows.push(
            <g key={`${x}-${y}`}>
              <path d={`M${x - R} ${y}A${R} ${R} 0 0 1 ${x + R} ${y}Z`} fill={bg.hex} />
              {[1, 0.72, 0.44].map((k) => (
                <path key={k} d={`M${x - R * k} ${y}A${R * k} ${R * k} 0 0 1 ${x + R * k} ${y}`} fill="none" stroke={col} strokeWidth={sw} />
              ))}
            </g>
          );
        }
      }
      body = <g>{rows}</g>;
      break;
    }
    case "topographic": {
      const centers = Array.from({ length: 3 }, () => [r.range(0, w), r.range(0, h), r.range(0, 9)] as const);
      const paths: string[] = [];
      for (const [cx, cy, ph] of centers) {
        for (let k = 1; k < 26; k++) {
          const rad = k * 34 * u;
          let d = "";
          for (let i = 0; i <= 72; i++) {
            const a = (i / 72) * Math.PI * 2;
            const rr = rad * (1 + 0.12 * Math.sin(a * 3 + ph + k * 0.2) + 0.06 * Math.sin(a * 5 - ph));
            d += `${i ? "L" : "M"}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
          }
          paths.push(d + "Z");
        }
      }
      body = <path d={paths.join("")} fill="none" stroke={col} strokeWidth={sw * 0.8} />;
      break;
    }
    case "wavylines": {
      const gap = 30 * u, amp = 7 * u, len = 120 * u;
      let d = "";
      for (let y = 0; y < h + gap; y += gap) {
        d += `M0 ${y}`;
        for (let x = 0; x < w + len; x += len) d += `Q${x + len / 4} ${y - amp} ${x + len / 2} ${y}T${x + len} ${y}`;
      }
      body = <path d={d} fill="none" stroke={col} strokeWidth={sw} />;
      break;
    }
    case "halftone": {
      const s = 26 * u;
      const fx = r.range(0, w), fy = r.range(0, h);
      const maxD = Math.hypot(w, h);
      const dots: ReactNode[] = [];
      for (let y = s / 2; y < h; y += s)
        for (let x = s / 2; x < w; x += s) {
          const k = 1 - Math.hypot(x - fx, y - fy) / maxD;
          const rad = s * 0.42 * k * k;
          if (rad > 0.6 * u) dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={rad} />);
        }
      body = <g fill={col}>{dots}</g>;
      break;
    }
    case "rings": {
      const cx = r.pick([0, w, w / 3, (2 * w) / 3]), cy = r.pick([0, h, h / 2]);
      const n = Math.ceil(Math.hypot(w, h) / (36 * u));
      body = (
        <g fill="none" stroke={col} strokeWidth={sw}>
          {Array.from({ length: n }, (_, i) => <circle key={i} cx={cx} cy={cy} r={(i + 1) * 36 * u} />)}
        </g>
      );
      break;
    }
    case "truchet": {
      const s = 54 * u;
      let d = "";
      for (let y = 0; y < h; y += s)
        for (let x = 0; x < w; x += s) {
          if (r.chance(0.5)) d += `M${x + s / 2} ${y}A${s / 2} ${s / 2} 0 0 1 ${x} ${y + s / 2}M${x + s} ${y + s / 2}A${s / 2} ${s / 2} 0 0 0 ${x + s / 2} ${y + s}`;
          else d += `M${x + s / 2} ${y}A${s / 2} ${s / 2} 0 0 0 ${x + s} ${y + s / 2}M${x} ${y + s / 2}A${s / 2} ${s / 2} 0 0 1 ${x + s / 2} ${y + s}`;
        }
      body = <path d={d} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />;
      break;
    }
    case "flow": {
      const f1 = r.range(0.6, 1.6) / (300 * u), f2 = r.range(0.6, 1.6) / (300 * u), p1 = r.range(0, 9), p2 = r.range(0, 9);
      const field = (x: number, y: number) => Math.sin(x * f1 + p1) * 1.4 + Math.cos(y * f2 + p2) * 1.4 + Math.sin((x + y) * f1 * 0.5);
      let d = "";
      const n = Math.round((w * h) / (90 * u) ** 2);
      for (let i = 0; i < n; i++) {
        let x = r.range(0, w), y = r.range(0, h);
        d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
        for (let k = 0; k < 28; k++) {
          const a = field(x, y);
          x += Math.cos(a) * 9 * u;
          y += Math.sin(a) * 9 * u;
          d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      }
      body = <path d={d} fill="none" stroke={col} strokeWidth={sw * 0.8} strokeLinecap="round" />;
      break;
    }
    case "grain": {
      body = (
        <>
          <defs>
            <filter id={`${uid}g`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency={0.9 / Math.max(0.5, u)} numOctaves={2} seed={comp.seed % 1000} />
              <feColorMatrix type="saturate" values="0" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.55" />
              </feComponentTransfer>
            </filter>
          </defs>
          <rect width={w} height={h} filter={`url(#${uid}g)`} style={{ mixBlendMode: "overlay" }} />
        </>
      );
      break;
    }
    default:
      return null;
  }
  return <g opacity={opacity}>{body}</g>;
}

export const Wallpaper = forwardRef<SVGSVGElement, Props>(function Wallpaper({ comp, depth, autoCoordinate, className, style }, ref) {
  const rid = useId().replace(/:/g, "");
  const { w, h, layers, bg } = comp;
  const S = Math.min(w, h);
  const off = depth * S * 0.028;
  const patternOpacity = autoCoordinate ? bg.patternOpacity * Math.max(0.3, Math.min(1, 1.15 - comp.score.coverage * 1.4)) : bg.patternOpacity;

  const shapes = useMemo(
    () =>
      layers.map((l, i) => {
        const g = getShape(l.shape);
        const strokeW = (S * 0.012) / (l.size / 2);
        return (
          <g key={i}>
            {off > 0 && !l.outline && <path d={g.d} transform={tf(l, off, off)} fill={l.shadow ?? "#0003"} />}
            {l.outline ? (
              <path d={g.d} transform={tf(l)} fill="none" stroke={l.fill} strokeWidth={strokeW} strokeLinejoin="round" />
            ) : (
              <path d={g.d} transform={tf(l)} fill={l.fill} />
            )}
            {l.overlapFill &&
              l.overlapWith.map((j) => (
                <g key={j} clipPath={`url(#${rid}c${j})`}>
                  <path d={g.d} transform={tf(l)} fill={l.overlapFill} />
                </g>
              ))}
          </g>
        );
      }),
    [layers, off, S, rid]
  );

  const clipIds = new Set(layers.flatMap((l) => (l.overlapFill ? l.overlapWith : [])));

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} style={style} preserveAspectRatio="xMidYMid meet">
      <defs>
        {bg.gradient && (
          <radialGradient id={`${rid}bg`} cx={bg.gradient.cx} cy={bg.gradient.cy} r="0.9">
            <stop offset="0" stopColor={bg.gradient.hex} />
            <stop offset="1" stopColor={bg.hex} />
          </radialGradient>
        )}
        {[...clipIds].map((j) => (
          <clipPath id={`${rid}c${j}`} key={j}>
            <path d={getShape(layers[j].shape).d} transform={tf(layers[j])} />
          </clipPath>
        ))}
      </defs>
      <rect width={w} height={h} fill={bg.gradient ? `url(#${rid}bg)` : bg.hex} />
      <Pattern comp={comp} uid={rid} opacity={patternOpacity} />
      {shapes}
    </svg>
  );
});

/** Non-exported overlay: thirds grid, focal points, weighted centroid, keep-out zones, clock mock. */
export function Guides({ comp, showGrid, showClock }: { comp: Composition; showGrid: boolean; showClock: boolean }) {
  const { w, h, keepOut, score, balanceTarget } = comp;
  const S = Math.min(w, h);
  const sw = S * 0.003;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full pointer-events-none" preserveAspectRatio="xMidYMid meet">
      {showGrid && (
        <g stroke="#fff" strokeOpacity={0.55} strokeWidth={sw} style={{ mixBlendMode: "difference" }}>
          {[1 / 3, 2 / 3].map((f) => (
            <g key={f}>
              <line x1={w * f} x2={w * f} y1={0} y2={h} strokeDasharray={`${sw * 6} ${sw * 6}`} />
              <line y1={h * f} y2={h * f} x1={0} x2={w} strokeDasharray={`${sw * 6} ${sw * 6}`} />
            </g>
          ))}
          <circle cx={balanceTarget[0]} cy={balanceTarget[1]} r={S * 0.012} fill="none" />
          <line x1={balanceTarget[0]} y1={balanceTarget[1]} x2={score.centroid[0]} y2={score.centroid[1]} strokeOpacity={0.9} />
          <circle cx={score.centroid[0]} cy={score.centroid[1]} r={S * 0.008} fill="#fff" />
        </g>
      )}
      {showGrid &&
        keepOut.map((k, i) => (
          <rect key={i} x={k.x} y={k.y} width={k.w} height={k.h} fill="#ff2d55" fillOpacity={0.08} stroke="#ff2d55" strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 4}`} rx={S * 0.02} />
        ))}
      {showClock &&
        keepOut.map((k, i) => (
          <g key={i} fill={comp.palette.isDark || comp.bg.role === "amoled" || comp.bg.role.startsWith("on") ? "#ffffffdd" : "#1c1b1fdd"} fontFamily="system-ui, sans-serif" textAnchor="middle">
            <text x={k.x + k.w / 2} y={k.y + k.h * 0.7} fontSize={k.h * 0.62} fontWeight={300}>
              12:45
            </text>
            <text x={k.x + k.w / 2} y={k.y + k.h * 0.95} fontSize={k.h * 0.12}>
              Tuesday, May 13
            </text>
          </g>
        ))}
    </svg>
  );
}
