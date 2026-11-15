import React, { useState } from 'react';
import type { ExerciseDemoShape } from '../../data/exercisePrograms';

interface SvgExerciseDemoProps {
  title: string;
  slug?: string;
  shape: ExerciseDemoShape;
  isPlaying?: boolean;
  compact?: boolean;
}

/**
 * Tries `/exercises/{slug}.webp` first; if missing or offline,
 * cleanly renders an animated SVG form illustration as offline fallback.
 */
export const SvgExerciseDemo: React.FC<SvgExerciseDemoProps> = ({
  title,
  slug,
  shape,
  isPlaying = true,
  compact = false,
}) => {
  const [imgFailed, setImgFailed] = useState(!slug);

  if (slug && !imgFailed) {
    return (
      <div
        className={`rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.03] flex items-center justify-center ${
          compact ? 'max-h-36' : 'h-48 sm:h-56'
        }`}
      >
        <img
          src={`/exercises/${slug}.webp`}
          alt={`${title} form demo`}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-slate-200 dark:border-white/10 bg-gradient-to-br from-slate-100 to-slate-200/70 dark:from-[#0E1624] dark:to-[#131B2E] flex flex-col items-center justify-center relative overflow-hidden ${
        compact ? 'h-32 px-3' : 'h-48 sm:h-56 px-4'
      }`}
    >
      <svg
        viewBox="0 0 180 130"
        className={compact ? 'w-32 h-24' : 'w-44 h-36'}
        role="img"
        aria-label={`${title} animated form diagram`}
      >
        <defs>
          <radialGradient id="ascendGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="90" cy="65" r="56" fill="url(#ascendGlow)" />

        {(shape === 'tongue_posture' ||
          shape === 'jaw_release' ||
          shape === 'cheek_lift' ||
          shape === 'forehead_relax') && (
          <g>
            {/* Clean silhouette head */}
            <ellipse
              cx="90"
              cy="64"
              rx="34"
              ry="42"
              fill="none"
              stroke="currentColor"
              className="text-slate-700 dark:text-slate-200"
              strokeWidth="2.5"
            />
            {/* Eyes */}
            <circle cx="77" cy="54" r="2.5" fill="currentColor" className="text-slate-600 dark:text-slate-300" />
            <circle cx="103" cy="54" r="2.5" fill="currentColor" className="text-slate-600 dark:text-slate-300" />
            {/* Cue specific animated markers */}
            {shape === 'tongue_posture' && (
              <g className={isPlaying ? 'animate-pulse' : ''}>
                <path
                  d="M 78 82 Q 90 74 102 82"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  d="M 90 73 L 90 64 M 86 68 L 90 64 L 94 68"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}
            {shape === 'jaw_release' && (
              <g className={isPlaying ? 'animate-pulse' : ''}>
                <circle cx="62" cy="76" r="6" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeDasharray="3 2" />
                <circle cx="118" cy="76" r="6" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeDasharray="3 2" />
                <path
                  d="M 76 86 Q 90 92 104 86"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </g>
            )}
            {shape === 'cheek_lift' && (
              <g className={isPlaying ? 'animate-pulse' : ''}>
                <path d="M 70 67 L 70 59 M 67 62 L 70 59 L 73 62" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M 110 67 L 110 59 M 107 62 L 110 59 L 113 62" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M 76 81 Q 90 89 104 81" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
              </g>
            )}
            {shape === 'forehead_relax' && (
              <g className={isPlaying ? 'animate-pulse' : ''}>
                <path d="M 86 38 L 70 38 M 74 35 L 70 38 L 74 41" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M 94 38 L 110 38 M 106 35 L 110 38 L 106 41" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
              </g>
            )}
          </g>
        )}

        {shape === 'eye_gaze' && (
          <g>
            <path
              d="M 38 65 Q 90 30 142 65 Q 90 100 38 65 Z"
              fill="none"
              stroke="currentColor"
              className="text-slate-700 dark:text-slate-200"
              strokeWidth="2.5"
            />
            <circle
              cx="90"
              cy="65"
              r="14"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              className={isPlaying ? 'animate-pulse' : ''}
            />
            <circle cx="90" cy="65" r="5" fill="var(--accent)" />
            <path d="M 52 65 L 64 65 M 116 65 L 128 65" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {(shape === 'chin_tuck' || shape === 'neck_lift' || shape === 'wall_posture') && (
          <g>
            {shape === 'wall_posture' && (
              <line x1="56" y1="16" x2="56" y2="116" stroke="currentColor" className="text-slate-400" strokeWidth="2" strokeDasharray="4 3" />
            )}
            <circle
              cx="92"
              cy="40"
              r="20"
              fill="none"
              stroke="currentColor"
              className="text-slate-700 dark:text-slate-200"
              strokeWidth="2.5"
            />
            <path
              d="M 84 60 L 82 90 L 66 112 M 82 90 L 110 92 L 116 112"
              fill="none"
              stroke="currentColor"
              className="text-slate-700 dark:text-slate-200"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {shape === 'chin_tuck' && (
              <path
                d="M 118 46 L 100 46 M 105 42 L 100 46 L 105 50"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                className={isPlaying ? 'animate-pulse' : ''}
              />
            )}
            {shape === 'neck_lift' && (
              <path
                d="M 112 34 L 118 20 M 112 22 L 118 20 L 120 26"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                className={isPlaying ? 'animate-pulse' : ''}
              />
            )}
            {shape === 'wall_posture' && (
              <path
                d="M 60 40 L 68 40 M 60 72 L 72 72"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                className={isPlaying ? 'animate-pulse' : ''}
              />
            )}
          </g>
        )}

        {(shape === 'cobra_stretch' || shape === 'dead_hang' || shape === 'jump_play') && (
          <g>
            {shape === 'dead_hang' && (
              <>
                <line x1="40" y1="22" x2="140" y2="22" stroke="currentColor" className="text-slate-500" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M 74 22 L 78 52 L 102 52 L 106 22" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="90" cy="48" r="9" fill="none" stroke="currentColor" className="text-slate-700 dark:text-slate-200" strokeWidth="2.4" />
                <path d="M 90 58 L 90 108" stroke="currentColor" className="text-slate-700 dark:text-slate-200" strokeWidth="2.6" strokeLinecap="round" />
              </>
            )}
            {shape === 'cobra_stretch' && (
              <>
                <line x1="32" y1="106" x2="148" y2="106" stroke="currentColor" className="text-slate-400" strokeWidth="2" />
                <path
                  d="M 42 104 L 94 104 Q 114 98 118 68"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className={isPlaying ? 'animate-pulse' : ''}
                />
                <circle cx="122" cy="54" r="10" fill="none" stroke="currentColor" className="text-slate-700 dark:text-slate-200" strokeWidth="2.4" />
                <path d="M 114 78 L 114 104" stroke="currentColor" className="text-slate-700 dark:text-slate-200" strokeWidth="2.4" strokeLinecap="round" />
              </>
            )}
            {shape === 'jump_play' && (
              <>
                <circle cx="90" cy="34" r="10" fill="none" stroke="currentColor" className="text-slate-700 dark:text-slate-200" strokeWidth="2.4" />
                <path d="M 90 45 L 90 78 L 76 102 M 90 78 L 104 102 M 72 60 L 108 60" fill="none" stroke="currentColor" className="text-slate-700 dark:text-slate-200" strokeWidth="2.4" strokeLinecap="round" />
                <path d="M 52 94 Q 90 120 128 94" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeDasharray="4 3" className={isPlaying ? 'animate-pulse' : ''} />
              </>
            )}
          </g>
        )}
      </svg>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {isPlaying ? 'Guided visual · Follow slowly' : 'Paused'}
      </span>
    </div>
  );
};
