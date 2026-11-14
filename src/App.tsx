import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Home,
  ListChecks,
  ScanFace,
  TrendingUp,
  HeartPulse,
  Settings,
  Bell,
  WifiOff,
  Lock,
  ArrowLeft,
  Menu,
  X,
  Sparkles,
  BookOpen,
  MessageSquareText,
  Plus,
  User,
  Utensils,
} from 'lucide-react';
import {
  createDefaultProfile,
  createDefaultSettings,
  createDefaultXpState,
  db,
  ensureDatabaseReady,
  getOrCreateDailyLog,
} from './db/database';
import { toLocalDateKey } from './lib/date';
import { sha256Hex } from './lib/crypto';
import { initFaceLandmarker } from './lib/faceAnalysis';
import { getInAppDueReminders } from './lib/notifications';
import {
  getPedometerState,
  needsMotionPermission,
  startBrowserPedometer,
  stopBrowserPedometer,
  subscribePedometerStatus,
  type PedometerState,
} from './lib/pedometer';
import { getRankForLevel } from './data/badges';
import { useOnlineStatus } from './hooks/usePWAInstall';
import { ToastProvider, useToast } from './components/ui/ToastProvider';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { QuickLogSheet } from './components/modals/QuickLogSheet';
import { OnboardingModal } from './components/modals/OnboardingModal';
import { CoachDrawer } from './components/modals/CoachDrawer';
import { HomeScreen } from './screens/HomeScreen';
import { RoutineScreen } from './screens/RoutineScreen';
import { CareScreen } from './screens/CareScreen';
import { TrackersScreen } from './screens/TrackersScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { AcademyScreen } from './screens/AcademyScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { NutritionScreen } from './screens/NutritionScreen';

const PslLabScreen = lazy(() =>
  import('./screens/PslLabScreen').then((m) => ({ default: m.PslLabScreen }))
);

type ScreenId =
  | 'home'
  | 'routine'
  | 'psl'
  | 'nutrition'
  | 'progress'
  | 'care'
  | 'trackers'
  | 'academy'
  | 'settings';

