import { addDays } from './date';
import { getRealLifeSettings } from './realLifeFood';
import type { AppSettings, DailyLog, ExerciseSessionLog, ToneMode } from '../types';

export interface DueReminder {
  id: string;
  title: string;
  body: string;
  time: string;
  kind?: 'mewing' | 'neck_set';
  category: 'routine' | 'hydration' | 'meals' | 'exercise' | 'sleep' | 'checkin' | 'prayer' | 'study';
}

export type ReminderDeliveryMode = 'capacitor' | 'web_push' | 'in_app_ics';

export interface ReminderDeliveryInfo {
  mode: ReminderDeliveryMode;
  label: string;
  detail: string;
}

interface SnoozeStore {
  dateKey: string;
  doneIds: string[];
  laterIds: string[];
  snoozedUntil: Record<string, number>;
}

const SNOOZE_KEY = 'ascend_reminder_state_v1';

export const MEWING_LINES: Record<ToneMode, string[]> = {
  normal: [
    'Quick tongue check: tongue up, lips closed, breathe through your nose.',
    'Rest the full tongue lightly on the roof of your mouth, teeth slightly apart.',
    'Reset your jaw: lips sealed, soft inhale through your nose, zero clenching.',
    'Gentle palate rest check — keep your face relaxed and shoulders dropped.',
    'Quiet nasal-breathing check: tongue resting up, jaw loose and comfortable.',
    'Two seconds of awareness: head stacked over shoulders, tongue resting gently up.',
    'Unclench your back teeth, close your lips lightly, and breathe smoothly.',
    'Easy posture check: tongue gently up on the palate, neck tall and relaxed.',
  ],
  chill: [
    'Tongue check, lock in.',
    'Quick reset: tongue up, lips shut, chill nasal breath.',
    'Unclench the jaw — light palate rest, smooth vibes.',
    'Reset check: tongue on the roof, shoulders loose, breathe easy.',
    'Lowkey posture win: teeth apart, lips closed, nasal flow.',
    'Tiny reset, big habits — tongue up, zero tension.',
    'Check the stack: chin neutral, tongue rested up, easy breathing.',
    '3-second form check: lips closed, jaw relaxed, keep rolling.',
  ],
  serious: [
    'Palate check: tongue lightly elevated, teeth slightly parted, nasal breath.',
    'Postural alignment check: seal lips cleanly and release masseter tension.',
    'Baseline check: full tongue contact on palate without pushing front teeth.',
    'Maintain quiet nasal breathing and neutral cervical posture.',
    'Relax the jaw, keep molars slightly separated, keep tongue resting high.',
    'Check form: upright head position, calm facial muscles, nasal airflow.',
    'Submental posture reset: light upward palate rest, zero forced clenching.',
    'Brief mid-day form check: tongue up, shoulders level, steady breathing.',
  ],
};

export const NECK_SET_LINES: Record<ToneMode, string[]> = {
  normal: [
    'Neck set time. 2 minutes, easy effort.',
    'Time for your neck set: chin tucks, light neck curls, and forehead press.',
    '2-minute frame check: glide the chin back smoothly and move with calm control.',
    'Quick posture boost — easy chin tucks and light hand-resisted neck work.',
    'Stand tall and give your neck 2 quiet minutes — zero heavy loading.',
    'Easy neck set ready: smooth reps, relaxed jaw, steady breathing.',
    'Short neck & chin-tuck break — feel clean length along the back of your neck.',
    'Knock out your 2-minute neck set whenever you have a spare moment.',
  ],
  chill: [
    "Neck set? 2 mins, let's go.",
    '2-minute neck set — chin tucks and light reps, super clean.',
    'Quick neck work: smooth chin tucks, forehead press, zero ego.',
    'Time for a fast neck & posture tune-up — takes 2 mins.',
    'Chin tucks + light neck curls — easy W for your side profile.',
    'Short neck set on deck — keep it smooth, never rush.',
    '2 minutes for a stronger frame — neck set when you are ready.',
    'Easy effort, clean reps — wrap up your neck set.',
  ],
  serious: [
    'Daily neck set: controlled chin tucks, light neck curls, forehead press.',
    '2-minute cervical session: prioritize posture form and zero joint strain.',
    'Complete your scheduled neck set with light controlled resistance.',
    'Execute slow chin tucks and balanced isometric holds — stop on discomfort.',
    'Cervical strength check: 2 minutes of steady postural repetitions.',
    'Perform your daily neck set at comfortable effort with relaxed jaw.',
    'Posture & neck session ready — slow tempo, controlled range.',
    'Finish your 1x daily neck set cleanly; bodyweight or light hand support only.',
  ],
};

