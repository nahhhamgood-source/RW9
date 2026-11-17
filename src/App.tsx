import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  CalendarCheck2,
  Grid,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Lock,
  Menu,
  MessageSquareText,
  Plus,
  Ruler,
  ScanFace,
  Settings,
  Sparkles,
  Utensils,
  WifiOff,
  X,
} from 'lucide-react';
import {
  createDefaultProfile,
  createDefaultSettings,
  createDefaultXpState,
  db,
  ensureDatabaseReady,
  ensureMorningAutoPlan,
  getOrCreateDailyLog,
  requestPersistentStorageAndCheck,
} from './db/database';
import type { AppSettings, MealType, UserProfile } from './types';
import { en } from './i18n/en';
import { setDayStartHour4am, toLocalDateKey } from './lib/date';
import { sha256Hex } from './lib/crypto';
import { installGlobalErrorListeners } from './lib/errorLog';
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
import { ScreenSkeleton } from './components/ui/Skeletons';
import { PWAUpdateBanner } from './components/PWAUpdateBanner';
import { QuickLogSheet, type QuickLogTab } from './components/modals/QuickLogSheet';
import { OnboardingModal } from './components/modals/OnboardingModal';
import { CoachDrawer } from './components/modals/CoachDrawer';
import { ReminderCenterModal } from './components/modals/ReminderCenterModal';

const PlanScreen = lazy(() =>
  import('./screens/PlanScreen').then((m) => ({ default: m.PlanScreen }))
);
const FoodScreen = lazy(() =>
  import('./screens/FoodScreen').then((m) => ({ default: m.FoodScreen }))
);
const FaceHubScreen = lazy(() =>
  import('./screens/FaceHubScreen').then((m) => ({ default: m.FaceHubScreen }))
);
const GrowScreen = lazy(() =>
  import('./screens/GrowScreen').then((m) => ({ default: m.GrowScreen }))
);
const HealthScreen = lazy(() =>
  import('./screens/HealthScreen').then((m) => ({ default: m.HealthScreen }))
);
const MoreScreen = lazy(() =>
  import('./screens/MoreScreen').then((m) => ({ default: m.MoreScreen }))
);
const HomeScreen = lazy(() =>
  import('./screens/HomeScreen').then((m) => ({ default: m.HomeScreen }))
);
const RoutineScreen = lazy(() =>
  import('./screens/RoutineScreen').then((m) => ({ default: m.RoutineScreen }))
);
const AcademyScreen = lazy(() =>
  import('./screens/AcademyScreen').then((m) => ({ default: m.AcademyScreen }))
);
const SettingsScreen = lazy(() =>
  import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen }))
);
const DietScreen = lazy(() =>
  import('./screens/DietScreen').then((m) => ({ default: m.DietScreen }))
);

type ScreenId =
  | 'plan'
  | 'food'
  | 'diet'
  | 'face'
  | 'grow'
  | 'health'
  | 'more'
  | 'dashboard'
  | 'routine'
  | 'academy'
  | 'settings';

function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return 'ME';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

