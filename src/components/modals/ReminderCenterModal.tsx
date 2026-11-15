import React, { useMemo, useState } from 'react';
import {
  Bell,
  CalendarPlus,
  Check,
  Clock,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { db } from '../../db/database';
import { apiRequest } from '../../lib/api';
import {
  downloadRemindersIcs,
  getInAppDueReminders,
  getReminderDeliveryInfo,
  markReminderAction,
  requestReminderPermission,
  syncLocalNotifications,
} from '../../lib/notifications';
import { useToast } from '../ui/ToastProvider';
import type { AppSettings, DailyLog } from '../../types';

interface ReminderCenterModalProps {
  open: boolean;
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
  const [pushServerStatus, setPushServerStatus] = useState<string | null>(null);

  const delivery = useMemo(() => getReminderDeliveryInfo(), [tick]);

  const dueReminders = useMemo(
    () =>
      getInAppDueReminders(settings, lastScanDate, todayKey, {
        todayLog,
        waterTargetMl,
        todayMealsCount,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, lastScanDate, todayKey, todayLog, waterTargetMl, todayMealsCount, tick]
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

  const handleAction = (id: string, action: 'done' | 'snooze30' | 'later') => {
    markReminderAction(id, action, todayKey);
    setTick((t) => t + 1);
    showToast(
      action === 'done'
        ? 'Reminder marked done'
        : action === 'snooze30'
        ? 'Snoozed for 30 minutes'
        : 'Hidden until tomorrow'
    );
  };

  const handleRequestOsAlerts = async () => {
    const res = await requestReminderPermission();
    setTick((t) => t + 1);
    showToast(
      res === 'granted'
        ? 'OS notifications enabled'
        : 'Browser alerts blocked — use In-App banners + Calendar .ics export',
      res === 'granted' ? 'info' : 'warning'
    );
  };

  const handleCheckPushServer = async () => {
    const res = await apiRequest<{ pushConfigured?: boolean; fallback?: string }>('/api/push');
    if (res.ok) {
      setPushServerStatus(
        res.data.pushConfigured
          ? 'Server Web Push VAPID keys configured.'
          : 'Server Web Push keys not set — using local notifications + .ics calendar fallback.'
      );
    } else {
      setPushServerStatus(res.error);
    }
  };

  const r = settings.reminders;

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
                Quiet hours, daily cap, adaptive skip &amp; calendar export
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

        {/* Honest Delivery Status Badge */}
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
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {delivery.detail}
          </p>
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
          {pushServerStatus && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{pushServerStatus}</p>
          )}
        </div>

        {/* Tabs: Due Now | Schedule (12 toggles + quiet hours) */}
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
                Reminders respect your quiet hours ({r.quietHoursStart ?? '23:00'}–{r.quietHoursEnd ?? '07:00'}), daily cap ({r.maxPerDay ?? 6}), and auto-skip water/meals once done.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {dueReminders.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{item.title}</span>
                    <span className="text-[11px] font-mono-num text-[var(--accent)]">{item.time}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{item.body}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleAction(item.id, 'done')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px]"
                    >
                      <Check className="w-3.5 h-3.5" /> Done
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(item.id, 'snooze30')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[36px]"
                    >
                      <Clock className="w-3.5 h-3.5" /> Snooze 30m
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(item.id, 'later')}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[36px]"
                    >
                      Later today
                    </button>
                  </div>
                </div>
              ))}
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

            {/* Quiet Hours & Max Per Day */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2">
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
                    value={r.maxPerDay ?? 6}
                    onChange={(e) => updateReminderPrefs({ maxPerDay: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-white/5 font-mono-num"
                  >
                    {[3, 4, 5, 6, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} / day
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                Notifications use neutral &quot;Daily Check-In&quot; labels and never expose private habits.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
