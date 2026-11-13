import React from 'react';

interface CircularRingProps {
  value: number; // 0..100
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  glow?: boolean;
  children?: React.ReactNode;
}

export const CircularRing: React.FC<CircularRingProps> = ({
  value,
  size = 96,
  strokeWidth = 8,
  color = 'var(--accent)',
  trackColor,
  glow = true,
  children,
}) => {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor ?? 'currentColor'}
          strokeWidth={strokeWidth}
          className={trackColor ? '' : 'text-slate-200 dark:text-white/[0.08]'}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 450ms cubic-bezier(0.16, 1, 0.3, 1)',
            filter: glow && clamped > 0 ? 'drop-shadow(0 0 6px var(--accent-glow))' : undefined,
          }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
};

interface ConcentricRingsProps {
  rings: [
    { label: string; value: number; color?: string },
    { label: string; value: number; color?: string },
    { label: string; value: number; color?: string },
  ];
  size?: number;
}

export const ConcentricRings: React.FC<ConcentricRingsProps> = ({ rings, size = 164 }) => {
  const strokeWidth = 12;
  const gap = 5;
  const radii = [
    (size - strokeWidth) / 2,
    (size - strokeWidth) / 2 - (strokeWidth + gap),
    (size - strokeWidth) / 2 - (strokeWidth + gap) * 2,
  ];
  const colors = [
    rings[0].color ?? '#A7F3D0',
    rings[1].color ?? '#F6D56F',
    rings[2].color ?? '#C084FC',
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 overflow-visible">
          {radii.map((r, i) => {
            const circ = 2 * Math.PI * r;
            const pct = Math.max(0, Math.min(100, rings[i].value));
            const offset = circ - (pct / 100) * circ;
            const angleRad = (pct / 100) * Math.PI * 2;
            const capX = size / 2 + Math.cos(angleRad) * r;
            const capY = size / 2 + Math.sin(angleRad) * r;
            return (
              <g key={rings[i].label}>
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={strokeWidth}
                  className="text-slate-200 dark:text-white/[0.07]"
                />
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={colors[i]}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  style={{
                    transition: 'stroke-dashoffset 500ms cubic-bezier(0.16, 1, 0.3, 1)',
                    filter: pct > 0 && i === 0 ? 'drop-shadow(0 0 6px var(--accent-glow))' : undefined,
                  }}
                />
                {pct > 3 && (
                  <circle
                    cx={capX}
                    cy={capY}
                    r={strokeWidth * 0.24}
                    fill="#040407"
                    opacity={0.75}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-3 w-full mt-4 text-center">
        {rings.map((ring, idx) => (
          <div key={ring.label}>
            <div className="font-mono-num text-xl font-bold" style={{ color: colors[idx] }}>
              {Math.round(ring.value)}%
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors[idx] }} />
              <span className="truncate">{ring.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
