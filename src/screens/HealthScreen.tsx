import React, { useEffect, useState } from 'react';
import { Utensils, HeartPulse, TrendingUp, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { NutritionScreen } from './NutritionScreen';
import { TrackersScreen } from './TrackersScreen';
import { ProgressScreen } from './ProgressScreen';
import { QuitHabitsPanel } from '../components/health/QuitHabitsPanel';
import { en } from '../i18n/en';
import type {
  ActiveProtocolTask,
  AppSettings,
  BodyMetricEntry,
  DailyLog,
  FaceScanResult,
  MealScanEntry,
  QuitHabitItem,
  QuitSlipEntry,
  TaskCompletion,
  UserProfile,
  WorkoutSession,
  XpState,
} from '../types';

interface HealthScreenProps {
  profile: UserProfile;
  settings: AppSettings;
  xpState: XpState;
  tasks: ActiveProtocolTask[];
  completions: TaskCompletion[];
  dailyLogs: DailyLog[];
  bodyMetrics: BodyMetricEntry[];
  scans: FaceScanResult[];
  workouts: WorkoutSession[];
  mealScans: MealScanEntry[];
  quitItems: QuitHabitItem[];
  quitSlips: QuitSlipEntry[];
  initialTab?: string;
  onOpenQuickLog: (tab?: 'water' | 'nutrition' | 'sleep' | 'body' | 'mood' | 'photo' | 'height') => void;
  onOpenOnboarding: () => void;
  onNavigate: (screen: string, subTab?: string) => void;
}

export const HealthScreen: React.FC<HealthScreenProps> = ({
  profile,
  settings,
  xpState,
  tasks,
  completions,
  dailyLogs,
  bodyMetrics,
  scans,
  workouts,
  mealScans,
  quitItems,
  quitSlips,
  initialTab,
  onOpenQuickLog,
  onOpenOnboarding,
  onNavigate,
}) => {
  const resolveTab = (t?: string): 'meals' | 'body' | 'trends' | 'quit' => {
    if (t === 'body' || t === 'sleep' || t === 'workouts' || t === 'trackers') return 'body';
    if (t === 'trends' || t === 'progress') return 'trends';
    if (t === 'quit') return 'quit';
    return 'meals';
  };

  const [tab, setTab] = useState<'meals' | 'body' | 'trends' | 'quit'>(() => resolveTab(initialTab));

  useEffect(() => {
    if (initialTab) setTab(resolveTab(initialTab));
  }, [initialTab]);

  const trackerSubTab =
    initialTab === 'sleep' || initialTab === 'workouts' ? initialTab : undefined;

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Health sections"
        className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-slate-200/80 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10"
      >
        {([
          { id: 'meals', label: en.healthHub.meals, icon: <Utensils className="w-4 h-4 shrink-0" /> },
          { id: 'body', label: en.healthHub.bodySleep, icon: <HeartPulse className="w-4 h-4 shrink-0" /> },
          { id: 'trends', label: en.healthHub.trends, icon: <TrendingUp className="w-4 h-4 shrink-0" /> },
          { id: 'quit', label: en.healthHub.quit, icon: <ShieldCheck className="w-4 h-4 shrink-0" /> },
        ] as const).map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-semibold min-h-[44px] transition ${
                active
                  ? 'bg-white dark:bg-[var(--accent)] text-slate-900 dark:text-[var(--accent-contrast)] shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'meals' && (
        <NutritionScreen
          profile={profile}
          settings={settings}
          dailyLogs={dailyLogs}
          mealScans={mealScans}
        />
      )}

      {tab === 'body' && (
        <TrackersScreen
          profile={profile}
          dailyLogs={dailyLogs}
          bodyMetrics={bodyMetrics}
          workouts={workouts}
          initialTab={trackerSubTab}
          onOpenNutrition={() => setTab('meals')}
        />
      )}

      {tab === 'trends' && (
        <div className="space-y-4">
          {settings.easyMode === false && (
            <div className="ascend-card p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">Pro Full Telemetry Dashboard</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Open detailed sleep dial, 28-day matrix, and step motion monitor.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px] shrink-0"
              >
                <LayoutDashboard className="w-4 h-4" /> Open
              </button>
            </div>
          )}
          <ProgressScreen
            profile={profile}
            xpState={xpState}
            tasks={tasks}
            completions={completions}
            dailyLogs={dailyLogs}
            bodyMetrics={bodyMetrics}
            scans={scans}
            workouts={workouts}
            slangTierNames={settings.slangTierNames ?? true}
            lastWeeklyReviewDate={settings.lastWeeklyReviewDate}
            onMarkWeeklyReviewed={async () => {
              const { db } = await import('../db/database');
              const { toLocalDateKey } = await import('../lib/date');
              await db.settings.update('app', { lastWeeklyReviewDate: toLocalDateKey() });
            }}
            onOpenQuickLog={(t) => onOpenQuickLog(t === 'skin' ? 'photo' : t)}
            onOpenOnboarding={onOpenOnboarding}
            onNavigate={onNavigate}
          />
        </div>
      )}

      {tab === 'quit' && (
        <QuitHabitsPanel
          profile={profile}
          quitItems={quitItems}
          quitSlips={quitSlips}
        />
      )}
    </div>
  );
};
