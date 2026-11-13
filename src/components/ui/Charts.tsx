import React, { useId, useState } from 'react';
import { BedDouble, Sunrise } from 'lucide-react';
import { addDays, formatShortDay, toLocalDateKey } from '../../lib/date';
import type { SleepStageBreakdown } from '../../lib/fitness';

interface BarPoint {
  date: string;
  score: number; // 0..100
}

export const DailyScoreBarChart: React.FC<{ data: BarPoint[] }> = ({ data }) => {
  const today = toLocalDateKey();
  const yesterday = addDays(today, -1);

  return (
    <div className="flex items-end justify-between gap-2 h-36 pt-5">
      {data.map((d) => {
        const heightPct = Math.max(6, Math.min(100, d.score));
        const barColor =
          d.score >= 75
            ? 'bg-emerald-500 dark:bg-[#34D399] shadow-[0_0_10px_rgba(16,185,129,0.20)]'
            : d.score >= 40
            ? 'bg-amber-500 dark:bg-[#F6D56F]'
            : d.score > 0
            ? 'bg-rose-500 dark:bg-rose-400'
            : 'bg-slate-200 dark:bg-white/10';

        const label =
          d.date === today ? 'Today' : d.date === yesterday ? 'Yday' : formatShortDay(d.date).slice(0, 3);

        return (
          <div key={d.date} className="flex-1 flex flex-col items-center h-full justify-end min-w-0">
            <span className="font-mono-num text-[11px] text-slate-600 dark:text-slate-300 mb-1">
              {d.score > 0 ? `${Math.round(d.score)}` : '0'}
            </span>
            <div className="w-full max-w-[30px] flex-1 flex items-end">
              <div
                className={`w-full rounded-t-lg transition-all duration-300 ${barColor}`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 whitespace-nowrap">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

interface LinePoint {
  label: string;
  value: number;
}

export const SmoothAreaChart: React.FC<{
  points: LinePoint[];
  unit?: string;
  color?: string;
  minVal?: number;
  maxVal?: number;
  compact?: boolean;
  emptyLabel?: string;
}> = ({
  points,
  unit = '',
  color = 'var(--accent)',
  minVal,
  maxVal,
  compact = false,
  emptyLabel = 'Log at least 2 entries to view trend.',
}) => {
  const gradId = useId();

  if (points.length === 0) {
    return (
      <div
        className={`${
          compact ? 'h-20' : 'h-32'
        } flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 text-center px-2`}
      >
        {emptyLabel}
      </div>
    );
  }

  if (points.length === 1) {
    return (
      <div className={`${compact ? 'h-20' : 'h-32'} flex flex-col items-center justify-center text-center`}>
        <span className="font-mono-num text-xl font-bold" style={{ color }}>
          {points[0].value}
          {unit}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Baseline ({points[0].label}) · Add 1 more entry to chart trend
        </span>
      </div>
    );
  }

  const W = 320;
  const H = compact ? 84 : 120;
  const padX = 12;
  const padY = 14;
  const vals = points.map((p) => p.value);
  const lo = minVal ?? Math.min(...vals) * 0.96;
  const hi = maxVal ?? Math.max(...vals) * 1.04;
  const span = Math.max(0.001, hi - lo);

  const coords = points.map((p, idx) => {
    const x = padX + (idx / (points.length - 1)) * (W - padX * 2);
    const y = H - padY - ((p.value - lo) / span) * (H - padY * 2);
    return { x, y, ...p };
  });

  let linePath = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const mx = ((p0.x + p1.x) / 2).toFixed(1);
    linePath += ` C ${mx} ${p0.y.toFixed(1)}, ${mx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${H - padY} L ${coords[0].x.toFixed(1)} ${H - padY} Z`;
  const last = coords[coords.length - 1];

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${compact ? 'h-20' : 'h-32'} overflow-visible`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.34" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 0 6px var(--accent-glow))' }}
        />
        {coords.map((c, idx) => (
          <circle
            key={`${c.label}-${idx}`}
            cx={c.x}
            cy={c.y}
            r={idx === coords.length - 1 ? 4.5 : 2.5}
            fill={idx === coords.length - 1 ? color : '#080C08'}
            stroke={color}
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-0.5 -mt-0.5">
        <span>{coords[0].label}</span>
        <span className="font-mono-num font-semibold text-slate-900 dark:text-white">
          {last.value}
          {unit}
        </span>
        <span>{last.label}</span>
      </div>
    </div>
  );
};

/* Reference-inspired Segmented Move Goal Progress Bar */
export const MoveGoalBar: React.FC<{ valuePct: number }> = ({ valuePct }) => {
  const pct = Math.max(0, Math.min(100, valuePct));
  return (
    <div className="relative h-9 w-full rounded-xl overflow-hidden bg-white dark:bg-white/95 border border-slate-200 dark:border-white/15 shadow-inner">
      <div
        className="h-full transition-all duration-500 relative overflow-hidden"
        style={{
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #10B981 0%, #3B82F6 55%, #6366F1 100%)',
          boxShadow: pct > 0 ? '0 0 18px rgba(16, 185, 129, 0.35)' : undefined,
        }}
      >
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.45) 0px, rgba(0,0,0,0.45) 1.5px, transparent 1.5px, transparent 5px)',
          }}
        />
      </div>
      {pct > 0 && pct < 98 && (
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]"
          style={{ left: `calc(${pct}% - 2px)` }}
        />
      )}
    </div>
  );
};

/* Reference-inspired Semi-Circular Sleep Dial Gauge + Bedtime/Wake */
export const SleepDialGauge: React.FC<{
  breakdown: SleepStageBreakdown | null;
  bedtime?: string;
  wakeTime?: string;
}> = ({ breakdown, bedtime, wakeTime }) => {
  const deepHrs = breakdown ? (breakdown.deepMin / 60).toFixed(1) : '0';
  const progressRatio = breakdown
    ? Math.min(1, (breakdown.deepMin + breakdown.remMin + breakdown.lightMin) / 480)
    : 0;
  const arcLen = 220;
  const arcDash = Math.max(8, arcLen * progressRatio);

  const ticks = ['20', '22', '00', '02', '04', '06', '08'];

  return (
    <div className="grid grid-cols-12 gap-3 items-center">
      <div className="col-span-8 relative flex flex-col items-center justify-center pt-1">
        <svg viewBox="0 0 200 120" className="w-full max-w-[230px] overflow-visible">
          <defs>
            <linearGradient id="sleepArcGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#047857" />
              <stop offset="55%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#34D399" />
            </linearGradient>
          </defs>
          {/* Outer Dial Track */}
          <path
            d="M 24 104 A 76 76 0 0 1 176 104"
            fill="none"
            stroke="currentColor"
            strokeWidth="16"
            strokeLinecap="round"
            className="text-slate-200 dark:text-white/[0.08]"
          />
          {/* Inner Ticks */}
          <path
            d="M 42 104 A 58 58 0 0 1 158 104"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2 7"
            className="text-slate-300 dark:text-white/15"
          />
          {/* Active Glowing Emerald Sleep Arc */}
          {breakdown && (
            <path
              d="M 24 104 A 76 76 0 0 1 176 104"
              fill="none"
              stroke="url(#sleepArcGrad)"
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${arcDash} ${arcLen + 40}`}
              style={{ filter: 'drop-shadow(0 0 10px rgba(0, 255, 136, 0.35))' }}
            />
          )}
          {/* Subtle Hour Labels */}
          {ticks.map((lbl, idx) => {
            const angle = Math.PI - (idx / (ticks.length - 1)) * Math.PI;
            const x = 100 + Math.cos(angle) * 62;
            const y = 104 - Math.sin(angle) * 62;
            return (
              <text
                key={lbl}
                x={x}
                y={y}
                textAnchor="middle"
                className="fill-slate-400 dark:fill-slate-500 text-[7px] font-mono-num"
              >
                {lbl}
              </text>
            );
          })}
        </svg>

        <div className="-mt-12 text-center">
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Sleep Duration</p>
          <p className="font-mono-num text-2xl font-bold tracking-tight">
            {breakdown ? breakdown.totalLabel : '—'}
          </p>
          <p className="text-[11px] font-medium text-[var(--accent)]">
            {breakdown ? `${deepHrs}h Deep Sleep` : 'Log sleep to analyze'}
          </p>
        </div>
      </div>

      {/* Stacked Bedtime / Wakeup Mini Cards */}
      <div className="col-span-4 space-y-2">
        <div className="p-2.5 rounded-2xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-center">
          <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <BedDouble className="w-3 h-3 text-[var(--accent)]" />
            <span>Bedtime</span>
          </div>
          <div className="font-mono-num text-xs font-bold mt-0.5">
            {bedtime || '23:00'}
          </div>
        </div>
        <div className="p-2.5 rounded-2xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-center">
          <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <Sunrise className="w-3 h-3 text-amber-400" />
            <span>Wake up</span>
          </div>
          <div className="font-mono-num text-xs font-bold mt-0.5">
            {wakeTime || '06:30'}
          </div>
        </div>
      </div>
    </div>
  );
};

/* Reference Image 2 Stepped Hypnogram Sleep Stages SVG */
export const SleepStageChart: React.FC<{ breakdown: SleepStageBreakdown }> = ({ breakdown }) => {
  const stages = [
    { label: 'Awake', pct: breakdown.awakePct, color: '#A7F3D0' },
    { label: 'Light', pct: breakdown.lightPct, color: '#F6D56F' },
    { label: 'Deep', pct: breakdown.deepPct, color: '#C084FC' },
  ];

  // Stepped waveform points across time axis (y: 12=Awake, 36=Light, 58=Deep)
  const segments = [
    { x1: 10, x2: 46, y: 14, color: '#A7F3D0' },
    { x1: 46, x2: 105, y: 36, color: '#F6D56F' },
    { x1: 105, x2: 145, y: 58, color: '#C084FC' },
    { x1: 145, x2: 158, y: 14, color: '#A7F3D0' },
    { x1: 158, x2: 196, y: 58, color: '#C084FC' },
    { x1: 196, x2: 242, y: 36, color: '#F6D56F' },
    { x1: 242, x2: 295, y: 14, color: '#A7F3D0' },
  ];

  return (
    <div className="space-y-2.5 pt-2 border-t border-slate-200/70 dark:border-white/10">
      <div className="grid grid-cols-3 gap-2 text-center">
        {stages.map((s) => (
          <div key={s.label} className="min-w-0">
            <div className="font-mono-num text-sm font-bold">{s.pct}%</div>
            <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      <svg viewBox="0 0 305 74" className="w-full h-16 overflow-visible">
        {[35, 95, 155, 215, 275].map((gx) => (
          <line
            key={gx}
            x1={gx}
            y1={6}
            x2={gx}
            y2={64}
            stroke="currentColor"
            strokeDasharray="2 3"
            className="text-slate-300 dark:text-white/10"
          />
        ))}
        {segments.map((seg, i) => {
          const prev = segments[i - 1];
          return (
            <g key={i}>
              {prev && (
                <line
                  x1={seg.x1}
                  y1={prev.y}
                  x2={seg.x1}
                  y2={seg.y}
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth="1.2"
                />
              )}
              <line
                x1={seg.x1}
                y1={seg.y}
                x2={seg.x2}
                y2={seg.y}
                stroke={seg.color}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/* Reference Image 2 28-Day Tactile Dot Matrix Card */
export const DotMatrixProgress: React.FC<{
  days: Array<{ date: string; pct: number }>;
}> = ({ days }) => {
  const completedCount = days.filter((d) => d.pct >= 60).length;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono-num text-2xl font-bold">
          {completedCount}
          <span className="text-sm font-normal text-slate-500 dark:text-slate-400">/{days.length}d</span>
        </span>
        <span className="text-[11px] font-semibold text-[var(--accent)]">28-Day Matrix</span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const strong = d.pct >= 80;
          const partial = d.pct > 0 && d.pct < 80;
          return (
            <div
              key={d.date}
              title={`${d.date}: ${d.pct}%`}
              className={`aspect-square rounded-full transition-all ${
                strong
                  ? 'bg-slate-900 dark:bg-white shadow-[0_0_10px_rgba(255,255,255,0.45)]'
                  : partial
                  ? 'bg-[var(--accent)]/65'
                  : 'bg-slate-200 dark:bg-white/10'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};

export const BeforeAfterSlider: React.FC<{
  beforeSrc: string;
  afterSrc: string;
  beforeLabel: string;
  afterLabel: string;
}> = ({ beforeSrc, afterSrc, beforeLabel, afterLabel }) => {
  const [pos, setPos] = useState(50);

  return (
    <div className="space-y-2">
      <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900 select-none">
        <img
          src={afterSrc}
          alt={afterLabel}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        >
          <img
            src={beforeSrc}
            alt={beforeLabel}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </div>
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow"
          style={{ left: `${pos}%` }}
        >
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white text-slate-900 shadow-lg flex items-center justify-center text-xs font-bold">
            ↔
          </div>
        </div>
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/65 text-white text-[11px] font-medium">
          {beforeLabel}
        </div>
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/65 text-white text-[11px] font-medium">
          {afterLabel}
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare before and after photo"
        className="w-full accent-[var(--accent)] h-2 cursor-pointer"
      />
    </div>
  );
};
