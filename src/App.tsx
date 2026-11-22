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
  recalculateXpAndBadges,
  requestPersistentStorageAndCheck,
  saveMealScanEntry,
  saveOneQuestionDayOutcome,
  toggleTaskCompletion,
} from './db/database';
import type { AppSettings, EventOutcomeLevel, MealType, UserProfile } from './types';
import { en } from './i18n/en';
import { setDayStartHour4am, toLocalDateKey } from './lib/date';
import { sha256Hex } from './lib/crypto';
import { installGlobalErrorListeners } from './lib/errorLog';
import { getInAppDueReminders, syncLocalNotifications } from './lib/notifications';
import { buildMealMemorySuggestions, getRealLifeSettings } from './lib/realLifeFood';
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
import { EventModeModal } from './components/food/EventModeModal';
import { DailyOneQuestionModal } from './components/food/DailyOneQuestionModal';
import { GalleryImportModal } from './components/food/GalleryImportModal';
import { AppBrandLogo } from './components/ui/AppBrandLogo';
import { PathPickerModal } from './components/plan/PathPickerModal';
import {
  applyLookAndFeelToDocument,
  getLookAndFeelSettings,
  playUiSound,
} from './lib/themes';
import {
  buildRealBootLine,
  getBadgeTitleForPath,
  getMindsetPathsSettings,
} from './lib/mindsetEngine';

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
  const [foodDate, setFoodDate] = useState<string>(() => toLocalDateKey());
  const [isSharedFoodInput, setIsSharedFoodInput] = useState(false);
  const [autoFocusMic, setAutoFocusMic] = useState(false);
  const [sharedFoodNote, setSharedFoodNote] = useState<string | undefined>(undefined);
  const [sharedFoodFile, setSharedFoodFile] = useState<File | null>(null);

  const [eventModalDate, setEventModalDate] = useState<string | null>(null);
  const [oneQuestionDate, setOneQuestionDate] = useState<string | null>(null);
  const [galleryModalOpen, setGalleryModalOpen] = useState(false);

  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogTab, setQuickLogTab] = useState<QuickLogTab>('water');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInitialPrompt, setCoachInitialPrompt] = useState<string | undefined>(undefined);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [pathPickerOpen, setPathPickerOpen] = useState(false);
  const [bootLineDismissed, setBootLineDismissed] = useState(false);
  const [launchFadeActive, setLaunchFadeActive] = useState(false);
  const autoPickerCheckedRef = useRef(false);
  const [pedometerState, setPedometerState] = useState<PedometerState>(() => getPedometerState());
  const mainRef = useRef<HTMLElement | null>(null);
  const stepsQueueRef = useRef(0);
  const flushTimerRef = useRef<number | null>(null);

  const hasModalOpen =
    quickLogOpen ||
    onboardingOpen ||
    coachOpen ||
    remindersOpen ||
    navDrawerOpen ||
    pathPickerOpen ||
    Boolean(eventModalDate) ||
    Boolean(oneQuestionDate) ||
    galleryModalOpen;
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

      // Handle Web Share Target handoff (?share-target=1), PWA app shortcuts, and quick replies
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const todayKeyNow = toLocalDateKey();
        const rl = getRealLifeSettings(bootResult.settings);

        if (params.has('share-target') && rl.shareIntoAscendEnabled !== false) {
          const noteParts = [params.get('title'), params.get('text'), params.get('url')]
            .filter((s): s is string => Boolean(s && s.trim()));
          setIsSharedFoodInput(true);
          setFoodDate(todayKeyNow);
          setAutoFocusMic(false);
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
            setFoodMode(noteParts.length > 0 ? 'scan' : 'quick');
          }
          setScreen('food');
          window.history.replaceState({}, '', '/');
        } else if (params.has('shortcut')) {
          const sc = params.get('shortcut');
          if (sc === 'talk') {
            setFoodDate(todayKeyNow);
            setAutoFocusMic(true);
            setFoodMode('quick');
            setScreen('food');
          } else if (sc === 'add-meal') {
            setFoodDate(todayKeyNow);
            setAutoFocusMic(false);
            setFoodMode('quick');
            setScreen('food');
          } else if (sc === 'water') {
            const cur = await getOrCreateDailyLog(todayKeyNow);
            await db.dailyLogs.update(todayKeyNow, {
              waterMl: (cur.waterMl || 0) + 250,
              updatedAt: Date.now(),
            });
            showToast('+250 ml water logged');
            setScreen('plan');
          } else if (sc === 'trained') {
            await db.workouts.add({
              date: todayKeyNow,
              name: 'Training check-in',
              durationMin: 45,
              exercises: [],
              notes: 'Logged from app shortcut',
              createdAt: Date.now(),
            });
            const workoutTask = await db.protocolTasks
              .filter((t) => t.protocolId === 'body-workout-day' && t.enabled)
              .first();
            if (workoutTask) {
              const existingComp = await db.taskCompletions.get(`${todayKeyNow}::${workoutTask.id}`);
              if (!existingComp) {
                await toggleTaskCompletion(todayKeyNow, workoutTask);
              }
            }
            await recalculateXpAndBadges();
            showToast('Workout checked in');
            setScreen('plan');
          }
          window.history.replaceState({}, '', '/');
        } else if (params.get('quick-reply') === 'food') {
          setOneQuestionDate(todayKeyNow);
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

  const exerciseLogs =
    useLiveQuery(() => (dbReady ? db.exerciseLogs.toArray() : []), [dbReady]) ?? [];

  // Look & Feel CSS-variable + theme mode + motion sync
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const syncLook = () => {
      applyLookAndFeelToDocument(settings, Boolean(media?.matches));
    };
    syncLook();
    if (media) {
      media.addEventListener('change', syncLook);
      return () => media.removeEventListener('change', syncLook);
    }
    return undefined;
  }, [settings]);

  // Auto-open Path Picker once after onboarding if no path was selected yet
  useEffect(() => {
    if (!dbReady || onboardingOpen || autoPickerCheckedRef.current) return;
    autoPickerCheckedRef.current = true;
    const onboarded = Boolean(
      profile.onboardingComplete || profile.onboardingDone || profile.onboardingSkipped
    );
    const mp = getMindsetPathsSettings(settings);
    const sessionPrompted = sessionStorage.getItem('ascend_path_picker_seen') === '1';
    if (
      onboarded &&
      mp.pathsEnabled &&
      !mp.pickerCompleted &&
      !mp.mainPathId &&
      mp.inspirationIds.length === 0 &&
      (mp.pickerBannerDismissCount ?? 0) === 0 &&
      !sessionPrompted
    ) {
      sessionStorage.setItem('ascend_path_picker_seen', '1');
      setPathPickerOpen(true);
    }
  }, [dbReady, onboardingOpen, profile, settings]);

  // Optional brief (<600ms) logo fade on launch
  const launchSplashDoneRef = useRef(false);
  useEffect(() => {
    if (!dbReady || launchSplashDoneRef.current) return;
    launchSplashDoneRef.current = true;
    const laf = getLookAndFeelSettings(settings);
    const reduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    if (laf.launchAnimation === 'logo_fade' && !reduced && laf.animationLevel !== 'off') {
      setLaunchFadeActive(true);
      const t = window.setTimeout(() => setLaunchFadeActive(false), 520);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [dbReady, settings]);

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

  // Sync native notifications when reminder preferences or Event Mode change
  useEffect(() => {
    if (!dbReady) return;
    syncLocalNotifications(settings, todayLogForRem ?? null).catch(() => {});
  }, [dbReady, settings, todayLogForRem]);

  // Capacitor deep links & notification quick-reply actions
  useEffect(() => {
    if (!dbReady || typeof window === 'undefined') return;
    const cap = (window as unknown as {
      Capacitor?: {
        Plugins?: {
          App?: {
            addListener?: (
              event: string,
              cb: (data: { url?: string }) => void
            ) => Promise<{ remove?: () => void }> | { remove?: () => void };
          };
          LocalNotifications?: {
            addListener?: (
              event: string,
              cb: (ev: { actionId?: string; notification?: { extra?: { quickReply?: string } } }) => void
            ) => Promise<{ remove?: () => void }> | { remove?: () => void };
          };
        };
      };
    }).Capacitor;
    if (!cap?.Plugins) return;

    let removed = false;
    const cleanups: Array<() => void> = [];

    const registerListeners = async () => {
      try {
        if (cap.Plugins?.App?.addListener) {
          const handle = await cap.Plugins.App.addListener('appUrlOpen', ({ url }) => {
            if (!url) return;
            try {
              const parsed = new URL(url);
              const sc = parsed.searchParams.get('shortcut');
              const qr = parsed.searchParams.get('quick-reply');
              const todayKeyNow = toLocalDateKey();
              if (sc === 'talk') {
                setFoodDate(todayKeyNow);
                setAutoFocusMic(true);
                setFoodMode('quick');
                setScreen('food');
              } else if (sc === 'add-meal') {
                setFoodDate(todayKeyNow);
                setAutoFocusMic(false);
                setFoodMode('quick');
                setScreen('food');
              } else if (qr === 'food') {
                setOneQuestionDate(todayKeyNow);
              }
            } catch {
              // ignore malformed deep links
            }
          });
          if (!removed && handle?.remove) cleanups.push(() => handle.remove?.());
        }

        if (cap.Plugins?.LocalNotifications?.addListener) {
          const handle = await cap.Plugins.LocalNotifications.addListener(
            'localNotificationActionPerformed',
            (ev) => {
              const todayKeyNow = toLocalDateKey();
              const aid = ev.actionId;
              if (aid === 'light' || aid === 'normal' || aid === 'heavy' || aid === 'very_heavy') {
                saveOneQuestionDayOutcome(todayKeyNow, aid as EventOutcomeLevel)
                  .then(() => showToast('Saved quick eating estimate'))
                  .catch(() => {});
              } else if (ev.notification?.extra?.quickReply === 'food') {
                setOneQuestionDate(todayKeyNow);
              }
            }
          );
          if (!removed && handle?.remove) cleanups.push(() => handle.remove?.());
        }
      } catch {
        // Ignore outside Capacitor native APK
      }
    };
    void registerListeners();

    return () => {
      removed = true;
      cleanups.forEach((fn) => fn());
    };
  }, [dbReady, showToast]);

  // Strictly OPT-IN auto-fill usual meals (OFF by default) — drafts at most once/day if empty & not event/skipped
  useEffect(() => {
    if (!dbReady || typeof window === 'undefined') return;
    const rl = getRealLifeSettings(settings);
    if (rl.autoFillUsualMeals !== true) return;
    const todayKeyNow = toLocalDateKey();
    const flagKey = `ascend_autofill_${todayKeyNow}`;
    if (window.localStorage.getItem(flagKey)) return;
    if (todayMealsCountForRem > 0) return;
    if (todayLogForRem?.eventMode?.active) return;
    if (settings.skippedGapCheckinDates?.includes(todayKeyNow)) return;

    const suggestions = buildMealMemorySuggestions({
      todayKey: todayKeyNow,
      mealScans,
      workouts,
    });
    const pick = suggestions[0];
    if (!pick) return;

    window.localStorage.setItem(flagKey, '1');
    const { id: _ignoredId, ...sourceWithoutId } = pick.sourceMeal;
    saveMealScanEntry({
      ...sourceWithoutId,
      date: todayKeyNow,
      timestamp: Date.now(),
      isEstimate: true,
      summaryNote: `${pick.reason} (auto-filled draft — edit or delete anytime)`,
    })
      .then(() => {
        showToast(`Drafted usual meal: ${pick.label} (edit anytime)`, 'info');
      })
      .catch(() => {});
  }, [dbReady, settings, todayMealsCountForRem, todayLogForRem, mealScans, workouts, showToast]);

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

  const laf = getLookAndFeelSettings(settings);
  const displayAppName = laf.displayAppName || en.appName;

  if (!dbReady) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-8 gap-3">
        <div
          className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center"
          style={{ boxShadow: '0 0 24px var(--accent-glow)' }}
        >
          <AppBrandLogo
            iconId={laf.appIconId}
            iconStyle={laf.iconStyle}
            className="w-6 h-6 text-[var(--accent)] animate-pulse"
          />
        </div>
        <div className="text-center space-y-1">
          <p className="font-display text-base font-bold tracking-tight">{displayAppName}</p>
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
  const todayKeyShell = toLocalDateKey();
  const createdMs = profile.createdAt || Date.now();
  const dayNumberShell = Math.max(1, Math.floor((Date.now() - createdMs) / 86400000) + 1);
  const weekStartKey = (() => {
    const d = new Date(`${todayKeyShell}T12:00:00`);
    d.setDate(d.getDate() - 6);
    return toLocalDateKey(d);
  })();
  const weeklyWorkoutsShell = workouts.filter((w) => w.date >= weekStartKey).length;
  const todayDoneCountShell = completions.filter((c) => c.date === todayKeyShell).length;
  const realBootLine = buildRealBootLine({
    dayNumber: dayNumberShell,
    weeklySessions: weeklyWorkoutsShell,
    todayCompletedCount: todayDoneCountShell,
    settings,
  });
  const drawerBadgeTitle = getBadgeTitleForPath(
    xpState.level,
    settings,
    getRankForLevel(xpState.level)
  );

  return (
    <div className="h-[100dvh] min-h-[100dvh] w-full max-w-full overflow-x-clip flex flex-col">
      {launchFadeActive && (
        <button
          type="button"
          onClick={() => setLaunchFadeActive(false)}
          aria-label="Skip launch splash"
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-[var(--bg-page)] transition-opacity duration-300"
        >
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center">
            <AppBrandLogo
              iconId={laf.appIconId}
              iconStyle={laf.iconStyle}
              className="w-7 h-7 text-[var(--accent)]"
            />
          </div>
          <p className="font-display text-lg font-bold tracking-tight">{displayAppName}</p>
        </button>
      )}

      {/* Top Bar: Left Menu/Back · Center Brand · Right Ask, Bell, More/Avatar */}
      <header
        className="shrink-0 z-30 backdrop-blur-xl border-b border-[var(--border-subtle)] no-print"
        style={{ backgroundColor: 'color-mix(in srgb, var(--bg-page) 88%, transparent)' }}
      >
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
            onClick={() => {
              playUiSound(settings, 'click');
              navigate('plan', 'now');
            }}
            className="flex items-center justify-center gap-2 whitespace-nowrap shrink-0 mx-auto min-h-[44px]"
          >
            <span
              className="w-6 h-6 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/45 flex items-center justify-center shrink-0"
              style={{ boxShadow: '0 0 12px var(--accent-glow)' }}
            >
              <AppBrandLogo
                iconId={laf.appIconId}
                iconStyle={laf.iconStyle}
                className="w-3.5 h-3.5 text-[var(--accent)]"
              />
            </span>
            <span className="font-display text-sm sm:text-base font-bold tracking-tight whitespace-nowrap">
              {displayAppName}
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
          {laf.bootLineEnabled && !bootLineDismissed && (
            <div className="px-3.5 py-2 rounded-xl bg-slate-100/80 dark:bg-white/[0.04] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-[11px] font-mono-num">
              <span className="truncate text-[var(--accent)] font-semibold">{realBootLine}</span>
              <button
                type="button"
                onClick={() => setBootLineDismissed(true)}
                aria-label="Dismiss boot status line"
                className="text-slate-400 hover:text-white shrink-0 px-1"
              >
                ×
              </button>
            </div>
          )}

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
                    exerciseLogs={exerciseLogs}
                    bodyMetrics={bodyMetrics}
                    goals={goals}
                    lifeList={lifeList}
                    latestScan={scans[0] ?? null}
                    scans={scans}
                    selectedDate={selectedDate}
                    initialTab={subTab}
                    isOnline={isOnline}
                    onOpenQuickLog={(t) => openQuickLogWithTab(t)}
                    onOpenFoodBreakfast={() => {
                      setFoodDate(toLocalDateKey());
                      setFoodMealType('breakfast');
                      setAutoFocusMic(false);
                      navigate('food', 'quick');
                    }}
                    onOpenFoodForDate={(dateKey, slot) => {
                      setFoodDate(dateKey);
                      setFoodMealType(slot);
                      setAutoFocusMic(false);
                      navigate('food', 'quick');
                    }}
                    onOpenEventModal={(dateKey) => setEventModalDate(dateKey)}
                    onOpenOneQuestionModal={(dateKey) => setOneQuestionDate(dateKey)}
                    onOpenGalleryImport={() => setGalleryModalOpen(true)}
                    onOpenPathPicker={() => setPathPickerOpen(true)}
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
                    workouts={workouts}
                    initialMealType={foodMealType}
                    initialMode={foodMode}
                    initialDate={foodDate}
                    initialPrefillNote={sharedFoodNote}
                    initialIsSharedInput={isSharedFoodInput}
                    initialSharedFile={sharedFoodFile}
                    autoFocusMic={autoFocusMic}
                    onConsumeSharedInput={() => {
                      setSharedFoodFile(null);
                      setSharedFoodNote(undefined);
                      setIsSharedFoodInput(false);
                      setAutoFocusMic(false);
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
                    settings={settings}
                    xpState={xpState}
                    onNavigate={navigate}
                    onOpenCoach={() => openCoach()}
                    onOpenReminders={() => setRemindersOpen(true)}
                    onOpenPathPicker={() => setPathPickerOpen(true)}
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
                    onOpenPathPicker={() => setPathPickerOpen(true)}
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
          <aside
            className="relative z-10 w-72 max-w-[85vw] h-full backdrop-blur-2xl border-r border-[var(--border-subtle)] p-5 flex flex-col justify-between overflow-y-auto"
            style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface-solid) 96%, transparent)' }}
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center">
                    <AppBrandLogo
                      iconId={laf.appIconId}
                      iconStyle={laf.iconStyle}
                      className="w-3.5 h-3.5 text-[var(--accent)]"
                    />
                  </span>
                  <span className="font-display text-base font-bold">{displayAppName}</span>
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
                  Level {xpState.level} {drawerBadgeTitle} · {xpState.currentStreak}d streak
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
          setFoodDate(selectedDate);
          setFoodMealType(mType);
          setAutoFocusMic(false);
          navigate('food', 'scan');
        }}
        onOpenQuitHabits={() => navigate('health', 'quit')}
        onOpenEventMode={(dk) => setEventModalDate(dk)}
        onOpenPathPicker={() => setPathPickerOpen(true)}
      />

      <PathPickerModal
        open={pathPickerOpen}
        settings={settings}
        onClose={() => setPathPickerOpen(false)}
      />

      <EventModeModal
        open={Boolean(eventModalDate)}
        dateKey={eventModalDate ?? toLocalDateKey()}
        dailyLog={dailyLogs.find((l) => l.date === eventModalDate) ?? null}
        settings={settings}
        onClose={() => setEventModalDate(null)}
        onOpenDetailsFlow={(mode) => {
          const targetDate = eventModalDate ?? toLocalDateKey();
          setEventModalDate(null);
          if (mode === 'gallery') {
            setGalleryModalOpen(true);
          } else {
            setFoodDate(targetDate);
            setAutoFocusMic(true);
            navigate('food', 'quick');
          }
        }}
      />

      <DailyOneQuestionModal
        open={Boolean(oneQuestionDate)}
        settings={settings}
        dateKey={oneQuestionDate ?? toLocalDateKey()}
        onClose={() => setOneQuestionDate(null)}
      />

      <GalleryImportModal
        open={galleryModalOpen}
        settings={settings}
        onClose={() => setGalleryModalOpen(false)}
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