const AppShell: React.FC = () => {
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenId>('home');
  const [subTab, setSubTab] = useState<string | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateKey());

  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogTab, setQuickLogTab] = useState<'water' | 'nutrition' | 'sleep' | 'body' | 'mood' | 'skin'>('water');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [pedometerState, setPedometerState] = useState<PedometerState>(() => getPedometerState());
  const mainRef = useRef<HTMLElement | null>(null);
  const stepsQueueRef = useRef(0);
  const flushTimerRef = useRef<number | null>(null);

  const hasModalOpen = quickLogOpen || onboardingOpen || coachOpen || remindersOpen || navDrawerOpen;
  useEffect(() => {
    if (hasModalOpen) {
      document.body.classList.add('ascend-scroll-lock');
    } else {
      document.body.classList.remove('ascend-scroll-lock');
    }
    return () => {
      document.body.classList.remove('ascend-scroll-lock');
    };
  }, [hasModalOpen]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [screen, subTab]);

  // PIN lock state
  const [unlocked, setUnlocked] = useState(false);
  const [pinAttempt, setPinAttempt] = useState('');

  const bootDb = async () => {
    setDbError(null);
    try {
      await Promise.race([
        ensureDatabaseReady(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Database startup timed out.')), 8000)),
      ]);
      setDbReady(true);
    } catch (err) {
      setDbError(err instanceof Error ? err.message : 'Failed to open local IndexedDB.');
    }
  };

  useEffect(() => {
    bootDb();
    const t = setTimeout(() => {
      initFaceLandmarker().catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const profile = useLiveQuery(() => (dbReady ? db.profile.get('me') : undefined), [dbReady]) ?? createDefaultProfile();
  const settings = useLiveQuery(() => (dbReady ? db.settings.get('app') : undefined), [dbReady]) ?? createDefaultSettings();
  const xpState = useLiveQuery(() => (dbReady ? db.xpState.get('xp') : undefined), [dbReady]) ?? createDefaultXpState();
  const tasks =
    useLiveQuery(
      () =>
        dbReady
          ? db.protocolTasks.toArray().then((arr) => arr.sort((a, b) => a.sortOrder - b.sortOrder))
          : [],
      [dbReady]
    ) ?? [];
  const completions = useLiveQuery(() => (dbReady ? db.taskCompletions.toArray() : []), [dbReady]) ?? [];
  const dailyLogs = useLiveQuery(() => (dbReady ? db.dailyLogs.toArray() : []), [dbReady]) ?? [];
  const bodyMetrics = useLiveQuery(() => (dbReady ? db.bodyMetrics.toArray() : []), [dbReady]) ?? [];
  const skinEntries =
    useLiveQuery(
      () =>
        dbReady
          ? db.skinEntries.toArray().then((arr) => arr.sort((a, b) => b.createdAt - a.createdAt))
          : [],
      [dbReady]
    ) ?? [];
  const products = useLiveQuery(() => (dbReady ? db.products.toArray() : []), [dbReady]) ?? [];
  const hairPrefs = useLiveQuery(() => (dbReady ? db.hairPreferences.toArray() : []), [dbReady]) ?? [];
  const wardrobe = useLiveQuery(() => (dbReady ? db.wardrobeItems.toArray() : []), [dbReady]) ?? [];
  const outfits = useLiveQuery(() => (dbReady ? db.outfits.toArray() : []), [dbReady]) ?? [];
  const workouts = useLiveQuery(() => (dbReady ? db.workouts.toArray() : []), [dbReady]) ?? [];
  const scans =
    useLiveQuery(
      () =>
        dbReady
          ? db.scans.toArray().then((arr) => arr.sort((a, b) => b.timestamp - a.timestamp))
          : [],
      [dbReady]
    ) ?? [];
  const mealScans =
    useLiveQuery(
      () =>
        dbReady
          ? db.mealScans.toArray().then((arr) => arr.sort((a, b) => b.timestamp - a.timestamp))
          : [],
      [dbReady]
    ) ?? [];

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-accent', settings.accent);
  }, [settings.theme, settings.accent]);

  useEffect(() => {
    if (dbReady && !profile.onboardingDone && !profile.onboardingSkipped) {
      setOnboardingOpen(true);
    }
  }, [dbReady, profile.onboardingDone, profile.onboardingSkipped]);

  const flushQueuedSteps = useCallback(async () => {
    const queued = stepsQueueRef.current;
    if (queued <= 0) return;
    stepsQueueRef.current = 0;
    const dateKey = toLocalDateKey();
    const log = await getOrCreateDailyLog(dateKey);
    await db.dailyLogs.update(dateKey, {
      steps: Math.max(0, (log.steps || 0) + queued),
      updatedAt: Date.now(),
    });
  }, []);

  const queueDetectedSteps = useCallback(
    (delta: number) => {
      stepsQueueRef.current += delta;
      if (flushTimerRef.current !== null) return;
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        flushQueuedSteps().catch(() => {});
      }, 650);
    },
    [flushQueuedSteps]
  );

  useEffect(() => {
    const unsub = subscribePedometerStatus((next) => setPedometerState(next));
    return () => {
      unsub();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushQueuedSteps().catch(() => {});
    };
  }, [flushQueuedSteps]);

  useEffect(() => {
    if (dbReady && settings.autoPedometer && !needsMotionPermission() && pedometerState.status === 'idle') {
      startBrowserPedometer(queueDetectedSteps).catch(() => {});
    }
  }, [dbReady, settings.autoPedometer, pedometerState.status, queueDetectedSteps]);

  const handleTogglePedometer = useCallback(async () => {
    if (pedometerState.status === 'active') {
      stopBrowserPedometer();
      await flushQueuedSteps();
      await db.settings.update('app', { autoPedometer: false });
      showToast('Motion step sensor paused');
      return;
    }
    const status = await startBrowserPedometer(queueDetectedSteps);
    if (status === 'active') {
      await db.settings.update('app', { autoPedometer: true });
      showToast('Live motion step sensor active');
    } else if (status === 'permission_denied') {
      await db.settings.update('app', { autoPedometer: false });
      showToast('Motion permission denied. Use quick step sync instead.', 'warning');
    } else if (status === 'unsupported') {
      await db.settings.update('app', { autoPedometer: false });
      showToast('DeviceMotion sensor unavailable on this browser. Use quick sync.', 'warning');
    }
  }, [pedometerState.status, flushQueuedSteps, queueDetectedSteps, showToast]);

  const handleAddSteps = useCallback(
    async (delta: number, dateKey: string) => {
      const log = await getOrCreateDailyLog(dateKey);
      const next = Math.max(0, (log.steps || 0) + delta);
      await db.dailyLogs.update(dateKey, {
        steps: next,
        updatedAt: Date.now(),
      });
      showToast(`+${delta.toLocaleString()} steps synced`);
    },
    [showToast]
  );

  const handleSetSteps = useCallback(
    async (exactSteps: number, dateKey: string) => {
      await getOrCreateDailyLog(dateKey);
      const clamped = Math.max(0, Math.min(150000, Math.round(exactSteps)));
      await db.dailyLogs.update(dateKey, {
        steps: clamped,
        updatedAt: Date.now(),
      });
      showToast(`Steps updated to ${clamped.toLocaleString()}`);
    },
    [showToast]
  );

  const handleUpdateStepTarget = useCallback(
    async (target: number) => {
      const clamped = Math.max(1000, Math.min(50000, Math.round(target)));
      await db.profile.update('me', {
        stepTarget: clamped,
        updatedAt: Date.now(),
      });
      showToast(`Daily step goal set to ${clamped.toLocaleString()}`);
    },
    [showToast]
  );

  const dueReminders = useMemo(
    () => getInAppDueReminders(settings, scans[0]?.date ?? null, toLocalDateKey()),
    [settings, scans]
  );

  const navigate = (nextScreen: string, nextSubTab?: string) => {
    setScreen(nextScreen as ScreenId);
    setSubTab(nextSubTab);
    setNavDrawerOpen(false);
    setQuickLogOpen(false);
    setCoachOpen(false);
    setRemindersOpen(false);
    document.body.classList.remove('ascend-scroll-lock');
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (dbError) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6">
        <div className="ascend-card max-w-sm w-full p-6 text-center space-y-3">
          <h1 className="font-display text-lg font-bold">Storage Initialization Error</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{dbError}</p>
          <button
            type="button"
            onClick={bootDb}
            className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[44px]"
          >
            Retry Startup
          </button>
        </div>
      </div>
    );
  }

  if (!dbReady) {
    return (
      <div className="min-h-[100dvh] max-w-5xl mx-auto px-4 py-8 space-y-4">
        <div className="h-10 w-44 rounded-2xl bg-slate-200 dark:bg-white/5 animate-pulse" />
        <div className="h-36 rounded-[28px] bg-slate-200 dark:bg-white/5 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-[28px] bg-slate-200 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (settings.pinHash && !unlocked) {
    const checkPin = async (e: React.FormEvent) => {
      e.preventDefault();
      const hashed = await sha256Hex(pinAttempt);
      if (hashed === settings.pinHash) {
        setUnlocked(true);
        setPinAttempt('');
      } else {
        showToast('Incorrect PIN', 'warning');
        setPinAttempt('');
      }
    };
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6">
        <form onSubmit={checkPin} className="ascend-card max-w-xs w-full p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <h1 className="font-display text-lg font-bold">ASCEND.OS Locked</h1>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="4-digit PIN"
            value={pinAttempt}
            onChange={(e) => setPinAttempt(e.target.value)}
            autoFocus
            className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-white/5 text-center font-mono-num text-lg tracking-widest"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  const isSubScreen = ['care', 'academy', 'settings'].includes(screen);

  return (
    <div className="h-[100dvh] min-h-[100dvh] flex flex-col">
      {/* Luxury Obsidian Top Bar: Left Circular Menu · Center Branded Title · Right Circular Alerts & Profile */}
      <header className="shrink-0 z-30 backdrop-blur-xl bg-[#F3F6F4]/85 dark:bg-[#040407]/85 border-b border-slate-200/70 dark:border-emerald-500/15 no-print">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 grid grid-cols-3 items-center">
          {/* Left Zone */}
          <div className="flex items-center gap-1.5 justify-start">
            <button
              type="button"
              onClick={() => setNavDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="w-10 h-10 rounded-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center hover:border-[var(--accent)]/40 transition"
            >
              <Menu className="w-4 h-4" />
            </button>
            {isSubScreen && (
              <button
                type="button"
                onClick={() => navigate('home')}
                aria-label="Back to Dashboard"
                className="w-9 h-9 rounded-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center hover:border-[var(--accent)]/40 transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Center Zone: Glowing Emerald Emblem + Wordmark */}
          <button
            type="button"
            onClick={() => navigate('home')}
            className="flex items-center justify-center gap-2 whitespace-nowrap shrink-0 mx-auto"
          >
            <span
              className="w-6 h-6 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/45 flex items-center justify-center shrink-0"
              style={{ boxShadow: '0 0 14px var(--accent-glow)' }}
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 3L4 19h4l4-8 4 8h4L12 3z" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display text-sm sm:text-base font-bold tracking-tight whitespace-nowrap">
              ASCEND.OS
            </span>
          </button>

          {/* Right Zone: Reminders & Profile/Settings */}
          <div className="flex items-center gap-1.5 justify-end">
            {!isOnline && (
              <span
                title="Offline Ready"
                className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-amber-500"
              >
                <WifiOff className="w-3.5 h-3.5" />
              </span>
            )}
            <button
              type="button"
              onClick={() => setRemindersOpen(true)}
              aria-label="View reminders"
              className="relative w-10 h-10 rounded-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center hover:border-[var(--accent)]/40 transition"
            >
              <Bell className="w-4 h-4" />
              {dueReminders.length > 0 && (
                <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('settings')}
              aria-label="Open Profile and Settings"
              className={`w-10 h-10 rounded-full border flex items-center justify-center transition ${
                screen === 'settings'
                  ? 'bg-[var(--accent-soft)] border-[var(--accent)]/45 text-[var(--accent)]'
                  : 'bg-white dark:bg-white/[0.06] border-slate-200 dark:border-white/10 hover:border-[var(--accent)]/40'
              }`}
            >
              <User className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Scrollable Main Content */}
      <main
        ref={mainRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] pb-28"
      >
        <div className="max-w-6xl w-full mx-auto px-3 sm:px-4 pt-4 min-w-0">
        <div key={screen} className="ascend-panel-enter">
        {screen === 'home' && (
          <ErrorBoundary screenName="Dashboard">
            <HomeScreen
              profile={profile}
              settings={settings}
              xpState={xpState}
              tasks={tasks}
              completions={completions}
              dailyLogs={dailyLogs}
              bodyMetrics={bodyMetrics}
              scans={scans}
              workouts={workouts}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onOpenQuickLog={(t) => {
                setQuickLogTab(t ?? 'water');
                setQuickLogOpen(true);
              }}
              onNavigate={navigate}
              onOpenCoach={() => setCoachOpen(true)}
              onOpenOnboarding={() => setOnboardingOpen(true)}
              pedometerState={pedometerState}
              onTogglePedometer={handleTogglePedometer}
              onAddSteps={(delta) => handleAddSteps(delta, selectedDate)}
              onSetSteps={(exact) => handleSetSteps(exact, selectedDate)}
              onUpdateStepTarget={handleUpdateStepTarget}
            />
          </ErrorBoundary>
        )}

        {screen === 'routine' && (
          <ErrorBoundary screenName="Routine">
            <RoutineScreen
              profile={profile}
              settings={settings}
              tasks={tasks}
              completions={completions}
              dailyLogs={dailyLogs}
              selectedDate={selectedDate}
              initialView={subTab}
            />
          </ErrorBoundary>
        )}

        {screen === 'psl' && (
          <ErrorBoundary screenName="PSL LAB">
            <Suspense
              fallback={
                <div className="ascend-card p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  Loading Face Scanner &amp; Report module...
                </div>
              }
            >
              <PslLabScreen scans={scans} settings={settings} onBack={() => navigate('home')} />
            </Suspense>
          </ErrorBoundary>
        )}

        {screen === 'progress' && (
          <ErrorBoundary screenName="Insights">
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
              initialSubTab={subTab}
              onOpenQuickLog={(t) => {
                setQuickLogTab(t ?? 'water');
                setQuickLogOpen(true);
              }}
              onOpenOnboarding={() => setOnboardingOpen(true)}
              onNavigate={navigate}
            />
          </ErrorBoundary>
        )}

        {screen === 'care' && (
          <ErrorBoundary screenName="Care Hub">
            <CareScreen
              profile={profile}
              products={products}
              skinEntries={skinEntries}
              hairPrefs={hairPrefs}
              wardrobe={wardrobe}
              outfits={outfits}
              scans={scans}
            />
          </ErrorBoundary>
        )}

        {screen === 'nutrition' && (
          <ErrorBoundary screenName="Nutrition Vision">
            <NutritionScreen
              profile={profile}
              dailyLogs={dailyLogs}
              mealScans={mealScans}
            />
          </ErrorBoundary>
        )}

        {screen === 'trackers' && (
          <ErrorBoundary screenName="Health">
            <TrackersScreen
              profile={profile}
              dailyLogs={dailyLogs}
              bodyMetrics={bodyMetrics}
              workouts={workouts}
              initialTab={subTab}
              onOpenNutrition={() => navigate('nutrition')}
            />
          </ErrorBoundary>
        )}

        {screen === 'academy' && (
          <ErrorBoundary screenName="Academy">
            <AcademyScreen />
          </ErrorBoundary>
        )}

        {screen === 'settings' && (
          <ErrorBoundary screenName="Settings">
            <SettingsScreen
              profile={profile}
              settings={settings}
              onOpenOnboarding={() => setOnboardingOpen(true)}
            />
          </ErrorBoundary>
        )}
        </div>

        <footer className="py-6 text-center text-[11px] text-slate-500 dark:text-slate-500">
          Self-tracking estimates, not medical advice. 100% local offline data.
        </footer>
        </div>
      </main>

      {/* Floating Glassmorphism Pill Bottom Dock + Floating Quick Log Orb */}
      <div className="fixed bottom-3 left-0 right-0 z-40 px-3 pointer-events-none no-print">
        <div className="max-w-lg mx-auto flex items-center justify-center gap-2.5">
          <nav
            aria-label="Primary navigation"
            className="pointer-events-auto flex-1 h-[68px] sm:h-[74px] rounded-full ascend-glass-dock grid grid-cols-5 items-center px-1 gap-0.5"
          >
            {([
              { id: 'progress', label: 'Insights', icon: <TrendingUp className="w-[17px] h-[17px]" /> },
              { id: 'home', label: 'Home', icon: <Home className="w-[17px] h-[17px]" /> },
              { id: 'nutrition', label: 'Fuel AI', icon: <Utensils className="w-[17px] h-[17px]" /> },
              { id: 'psl', label: 'Face AI', icon: <ScanFace className="w-[17px] h-[17px]" /> },
              { id: 'trackers', label: 'Health', icon: <HeartPulse className="w-[17px] h-[17px]" /> },
            ] as const).map((item) => {
              const active = screen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-full min-h-[52px] min-w-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 ${
                    active
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold scale-[1.02] border border-[var(--accent)]/25'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'
                  }`}
                >
                  {item.icon}
                  <span className="text-[9.5px] sm:text-[10px] mt-0.5 whitespace-nowrap leading-none tracking-tight">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => {
              setQuickLogTab('water');
              setQuickLogOpen(true);
            }}
            aria-label="Quick Log"
            className="pointer-events-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_12px_28px_-8px_rgba(0,0,0,0.65)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shrink-0 border border-white/15"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Hamburger Slide-Over Navigation Drawer */}
      {navDrawerOpen && (
        <div className="fixed inset-0 z-50 flex no-print">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setNavDrawerOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full bg-white dark:bg-[#080C0A]/95 dark:backdrop-blur-2xl border-r border-slate-200 dark:border-emerald-500/20 p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                  </span>
                  <span className="font-display text-base font-bold">ASCEND.OS</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNavDrawerOpen(false)}
                  aria-label="Close navigation menu"
                  className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0C1410]/80 border border-slate-200 dark:border-emerald-500/20 space-y-1">
                <p className="text-sm font-bold">{profile.name || 'Member'}</p>
                <p className="text-[11px] uppercase tracking-widest text-[var(--accent)] font-semibold">
                  Level {xpState.level} {getRankForLevel(xpState.level)} · {xpState.currentStreak}d Streak
                </p>
              </div>

              <div className="space-y-1">
                {[
                  { id: 'home', label: 'Dashboard', icon: <Home className="w-4 h-4" /> },
                  { id: 'nutrition', label: 'AI Nutrition & Calorie Vision', icon: <Utensils className="w-4 h-4" /> },
                  { id: 'routine', label: 'Daily Stack & Mind', icon: <ListChecks className="w-4 h-4" /> },
                  { id: 'psl', label: 'PSL LAB (3-Angle)', icon: <ScanFace className="w-4 h-4" /> },
                  { id: 'progress', label: 'Insights & Reports', icon: <TrendingUp className="w-4 h-4" /> },
                  { id: 'trackers', label: 'Health & Gym', icon: <HeartPulse className="w-4 h-4" /> },
                  { id: 'care', label: 'Care Hub (Skin/Hair/Style)', icon: <Sparkles className="w-4 h-4" /> },
                  { id: 'academy', label: 'Academy & Myths Wall', icon: <BookOpen className="w-4 h-4" /> },
                  { id: 'settings', label: 'Settings & Backup', icon: <Settings className="w-4 h-4" /> },
                ].map((navItem) => {
                  const active = screen === navItem.id;
                  return (
                    <button
                      key={navItem.id}
                      type="button"
                      onClick={() => navigate(navItem.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold min-h-[44px] transition ${
                        active
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30'
                          : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 border border-transparent'
                      }`}
                    >
                      {navItem.icon}
                      <span>{navItem.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setNavDrawerOpen(false);
                  setQuickLogTab('water');
                  setQuickLogOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
              >
                <Plus className="w-4 h-4" /> Quick Log Vitals
              </button>
              <button
                type="button"
                onClick={() => {
                  setNavDrawerOpen(false);
                  setCoachOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                <MessageSquareText className="w-4 h-4 text-[var(--accent)]" /> Open Local Coach
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Modals */}
      <QuickLogSheet
        open={quickLogOpen}
        initialTab={quickLogTab}
        dateKey={selectedDate}
        profile={profile}
        onClose={() => setQuickLogOpen(false)}
        onOpenSkinLab={() => navigate('care')}
      />

      {onboardingOpen && (
        <OnboardingModal profile={profile} onClose={() => setOnboardingOpen(false)} />
      )}

      <CoachDrawer
        open={coachOpen}
        context={{
          profile,
          tasks,
          completions,
          dailyLogs,
          skinEntries,
          scans,
          workouts,
        }}
        onClose={() => setCoachOpen(false)}
      />

      {remindersOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3 no-print">
          <div className="ascend-card max-w-md w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold">In-App Reminders</h2>
              <button
                type="button"
                onClick={() => setRemindersOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {dueReminders.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                No active reminders due right now. Adjust schedule in Settings.
              </p>
            ) : (
              <div className="space-y-2">
                {dueReminders.map((r) => (
                  <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] text-xs">
                    <div className="flex justify-between font-semibold">
                      <span>{r.title}</span>
                      <span className="font-mono-num text-[var(--accent)]">{r.time}</span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">{r.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <ErrorBoundary screenName="ASCEND.OS">
        <AppShell />
      </ErrorBoundary>
    </ToastProvider>
  );
}
