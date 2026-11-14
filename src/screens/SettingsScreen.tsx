import React, { useEffect, useState } from 'react';
import {
  Download,
  Upload,
  Lock,
  Trash2,
  Sun,
  Moon,
  Bell,
  Smartphone,
  Info,
} from 'lucide-react';
import {
  db,
  exportAllDataJson,
  importAllDataJson,
  regenerateProtocolFromProfile,
  wipeAllData,
} from '../db/database';
import { decryptBackupJson, encryptBackupJson, sha256Hex } from '../lib/crypto';
import { requestReminderPermission, syncLocalNotifications } from '../lib/notifications';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type {
  AccentPreset,
  AppSettings,
  FocusAreaId,
  MindSubGoalId,
  PrayerKey,
  UserProfile,
} from '../types';
import { useToast } from '../components/ui/ToastProvider';

const FOCUS_AREA_OPTIONS: Array<{ id: FocusAreaId; label: string }> = [
  { id: 'face', label: 'Face' },
  { id: 'body', label: 'Body' },
  { id: 'mind', label: 'Mind' },
];

const MIND_SUBGOAL_OPTIONS: Array<{ id: MindSubGoalId; label: string }> = [
  { id: 'study', label: 'Study' },
  { id: 'programming', label: 'Learn programming' },
  { id: 'calm', label: 'Calm/focus' },
];

const PRAYER_LIST: Array<{ key: PrayerKey; label: string }> = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'dhuhr', label: 'Dhuhr' },
  { key: 'asr', label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha', label: 'Isha' },
];

interface SettingsScreenProps {
  profile: UserProfile;
  settings: AppSettings;
  onOpenOnboarding: () => void;
}

