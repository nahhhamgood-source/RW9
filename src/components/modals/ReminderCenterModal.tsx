import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bell,
  CalendarPlus,
  Check,
  Clock,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Timer,
  X,
} from 'lucide-react';
import { db, recalculateXpAndBadges } from '../../db/database';
import { apiRequest } from '../../lib/api';
import {
  computeMewingWeeklyCount,
  computeNeckSetStreak,
  downloadRemindersIcs,
  getInAppDueReminders,
  getReminderDeliveryInfo,
  markReminderAction,
  requestReminderPermission,
  syncLocalNotifications,
  type DueReminder,
} from '../../lib/notifications';
import { CircularRing } from '../ui/ProgressRings';
import { ExerciseDemoLinks } from '../ui/ExerciseDemoLinks';
import { useToast } from '../ui/ToastProvider';
import type { AppSettings, DailyLog, UserProfile } from '../../types';

interface ReminderCenterModalProps {
  open: boolean;
  profile: UserProfile;
  settings: AppSettings;
  lastScanDate: string | null;
  todayKey: string;
  todayLog?: DailyLog;
  waterTargetMl: number;
  todayMealsCount: number;
  onClose: () => void;
}

export const ReminderCenterModal: React.FC<ReminderCenterModalProps> = ({
  open,
  profile,
  settings,
  lastScanDate,
  todayKey,
  todayLog,
  waterTargetMl,
  todayMealsCount,
  onClose,
}) => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'due' | 'schedule'>('due');
  const [tick, setTick] = useState(0);
  const [serverPushConfigured, setServerPushConfigured] = useState<boolean | null>(null);
  const [pushServerNote, setPushServerNote] = useState<string | null>(null);

  // Interactive 30-second mini routine modal state
  const [activeRoutine, setActiveRoutine] = useState<DueReminder | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);

  const exerciseLogs =
    useLiveQuery(() => (open ? db.exerciseLogs.toArray() : []), [open, tick]) ?? [];

  useEffect(() => {
    if (!open) return;
    let active = true;
    apiRequest<{ pushConfigured?: boolean }>('/api/push')
      .then((res) => {
        if (!active) return;
        if (res.ok) {
          setServerPushConfigured(Boolean(res.data.pushConfigured));
        } else {
          setServerPushConfigured(false);
        }
      })
      .catch(() => {
        if (active) setServerPushConfigured(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const delivery = useMemo(
    () => getReminderDeliveryInfo(serverPushConfigured),
    [serverPushConfigured, tick]
  );

  const mewingWeeklyCount = useMemo(
    () => computeMewingWeeklyCount(exerciseLogs, todayKey),
    [exerciseLogs, todayKey]
  );
  const neckStreak = useMemo(
    () => computeNeckSetStreak(exerciseLogs, todayKey),
    [exerciseLogs, todayKey]
  );

  const dueReminders = useMemo(
    () =>
      getInAppDueReminders(settings, lastScanDate, todayKey, {
        todayLog,
        waterTargetMl,
        todayMealsCount,
        userName: profile.name,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, lastScanDate, todayKey, todayLog, waterTargetMl, todayMealsCount, profile.name, tick]
  );

  if (!open) return null;

  const updateReminderPrefs = async (patch: Partial<AppSettings['reminders']>) => {
    const next: AppSettings = {
      ...settings,
      reminders: {
        ...settings.reminders,
        ...patch,
      },
    };
    await db.settings.put(next);
    await syncLocalNotifications(next);
  };

  const updateTopSettings = async (patch: Partial<AppSettings>) => {
    const next: AppSettings = {
      ...settings,
      ...patch,
    };
    await db.settings.put(next);
    await syncLocalNotifications(next);
  };

  const openMiniRoutine = (item: DueReminder) => {
    setActiveRoutine(item);
    setTimerSeconds(30);
    setTimerRunning(false);
  };

  const handleAction = async (item: DueReminder, action: 'done' | 'snooze30' | 'later') => {
    markReminderAction(item.id, action, todayKey);
    if (action === 'done' && (item.kind === 'mewing' || item.kind === 'neck_set')) {
      const isNeck = item.kind === 'neck_set';
      await db.exerciseLogs.add({
        date: todayKey,
        programId: isNeck ? 'reminder_neck_set' : 'reminder_mewing',
        programTitle: isNeck ? 'Neck set check-in' : 'Mewing posture check-in',
        domain: 'face',
        level: 1,
        minutes: isNeck ? 2 : 1,
        xpEarned: 10,
        completedAt: Date.now(),
      });
      await recalculateXpAndBadges();

      const updatedLogs = await db.exerciseLogs.toArray();
      if (isNeck) {
        const nextStreak = computeNeckSetStreak(updatedLogs, todayKey);
        showToast(
          nextStreak > 0
            ? `Neck set done. ${nextStreak}-day streak (+10 XP)`
            : 'Neck set done (+10 XP)'
        );
      } else {
        const nextWeekly = computeMewingWeeklyCount(updatedLogs, todayKey);
        showToast(`Mewing check logged · ${nextWeekly} of 21 times this week (+10 XP)`);
      }
    } else {
      showToast(
        action === 'done'
          ? 'Reminder marked done'
          : action === 'snooze30'
          ? 'Snoozed for 30 minutes'
          : 'Skipped for today'
      );
    }
    if (activeRoutine?.id === item.id) {
      setActiveRoutine(null);
      setTimerRunning(false);
    }
    setTick((t) => t + 1);
  };

  const handleRequestOsAlerts = async () => {
    const res = await requestReminderPermission();
    setTick((t) => t + 1);
    showToast(
      res === 'granted'
        ? 'Alert permission granted'
        : 'Browser alerts blocked — use Android app or Calendar .ics file',
      res === 'granted' ? 'info' : 'warning'
    );
  };

  const handleCheckPushServer = async () => {
    const res = await apiRequest<{ pushConfigured?: boolean }>('/api/push');
    if (res.ok) {
      const configured = Boolean(res.data.pushConfigured);
      setServerPushConfigured(configured);
      setPushServerNote(
        configured
          ? 'Web Push VAPID keys are configured. Note: delivery is best-effort and Vercel Hobby cron runs at most once per day.'
          : 'Push is not set up. Use the Android app or the calendar file.'
      );
    } else {
      setServerPushConfigured(false);
      setPushServerNote('Push is not set up. Use the Android app or the calendar file.');
    }
  };

  const r = settings.reminders;
  const maxPerDay = Math.max(1, Math.min(6, r.maxPerDay ?? 6));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ascend-card max-w-lg w-full p-5 max-h-[90dvh] overflow-y-auto overscroll-y-contain space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold">Reminder Center</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mewing checks, neck sets, quiet hours &amp; max {maxPerDay}/day cap
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Reminder Center"
            className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Real Progress Rings for Mewing & Neck Set */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center gap-3">
            <CircularRing value={Math.min(100, (mewingWeeklyCount / 21) * 100)} size={50} strokeWidth={5}>
              <span className="font-mono-num text-[11px] font-bold">{mewingWeeklyCount}/21</span>
            </CircularRing>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">Mewing check</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                {mewingWeeklyCount} of 21 this week
              </p>
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center gap-3">
            <CircularRing value={Math.min(100, (neckStreak / 7) * 100)} size={50} strokeWidth={5}>
              <span className="font-mono-num text-[11px] font-bold">{neckStreak}d</span>
            </CircularRing>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">Neck set</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                {neckStreak > 0 ? `${neckStreak}-day streak` : 'Start your streak'}
              </p>
            </div>
          </div>
        </div>

        {/* Honest 3-Path Delivery Status */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)]">
              <Smartphone className="w-3.5 h-3.5" /> {delivery.label}
            </span>
            <button
              type="button"
              onClick={handleRequestOsAlerts}
              className="px-2.5 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-[11px] font-bold min-h-[32px]"
            >
              Allow Alerts
            </button>
          </div>
          <p className="text-[11px] text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
            {delivery.detail}
          </p>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 pt-1 border-t border-slate-200 dark:border-white/10">
            <p>
              <strong>1. Android APK (Capacitor):</strong> Most reliable — runs offline on your phone with no server.
            </p>
            <p>
              <strong>2. Web Push (PWA + VAPID):</strong> Works on installed Android Chrome; iPhone requires Add to Home Screen; delivery is not guaranteed and Vercel Hobby cron runs at most once a day.
            </p>
            <p>
              <strong>3. Fallback:</strong> In-app banner while open + downloadable <code>.ics</code> calendar file with repeating alarms.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                downloadRemindersIcs(settings);
                showToast('Downloaded ascend-reminders.ics');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[36px]"
            >
              <CalendarPlus className="w-3.5 h-3.5 text-[var(--accent)]" /> Export .ics Calendar
            </button>
            <button
              type="button"
              onClick={handleCheckPushServer}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[36px]"
            >
              Check Web Push
            </button>
          </div>
          {pushServerNote && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300">{pushServerNote}</p>
          )}
        </div>

        {/* 30-second interactive mini routine view when user taps a Mewing/Neck reminder */}
        {activeRoutine && (
          <div className="p-4 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  30-second mini routine
                </p>
                <h3 className="font-display text-base font-bold">{activeRoutine.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveRoutine(null);
                  setTimerRunning(false);
                }}
                aria-label="Close mini routine"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-200">
              {activeRoutine.kind === 'neck_set'
                ? 'Slow chin tucks (10 reps), light neck curls (10 reps), and gentle hand-resisted forehead press (15 sec). Comfortable effort only — never push through pain.'
                : 'Rest the full tongue gently on the roof of your mouth, close your lips lightly, keep back teeth slightly apart, and breathe smoothly through your nose.'}
            </p>

            {/* 30-second timer */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/80 dark:bg-[#0D131D]">
              <div className="flex items-center gap-2.5">
                <Timer className="w-5 h-5 text-[var(--accent)]" />
                <span className="font-mono-num text-xl font-bold">
                  {String(timerSeconds).padStart(2, '0')}s
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTimerRunning((v) => !v)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px]"
                >
                  {timerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {timerRunning ? 'Pause' : 'Start 30s'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimerRunning(false);
                    setTimerSeconds(30);
                  }}
                  aria-label="Reset timer"
                  className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <ExerciseDemoLinks
              title={activeRoutine.title}
              searchQuery={
                activeRoutine.kind === 'neck_set'
                  ? 'chin tucks light neck curls forehead press proper form'
                  : 'proper resting tongue posture nasal breathing gentle'
              }
              doseLabel={activeRoutine.kind === 'neck_set' ? '2 min · light effort' : '30 sec · relaxed'}
              compact
            />

            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleAction(activeRoutine, 'done')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold min-h-[36px]"
              >
                <Check className="w-3.5 h-3.5" /> Done (+10 XP)
              </button>
              <button
                type="button"
                onClick={() => handleAction(activeRoutine, 'snooze30')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-white/10 text-xs font-semibold min-h-[36px]"
              >
                <Clock className="w-3.5 h-3.5" /> Later (+30m)
              </button>
              <button
                type="button"
                onClick={() => handleAction(activeRoutine, 'later')}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/10 text-xs font-semibold min-h-[36px]"
              >
                Skip today
              </button>
            </div>
          </div>
        )}

        {/* Tabs: Due Now | Schedule & Rules */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-white/[0.04]">
          <button
            type="button"
            onClick={() => setTab('due')}
            className={`py-2 rounded-xl text-xs font-bold min-h-[40px] ${
              tab === 'due'
                ? 'bg-white dark:bg-[var(--accent)] text-slate-900 dark:text-[var(--accent-contrast)] shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Due Now ({dueReminders.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('schedule')}
            className={`py-2 rounded-xl text-xs font-bold min-h-[40px] ${
              tab === 'schedule'
                ? 'bg-white dark:bg-[var(--accent)] text-slate-900 dark:text-[var(--accent-contrast)] shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Schedule &amp; Rules
          </button>
        </div>

        {tab === 'due' ? (
          dueReminders.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm font-semibold">All caught up for now</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Quiet hours ({r.quietHoursStart ?? '23:00'}–{r.quietHoursEnd ?? '07:00'}), training window ({settings.trainingWindowStart ?? '18:00'}–{settings.trainingWindowEnd ?? '20:00'}),{settings.relaxedFridayMode ? ' Relaxed Friday,' : ''} and daily cap ({maxPerDay}/day) are active.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {dueReminders.map((item) => {
                const isMiniRoutineEligible = item.kind === 'mewing' || item.kind === 'neck_set';
                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {isMiniRoutineEligible ? (
                        <button
                          type="button"
                          onClick={() => openMiniRoutine(item)}
                          className="text-sm font-bold text-left hover:text-[var(--accent)] transition"
                        >
                          {item.title}
                        </button>
                      ) : (
                        <span className="text-sm font-bold">{item.title}</span>
                      )}
                      <span className="text-[11px] font-mono-num text-[var(--accent)]">{item.time}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{item.body}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleAction(item, 'done')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px]"
                      >
                        <Check className="w-3.5 h-3.5" /> Done
                      </button>
                      {isMiniRoutineEligible && (
                        <button
                          type="button"
                          onClick={() => openMiniRoutine(item)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold min-h-[36px]"
                        >
                          <Timer className="w-3.5 h-3.5" /> 30s routine
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAction(item, 'snooze30')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[36px]"
                      >
                        <Clock className="w-3.5 h-3.5" /> Later (+30m)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction(item, 'later')}
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[36px]"
                      >
                        Skip today
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="space-y-3 text-xs">
            {/* Master toggle */}
            <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 cursor-pointer min-h-[48px]">
              <span className="font-bold">Enable daily reminders</span>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => updateReminderPrefs({ enabled: e.target.checked })}
                className="w-5 h-5 accent-[var(--accent)]"
              />
            </label>

            {/* Mewing Check & Neck Set Reminders */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-bold block">Mewing check (3x/day default)</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Tongue on roof of mouth, lips closed, teeth slightly apart, nasal breathing
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={r.mewingCheckEnabled !== false}
                  onChange={(e) => updateReminderPrefs({ mewingCheckEnabled: e.target.checked })}
                  className="w-4 h-4 accent-[var(--accent)] shrink-0"
                />
              </div>
              {r.mewingCheckEnabled !== false && (
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((idx) => {
                    const arr = settings.tongueReminderTimes ?? ['11:00', '15:30', '20:00'];
                    const labels = ['Late morning', 'Afternoon', 'Evening'];
                    return (
                      <div key={idx}>
                        <label className="block text-[10px] text-slate-500 mb-0.5">{labels[idx]}</label>
                        <input
                          type="time"
                          value={arr[idx] ?? ''}
                          onChange={(e) => {
                            const next = [...arr];
                            next[idx] = e.target.value;
                            updateTopSettings({ tongueReminderTimes: next });
                          }}
                          className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-white/5 font-mono-num"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
                <div>
                  <span className="font-bold block">Neck set (1x/day default)</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Chin tucks, light neck curls, forehead press after training or evening
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="time"
                    value={r.neckSetTime ?? '19:30'}
                    onChange={(e) => updateReminderPrefs({ neckSetTime: e.target.value })}
                    className="px-2 py-1 rounded-lg bg-white dark:bg-white/5 font-mono-num"
                  />
                  <input
                    type="checkbox"
                    checked={r.neckSetEnabled !== false}
                    onChange={(e) => updateReminderPrefs({ neckSetEnabled: e.target.checked })}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                </div>
              </div>
            </div>

            {/* Core times */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Morning routine</label>
                <input
                  type="time"
                  value={r.morning}
                  onChange={(e) => updateReminderPrefs({ morning: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num min-h-[40px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Midday SPF</label>
                <input
                  type="time"
                  value={r.spf}
                  onChange={(e) => updateReminderPrefs({ spf: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num min-h-[40px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Training / movement</label>
                <input
                  type="time"
                  value={r.workout}
                  onChange={(e) => updateReminderPrefs({ workout: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num min-h-[40px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Sleep wind-down</label>
                <input
                  type="time"
                  value={r.sleep}
                  onChange={(e) => updateReminderPrefs({ sleep: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num min-h-[40px]"
                />
              </div>
            </div>

            {/* Water & Meals */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Hydration reminders (auto-skips near target)</span>
                <input
                  type="checkbox"
                  checked={Boolean(r.waterReminder)}
                  onChange={(e) => updateReminderPrefs({ waterReminder: e.target.checked })}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </div>
              {r.waterReminder && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">Interval:</span>
                  {[60, 90, 120, 180].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => updateReminderPrefs({ waterIntervalMin: min })}
                      className={`px-2.5 py-1 rounded-lg font-mono-num text-[11px] font-bold ${
                        (r.waterIntervalMin ?? 120) === min
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'bg-white dark:bg-white/5'
                      }`}
                    >
                      {min}m
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
                <span className="font-semibold">Meal log reminders (auto-skips after 3 meals)</span>
                <input
                  type="checkbox"
                  checked={Boolean(r.mealLogReminder)}
                  onChange={(e) => updateReminderPrefs({ mealLogReminder: e.target.checked })}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </div>
              {r.mealLogReminder && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Lunch check</label>
                    <input
                      type="time"
                      value={r.lunchTime ?? '13:30'}
                      onChange={(e) => updateReminderPrefs({ lunchTime: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-white/5 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Dinner check</label>
                    <input
                      type="time"
                      value={r.dinnerTime ?? '19:30'}
                      onChange={(e) => updateReminderPrefs({ dinnerTime: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-white/5 font-mono-num"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Face Exercises, Posture, Study, Photo & Height */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Face &amp; posture exercises</span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={r.exerciseTime ?? '18:00'}
                    onChange={(e) => updateReminderPrefs({ exerciseTime: e.target.value })}
                    className="px-2 py-1 rounded-lg bg-white dark:bg-white/5 font-mono-num"
                  />
                  <input
                    type="checkbox"
                    checked={Boolean(r.exerciseReminder)}
                    onChange={(e) => updateReminderPrefs({ exerciseReminder: e.target.checked })}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="font-semibold">Posture &amp; neck breaks</span>
                <input
                  type="checkbox"
                  checked={Boolean(r.postureBreakEnabled)}
                  onChange={(e) => updateReminderPrefs({ postureBreakEnabled: e.target.checked })}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </label>

              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Study / focus window</span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={r.studyReminderTime ?? '16:00'}
                    onChange={(e) => updateReminderPrefs({ studyReminderTime: e.target.value })}
                    className="px-2 py-1 rounded-lg bg-white dark:bg-white/5 font-mono-num"
                  />
                  <input
                    type="checkbox"
                    checked={Boolean(r.studyReminderEnabled)}
                    onChange={(e) => updateReminderPrefs({ studyReminderEnabled: e.target.checked })}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="font-semibold">Weekly baseline scan / photo check</span>
                <input
                  type="checkbox"
                  checked={r.weeklyPhotoEnabled !== false}
                  onChange={(e) => updateReminderPrefs({ weeklyPhotoEnabled: e.target.checked })}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </label>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="font-semibold">Monthly height measurement</span>
                <input
                  type="checkbox"
                  checked={r.monthlyHeightEnabled !== false}
                  onChange={(e) => updateReminderPrefs({ monthlyHeightEnabled: e.target.checked })}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </label>
            </div>

            {/* Training Window & Relaxed Friday */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2.5">
              <div>
                <p className="font-semibold">Training window (mute non-urgent alerts)</p>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Training start</label>
                    <input
                      type="time"
                      value={settings.trainingWindowStart ?? '18:00'}
                      onChange={(e) => updateTopSettings({ trainingWindowStart: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-white/5 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 mb-0.5">Training end</label>
                    <input
                      type="time"
                      value={settings.trainingWindowEnd ?? '20:00'}
                      onChange={(e) => updateTopSettings({ trainingWindowEnd: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-white/5 font-mono-num"
                    />
                  </div>
                </div>
              </div>

              <label className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-white/10 cursor-pointer">
                <div>
                  <span className="font-semibold block">Relaxed Friday &amp; holiday mode</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Mutes extra water/posture/study pings on Fridays
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.relaxedFridayMode)}
                  onChange={(e) => updateTopSettings({ relaxedFridayMode: e.target.checked })}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
              </label>
            </div>

            {/* Quiet Hours, Privacy Toggle & Max Per Day */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Quiet start</label>
                  <input
                    type="time"
                    value={r.quietHoursStart ?? '23:00'}
                    onChange={(e) => updateReminderPrefs({ quietHoursStart: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-white/5 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Quiet end</label>
                  <input
                    type="time"
                    value={r.quietHoursEnd ?? '07:00'}
                    onChange={(e) => updateReminderPrefs({ quietHoursEnd: e.target.value })}
                    className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-white/5 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Max / day</label>
                  <select
                    value={maxPerDay}
                    onChange={(e) =>
                      updateReminderPrefs({
                        maxPerDay: Math.max(1, Math.min(6, Number(e.target.value))),
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-white/5 font-mono-num"
                  >
                    {[2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} / day
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-white/10 cursor-pointer">
                <div>
                  <span className="font-semibold block">Show details in notifications</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Off by default — external alerts say &quot;Quick check-in&quot;; full friendly lines show inside the app
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(r.showDetailsInNotifications)}
                  onChange={(e) =>
                    updateReminderPrefs({ showDetailsInNotifications: e.target.checked })
                  }
                  className="w-4 h-4 accent-[var(--accent)] shrink-0"
                />
              </label>

              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                Private-safe by default: Quit habits never appear in any notification or calendar export.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
