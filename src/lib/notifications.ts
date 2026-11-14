import type { AppSettings } from '../types';

export interface DueReminder {
  id: string;
  title: string;
  body: string;
  time: string;
}

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
  const w = window as unknown as {
    Capacitor?: { Plugins?: { LocalNotifications?: CapacitorLocalNotificationsPlugin } };
  };
  return w.Capacitor?.Plugins?.LocalNotifications ?? null;
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
  if ('Notification' in window && Notification.permission !== 'denied') {
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

export async function syncLocalNotifications(settings: AppSettings): Promise<void> {
  const cap = getCapacitorLocalNotifications();
  if (!cap?.schedule) return;

  try {
    if (cap.cancel) {
      await cap.cancel({ notifications: [{ id: 101 }, { id: 102 }, { id: 103 }, { id: 104 }] });
    }
    if (!settings.reminders.enabled) return;

    const m = parseHm(settings.reminders.morning);
    const spf = parseHm(settings.reminders.spf);
    const w = parseHm(settings.reminders.workout);
    const s = parseHm(settings.reminders.sleep);

    await cap.schedule({
      notifications: [
        { id: 101, title: 'ASCEND Morning Protocol', body: 'Start your AM routine and daylight check.', schedule: { on: m, repeats: true } },
        { id: 102, title: 'SPF Reapply Reminder', body: 'Reapply broad-spectrum SPF 30–50 if outdoors.', schedule: { on: spf, repeats: true } },
        { id: 103, title: 'Training Window', body: 'Log your workout or mobility block today.', schedule: { on: w, repeats: true } },
        { id: 104, title: 'Sleep Wind-Down', body: 'Dim lights and put screens away for recovery.', schedule: { on: s, repeats: true } },
      ],
    });
  } catch {
    // Graceful fallback to in-app reminders
  }
}

export function getInAppDueReminders(settings: AppSettings, lastScanDate: string | null, todayKey: string): DueReminder[] {
  if (!settings.reminders.enabled) return [];
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const due: DueReminder[] = [];

  if (hhmm >= settings.reminders.morning && hhmm < '12:00') {
    due.push({ id: 'am', title: 'Morning Routine Window', body: 'Complete AM cleanse, moisturizer, SPF, and daylight.', time: settings.reminders.morning });
  }
  if (hhmm >= settings.reminders.spf && hhmm < '16:30') {
    due.push({ id: 'spf', title: 'Midday SPF Check', body: 'Reapply SPF if exposed to daylight or windows.', time: settings.reminders.spf });
  }
  if (hhmm >= settings.reminders.workout && hhmm < '21:00') {
    due.push({ id: 'workout', title: 'Movement & Training', body: 'Log your workout sets or daily step goal.', time: settings.reminders.workout });
  }
  if (hhmm >= settings.reminders.sleep || hhmm < '03:00') {
    due.push({ id: 'sleep', title: 'Sleep Wind-Down', body: 'Dim lights and prepare for your fixed sleep anchor.', time: settings.reminders.sleep });
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
        due.push({
          id: `prayer-${p.key}`,
          title: p.title,
          body: 'Optional quiet moment — tap on Dashboard if completed.',
          time: t,
        });
      }
    }
  }

  const tongueTimes = (settings.tongueReminderTimes ?? []).filter(Boolean);
  tongueTimes.forEach((t, idx) => {
    if (hhmm >= t) {
      due.push({
        id: `tongue-${idx}`,
        title: 'Gentle Tongue Posture Check',
        body: 'Lips closed, tongue lightly on palate, teeth apart, zero clenching.',
        time: t,
      });
    }
  });

  if (lastScanDate) {
    const diffMs = new Date(todayKey).getTime() - new Date(lastScanDate).getTime();
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays >= settings.reminders.rescanDays) {
      due.push({
        id: 'rescan',
        title: '14-Day PSL LAB Check-In Due',
        body: `It has been ${diffDays} days since your last baseline scan.`,
        time: 'Every 14d',
      });
    }
  }

  return due;
}