const ACCENT_PRESETS: Array<{ id: AccentPreset; label: string; swatch: string }> = [
  { id: 'mint', label: 'Obsidian Emerald', swatch: '#10B981' },
  { id: 'sky', label: 'Slate Cyan', swatch: '#38BDF8' },
  { id: 'violet', label: 'Muted Violet', swatch: '#A78BFA' },
  { id: 'amber', label: 'Warm Gold', swatch: '#FBBF24' },
];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  profile,
  settings,
  onOpenOnboarding,
}) => {
  const { showToast } = useToast();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const [pinInput, setPinInput] = useState('');
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [pendingEncryptedText, setPendingEncryptedText] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [storageCounts, setStorageCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      db.taskCompletions.count(),
      db.dailyLogs.count(),
      db.scans.count(),
      db.workouts.count(),
      db.skinEntries.count(),
      db.products.count(),
    ]).then(([completions, logs, scans, workouts, skin, products]) => {
      setStorageCounts({ completions, logs, scans, workouts, skin, products });
    });
  }, []);

  const updateSettings = async (patch: Partial<AppSettings>, rebuildTasks = false) => {
    const next = { ...settings, ...patch };
    await db.settings.put(next);
    await syncLocalNotifications(next);
    if (rebuildTasks) {
      await regenerateProtocolFromProfile(profile);
    }
  };

  const activeFocusAreas: FocusAreaId[] =
    profile.focusAreas && profile.focusAreas.length > 0 ? profile.focusAreas : ['face', 'body'];
  const activeMindSubGoals: MindSubGoalId[] = profile.mindSubGoals ?? [];

  const handleToggleFocusArea = async (id: FocusAreaId) => {
    const exists = activeFocusAreas.includes(id);
    if (exists && activeFocusAreas.length <= 1) {
      showToast('Keep at least one focus area selected', 'info');
      return;
    }
    const nextFocus = exists
      ? activeFocusAreas.filter((x) => x !== id)
      : [...activeFocusAreas, id];
    const updated: UserProfile = {
      ...profile,
      focusAreas: nextFocus,
      updatedAt: Date.now(),
    };
    await db.profile.put(updated);
    await regenerateProtocolFromProfile(updated);
    showToast('My focus updated & daily stack rebuilt');
  };

  const handleToggleMindSubGoal = async (id: MindSubGoalId) => {
    const exists = activeMindSubGoals.includes(id);
    const nextSub = exists
      ? activeMindSubGoals.filter((x) => x !== id)
      : [...activeMindSubGoals, id];
    const nextFocus = activeFocusAreas.includes('mind')
      ? activeFocusAreas
      : ([...activeFocusAreas, 'mind'] as FocusAreaId[]);
    const updated: UserProfile = {
      ...profile,
      focusAreas: nextFocus,
      mindSubGoals: nextSub,
      updatedAt: Date.now(),
    };
    await db.profile.put(updated);
    await regenerateProtocolFromProfile(updated);
    showToast('Mind goal updated & daily stack rebuilt');
  };

  const handleExport = async (encrypted: boolean) => {
    const raw = await exportAllDataJson();
    let content = raw;
    let filename = `ascend-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (encrypted) {
      if (backupPassphrase.trim().length < 4) {
        showToast('Enter a passphrase (4+ chars) to encrypt backup', 'warning');
        return;
      }
      content = await encryptBackupJson(raw, backupPassphrase.trim());
      filename = `ascend-encrypted-backup-${new Date().toISOString().slice(0, 10)}.json`;
    }
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(encrypted ? 'Encrypted backup downloaded' : 'JSON backup downloaded');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    e.target.value = '';
    try {
      const parsed = JSON.parse(text);
      if (parsed.ascendEncryptedBackup) {
        setPendingEncryptedText(text);
        showToast('Encrypted backup detected — enter passphrase below', 'info');
        return;
      }
      await importAllDataJson(text);
      showToast('Backup restored successfully');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to import backup', 'warning');
    }
  };

  const handleDecryptAndRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEncryptedText) return;
    try {
      const plain = await decryptBackupJson(pendingEncryptedText, importPassphrase.trim());
      await importAllDataJson(plain);
      setPendingEncryptedText(null);
      setImportPassphrase('');
      showToast('Encrypted backup decrypted & restored');
    } catch {
      showToast('Incorrect passphrase or corrupted backup', 'warning');
    }
  };

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pinInput)) {
      showToast('Enter a 4-digit numeric PIN', 'warning');
      return;
    }
    const hash = await sha256Hex(pinInput);
    await updateSettings({ pinHash: hash });
    setPinInput('');
    showToast('Local 4-digit PIN enabled');
  };

  const handleWipeAll = async () => {
    if (deleteText.trim() !== 'DELETE') {
      showToast('Type DELETE exactly to confirm', 'warning');
      return;
    }
    await wipeAllData();
    setShowDeleteConfirm(false);
    setDeleteText('');
    showToast('All local data erased cleanly', 'info');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings &amp; Data</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          100% local IndexedDB storage · No accounts · No cloud sync
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Appearance & Profile */}
        <div className="lg:col-span-6 space-y-4">
          <div className="ascend-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold">Appearance &amp; Units</h2>
              <button
                type="button"
                onClick={onOpenOnboarding}
                className="text-xs font-semibold text-[var(--accent)]"
              >
                Edit Profile ({profile.name})
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Theme Mode</span>
              <button
                type="button"
                onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[40px]"
              >
                {settings.theme === 'dark' ? <Moon className="w-4 h-4 text-[var(--accent)]" /> : <Sun className="w-4 h-4 text-amber-500" />}
                {settings.theme === 'dark' ? 'Dark Charcoal' : 'Light Clean'}
              </button>
            </div>

            <div>
              <span className="block text-xs font-medium mb-2">Accent Color Preset</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => updateSettings({ accent: p.id })}
                    className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-2 border min-h-[40px] ${
                      settings.accent === p.id
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: p.swatch }} />
                    <span className="truncate">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10">
              <span className="text-xs font-medium">Measurement Units</span>
              <div className="flex gap-1.5">
                {(['metric', 'imperial'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => updateSettings({ units: u })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                      settings.units === u
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                        : 'bg-slate-100 dark:bg-white/5 border-transparent'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Save Scan Thumbnails Locally</span>
              <button
                type="button"
                onClick={() => updateSettings({ saveThumbnails: !settings.saveThumbnails })}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                  settings.saveThumbnails
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent'
                }`}
              >
                {settings.saveThumbnails ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div>
                <span className="text-xs font-medium block">Slang tier names</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {(settings.slangTierNames ?? true)
                    ? 'ON: Chad, Chadlite, HTN, True Normie, LTN'
                    : 'OFF: Elite, Top, High, Average, Below average'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => updateSettings({ slangTierNames: !(settings.slangTierNames ?? true) })}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border shrink-0 transition ${
                  settings.slangTierNames ?? true
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent'
                }`}
              >
                {(settings.slangTierNames ?? true) ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          {/* My Focus (Face · Body · Mind) */}
          <div className="ascend-card p-4 space-y-3">
            <div>
              <h2 className="font-display text-base font-bold">My focus</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Choose focus areas to build Today&apos;s Stack (max 8–10 small tasks/day).
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {FOCUS_AREA_OPTIONS.map((f) => {
                const active = activeFocusAreas.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleToggleFocusArea(f.id)}
                    className={`py-2.5 rounded-xl text-xs font-bold border min-h-[40px] transition ${
                      active
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/40'
                        : 'bg-slate-100 dark:bg-white/5 border-transparent'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5 pt-1">
              <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Mind sub-goals
              </span>
              <div className="flex flex-wrap gap-1.5">
                {MIND_SUBGOAL_OPTIONS.map((sg) => {
                  const active = activeMindSubGoals.includes(sg.id);
                  return (
                    <button
                      key={sg.id}
                      type="button"
                      onClick={() => handleToggleMindSubGoal(sg.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border min-h-[36px] transition ${
                        active
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/40'
                          : 'bg-slate-100 dark:bg-white/5 border-transparent'
                      }`}
                    >
                      {sg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Optional Prayer Check-Ins */}
          <div className="ascend-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold">Prayer check-ins</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Five calm one-tap ticks. Missing one never affects streaks or shows negative text.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSettings(
                    { prayerTrackingEnabled: !settings.prayerTrackingEnabled },
                    true
                  )
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border shrink-0 transition ${
                  settings.prayerTrackingEnabled
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent'
                }`}
              >
                {settings.prayerTrackingEnabled ? 'On' : 'Off'}
              </button>
            </div>

            {settings.prayerTrackingEnabled && (
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">Include optional &quot;Dhikr / Quran 5 min&quot; task</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({ dhikrTaskEnabled: !settings.dhikrTaskEnabled }, true)
                    }
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border shrink-0 transition ${
                      settings.dhikrTaskEnabled
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                        : 'bg-slate-100 dark:bg-white/5 border-transparent'
                    }`}
                  >
                    {settings.dhikrTaskEnabled ? 'Added' : 'Off'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {PRAYER_LIST.map((p) => {
                    const times = settings.prayerTimes ?? {
                      fajr: '05:15',
                      dhuhr: '12:30',
                      asr: '15:45',
                      maghrib: '18:15',
                      isha: '19:45',
                    };
                    return (
                      <div key={p.key}>
                        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                          {p.label}
                        </label>
                        <input
                          type="time"
                          value={times[p.key]}
                          onChange={(e) =>
                            updateSettings({
                              prayerTimes: {
                                ...times,
                                [p.key]: e.target.value,
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Reminders & PWA Install */}
          <div className="ascend-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold flex items-center gap-2">
                <Bell className="w-4 h-4 text-[var(--accent)]" /> Reminders
              </h2>
              <button
                type="button"
                onClick={async () => {
                  const res = await requestReminderPermission();
                  showToast(
                    res === 'granted'
                      ? 'Notifications enabled'
                      : 'Using in-app reminder banners',
                    'info'
                  );
                }}
                className="text-xs font-semibold text-[var(--accent)]"
              >
                Enable OS Alerts
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 mb-1">Morning Routine</label>
                <input
                  type="time"
                  value={settings.reminders.morning}
                  onChange={(e) =>
                    updateSettings({ reminders: { ...settings.reminders, morning: e.target.value } })
                  }
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num"
                />
              </div>
              <div>
                <label className="block text-slate-500 dark:text-slate-400 mb-1">SPF Reapply</label>
                <input
                  type="time"
                  value={settings.reminders.spf}
                  onChange={(e) =>
                    updateSettings({ reminders: { ...settings.reminders, spf: e.target.value } })
                  }
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num"
                />
              </div>
              <div>
                <label className="block text-slate-500 dark:text-slate-400 mb-1">Workout</label>
                <input
                  type="time"
                  value={settings.reminders.workout}
                  onChange={(e) =>
                    updateSettings({ reminders: { ...settings.reminders, workout: e.target.value } })
                  }
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num"
                />
              </div>
              <div>
                <label className="block text-slate-500 dark:text-slate-400 mb-1">Sleep Prep</label>
                <input
                  type="time"
                  value={settings.reminders.sleep}
                  onChange={(e) =>
                    updateSettings({ reminders: { ...settings.reminders, sleep: e.target.value } })
                  }
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-1.5 text-xs">
              <span className="block font-medium">Tongue posture reminders (3 optional · zero force)</span>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((idx) => {
                  const arr = settings.tongueReminderTimes ?? ['10:00', '14:30', '19:00'];
                  return (
                    <input
                      key={idx}
                      type="time"
                      value={arr[idx] ?? ''}
                      onChange={(e) => {
                        const next = [...arr];
                        next[idx] = e.target.value;
                        updateSettings({ tongueReminderTimes: next });
                      }}
                      className="w-full px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num"
                    />
                  );
                })}
              </div>
            </div>

            {!isInstalled && (isInstallable || isIOS) && (
              <div className="pt-2 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => (isInstallable ? install() : setShowIOSGuide(true))}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[44px]"
                >
                  <Smartphone className="w-4 h-4" />
                  {isIOS ? 'Install ASCEND on iOS' : 'Install ASCEND Offline App'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Backup, PIN, Storage & Danger Zone */}
        <div className="lg:col-span-6 space-y-4">
          <div className="ascend-card p-4 space-y-3">
            <h2 className="font-display text-base font-bold">Backup &amp; Restore</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleExport(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[42px]"
              >
                <Download className="w-4 h-4" /> Export JSON
              </button>
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold cursor-pointer min-h-[42px]">
                <Upload className="w-4 h-4" /> Restore Backup
                <input type="file" accept=".json,application/json" onChange={handleImportFile} className="hidden" />
              </label>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-2">
              <p className="text-xs font-semibold">Optional AES-GCM Encrypted Backup</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Backup passphrase"
                  value={backupPassphrase}
                  onChange={(e) => setBackupPassphrase(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs min-h-[40px]"
                />
                <button
                  type="button"
                  onClick={() => handleExport(true)}
                  className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[40px]"
                >
                  Export Encrypted
                </button>
              </div>
            </div>

            {pendingEncryptedText && (
              <form onSubmit={handleDecryptAndRestore} className="p-3 rounded-xl bg-amber-500/10 space-y-2">
                <p className="text-xs font-semibold">Enter passphrase to decrypt restored backup:</p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={importPassphrase}
                    onChange={(e) => setImportPassphrase(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#131815] text-xs"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold"
                  >
                    Decrypt
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Local PIN Lock */}
          <div className="ascend-card p-4 space-y-3">
            <h2 className="font-display text-base font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-[var(--accent)]" /> Local PIN Lock
            </h2>
            {settings.pinHash ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-500 font-semibold">4-digit local PIN active</span>
                <button
                  type="button"
                  onClick={() => updateSettings({ pinHash: null })}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 font-semibold"
                >
                  Remove PIN
                </button>
              </div>
            ) : (
              <form onSubmit={handleSetPin} className="flex gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="4-digit PIN"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-xs min-h-[40px]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold min-h-[40px]"
                >
                  Set PIN
                </button>
              </form>
            )}
          </div>

          {/* Storage & About */}
          <div className="ascend-card p-4 space-y-3 text-xs">
            <h2 className="font-display text-base font-bold">Local Storage Summary</h2>
            <div className="grid grid-cols-3 gap-2 font-mono-num">
              {Object.entries(storageCounts).map(([k, v]) => (
                <div key={k} className="p-2 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
                  <div className="text-slate-500 capitalize text-[11px]">{k}</div>
                  <div className="text-sm font-bold">{v}</div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[var(--accent)]" /> About These Scores
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                PSL LAB uses on-device MediaPipe 478-landmark geometry normalized by interpupillary distance. Lighting, focal length, and angle alter measurements—this is a rough personal tracking tool, not medical or attractiveness science.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10">
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 text-rose-500 font-semibold min-h-[40px]"
                >
                  <Trash2 className="w-4 h-4" /> Delete All Local Data
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                  <p className="font-semibold text-rose-500">
                    Type DELETE to permanently wipe all local ASCEND data:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={deleteText}
                      onChange={(e) => setDeleteText(e.target.value)}
                      placeholder="DELETE"
                      className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#131815] font-mono-num"
                    />
                    <button
                      type="button"
                      onClick={handleWipeAll}
                      className="px-3.5 py-2 rounded-xl bg-rose-500 text-white font-semibold"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-white/10 font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="ascend-card max-w-sm w-full p-5 space-y-3">
            <h3 className="font-display text-base font-bold">Install on iPhone / iPad</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              1. Tap the <strong>Share</strong> button in Safari toolbar.<br />
              2. Scroll down and tap <strong>Add to Home Screen</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
