import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GripHorizontal } from 'lucide-react';
import { clamp, recomputeThirdsFromHairlineY } from '../../lib/faceMetrics';
import type { LandmarksOverlayGuides } from '../../types';

interface ThirdsCanvasOverlayProps {
  overlay: LandmarksOverlayGuides;
  onCommitHairline?: (nextOverlay: LandmarksOverlayGuides) => void;
}

function getThirdTextColor(pct: number): string {
  const diff = Math.abs(pct - 33.3);
  if (diff <= 3.0) return 'text-emerald-400';
  if (diff <= 6.0) return 'text-amber-300';
  return 'text-rose-300';
}

export const ThirdsCanvasOverlay: React.FC<ThirdsCanvasOverlayProps> = ({
  overlay,
  onCommitHairline,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const initialHairline = overlay.customHairlineY ?? overlay.faceTopY;
  const [hairlineY, setHairlineY] = useState<number>(initialHairline);
  const [adjustedByUser, setAdjustedByUser] = useState<boolean>(
    Boolean(overlay.hairlineAdjustedByUser)
  );
  const [dragging, setDragging] = useState(false);

  // Sync if user switches to a different scan
  useEffect(() => {
    setHairlineY(overlay.customHairlineY ?? overlay.faceTopY);
    setAdjustedByUser(Boolean(overlay.hairlineAdjustedByUser));
  }, [overlay.faceTopY, overlay.customHairlineY, overlay.hairlineAdjustedByUser]);

  const liveThirds = useMemo(
    () =>
      recomputeThirdsFromHairlineY(
        hairlineY,
        overlay.upperThirdY,
        overlay.midThirdY,
        overlay.lowerThirdY
      ),
    [hairlineY, overlay.upperThirdY, overlay.midThirdY, overlay.lowerThirdY]
  );

  const drawLines = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const w = rect.width;
    const h = rect.height;

    // Span horizontal lines cleanly across the face guide area
    const leftX = clamp((overlay.leftFaceX ?? 0.24) - 0.08, 0.06, 0.34) * w;
    const rightX = clamp((overlay.rightFaceX ?? 0.76) + 0.08, 0.66, 0.94) * w;

    const yHair = clamp(hairlineY, 0.02, overlay.upperThirdY - 0.03) * h;
    const yBrow = overlay.upperThirdY * h;
    const yNose = overlay.midThirdY * h;
    const yChin = overlay.lowerThirdY * h;
    const xMid = overlay.midlineX * w;

    // Align to half-pixel for crisp 1px lines
    const crisp = (v: number) => Math.round(v) + 0.5;

    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);

    // 4 horizontal lines ONLY (hairline, brow line, nose base, chin bottom)
    const horizontalYs = [yHair, yBrow, yNose, yChin];
    horizontalYs.forEach((y, idx) => {
      ctx.beginPath();
      ctx.strokeStyle =
        dragging && idx === 0
          ? 'rgba(255, 255, 255, 0.85)'
          : dragging
          ? 'rgba(255, 255, 255, 0.56)'
          : 'rgba(255, 255, 255, 0.45)';
      ctx.moveTo(leftX, crisp(y));
      ctx.lineTo(rightX, crisp(y));
      ctx.stroke();
    });

    // 1 thin vertical midline
    ctx.beginPath();
    ctx.strokeStyle = dragging
      ? 'rgba(255, 255, 255, 0.56)'
      : 'rgba(255, 255, 255, 0.45)';
    const topMidY = Math.max(4, yHair - 10);
    const botMidY = Math.min(h - 4, yChin + 10);
    ctx.moveTo(crisp(xMid), topMidY);
    ctx.lineTo(crisp(xMid), botMidY);
    ctx.stroke();

    ctx.restore();
  }, [
    dragging,
    hairlineY,
    overlay.leftFaceX,
    overlay.rightFaceX,
    overlay.upperThirdY,
    overlay.midThirdY,
    overlay.lowerThirdY,
    overlay.midlineX,
  ]);

  useEffect(() => {
    drawLines();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => drawLines());
    ro.observe(container);
    return () => ro.disconnect();
  }, [drawLines]);

  const computeYFromClientY = (clientY: number): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return hairlineY;
    const raw = (clientY - rect.top) / rect.height;
    return Number(clamp(raw, 0.02, overlay.upperThirdY - 0.03).toFixed(4));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setAdjustedByUser(true);
    setHairlineY(computeYFromClientY(e.clientY));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    e.preventDefault();
    setHairlineY(computeYFromClientY(e.clientY));
  };

  const finishDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
    const finalY = computeYFromClientY(e.clientY);
    setHairlineY(finalY);
    setAdjustedByUser(true);
    const computed = recomputeThirdsFromHairlineY(
      finalY,
      overlay.upperThirdY,
      overlay.midThirdY,
      overlay.lowerThirdY
    );
    onCommitHairline?.({
      ...overlay,
      faceTopY: finalY,
      customHairlineY: finalY,
      hairlineAdjustedByUser: true,
      upperPct: computed.upperPct,
      midPct: computed.midPct,
      lowerPct: computed.lowerPct,
    });
  };

  // Label X position at the left end of each third's middle segment
  const pillLeftPct = clamp((overlay.leftFaceX ?? 0.24) * 100 - 6, 2, 26);

  const segments = [
    {
      key: 'upper',
      pct: liveThirds.upperPct,
      midY: ((hairlineY + overlay.upperThirdY) / 2) * 100,
    },
    {
      key: 'mid',
      pct: liveThirds.midPct,
      midY: ((overlay.upperThirdY + overlay.midThirdY) / 2) * 100,
    },
    {
      key: 'lower',
      pct: liveThirds.lowerPct,
      midY: ((overlay.midThirdY + overlay.lowerThirdY) / 2) * 100,
    },
  ];

  const handleRightPct = clamp((overlay.rightFaceX ?? 0.76) * 100 + 4, 58, 94);
  const hairlineTopPct = clamp(hairlineY * 100, 3, overlay.upperThirdY * 100 - 3);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none select-none">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Three Compact Percentage Pills Directly On the Left End of Each Third */}
      {segments.map((seg) => (
        <div
          key={seg.key}
          style={{
            left: `${pillLeftPct}%`,
            top: `${clamp(seg.midY, 6, 94)}%`,
            transform: 'translateY(-50%)',
          }}
          className="absolute px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm border border-white/15 leading-tight shadow-sm"
        >
          <span
            className={`block font-mono-num text-[11px] font-bold ${getThirdTextColor(seg.pct)}`}
          >
            {seg.pct.toFixed(1)}%
          </span>
          <span className="block text-[8.5px] text-slate-300/80 font-mono-num leading-none">
            ideal 33%
          </span>
        </div>
      ))}

      {/* Draggable Hairline Handle (touch-none ONLY on this small handle) */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        aria-label="Drag hairline up or down to adjust upper third"
        style={{
          left: `${clamp(overlay.midlineX * 100, 32, 68)}%`,
          top: `${hairlineTopPct}%`,
          transform: 'translate(-50%, -50%)',
          maxWidth: `${Math.max(110, handleRightPct * 2)}px`,
        }}
        className={`pointer-events-auto touch-none absolute inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-semibold transition-colors cursor-ns-resize border ${
          dragging
            ? 'bg-white text-slate-950 border-white shadow-md'
            : 'bg-black/75 text-white/90 border-white/30 hover:border-white/70'
        }`}
      >
        <GripHorizontal className="w-3 h-3 shrink-0 opacity-85" />
        <span className="whitespace-nowrap">
          {adjustedByUser ? 'adjusted by you' : 'estimated'}
        </span>
      </button>
    </div>
  );
};