export function getFriendlyReminderLine(
  kind: 'mewing' | 'neck_set',
  tone: ToneMode = 'normal',
  userName?: string,
  dateKey: string = '2026-01-01',
  slotIndex: number = 0
): string {
  const pool = kind === 'mewing' ? MEWING_LINES[tone] : NECK_SET_LINES[tone];
  const dateSeed = dateKey.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const line = pool[(dateSeed + slotIndex) % pool.length];
  const cleanName = (userName ?? '').trim();
  if (!cleanName) return line;
  return `${cleanName}, ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
}

export function computeNeckSetStreak(
  exerciseLogs: ExerciseSessionLog[],
  todayKey: string
): number {
  const dates = new Set(
    exerciseLogs.filter((l) => l.programId === 'reminder_neck_set').map((l) => l.date)
  );
  if (dates.size === 0) return 0;
  let cursor = dates.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    if (!dates.has(cursor)) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function computeMewingWeeklyCount(
  exerciseLogs: ExerciseSessionLog[],
  todayKey: string
): number {
  const weekStart = addDays(todayKey, -6);
  return exerciseLogs.filter(
    (l) => l.programId === 'reminder_mewing' && l.date >= weekStart && l.date <= todayKey
  ).length;
}

interface CapacitorLocalNotificationsPlugin {
  requestPermissions?: () => Promise<{ display: string }>;
  registerActionTypes?: (options: {
    types: Array<{
      id: string;
      actions: Array<{ id: string; title: string }>;
    }>;
  }) => Promise<void>;
  schedule?: (options: {
    notifications: Array<{
      id: number;
      title: string;
      body: string;
      actionTypeId?: string;
      extra?: Record<string, unknown>;
      schedule?: { on?: { hour: number; minute: number }; repeats?: boolean };
    }>;
  }) => Promise<void>;
  cancel?: (options: { notifications: Array<{ id: number }> }) => Promise<void>;
}

function getCapacitorLocalNotifications(): CapacitorLocalNotificationsPlugin | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    Capacitor?: { Plugins?: { LocalNotifications?: CapacitorLocalNotificationsPlugin } };
  };
  return w.Capacitor?.Plugins?.LocalNotifications ?? null;
}

export async function registerCapacitorFoodActions(): Promise<void> {
  const cap = getCapacitorLocalNotifications();
  if (!cap?.registerActionTypes) return;
  try {
    await cap.registerActionTypes({
      types: [
        {
          id: 'FOOD_QUICK_REPLY',
          actions: [
            { id: 'light', title: 'Light' },
            { id: 'normal', title: 'Normal' },
            { id: 'heavy', title: 'Heavy' },
            { id: 'very_heavy', title: 'Big event' },
          ],
        },
      ],
    });
  } catch {
    // Graceful no-op outside Capacitor native APK
  }
}

export function isCapacitorNativeAlertsAvailable(): boolean {
  return Boolean(getCapacitorLocalNotifications()?.schedule);
}

export function getReminderDeliveryInfo(serverPushConfigured?: boolean | null): ReminderDeliveryInfo {
  const cap = getCapacitorLocalNotifications();
  if (cap?.schedule) {
    return {
      mode: 'capacitor',
      label: 'Android APK Native Local Alerts',
      detail: 'Most reliable: runs offline directly through Capacitor Local Notifications with no server needed.',
    };
  }
  if (
    serverPushConfigured &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    return {
      mode: 'web_push',
      label: 'Web Push Enabled (Best-Effort)',
      detail: 'Works on installed Android Chrome (and iPhone only after Add to Home Screen). Delivery is not guaranteed and Vercel Hobby cron runs at most once a day.',
    };
  }
  return {
    mode: 'in_app_ics',
    label: 'In-App Banner + Calendar (.ics) Fallback',
    detail: 'Push is not set up. Use the Android app or the calendar file.',
  };
}

export function readReminderSnoozeState(todayKey: string): SnoozeStore {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY);
    if (!raw) return { dateKey: todayKey, doneIds: [], laterIds: [], snoozedUntil: {} };
    const parsed = JSON.parse(raw) as SnoozeStore;
    if (parsed.dateKey !== todayKey) {
      return { dateKey: todayKey, doneIds: [], laterIds: [], snoozedUntil: {} };
    }
    return {
      dateKey: todayKey,
      doneIds: Array.isArray(parsed.doneIds) ? parsed.doneIds : [],
      laterIds: Array.isArray(parsed.laterIds) ? parsed.laterIds : [],
      snoozedUntil: parsed.snoozedUntil && typeof parsed.snoozedUntil === 'object' ? parsed.snoozedUntil : {},
    };
  } catch {
    return { dateKey: todayKey, doneIds: [], laterIds: [], snoozedUntil: {} };
  }
}

function writeReminderSnoozeState(state: SnoozeStore): void {
  try {
    window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function markReminderAction(
  id: string,
  action: 'done' | 'snooze30' | 'later',
  todayKey: string
): void {
  const state = readReminderSnoozeState(todayKey);
  if (action === 'done') {
    if (!state.doneIds.includes(id)) state.doneIds.push(id);
  } else if (action === 'later') {
    if (!state.laterIds.includes(id)) state.laterIds.push(id);
  } else if (action === 'snooze30') {
    state.snoozedUntil[id] = Date.now() + 30 * 60_000;
  }
  writeReminderSnoozeState(state);
}

export async function requestReminderPermission(): Promise<'granted' | 'denied' | 'in-app'> {
  const cap = getCapacitorLocalNotifications();
  if (cap?.requestPermissions) {
    try {
      const res = await cap.requestPermissions();
      return res.display === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'in-app';
    }
  }
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'denied') {
    try {
      const res = await Notification.requestPermission();
      return res === 'granted' ? 'granted' : 'in-app';
    } catch {
      return 'in-app';
    }
  }
  return 'in-app';
}

function parseHm(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(':').map(Number);
  return { hour: isNaN(h) ? 8 : h, minute: isNaN(m) ? 0 : m };
}

function toMinutes(hhmm: string): number {
  const { hour, minute } = parseHm(hhmm);
  return hour * 60 + minute;
}

export function isWithinQuietHours(nowMin: number, startStr?: string, endStr?: string): boolean {
  if (!startStr || !endStr) return false;
  const start = toMinutes(startStr);
  const end = toMinutes(endStr);
  if (start === end) return false;
  if (start < end) {
    return nowMin >= start && nowMin < end;
  }
  return nowMin >= start || nowMin < end;
}

export async function syncLocalNotifications(
  settings: AppSettings,
  todayLog?: DailyLog | null
): Promise<void> {
  const cap = getCapacitorLocalNotifications();
  if (!cap?.schedule) return;

  const showDetails = Boolean(settings.reminders.showDetailsInNotifications);
  const safeTitle = (detailTitle: string) => (showDetails ? detailTitle : 'Quick check-in');
  const safeBody = (detailBody: string) =>
    showDetails ? detailBody : 'Open ASCEND for your check-in.';

  const isEventQuiet = Boolean(
    todayLog?.eventMode?.active &&
      (todayLog.eventMode.reminderQuietUntilMidnight !== false ||
        todayLog.eventMode.type === 'travel')
  );
  const realLife = getRealLifeSettings(settings);

  try {
    const ids = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111];
    if (cap.cancel) {
      await cap.cancel({ notifications: ids.map((id) => ({ id })) });
    }
    if (!settings.reminders.enabled) return;

    await registerCapacitorFoodActions();

    const notifications: Array<{
      id: number;
      title: string;
      body: string;
      actionTypeId?: string;
      extra?: Record<string, unknown>;
      schedule: { on: { hour: number; minute: number }; repeats: boolean };
    }> = [];

    if (!isEventQuiet && settings.reminders.mewingCheckEnabled !== false) {
      const mewingTimes = (settings.tongueReminderTimes ?? ['11:00', '15:30', '20:00'])
        .filter(Boolean)
        .slice(0, 3);
      mewingTimes.forEach((time, idx) => {
        notifications.push({
          id: 107 + idx,
          title: safeTitle('ASCEND: Mewing check'),
          body: safeBody('Tongue up on the palate, lips closed, teeth apart, nasal breath.'),
          schedule: { on: parseHm(time), repeats: true },
        });
      });
    }

    if (!isEventQuiet && settings.reminders.neckSetEnabled !== false) {
      notifications.push({
        id: 110,
        title: safeTitle('ASCEND: Neck set'),
        body: safeBody('2 minutes: chin tucks, light neck curls, forehead press.'),
        schedule: { on: parseHm(settings.reminders.neckSetTime ?? '19:30'), repeats: true },
      });
    }

    if (!isEventQuiet) {
      notifications.push(
        {
          id: 101,
          title: safeTitle('ASCEND Morning Routine'),
          body: safeBody('Cleanse, hydrate, and start your daily check-in.'),
          schedule: { on: parseHm(settings.reminders.morning), repeats: true },
        },
        {
          id: 102,
          title: safeTitle('SPF Check'),
          body: safeBody('Reapply SPF 30–50 if spending time outdoors.'),
          schedule: { on: parseHm(settings.reminders.spf), repeats: true },
        },
        {
          id: 103,
          title: safeTitle('Movement Window'),
          body: safeBody('Log your workout, steps, or face/posture exercises.'),
          schedule: { on: parseHm(settings.reminders.workout), repeats: true },
        },
        {
          id: 104,
          title: safeTitle('Sleep Wind-Down'),
          body: safeBody('Dim screens and wind down for recovery.'),
          schedule: { on: parseHm(settings.reminders.sleep), repeats: true },
        }
      );

      if (settings.reminders.exerciseReminder && settings.reminders.exerciseTime) {
        notifications.push({
          id: 105,
          title: safeTitle('Face & Posture'),
          body: safeBody('3-minute gentle jawline release and posture reset.'),
          schedule: { on: parseHm(settings.reminders.exerciseTime), repeats: true },
        });
      }
      if (settings.reminders.studyReminderEnabled && settings.reminders.studyReminderTime) {
        notifications.push({
          id: 106,
          title: safeTitle('Focus Block'),
          body: safeBody('Short focused session ready in Plan.'),
          schedule: { on: parseHm(settings.reminders.studyReminderTime), repeats: true },
        });
      }
      if (realLife.dailyOneQuestionEnabled && realLife.foodReminderMode !== 'off') {
        notifications.push({
          id: 111,
          title: safeTitle('Quick one: how was eating today?'),
          body: safeBody('Tap Light, Normal, Heavy, or Big event — 1 tap.'),
          actionTypeId: 'FOOD_QUICK_REPLY',
          extra: { quickReply: 'food' },
          schedule: {
            on: parseHm(realLife.dailyOneQuestionTime || '21:00'),
            repeats: true,
          },
        });
      }
    }

    const capLimit = Math.max(1, Math.min(6, settings.reminders.maxPerDay ?? 6));
    if (notifications.length > 0) {
      await cap.schedule({ notifications: notifications.slice(0, capLimit) });
    }
  } catch {
    // Graceful fallback to in-app reminders
  }
}

export function getInAppDueReminders(
  settings: AppSettings,
  lastScanDate: string | null,
  todayKey: string,
  adaptiveContext?: {
    todayLog?: DailyLog;
    waterTargetMl?: number;
    todayMealsCount?: number;
    userName?: string;
  }
): DueReminder[] {
  if (!settings.reminders.enabled) return [];

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (
    isWithinQuietHours(
      nowMin,
      settings.reminders.quietHoursStart ?? '23:00',
      settings.reminders.quietHoursEnd ?? '07:00'
    )
  ) {
    return [];
  }

  if (
    settings.trainingWindowStart &&
    settings.trainingWindowEnd &&
    isWithinQuietHours(nowMin, settings.trainingWindowStart, settings.trainingWindowEnd)
  ) {
    return [];
  }

  const isRelaxedFriday = Boolean(settings.relaxedFridayMode && now.getDay() === 5);
  const isEventQuiet = Boolean(
    adaptiveContext?.todayLog?.eventMode?.active &&
      (adaptiveContext.todayLog.eventMode.reminderQuietUntilMidnight !== false ||
        adaptiveContext.todayLog.eventMode.type === 'travel')
  );
  const realLife = getRealLifeSettings(settings);
  const tone = settings.tone ?? 'normal';
  const userName = adaptiveContext?.userName;

  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const snoozeState = typeof window !== 'undefined'
    ? readReminderSnoozeState(todayKey)
    : { dateKey: todayKey, doneIds: [], laterIds: [], snoozedUntil: {} };
  const due: DueReminder[] = [];

  const pushIfActive = (item: DueReminder) => {
    if (isEventQuiet) {
      if (item.category === 'meals' || item.category === 'routine' || item.category === 'study' || item.category === 'exercise') {
        return;
      }
    }
    if (
      isRelaxedFriday &&
      ['water', 'posture-break', 'study'].includes(item.id)
    ) {
      return;
    }
    if (snoozeState.doneIds.includes(item.id) || snoozeState.laterIds.includes(item.id)) return;
    const until = snoozeState.snoozedUntil[item.id];
    if (until && Date.now() < until) return;
    due.push(item);
  };

  if (settings.reminders.mewingCheckEnabled !== false) {
    const tongueTimes = (settings.tongueReminderTimes ?? ['11:00', '15:30', '20:00']).filter(Boolean);
    tongueTimes.forEach((t, idx) => {
      if (hhmm >= t) {
        pushIfActive({
          id: `tongue-${idx}`,
          kind: 'mewing',
          title: 'Mewing check',
          body: getFriendlyReminderLine('mewing', tone, userName, todayKey, idx),
          time: t,
          category: 'checkin',
        });
      }
    });
  }

  if (settings.reminders.neckSetEnabled !== false) {
    const neckTime = settings.reminders.neckSetTime ?? '19:30';
    if (hhmm >= neckTime && hhmm < '23:00') {
      pushIfActive({
        id: 'neck-set',
        kind: 'neck_set',
        title: 'Neck set',
        body: getFriendlyReminderLine('neck_set', tone, userName, todayKey, 0),
        time: neckTime,
        category: 'exercise',
      });
    }
  }

  if (hhmm >= settings.reminders.morning && hhmm < '12:00') {
    pushIfActive({
      id: 'am',
      title: 'Morning Routine Window',
      body: 'Complete AM cleanse, moisturizer, SPF, and daylight.',
      time: settings.reminders.morning,
      category: 'routine',
    });
  }

  if (hhmm >= settings.reminders.spf && hhmm < '16:30') {
    pushIfActive({
      id: 'spf',
      title: 'Midday SPF Check',
      body: 'Reapply SPF if exposed to daylight or windows.',
      time: settings.reminders.spf,
      category: 'routine',
    });
  }

  const waterTarget = adaptiveContext?.waterTargetMl ?? 3000;
  const waterDone = (adaptiveContext?.todayLog?.waterMl ?? 0) >= waterTarget * 0.85;
  if (settings.reminders.waterReminder && !waterDone && hhmm >= '09:00' && hhmm < '21:00') {
    pushIfActive({
      id: 'water',
      title: 'Hydration Check',
      body: `Stay steady toward ${(waterTarget / 1000).toFixed(1)}L daily water.`,
      time: `Every ${settings.reminders.waterIntervalMin ?? 120}m`,
      category: 'hydration',
    });
  }

  const mealsCount = adaptiveContext?.todayMealsCount ?? 0;
  const alreadyAskedFoodToday = Boolean(
    settings.dailyCheckinAskedDates?.[todayKey] ||
      settings.skippedGapCheckinDates?.includes(todayKey)
  );
  if (!isEventQuiet && !alreadyAskedFoodToday && realLife.foodReminderMode !== 'off') {
    if (realLife.foodReminderMode === 'mealtime_nudges' && settings.reminders.mealLogReminder && mealsCount < 3) {
      const lunch = settings.reminders.lunchTime ?? '13:30';
      const dinner = settings.reminders.dinnerTime ?? '19:30';
      if (hhmm >= lunch && hhmm < '16:30' && mealsCount < 2) {
        pushIfActive({
          id: 'meal-lunch',
          title: 'Log Midday Meal',
          body: 'Quick add or scan your lunch so protein stays on track.',
          time: lunch,
          category: 'meals',
        });
      } else if (hhmm >= dinner && hhmm < '22:00') {
        pushIfActive({
          id: 'meal-dinner',
          title: 'Log Evening Meal',
          body: 'Keep sodium gentle in the evening to reduce morning puffiness.',
          time: dinner,
          category: 'meals',
        });
      }
    } else if (
      realLife.foodReminderMode === 'if_empty_by_time' &&
      mealsCount === 0 &&
      hhmm >= (realLife.foodReminderEmptyTime || '20:00') &&
      hhmm < '23:00'
    ) {
      pushIfActive({
        id: 'meal-empty-check',
        title: realLife.dailyOneQuestionEnabled
          ? 'Quick one: how was eating today?'
          : 'Log food when ready',
        body: 'Tap once for Light/Normal/Heavy, Event, or Skip — gaps never break your streak.',
        time: realLife.foodReminderEmptyTime || '20:00',
        category: 'meals',
      });
    }
  }

  if (hhmm >= settings.reminders.workout && hhmm < '21:00') {
    pushIfActive({
      id: 'workout',
      title: 'Movement & Training',
      body: 'Log your workout sets or daily step goal.',
      time: settings.reminders.workout,
      category: 'exercise',
    });
  }

  if (settings.reminders.exerciseReminder && settings.reminders.exerciseTime && hhmm >= settings.reminders.exerciseTime && hhmm < '22:00') {
    pushIfActive({
      id: 'exercise-face',
      title: 'Face & Posture Exercises',
      body: 'Open Face Exercises or Grow posture flow (3–5 min).',
      time: settings.reminders.exerciseTime,
      category: 'exercise',
    });
  }

  if (settings.reminders.postureBreakEnabled && hhmm >= '11:00' && hhmm < '20:00') {
    pushIfActive({
      id: 'posture-break',
      title: 'Posture & Neck Break',
      body: 'Drop shoulders, chin slightly tucked, relax jaw.',
      time: 'Midday check',
      category: 'exercise',
    });
  }

  if (settings.reminders.studyReminderEnabled && settings.reminders.studyReminderTime && hhmm >= settings.reminders.studyReminderTime && hhmm < '22:00') {
    pushIfActive({
      id: 'study',
      title: 'Focus & Study Window',
      body: 'One clean 25–45 minute focus block without distractions.',
      time: settings.reminders.studyReminderTime,
      category: 'study',
    });
  }

  if (hhmm >= settings.reminders.sleep || hhmm < '03:00') {
    pushIfActive({
      id: 'sleep',
      title: 'Sleep Wind-Down',
      body: 'Dim lights and prepare for your fixed sleep anchor.',
      time: settings.reminders.sleep,
      category: 'sleep',
    });
  }

  if (settings.prayerTrackingEnabled && settings.prayerTimes) {
    const labels = [
      { key: 'fajr' as const, title: 'Fajr Prayer Check-In' },
      { key: 'dhuhr' as const, title: 'Dhuhr Prayer Check-In' },
      { key: 'asr' as const, title: 'Asr Prayer Check-In' },
      { key: 'maghrib' as const, title: 'Maghrib Prayer Check-In' },
      { key: 'isha' as const, title: 'Isha Prayer Check-In' },
    ];
    for (const p of labels) {
      const t = settings.prayerTimes[p.key];
      if (t && hhmm >= t) {
        pushIfActive({
          id: `prayer-${p.key}`,
          title: p.title,
          body: 'Optional quiet moment — tap on Plan if completed.',
          time: t,
          category: 'prayer',
        });
      }
    }
  }

  if (settings.reminders.weeklyPhotoEnabled !== false && lastScanDate) {
    const diffMs = new Date(todayKey).getTime() - new Date(lastScanDate).getTime();
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays >= settings.reminders.rescanDays) {
      pushIfActive({
        id: 'rescan',
        title: 'Daily Check-In: Baseline Scan Ready',
        body: `It has been ${diffDays} days since your last face scan in same light.`,
        time: `Every ${settings.reminders.rescanDays}d`,
        category: 'checkin',
      });
    }
  }

  const maxCap = Math.max(1, Math.min(6, settings.reminders.maxPerDay ?? 6));
  return due.slice(0, maxCap);
}

/**
 * Generates an RFC 5545 .ics calendar file containing recurring daily events
 * with 5-minute alarms so reminders ring reliably on iOS/Android calendars offline.
 * Keeps external summaries private-safe by default ("Quick check-in" / "Gentle Posture Check-In")
 * unless showDetailsInNotifications is enabled, and never writes Quit habit topics.
 */
export function generateRemindersIcs(settings: AppSettings): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const dateStamp = `${y}${m}${d}`;
  const showDetails = Boolean(settings.reminders.showDetailsInNotifications);

  const events: Array<{ uid: string; summary: string; desc: string; time: string; freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' }> = [
    {
      uid: 'ascend-morning',
      summary: showDetails ? 'ASCEND: Morning Routine & Water' : 'ASCEND: Quick check-in (Morning)',
      desc: showDetails ? 'Cleanse, moisturize, SPF, and drink a glass of water.' : 'Open ASCEND for your daily check-in.',
      time: settings.reminders.morning,
      freq: 'DAILY',
    },
    {
      uid: 'ascend-spf',
      summary: showDetails ? 'ASCEND: Midday SPF Check' : 'ASCEND: Quick check-in (Midday)',
      desc: showDetails ? 'Reapply SPF 30-50 if outdoors.' : 'Open ASCEND for your daily check-in.',
      time: settings.reminders.spf,
      freq: 'DAILY',
    },
    {
      uid: 'ascend-workout',
      summary: showDetails ? 'ASCEND: Movement & Training' : 'ASCEND: Quick check-in (Training)',
      desc: showDetails ? 'Training session or daily steps.' : 'Open ASCEND for your daily check-in.',
      time: settings.reminders.workout,
      freq: 'DAILY',
    },
    {
      uid: 'ascend-sleep',
      summary: showDetails ? 'ASCEND: Sleep Wind-Down' : 'ASCEND: Quick check-in (Evening)',
      desc: showDetails ? 'Dim screens for 8h+ recovery.' : 'Open ASCEND for your daily check-in.',
      time: settings.reminders.sleep,
      freq: 'DAILY',
    },
  ];

  if (settings.reminders.mewingCheckEnabled !== false) {
    const tongueTimes = (settings.tongueReminderTimes ?? ['11:00', '15:30', '20:00'])
      .filter(Boolean)
      .slice(0, 3);
    tongueTimes.forEach((time, idx) => {
      events.push({
        uid: `ascend-posture-check-${idx + 1}`,
        summary: 'ASCEND: Gentle Posture Check-In',
        desc: showDetails
          ? 'Mewing check: tongue on palate, lips closed, teeth slightly apart, nasal breathing.'
          : 'Quick check-in in ASCEND.',
        time,
        freq: 'DAILY',
      });
    });
  }

  if (settings.reminders.neckSetEnabled !== false) {
    events.push({
      uid: 'ascend-neck-set',
      summary: showDetails ? 'ASCEND: Neck set (2 min)' : 'ASCEND: Quick check-in (Neck)',
      desc: showDetails
        ? 'Chin tucks, light neck curls, forehead press — easy controlled effort.'
        : 'Quick check-in in ASCEND.',
      time: settings.reminders.neckSetTime ?? '19:30',
      freq: 'DAILY',
    });
  }

  if (settings.reminders.exerciseReminder && settings.reminders.exerciseTime) {
    events.push({
      uid: 'ascend-face-exercise',
      summary: showDetails ? 'ASCEND: Daily Check-In (Exercises)' : 'ASCEND: Quick check-in',
      desc: showDetails ? 'Gentle face & posture session.' : 'Open ASCEND for your check-in.',
      time: settings.reminders.exerciseTime,
      freq: 'DAILY',
    });
  }
  if (settings.reminders.studyReminderEnabled && settings.reminders.studyReminderTime) {
    events.push({
      uid: 'ascend-study',
      summary: showDetails ? 'ASCEND: Focus Block' : 'ASCEND: Quick check-in',
      desc: showDetails ? 'Dedicated study or skill session.' : 'Open ASCEND for your check-in.',
      time: settings.reminders.studyReminderTime,
      freq: 'DAILY',
    });
  }
  if (settings.reminders.weeklyPhotoEnabled !== false) {
    events.push({
      uid: 'ascend-weekly-photo',
      summary: 'ASCEND: Weekly Check-In Photo',
      desc: 'Same lighting & distance.',
      time: '10:00',
      freq: 'WEEKLY',
    });
  }
  if (settings.reminders.monthlyHeightEnabled !== false) {
    events.push({
      uid: 'ascend-monthly-height',
      summary: 'ASCEND: Monthly Morning Height Check',
      desc: 'Barefoot against wall at morning hour.',
      time: '08:00',
      freq: 'MONTHLY',
    });
  }

  if (settings.prayerTrackingEnabled && settings.prayerTimes) {
    (['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).forEach((key) => {
      const t = settings.prayerTimes?.[key];
      if (t) {
        events.push({
          uid: `ascend-prayer-${key}`,
          summary: `ASCEND: ${key.charAt(0).toUpperCase() + key.slice(1)} Quiet Check-In`,
          desc: 'Optional quiet reflection check-in.',
          time: t,
          freq: 'DAILY',
        });
      }
    });
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ASCEND//Habit & Looks Care Reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const ev of events) {
    const { hour, minute } = parseHm(ev.time);
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    const endMin = (hour * 60 + minute + 10) % (24 * 60);
    const eh = String(Math.floor(endMin / 60)).padStart(2, '0');
    const em = String(endMin % 60).padStart(2, '0');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}@ascend.local`,
      `DTSTAMP:${dateStamp}T000000`,
      `DTSTART:${dateStamp}T${hh}${mm}00`,
      `DTEND:${dateStamp}T${eh}${em}00`,
      `RRULE:FREQ=${ev.freq}`,
      `SUMMARY:${ev.summary}`,
      `DESCRIPTION:${ev.desc}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT5M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${ev.summary}`,
      'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadRemindersIcs(settings: AppSettings): void {
  const ics = generateRemindersIcs(settings);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ascend-reminders.ics';
  a.click();
  URL.revokeObjectURL(url);
}
