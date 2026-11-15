import React, { Suspense, lazy, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Flame,
  Info,
  Lock,
  Play,
  ShieldAlert,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, isUnder18OrGrowing, recalculateXpAndBadges } from '../../db/database';
import {
  FACE_EXERCISE_HONEST_NOTE,
  FACE_EXERCISE_PROGRAMS,
  type GuidedExerciseProgram,
} from '../../data/exercisePrograms';
import { addDays, toLocalDateKey } from '../../lib/date';
import { SvgExerciseDemo } from './SvgExerciseDemo';
import { ExerciseDemoLinks } from '../ui/ExerciseDemoLinks';
import { useToast } from '../ui/ToastProvider';
import type { AppSettings, UserProfile } from '../../types';

const LazyExercisePlayer = lazy(() =>
  import('./ExercisePlayer').then((m) => ({ default: m.ExercisePlayer }))
);

interface FaceExercisesPanelProps {
  profile: UserProfile;
  settings: AppSettings;
}

export const FaceExercisesPanel: React.FC<FaceExercisesPanelProps> = ({
  profile,
  settings,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();
  const isMinor = isUnder18OrGrowing(profile);

  const exerciseLogs = useLiveQuery(() => db.exerciseLogs.toArray(), [], []);
  const faceLogs = useMemo(
    () => exerciseLogs.filter((l) => l.domain === 'face'),
    [exerciseLogs]
  );

  const [expandedProgId, setExpandedProgId] = useState<string | null>('jawline_neck');
  const [selectedLevels, setSelectedLevels] = useState<Record<string, 1 | 2>>({});
  const [activePlayer, setActivePlayer] = useState<{
    program: GuidedExerciseProgram;
    level: 1 | 2;
  } | null>(null);

  const last7DateKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(todayKey, -(6 - i))),
    [todayKey]
  );

  const todayCount = useMemo(
    () => faceLogs.filter((l) => l.date === todayKey).length,
    [faceLogs, todayKey]
  );

  const handlePlayerComplete = async (summary: {
    programId: string;
    programTitle: string;
    domain: 'face' | 'grow';
    level: 1 | 2;
    minutes: number;
  }) => {
    await db.exerciseLogs.add({
      date: todayKey,
      programId: summary.programId,
      programTitle: summary.programTitle,
      domain: 'face',
      level: summary.level,
      minutes: summary.minutes,
      xpEarned: 20,
      completedAt: Date.now(),
    });
    await recalculateXpAndBadges();
    showToast(`Saved "${summary.programTitle}" (+20 XP)`);
  };

  return (
    <div className="space-y-4">
      {/* Honest Expectations Banner */}
      <section className="ascend-card p-4 border-l-4 border-l-[var(--accent)] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-[var(--accent)]" /> Face &amp; Posture Exercises
          </h2>
          <span className="px-2.5 py-1 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold font-mono-num">
            {todayCount} done today
          </span>
        </div>
        <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            <strong className="text-emerald-600 dark:text-emerald-400">What it can do:</strong>{' '}
            {FACE_EXERCISE_HONEST_NOTE.canDo}
          </p>
          <p>
            <strong className="text-amber-600 dark:text-amber-300">What it cannot do:</strong>{' '}
            {FACE_EXERCISE_HONEST_NOTE.cannotDo}
          </p>
        </div>
        {isMinor && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5 pt-1">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            Under-18 protection active: bodyweight &amp; gentle posture only — zero neck weights or hard chewing.
          </p>
        )}
      </section>

      {/* Program Cards */}
      <div className="space-y-3">
        {FACE_EXERCISE_PROGRAMS.map((prog) => {
          const isOpen = expandedProgId === prog.id;
          const progLogs = faceLogs.filter((l) => l.programId === prog.id);
          const uniqueDaysCompleted = new Set(progLogs.map((l) => l.date)).size;
          const level2Unlocked = uniqueDaysCompleted >= 7;
          const chosenLevel: 1 | 2 = selectedLevels[prog.id] ?? 1;
          const activeSteps = chosenLevel === 2 ? prog.level2 : prog.level1;
          const totalSecs = activeSteps.reduce(
            (sum, s, i) => sum + s.seconds + (i < activeSteps.length - 1 ? s.restSeconds : 0),
            0
          );

          return (
            <section key={prog.id} className="ascend-card p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-bold">{prog.title}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        prog.evidence === 'Proven'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                          : 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
                      }`}
                    >
                      {prog.evidence}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{prog.subtitle}</p>
                </div>

                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-mono-num font-bold shrink-0">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  {uniqueDaysCompleted}d logged
                </span>
              </div>

              {/* 7-Day Recent Consistency Dots */}
              <div className="grid grid-cols-7 gap-1.5">
                {last7DateKeys.map((dk, idx) => {
                  const doneDay = progLogs.some((l) => l.date === dk);
                  const dObj = new Date(`${dk}T12:00:00`);
                  const dayChar = dObj.toLocaleDateString('en-US', { weekday: 'narrow' });
                  return (
                    <div
                      key={dk}
                      title={`${dk}${doneDay ? ' — Completed' : ''}`}
                      className={`h-9 rounded-xl border flex flex-col items-center justify-center text-[10px] font-mono-num font-bold ${
                        doneDay
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : idx === 6
                          ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-500'
                      }`}
                    >
                      <span>{doneDay ? <Check className="w-3.5 h-3.5" /> : dayChar}</span>
                    </div>
                  );
                })}
              </div>

              {/* Safety + Controls Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setSelectedLevels((prev) => ({ ...prev, [prog.id]: 1 }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[36px] ${
                      chosenLevel === 1
                        ? 'bg-white dark:bg-[var(--accent)] text-slate-900 dark:text-[var(--accent-contrast)] shadow-sm'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Level 1
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!level2Unlocked) {
                        showToast('Level 2 opens after 7 logged days — previewing safely', 'info');
                      }
                      setSelectedLevels((prev) => ({ ...prev, [prog.id]: 2 }));
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[36px] ${
                      chosenLevel === 2
                        ? 'bg-white dark:bg-[var(--accent)] text-slate-900 dark:text-[var(--accent-contrast)] shadow-sm'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {!level2Unlocked && <Lock className="w-3 h-3" />}
                    Level 2
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedProgId(isOpen ? null : prog.id)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
                  >
                    {isOpen ? 'Hide steps' : `${activeSteps.length} moves`}
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePlayer({ program: prog, level: chosenLevel })}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
                  >
                    <Play className="w-3.5 h-3.5" /> Start (~{Math.max(1, Math.ceil(totalSecs / 60))}m)
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
                  <p className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                    <Info className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                    <span>
                      <strong>Why:</strong> {prog.whatItCanDo} · <strong>Safety:</strong> {prog.safetySummary}
                    </span>
                  </p>

                  <div className="space-y-2.5">
                    {activeSteps.map((step, sIdx) => (
                      <div
                        key={step.id}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold">
                            {sIdx + 1}. {step.title}
                          </p>
                          <span className="text-xs font-mono-num font-semibold text-[var(--accent)]">
                            {step.repsLabel} · {step.seconds}s
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                          <div className="sm:col-span-5">
                            <SvgExerciseDemo
                              title={step.title}
                              slug={step.slug}
                              shape={step.demoShape}
                              compact
                            />
                          </div>
                          <div className="sm:col-span-7 space-y-2 text-xs">
                            <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                              {step.cues.map((c, ci) => (
                                <li key={ci}>• {c}</li>
                              ))}
                            </ul>
                            <p className="text-[11px] text-amber-600 dark:text-amber-300 font-medium">
                              Safety: {step.safetyRule}
                            </p>
                            <ExerciseDemoLinks
                              title={step.title}
                              searchQuery={step.watchQuery}
                              compact
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Shared Lazy Exercise Player Modal */}
      {activePlayer && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center text-white text-sm font-semibold">
              Loading guided player...
            </div>
          }
        >
          <LazyExercisePlayer
            programId={activePlayer.program.id}
            programTitle={activePlayer.program.title}
            domain="face"
            level={activePlayer.level}
            steps={
              activePlayer.level === 2
                ? activePlayer.program.level2
                : activePlayer.program.level1
            }
            soundEnabled={settings.soundEnabled ?? false}
            onComplete={handlePlayerComplete}
            onClose={() => setActivePlayer(null)}
          />
        </Suspense>
      )}
    </div>
  );
};
