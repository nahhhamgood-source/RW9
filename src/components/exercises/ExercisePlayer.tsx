import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { GuidedExerciseStep } from '../../data/exercisePrograms';
import { SvgExerciseDemo } from './SvgExerciseDemo';
import { ExerciseDemoLinks } from '../ui/ExerciseDemoLinks';
import { CircularRing } from '../ui/ProgressRings';

export interface ExercisePlayerProps {
  programId: string;
  programTitle: string;
  domain: 'face' | 'grow';
  level: 1 | 2;
  steps: GuidedExerciseStep[];
  dayNumber?: number;
  soundEnabled?: boolean;
  onComplete: (summary: {
    programId: string;
    programTitle: string;
    domain: 'face' | 'grow';
    level: 1 | 2;
    minutes: number;
    dayNumber?: number;
  }) => void | Promise<void>;
  onClose: () => void;
}

function playStepChime(enabled: boolean, isFinish = false): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(isFinish ? [20, 40, 20] : 12);
    }
    if (!enabled || typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinish ? 784 : 523.25, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(isFinish ? 1046.5 : 659.25, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
  } catch {
    // AudioContext might be blocked until user interaction
  }
}

export const ExercisePlayer: React.FC<ExercisePlayerProps> = ({
  programId,
  programTitle,
  domain,
  level,
  steps,
  dayNumber,
  soundEnabled = true,
  onComplete,
  onClose,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<'work' | 'rest' | 'done'>('work');
  const [secondsLeft, setSecondsLeft] = useState(() => steps[0]?.seconds ?? 30);
  const [isPlaying, setIsPlaying] = useState(true);
  const [muteChime, setMuteChime] = useState(!soundEnabled);
  const [savingFinish, setSavingFinish] = useState(false);

  const startedAtRef = useRef(Date.now());
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const currentStep = steps[stepIndex] ?? steps[0];
  const nextStep = steps[stepIndex + 1] ?? null;

  // Keep screen awake during active timer playback when supported
  useEffect(() => {
    let active = true;
    const manageWakeLock = async () => {
      try {
        const nav = navigator as unknown as {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
        };
        if (isPlaying && phase !== 'done' && nav.wakeLock?.request) {
          const sentinel = await nav.wakeLock.request('screen');
          if (active) wakeLockRef.current = sentinel;
          else await sentinel.release().catch(() => {});
        } else if (wakeLockRef.current) {
          await wakeLockRef.current.release().catch(() => {});
          wakeLockRef.current = null;
        }
      } catch {
        // WakeLock optional
      }
    };
    manageWakeLock();
    return () => {
      active = false;
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isPlaying, phase]);

  // Countdown tick
  useEffect(() => {
    if (!isPlaying || phase === 'done' || !currentStep) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;

        if (phase === 'work') {
          const restSec = currentStep.restSeconds ?? 10;
          if (stepIndex < steps.length - 1 && restSec > 0) {
            playStepChime(!muteChime, false);
            setPhase('rest');
            return restSec;
          }
          if (stepIndex < steps.length - 1) {
            playStepChime(!muteChime, false);
            const nextIdx = stepIndex + 1;
            setStepIndex(nextIdx);
            setPhase('work');
            return steps[nextIdx].seconds;
          }
          playStepChime(!muteChime, true);
          setPhase('done');
          setIsPlaying(false);
          return 0;
        }

        // Rest finished -> advance to next work step
        const nextIdx = stepIndex + 1;
        if (nextIdx < steps.length) {
          playStepChime(!muteChime, false);
          setStepIndex(nextIdx);
          setPhase('work');
          return steps[nextIdx].seconds;
        }
        playStepChime(!muteChime, true);
        setPhase('done');
        setIsPlaying(false);
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPlaying, phase, stepIndex, steps, currentStep, muteChime]);

  const totalDurationSec = useMemo(
    () => steps.reduce((sum, s, idx) => sum + s.seconds + (idx < steps.length - 1 ? s.restSeconds : 0), 0),
    [steps]
  );

  const stepTotalSec = phase === 'rest' ? currentStep?.restSeconds || 10 : currentStep?.seconds || 30;
  const pctRemaining = Math.max(0, Math.min(100, Math.round((secondsLeft / Math.max(1, stepTotalSec)) * 100)));

  const handleSkip = () => {
    if (phase === 'rest') {
      const nextIdx = stepIndex + 1;
      if (nextIdx < steps.length) {
        setStepIndex(nextIdx);
        setPhase('work');
        setSecondsLeft(steps[nextIdx].seconds);
      } else {
        setPhase('done');
        setIsPlaying(false);
      }
      return;
    }

    if (stepIndex < steps.length - 1) {
      const nextIdx = stepIndex + 1;
      setStepIndex(nextIdx);
      setPhase('work');
      setSecondsLeft(steps[nextIdx].seconds);
    } else {
      playStepChime(!muteChime, true);
      setPhase('done');
      setIsPlaying(false);
    }
  };

  const handleRestart = () => {
    setStepIndex(0);
    setPhase('work');
    setSecondsLeft(steps[0]?.seconds ?? 30);
    setIsPlaying(true);
    startedAtRef.current = Date.now();
  };

  const handleSaveFinish = async () => {
    if (savingFinish) return;
    setSavingFinish(true);
    try {
      const elapsedMin = Math.max(
        1,
        Math.round((Date.now() - startedAtRef.current) / 60000) || Math.ceil(totalDurationSec / 60)
      );
      await onComplete({
        programId,
        programTitle,
        domain,
        level,
        minutes: elapsedMin,
        dayNumber,
      });
      onClose();
    } finally {
      setSavingFinish(false);
    }
  };

  if (!currentStep) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${programTitle} guided player`}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden my-auto">
        {/* Top Bar */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
              {programTitle} · Level {level}
              {dayNumber ? ` · Day ${dayNumber}` : ''}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
              Step {Math.min(stepIndex + 1, steps.length)} of {steps.length} · ~{Math.max(1, Math.ceil(totalDurationSec / 60))} min total
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setMuteChime((v) => !v)}
              aria-label={muteChime ? 'Unmute step chime' : 'Mute step chime'}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-slate-300"
            >
              {muteChime ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close exercise player"
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step dots */}
        <div className="px-4 pt-3 flex gap-1.5">
          {steps.map((s, idx) => (
            <div
              key={s.id}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                phase === 'done' || idx < stepIndex
                  ? 'bg-emerald-500'
                  : idx === stepIndex
                  ? 'bg-[var(--accent)]'
                  : 'bg-slate-200 dark:bg-white/10'
              }`}
            />
          ))}
        </div>

        {phase === 'done' ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold">Session complete!</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Nice consistency finishing <strong>{programTitle}</strong>. Save this session to log your XP and progress dot.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleSaveFinish}
                disabled={savingFinish}
                className="flex-1 py-3 px-5 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[48px]"
              >
                {savingFinish ? 'Saving...' : 'Save & finish (+20 XP)'}
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-white/5 text-sm font-semibold min-h-[48px] inline-flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> Repeat
              </button>
            </div>
          </div>
        ) : phase === 'rest' ? (
          <div className="p-6 text-center space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">
              Rest &amp; Breathe
            </p>
            <div className="flex justify-center">
              <CircularRing value={pctRemaining} size={104} strokeWidth={8} color="#10b981">
                <span className="font-mono-num text-2xl font-bold">{secondsLeft}s</span>
              </CircularRing>
            </div>
            {nextStep && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-left space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Next up
                </p>
                <p className="text-sm font-bold">{nextStep.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{nextStep.repsLabel}</p>
              </div>
            )}
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setIsPlaying((v) => !v)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-white/5 text-sm font-semibold min-h-[48px] inline-flex items-center justify-center gap-1.5"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="flex-1 py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[48px] inline-flex items-center justify-center gap-1.5"
              >
                Start next now <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Visual */}
            <SvgExerciseDemo
              key={currentStep.id}
              title={currentStep.title}
              slug={currentStep.slug}
              shape={currentStep.demoShape}
              isPlaying={isPlaying}
            />

            {/* Title + Timer Ring */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <h2 className="font-display text-lg font-bold leading-snug">
                  {currentStep.title}
                </h2>
                <p className="text-xs font-semibold text-[var(--accent)]">
                  {currentStep.repsLabel}
                </p>
              </div>
              <div className="shrink-0">
                <CircularRing value={pctRemaining} size={74} strokeWidth={6} color="var(--accent)">
                  <span className="font-mono-num text-lg font-bold">{secondsLeft}s</span>
                </CircularRing>
              </div>
            </div>

            {/* Form steps */}
            <ul className="space-y-1.5 p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-200">
              {currentStep.cues.map((cue, idx) => (
                <li key={idx} className="leading-relaxed">
                  {idx + 1}. {cue}
                </li>
              ))}
            </ul>

            {/* Safety callout */}
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>{currentStep.safetyRule}</span>
            </div>

            {/* Watch links */}
            <ExerciseDemoLinks
              title={currentStep.title}
              searchQuery={currentStep.watchQuery}
              compact
            />

            {/* Controls */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsPlaying((v) => !v)}
                className="flex-1 py-3 px-4 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[48px] inline-flex items-center justify-center gap-2"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={() => setSecondsLeft((s) => Math.min(180, s + 10))}
                className="py-3 px-3.5 rounded-2xl bg-slate-100 dark:bg-white/5 text-xs font-bold min-h-[48px] font-mono-num"
              >
                +10s
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="py-3 px-3.5 rounded-2xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[48px] inline-flex items-center gap-1"
              >
                Skip <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
