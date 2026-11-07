'use client';
import { useState, type MouseEvent } from 'react';
import { compactMoney } from '@/lib/format';

export interface ChartSeries { name: string; color: string; values: number[] }

const W = 560, H = 270, PAD_T = 36, PAD_B = 14;

/** Smooth path through the points (Catmull-Rom converted to cubic Béziers). */
function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2, t = 0.17;
    const clampY = (y: number) => Math.min(H - PAD_B, Math.max(PAD_T - 20, y));
    d += ` C ${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)} ${clampY(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)}, ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)} ${clampY(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Dependency-free SVG chart: smooth lines, soft area under the first series, a floating value tag on hover. */
export function ActivityChart({ series, labels, currency }: { series: ChartSeries[]; labels: string[]; currency: string }) {
  const n = labels.length;
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => (n <= 1 ? W / 2 : 14 + (i * (W - 28)) / (n - 1));
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
  const points = (s: ChartSeries) => s.values.map((v, i) => [x(i), y(v)] as [number, number]);
  const active = hover ?? n - 1;
  const lead = series[0];
  const [ax, ay] = [x(active), y(lead.values[active] ?? 0)];

  const move = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W; // mouse position in SVG units
    setHover(Math.max(0, Math.min(n - 1, Math.round(((vx - 14) / (W - 28)) * (n - 1)))));
  };

  return (
    <div>
      <div className="chart-wrap" onMouseMove={move} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cumulative value by outcome: ${series.map((s) => `${s.name} ${compactMoney(s.values[n - 1] ?? 0, currency)}`).join(', ')}`}>
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lead.color} stopOpacity="0.38" /><stop offset="100%" stopColor={lead.color} stopOpacity="0" /></linearGradient>
          </defs>
          {Array.from({ length: n }, (_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={10} y2={H - PAD_B} stroke={i === active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'} strokeDasharray="3 5" />)}
          <path d={`${smooth(points(lead))} L ${x(n - 1)} ${H - PAD_B} L ${x(0)} ${H - PAD_B} Z`} fill="url(#area)" />
          {[...series].reverse().map((s) => <path key={s.name} d={smooth(points(s))} fill="none" stroke={s.color} strokeWidth="2.6" strokeLinecap="round" style={{ filter: `drop-shadow(0 4px 10px ${s.color}66)` }} />)}
          {series.map((s) => <circle key={s.name} cx={x(active)} cy={y(s.values[active] ?? 0)} r="4" fill="#0b0c14" stroke={s.color} strokeWidth="2.5" />)}
        </svg>
        <div className="chart-tip" style={{ left: `${(ax / W) * 100}%`, top: `${(ay / H) * 100}%` }}>{compactMoney(lead.values[active] ?? 0, currency)}</div>
      </div>
      <div className="chart-x"><span>{labels[0]}</span><span>{labels[Math.floor((n - 1) / 2)]}</span><span>{labels[n - 1]}</span></div>
    </div>
  );
}