const AppShell: React.FC = () => {
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [initialProfile, setInitialProfile] = useState<UserProfile | null>(null);
  const [initialSettings, setInitialSettings] = useState<AppSettings | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [screen, setScreen] = useState<ScreenId>('plan');
  const [subTab, setSubTab] = useState<string | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateKey());

  const [foodMealType, setFoodMealType] = useState<MealType | undefined>(undefined);
  const [foodMode, setFoodMode] = useState<'timeline' | 'scan' | 'quick' | undefined>(undefined);
  const [sharedFoodNote, setSharedFoodNote] = useState<string | undefined>(undefined);
  const [sharedFoodFile, setSharedFoodFile] = useState<File | null>(null);

  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogTab, setQuickLogTab] = useState<QuickLogTab>('water');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInitialPrompt, setCoachInitialPrompt] = useState<string | undefined>(undefined);
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

  const [unlocked, setUnlocked] = useState(false);
  const [pinAttempt, setPinAttempt] = useState('');

  const bootDb = async () => {
    setDbError(null);
    try {
      const [bootResult, storageResult] = await Promise.all([
        Promise.race([
          ensureDatabaseReady(),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error('Database startup timed out.')), 8000)
          ),
        ]),
        requestPersistentStorageAndCheck(),
      ]);

      setInitialProfile(bootResult.profile);
      setInitialSettings(bootResult.settings);
      if (storageResult.warning) {
        setStorageWarning(storageResult.warning);
      }
      const isCompleted = Boolean(
        bootResult.profile &&
          (bootResult.profile.onboardingComplete ||
            bootResult.profile.onboardingDone ||
            bootResult.profile.onboardingSkipped)
      );
      if (!isCompleted) {
        setOnboardingOpen(true);
      } else if (bootResult.profile) {
        ensureMorningAutoPlan(bootResult.profile, bootResult.settings).catch(() => {});
      }
      setDbReady(true);

      // Handle Web Share Target handoff (?share-target=1)
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.has('share-target')) {
          const noteParts = [params.get('title'), params.get('text'), params.get('url')]
            .filter((s): s is string => Boolean(s && s.trim()));
          if (noteParts.length > 0) {
            setSharedFoodNote(noteParts.join(' · '));
          }
          if (params.get('has-photo') === '1' && 'caches' in window) {
            caches
              .open('ascend-share-target')
              .then(async (cache) => {
                const resp = await cache.match('/__shared-photo__');
                if (!resp) return;
                const blob = await resp.blob();
                const rawName = resp.headers.get('X-File-Name') || 'shared-meal.jpg';
                const fileName = decodeURIComponent(rawName);
                const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
                await cache.delete('/__shared-photo__');
                setSharedFoodFile(file);
              })
              .catch(() => {});
            setFoodMode('scan');
          } else {
            setFoodMode(noteParts.length > 0 ? 'scan' : 'timeline');
          }
          setScreen('food');
          window.history.replaceState({}, '', '/');
        }
      }
    } catch (err) {
      setDbError(err instanceof Error ? err.message : 'Failed to open local IndexedDB.');
    }
  };

  useEffect(() => {
    installGlobalErrorListeners();
    bootDb();
    const t = setTimeout(() => {
      import('./lib/faceAnalysis')
        .then((m) => m.initFaceLandmarker())
        .catch(() => {});
    }, 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const isEditableField = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (tag === 'INPUT') {
        const type = (el as HTMLInputElement).type;
        return !['range', 'checkbox', 'radio', 'file', 'button', 'submit', 'reset'].includes(type);
      }
      return el.isContentEditable;
    };
    const onFocusIn = (e: FocusEvent) => {
      if (isEditableField(e.target)) setIsInputFocused(true);
    };
    const onFocusOut = () => {
      window.setTimeout(() => {
        setIsInputFocused(isEditableField(document.activeElement));
      }, 60);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  const profileQuery = useLiveQuery(() => (dbReady ? db.profile.get('me') : undefined), [dbReady]);
  const settingsQuery = useLiveQuery(() => (dbReady ? db.settings.get('app') : undefined), [dbReady]);
  const profile = profileQuery ?? initialProfile ?? createDefaultProfile();
  const settings = settingsQuery ?? initialSettings ?? createDefaultSettings();
  const xpState =
    useLiveQuery(() => (dbReady ? db.xpState.get('xp') : undefined), [dbReady]) ??
    createDefaultXpState();
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
  const puffinessLogs =
    useLiveQuery(
      () =>
        dbReady
          ? db.puffinessLogs.toArray().then((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)))
          : [],
      [dbReady]
    ) ?? [];
  const goals =
    useLiveQuery(
      () =>
        dbReady ? db.goals.toArray().then((arr) => arr.sort((a, b) => a.createdAt - b.createdAt)) : [],
      [dbReady]
    ) ?? [];
  const lifeList = useLiveQuery(() => (dbReady ? db.lifeList.toArray() : []), [dbReady]) ?? [];
  const heightLogs = useLiveQuery(() => (dbReady ? db.heightLogs.toArray() : []), [dbReady]) ?? [];
  const quitItems = useLiveQuery(() => (dbReady ? db.quitItems.toArray() : []), [dbReady]) ?? [];
  const quitSlips = useLiveQuery(() => (dbReady ? db.quitSlips.toArray() : []), [dbReady]) ?? [];
  const growthCheckoffs =
    useLiveQuery(() => (dbReady ? db.growthCheckoffs.toArray() : []), [dbReady]) ?? [];
  const growthPrograms =
    useLiveQuery(() => (dbReady ? db.growthPrograms.toArray() : []), [dbReady]) ?? [];

  // Theme sync supporting 'system' | 'dark' | 'light' + dynamic <meta name="theme-color">
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const resolvedDark =
        settings.theme === 'dark' || (settings.theme === 'system' && Boolean(media?.matches));
      if (resolvedDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      root.setAttribute('data-accent', settings.accent);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', resolvedDark ? '#06090F' : '#F4F7FA');
      }
    };

    applyTheme();
    if (settings.theme === 'system' && media) {
      media.addEventListener('change', applyTheme);
      return () => media.removeEventListener('change', applyTheme);
    }
    return undefined;
  }, [settings.theme, settings.accent]);

  useEffect(() => {
    setDayStartHour4am(Boolean(settings.dayStartsAt4am));
    setSelectedDate(toLocalDateKey());
  }, [settings.dayStartsAt4am]);

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

  const todayLogForRem = useMemo(
    () => dailyLogs.find((l) => l.date === toLocalDateKey()),
    [dailyLogs]
  );
  const todayMealsCountForRem = useMemo(
    () => mealScans.filter((m) => m.date === toLocalDateKey()).length,
    [mealScans]
  );
  const dueReminders = useMemo(
    () =>
      getInAppDueReminders(settings, scans[0]?.date ?? null, toLocalDateKey(), {
        todayLog: todayLogForRem,
        waterTargetMl: profile.waterTargetMl || 3000,
        todayMealsCount: todayMealsCountForRem,
        userName: profile.name,
      }),
    [settings, scans, todayLogForRem, profile.waterTargetMl, todayMealsCountForRem, profile.name]
  );

  const navigate = useCallback((nextScreen: string, nextSubTab?: string) => {
    let target: ScreenId = 'plan';
    let resolvedSub = nextSubTab;

    switch (nextScreen) {
      case 'home':
      case 'plan':
        target = 'plan';
        break;
      case 'food':
        target = 'food';
        setFoodMode(nextSubTab === 'scan' || nextSubTab === 'quick' ? nextSubTab : 'timeline');
        break;
      case 'diet':
        target = 'diet';
        break;
      case 'psl':
        target = 'face';
        resolvedSub = resolvedSub ?? 'scanner';
        break;
      case 'care':
        target = 'face';
        resolvedSub = resolvedSub ?? 'care';
        break;
      case 'face':
        target = 'face';
        break;
      case 'grow':
        target = 'grow';
        break;
      case 'nutrition':
        target = 'health';
        resolvedSub = resolvedSub ?? 'meals';
        break;
      case 'trackers':
        target = 'health';
        resolvedSub = resolvedSub ?? 'body';
        break;
      case 'progress':
        target = 'health';
        resolvedSub = resolvedSub ?? 'trends';
        break;
      case 'health':
        target = 'health';
        break;
      case 'more':
        target = 'more';
        break;
      case 'dashboard':
        target = 'dashboard';
        break;
      case 'routine':
        target = 'routine';
        break;
      case 'academy':
        target = 'academy';
        break;
      case 'settings':
        target = 'settings';
        break;
      default:
        target = 'plan';
    }

    setScreen(target);
    setSubTab(resolvedSub);
    setNavDrawerOpen(false);
    setQuickLogOpen(false);
    setCoachOpen(false);
    setRemindersOpen(false);
    document.body.classList.remove('ascend-scroll-lock');
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const openQuickLogWithTab = (t?: QuickLogTab | 'skin') => {
    setQuickLogTab(t === 'skin' ? 'photo' : (t ?? 'water'));
    setQuickLogOpen(true);
  };

  const openCoach = (prompt?: string) => {
    setCoachInitialPrompt(prompt);
    setCoachOpen(true);
  };

  if (dbError) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6">
        <div className="ascend-card max-w-sm w-full p-6 text-center space-y-3">
          <h1 className="font-display text-lg font-bold">{en.shell.storageErrorTitle}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{dbError}</p>
          <button
            type="button"
            onClick={bootDb}
            className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[44px]"
          >
            {en.shell.retryStartup}
          </button>
        </div>
      </div>
    );
  }

  if (!dbReady) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-8 gap-3">
        <div
          className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center"
          style={{ boxShadow: '0 0 24px var(--accent-glow)' }}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-6 h-6 text-[var(--accent)] animate-pulse"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <path d="M12 3L4 19h4l4-8 4 8h4L12 3z" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="text-center space-y-1">
          <p className="font-display text-base font-bold tracking-tight">{en.appName}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{en.shell.openingPlan}</p>
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
          <h1 className="font-display text-lg font-bold">{en.shell.lockedTitle}</h1>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="4-digit PIN"
            value={pinAttempt}
            onChange={(e) => setPinAttempt(e.target.value)}
            autoFocus
            className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-white/5 text-center font-mono-num text-lg tracking-widest min-h-[44px]"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
          >
            {en.shell.unlockBtn}
          </button>
        </form>
      </div>
    );
  }

  const isSubScreen = ['diet', 'more', 'dashboard', 'routine', 'academy', 'settings'].includes(screen);
  const avatarInitials = getInitials(profile.name);

  return (
    <div className="h-[100dvh] min-h-[100dvh] w-full max-w-full overflow-x-clip flex flex-col">
      {/* Top Bar: Left Menu/Back · Center ASCEND · Right Ask, Bell, More/Avatar */}
      <header className="shrink-0 z-30 backdrop-blur-xl bg-[#F4F7FA]/85 dark:bg-[#06090F]/85 border-b border-slate-200/70 dark:border-white/10 no-print">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 grid grid-cols-3 items-center">
          <div className="flex items-center gap-1.5 justify-start">
            <button
              type="button"
              onClick={() => setNavDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="w-11 h-11 rounded-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center hover:border-[var(--accent)]/40 transition"
            >
              <Menu className="w-4 h-4" />
            </button>
            {isSubScreen && (
              <button
                type="button"
                onClick={() => navigate('plan', 'now')}
                aria-label="Back to Plan"
                className="w-11 h-11 rounded-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center hover:border-[var(--accent)]/40 transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('plan', 'now')}
            className="flex items-center justify-center gap-2 whitespace-nowrap shrink-0 mx-auto min-h-[44px]"
          >
            <span
              className="w-6 h-6 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/45 flex items-center justify-center shrink-0"
              style={{ boxShadow: '0 0 12px var(--accent-glow)' }}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-3.5 h-3.5 text-[var(--accent)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
              >
                <path d="M12 3L4 19h4l4-8 4 8h4L12 3z" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display text-sm sm:text-base font-bold tracking-tight whitespace-nowrap">
              {en.appName}
            </span>
          </button>

          <div className="flex items-center gap-1 sm:gap-1.5 justify-end">
            <button
              type="button"
              onClick={() => openCoach()}
              aria-label="Ask coach"
              className="inline-flex items-center gap-1 px-2.5 h-11 rounded-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-semibold hover:border-[var(--accent)]/40 transition"
            >
              <MessageSquareText className="w-4 h-4 text-[var(--accent)]" />
              <span className="hidden sm:inline">{en.nav.askCoach}</span>
            </button>

            <button
              type="button"
              onClick={() => setRemindersOpen(true)}
              aria-label="View reminders"
              className="relative w-11 h-11 rounded-full bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center hover:border-[var(--accent)]/40 transition"
            >
              <Bell className="w-4 h-4" />
              {dueReminders.length > 0 && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[var(--accent)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('more')}
              aria-label="Open More and Settings"
              className={`w-11 h-11 rounded-full border flex items-center justify-center text-xs font-bold transition ${
                screen === 'more' || screen === 'settings'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent'
                  : 'bg-[var(--accent-soft)] border-[var(--accent)]/35 text-[var(--accent)] hover:border-[var(--accent)]/60'
              }`}
            >
              {avatarInitials}
            </button>
          </div>
        </div>
      </header>

      {/* Scrollable Main Content */}
      <main
        ref={mainRef}
        className={`flex-1 min-h-0 overflow-y-auto overflow-x-clip overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] ${
          isInputFocused ? 'pb-8' : 'pb-[calc(108px+env(safe-area-inset-bottom))]'
        }`}
      >
        <div className="max-w-6xl w-full mx-auto px-4 pt-4 min-w-0 space-y-3">
          {!isOnline && (
            <div className="p-3 rounded-2xl bg-sky-500/12 border border-sky-500/30 text-xs font-medium text-sky-700 dark:text-sky-300 flex items-center gap-2">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>{en.offline.banner}</span>
            </div>
          )}

          {storageWarning && (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-800 dark:text-amber-200 flex items-start justify-between gap-3">
              <span>{storageWarning}</span>
              <button
                type="button"
                onClick={() => setStorageWarning(null)}
                className="px-2 py-1 rounded-lg bg-black/20 text-[11px] font-semibold shrink-0 min-h-[32px]"
              >
                Dismiss
              </button>
            </div>
          )}

          <Suspense fallback={<ScreenSkeleton />}>
            <div key={screen} className="ascend-panel-enter">
              {screen === 'plan' && (
                <ErrorBoundary screenName="Plan">
                  <PlanScreen
                    profile={profile}
                    settings={settings}
                    xpState={xpState}
                    tasks={tasks}
                    completions={completions}
                    dailyLogs={dailyLogs}
                    mealScans={mealScans}
                    workouts={workouts}
                    bodyMetrics={bodyMetrics}
                    goals={goals}
                    lifeList={lifeList}
                    latestScan={scans[0] ?? null}
                    scans={scans}
                    selectedDate={selectedDate}
                    initialTab={subTab}
                    onOpenQuickLog={(t) => openQuickLogWithTab(t)}
                    onOpenFoodBreakfast={() => {
                      setFoodMealType('breakfast');
                      navigate('food', 'quick');
                    }}
                    onNavigate={navigate}
                    onOpenCoach={(prompt) => openCoach(prompt)}
                  />
                </ErrorBoundary>
              )}

              {screen === 'food' && (
                <ErrorBoundary screenName="Food">
                  <FoodScreen
                    profile={profile}
                    settings={settings}
                    dailyLogs={dailyLogs}
                    mealScans={mealScans}
                    bodyMetrics={bodyMetrics}
                    initialMealType={foodMealType}
                    initialMode={foodMode}
                    initialPrefillNote={sharedFoodNote}
                    initialSharedFile={sharedFoodFile}
                    onConsumeSharedInput={() => {
                      setSharedFoodFile(null);
                    }}
                    onOpenNutritionVault={() => navigate('health', 'meals')}
                    onOpenDiet={() => navigate('diet')}
                    onOpenCoach={() => openCoach('Ask about calories, protein, or meal swaps')}
                  />
                </ErrorBoundary>
              )}

              {screen === 'diet' && (
                <ErrorBoundary screenName="Diet">
                  <DietScreen
                    profile={profile}
                    settings={settings}
                    dailyLogs={dailyLogs}
                    mealScans={mealScans}
                    bodyMetrics={bodyMetrics}
                    onBack={() => navigate('food')}
                    onNavigate={navigate}
                    onOpenCoach={(prompt) => openCoach(prompt)}
                  />
                </ErrorBoundary>
              )}

              {screen === 'face' && (
                <ErrorBoundary screenName="Face">
                  <FaceHubScreen
                    profile={profile}
                    settings={settings}
                    products={products}
                    skinEntries={skinEntries}
                    hairPrefs={hairPrefs}
                    wardrobe={wardrobe}
                    outfits={outfits}
                    scans={scans}
                    puffinessLogs={puffinessLogs}
                    initialTab={subTab}
                    onBackToPlan={() => navigate('plan', 'now')}
                    onAskCoach={() => openCoach('Explain my scan')}
                    onOpenDebloatFood={() => navigate('food')}
                  />
                </ErrorBoundary>
              )}

              {screen === 'grow' && (
                <ErrorBoundary screenName="Grow">
                  <GrowScreen
                    profile={profile}
                    units={settings.units}
                    heightLogs={heightLogs}
                    growthCheckoffs={growthCheckoffs}
                    growthPrograms={growthPrograms}
                    dailyLogs={dailyLogs}
                    onOpenHeightLog={() => openQuickLogWithTab('height')}
                    onAskCoach={() => openCoach('Ask about height and posture')}
                  />
                </ErrorBoundary>
              )}

              {screen === 'health' && (
                <ErrorBoundary screenName="Health">
                  <HealthScreen
                    profile={profile}
                    settings={settings}
                    xpState={xpState}
                    tasks={tasks}
                    completions={completions}
                    dailyLogs={dailyLogs}
                    bodyMetrics={bodyMetrics}
                    scans={scans}
                    workouts={workouts}
                    mealScans={mealScans}
                    quitItems={quitItems}
                    quitSlips={quitSlips}
                    initialTab={subTab}
                    onOpenQuickLog={(t) => openQuickLogWithTab(t)}
                    onOpenOnboarding={() => setOnboardingOpen(true)}
                    onNavigate={navigate}
                  />
                </ErrorBoundary>
              )}

              {screen === 'more' && (
                <ErrorBoundary screenName="More">
                  <MoreScreen
                    profile={profile}
                    xpState={xpState}
                    onNavigate={navigate}
                    onOpenCoach={() => openCoach()}
                    onOpenReminders={() => setRemindersOpen(true)}
                  />
                </ErrorBoundary>
              )}

              {screen === 'dashboard' && (
                <ErrorBoundary screenName="Pro Dashboard">
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
                    onOpenQuickLog={(t) => openQuickLogWithTab(t)}
                    onNavigate={navigate}
                    onOpenCoach={() => openCoach()}
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
                <ErrorBoundary screenName="Habit Library">
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
          </Suspense>

          <footer className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            {en.safety.scoreFooter} {en.shell.footerNotice}
          </footer>
          <PWAUpdateBanner />
        </div>
      </main>

      {/* Floating Bottom Dock: 5 Tabs (Plan · Food · Face · Grow · Health) + Paired Quick-Add "+" */}
      {!isInputFocused && (
        <div className="fixed bottom-3 left-0 right-0 z-40 px-3 sm:px-4 pointer-events-none no-print">
          <div className="max-w-xl mx-auto flex items-center justify-center gap-2">
            <nav
              aria-label="Primary navigation"
              className="pointer-events-auto flex-1 h-[64px] sm:h-[70px] rounded-full ascend-glass-dock grid grid-cols-5 items-center px-1 gap-0.5"
            >
              {([
                {
                  id: 'plan',
                  label: en.nav.plan,
                  icon: <CalendarCheck2 className="w-[17px] h-[17px]" />,
                },
                {
                  id: 'food',
                  label: en.nav.food,
                  icon: <Utensils className="w-[17px] h-[17px]" />,
                },
                {
                  id: 'face',
                  label: en.nav.face,
                  icon: <ScanFace className="w-[17px] h-[17px]" />,
                },
                {
                  id: 'grow',
                  label: en.nav.grow,
                  icon: <Ruler className="w-[17px] h-[17px]" />,
                },
                {
                  id: 'health',
                  label: en.nav.health,
                  icon: <HeartPulse className="w-[17px] h-[17px]" />,
                },
              ] as const).map((item) => {
                const active = screen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-full min-h-[48px] min-w-0 transition-all duration-200 active:scale-95 ${
                      active
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold border border-[var(--accent)]/30'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent'
                    }`}
                  >
                    {item.icon}
                    <span className="text-[10.5px] sm:text-[11px] mt-0.5 whitespace-nowrap leading-none tracking-tight">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => openQuickLogWithTab('water')}
              aria-label={en.nav.quickAdd}
              className="pointer-events-auto w-13 h-13 sm:w-15 sm:h-15 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_12px_28px_-8px_rgba(0,0,0,0.55)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shrink-0 border border-white/15"
              style={{ minWidth: 52, minHeight: 52 }}
            >
              <Plus className="w-6 h-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* Slide-Over Menu Drawer */}
      {navDrawerOpen && (
        <div className="fixed inset-0 z-50 flex no-print">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setNavDrawerOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full bg-white dark:bg-[#0C121D]/95 dark:backdrop-blur-2xl border-r border-slate-200 dark:border-white/10 p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                  </span>
                  <span className="font-display text-base font-bold">{en.appName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNavDrawerOpen(false)}
                  aria-label="Close navigation menu"
                  className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-1">
                {profile.name.trim() && <p className="text-sm font-bold">{profile.name.trim()}</p>}
                <p className="text-xs text-[var(--accent)] font-semibold">
                  Level {xpState.level} {getRankForLevel(xpState.level)} · {xpState.currentStreak}d streak
                </p>
              </div>

              <div className="space-y-1">
                {[
                  { id: 'plan', label: 'Plan (Now · Today · Goals)', icon: <CalendarCheck2 className="w-4 h-4" /> },
                  { id: 'food', label: 'Food (Meals & Calories)', icon: <Utensils className="w-4 h-4" /> },
                  { id: 'face', label: 'Face (Scanner & Looks Care)', icon: <ScanFace className="w-4 h-4" /> },
                  { id: 'grow', label: 'Grow (Height & Posture)', icon: <Ruler className="w-4 h-4" /> },
                  { id: 'health', label: 'Health (Body, Sleep & Trends)', icon: <HeartPulse className="w-4 h-4" /> },
                  { id: 'more', label: 'More (Search All & Quit list)', icon: <Grid className="w-4 h-4" /> },
                  { id: 'routine', label: 'Habit Library & Mind', icon: <ListChecks className="w-4 h-4" /> },
                  { id: 'academy', label: 'Academy & Myths', icon: <BookOpen className="w-4 h-4" /> },
                  { id: 'dashboard', label: 'Pro Telemetry Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
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
                  openQuickLogWithTab('water');
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
              >
                <Plus className="w-4 h-4" /> {en.quickAdd.title}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNavDrawerOpen(false);
                  openCoach();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                <MessageSquareText className="w-4 h-4 text-[var(--accent)]" /> Ask local coach
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
        settings={settings}
        mealScans={mealScans}
        units={settings.units}
        onClose={() => setQuickLogOpen(false)}
        onOpenSkinLab={() => navigate('face', 'skin')}
        onOpenMealScanner={(mType) => {
          setFoodMealType(mType);
          navigate('food', 'scan');
        }}
        onOpenQuitHabits={() => navigate('health', 'quit')}
      />

      {onboardingOpen && (
        <OnboardingModal
          profile={profile}
          currentTone={settings.tone ?? 'normal'}
          onClose={() => setOnboardingOpen(false)}
        />
      )}

      <CoachDrawer
        open={coachOpen}
        initialPrompt={coachInitialPrompt}
        settings={settings}
        context={{
          profile,
          settings,
          tasks,
          completions,
          dailyLogs,
          skinEntries,
          scans,
          workouts,
          mealScans,
          bodyMetrics,
        }}
        onClose={() => {
          setCoachOpen(false);
          setCoachInitialPrompt(undefined);
        }}
      />

      <ReminderCenterModal
        open={remindersOpen}
        profile={profile}
        settings={settings}
        lastScanDate={scans[0]?.date ?? null}
        todayKey={toLocalDateKey()}
        todayLog={todayLogForRem}
        waterTargetMl={profile.waterTargetMl || 3000}
        todayMealsCount={todayMealsCountForRem}
        onClose={() => setRemindersOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <ErrorBoundary screenName="ASCEND">
        <AppShell />
      </ErrorBoundary>
    </ToastProvider>
  );
}
