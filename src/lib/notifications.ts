import type { AppSettings, DailyLog } from '../types';

export interface DueReminder {
  id: string;
  title: string;
  body: string;
  time: string;
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

interface CapacitorLocalNotificationsPlugin {
  requestPermissions?: () => Promise<{ display: string }>;
  schedule?: (options: {
    notifications: Array<{
      id: number;
      title: string;
      body: string;
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

export function getReminderDeliveryInfo(): ReminderDeliveryInfo {
  const cap = getCapacitorLocalNotifications();
  if (cap?.schedule) {
    return {
      mode: 'capacitor',
      label: 'Capacitor Native Local Alerts',
      detail: 'Scheduled directly through Android/iOS native notification system — works offline.',
    };
  }
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    return {
      mode: 'web_push',
      label: 'Browser Notification + In-App Banners',
      detail: 'OS alerts allowed while browser/PWA is active; export .ics calendar for guaranteed lock-screen chimes.',
    };
  }
  return {
    mode: 'in_app_ics',
    label: 'In-App Banners + Calendar (.ics)',
    detail: 'Always works offline with zero permissions. Export the .ics file to sync alarms with Apple/Google Calendar.',
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
  // Overnight quiet hours e.g. 23:00 to 07:00
  return nowMin >= start || nowMin < end;
}

export async function syncLocalNotifications(settings: AppSettings): Promise<void> {
  const cap = getCapacitorLocalNotifications();
  if (!cap?.schedule) return;

  try {
    const ids = [101, 102, 103, 104, 105, 106, 107];
    if (cap.cancel) {
      await cap.cancel({ notifications: ids.map((id) => ({ id })) });
    }
    if (!settings.reminders.enabled) return;

    const notifications: Array<{
      id: number;
      title: string;
      body: string;
      schedule: { on: { hour: number; minute: number }; repeats: boolean };
    }> = [
      {
        id: 101,
        title: 'ASCEND Morning Routine',
        body: 'Cleanse, hydrate, and start your daily check-in.',
        schedule: { on: parseHm(settings.reminders.morning), repeats: true },
      },
      {
        id: 102,
        title: 'SPF Check',
        body: 'Reapply SPF 30–50 if spending time outdoors.',
        schedule: { on: parseHm(settings.reminders.spf), repeats: true },
      },
      {
        id: 103,
        title: 'Movement Window',
        body: 'Log your workout, steps, or face/posture exercises.',
        schedule: { on: parseHm(settings.reminders.workout), repeats: true },
      },
      {
        id: 104,
        title: 'Sleep Wind-Down',
        body: 'Dim screens and wind down for recovery.',
        schedule: { on: parseHm(settings.reminders.sleep), repeats: true },
      },
    ];

    if (settings.reminders.exerciseReminder && settings.reminders.exerciseTime) {
      notifications.push({
        id: 105,
        title: 'Daily Check-In: Face & Posture',
        body: '3-minute gentle jawline release and posture reset.',
        schedule: { on: parseHm(settings.reminders.exerciseTime), repeats: true },
      });
    }
    if (settings.reminders.studyReminderEnabled && settings.reminders.studyReminderTime) {
      notifications.push({
        id: 106,
        title: 'Focus Block',
        body: 'Short focused session ready in Plan.',
        schedule: { on: parseHm(settings.reminders.studyReminderTime), repeats: true },
      });
    }

    const capLimit = Math.max(1, Math.min(8, settings.reminders.maxPerDay ?? 6));
    await cap.schedule({ notifications: notifications.slice(0, capLimit) });
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

  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const snoozeState = typeof window !== 'undefined'
    ? readReminderSnoozeState(todayKey)
    : { dateKey: todayKey, doneIds: [], laterIds: [], snoozedUntil: {} };
  const due: DueReminder[] = [];

  const pushIfActive = (item: DueReminder) => {
    if (snoozeState.doneIds.includes(item.id) || snoozeState.laterIds.includes(item.id)) return;
    const until = snoozeState.snoozedUntil[item.id];
    if (until && Date.now() < until) return;
    due.push(item);
  };

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

  // Adaptive water check: skip if target already hit
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

  // Adaptive meal reminder: skip if 3+ meals already logged today
  const mealsCount = adaptiveContext?.todayMealsCount ?? 0;
  if (settings.reminders.mealLogReminder && mealsCount < 3) {
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

  const tongueTimes = (settings.tongueReminderTimes ?? []).filter(Boolean);
  tongueTimes.forEach((t, idx) => {
    if (hhmm >= t) {
      pushIfActive({
        id: `tongue-${idx}`,
        title: 'Daily Check-In: Gentle Posture',
        body: 'Lips closed, light palate rest, teeth apart, zero clenching.',
        time: t,
        category: 'checkin',
      });
    }
  });

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

  const maxCap = Math.max(1, Math.min(12, settings.reminders.maxPerDay ?? 6));
  return due.slice(0, maxCap);
}

/**
 * Generates an RFC 5545 .ics calendar file containing recurring daily events
 * with 5-minute alarms so reminders ring reliably on iOS/Android calendars offline.
 * Never includes any private Quit habit names.
 */
export function generateRemindersIcs(settings: AppSettings): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const dateStamp = `${y}${m}${d}`;

  const events: Array<{ uid: string; summary: string; desc: string; time: string; freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' }> = [
    {
      uid: 'ascend-morning',
      summary: 'ASCEND: Morning Routine & Water',
      desc: 'Cleanse, moisturize, SPF, and drink a glass of water.',
      time: settings.reminders.morning,
      freq: 'DAILY',
    },
    {
      uid: 'ascend-spf',
      summary: 'ASCEND: Midday SPF Check',
      desc: 'Reapply SPF 30-50 if outdoors.',
      time: settings.reminders.spf,
      freq: 'DAILY',
    },
    {
      uid: 'ascend-workout',
      summary: 'ASCEND: Movement & Training',
      desc: 'Training session or daily steps.',
      time: settings.reminders.workout,
      freq: 'DAILY',
    },
    {
      uid: 'ascend-sleep',
      summary: 'ASCEND: Sleep Wind-Down',
      desc: 'Dim screens for 8h+ recovery.',
      time: settings.reminders.sleep,
      freq: 'DAILY',
    },
  ];

  if (settings.reminders.exerciseReminder && settings.reminders.exerciseTime) {
    events.push({
      uid: 'ascend-face-exercise',
      summary: 'ASCEND: Daily Check-In (Exercises)',
      desc: 'Gentle face & posture session.',
      time: settings.reminders.exerciseTime,
      freq: 'DAILY',
    });
  }
  if (settings.reminders.studyReminderEnabled && settings.reminders.studyReminderTime) {
    events.push({
      uid: 'ascend-study',
      summary: 'ASCEND: Focus Block',
      desc: 'Dedicated study or skill session.',
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
