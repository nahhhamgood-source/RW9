import React, { useEffect, useState } from 'react';
import {
  Activity,
  Download,
  Upload,
  Lock,
  Trash2,
  Sun,
  Moon,
  Bell,
  Smartphone,
  Info,
  Cloud,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  db,
  exportAllDataJson,
  getStorageUsageEstimate,
  importAllDataJson,
  isAgeUnknown,
  previewBackupJson,
  regenerateProtocolFromProfile,
  saveAndVerifyProfile,
  wipeAllData,
  type BackupPreview,
} from '../db/database';
import { decryptBackupJson, encryptBackupJson, sha256Hex } from '../lib/crypto';
import { apiRequest } from '../lib/api';
import { clearErrorLog, getErrorLog, type LoggedErrorEntry as LocalErrorRecord } from '../lib/errorLog';
import { setDayStartHour4am } from '../lib/date';
import {
  downloadRemindersIcs,
  getReminderDeliveryInfo,
  requestReminderPermission,
  syncLocalNotifications,
} from '../lib/notifications';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Monitor, Volume2, VolumeX, Sparkles, Check } from 'lucide-react';
import { en } from '../i18n/en';
import type {
  AccentPreset,
  AppSettings,
  FocusAreaId,
  MindSubGoalId,
  PrayerKey,
  ThemeMode,
  ToneMode,
  UserProfile,
} from '../types';
import { useToast } from '../components/ui/ToastProvider';
import { AboutMeSection } from '../components/settings/AboutMeSection';
import { ConnectionsSection } from '../components/settings/ConnectionsSection';
import { PrivacyInventorySection } from '../components/settings/PrivacyInventorySection';

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
  { id: 'sky', label: 'Calm Sky', swatch: '#0284C7' },
  { id: 'mint', label: 'Soft Mint', swatch: '#10B981' },
  { id: 'violet', label: 'Muted Violet', swatch: '#A78BFA' },
  { id: 'amber', label: 'Warm Amber', swatch: '#FBBF24' },
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
  const [pendingBackupJson, setPendingBackupJson] = useState<string | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [includeQuitInExport, setIncludeQuitInExport] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [storageCounts, setStorageCounts] = useState<Record<string, number>>({});
  const [storageUsageLabel, setStorageUsageLabel] = useState<string>('Checking...');
  const [ageDraft, setAgeDraft] = useState<string>(profile.age > 0 ? String(profile.age) : '');

  interface SelfCheckItem {
    id: string;
    label: string;
    ok: boolean;
    detail: string;
  }
  const [checkingDiag, setCheckingDiag] = useState(false);
  const [diagResults, setDiagResults] = useState<SelfCheckItem[] | null>(null);
  const [errorLog, setErrorLog] = useState<LocalErrorRecord[]>(() => getErrorLog());
  const [showErrorLog, setShowErrorLog] = useState(false);

  useEffect(() => {
    setAgeDraft(profile.age > 0 ? String(profile.age) : '');
  }, [profile.age]);

  useEffect(() => {
    Promise.all([
      db.taskCompletions.count(),
      db.dailyLogs.count(),
      db.scans.count(),
      db.workouts.count(),
      db.skinEntries.count(),
      db.products.count(),
      getStorageUsageEstimate(),
    ]).then(([completions, logs, scans, workouts, skin, products, est]) => {
      setStorageCounts({ completions, logs, scans, workouts, skin, products });
      setStorageUsageLabel(est.usageMbLabel);
    });
  }, []);

  const updateSettings = async (patch: Partial<AppSettings>, rebuildTasks = false) => {
    const next = { ...settings, ...patch };
    if (patch.dayStartsAt4am !== undefined) {
      setDayStartHour4am(Boolean(patch.dayStartsAt4am));
    }
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
    const verified = await saveAndVerifyProfile(updated);
    await regenerateProtocolFromProfile(verified);
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
    const verified = await saveAndVerifyProfile(updated);
    await regenerateProtocolFromProfile(verified);
    showToast('Mind goal updated & daily stack rebuilt');
  };

  const handleExport = async (encrypted: boolean) => {
    const raw = await exportAllDataJson(includeQuitInExport);
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
      const prev = previewBackupJson(text);
      setPendingBackupJson(text);
      setBackupPreview(prev);
      showToast('Backup parsed — review preview to confirm restore', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to import backup', 'warning');
    }
  };

  const handleDecryptAndRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEncryptedText) return;
    try {
      const plain = await decryptBackupJson(pendingEncryptedText, importPassphrase.trim());
      const prev = previewBackupJson(plain);
      setPendingEncryptedText(null);
      setImportPassphrase('');
      setPendingBackupJson(plain);
      setBackupPreview(prev);
      showToast('Backup decrypted — confirm restore below', 'info');
    } catch {
      showToast('Incorrect passphrase or corrupted backup', 'warning');
    }
  };

  const handleConfirmBackupRestore = async () => {
    if (!pendingBackupJson) return;
    try {
      await importAllDataJson(pendingBackupJson);
      setPendingBackupJson(null);
      setBackupPreview(null);
      showToast('Backup restored successfully');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Restore failed', 'warning');
    }
  };

  const handleSaveAge = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Math.round(Number(ageDraft));
    if (!Number.isFinite(num) || num < 10 || num > 100) {
      showToast('Enter an age between 10 and 100', 'warning');
      return;
    }
    const updated = await saveAndVerifyProfile({
      ...profile,
      age: num,
      ageExplicitlySet: true,
      updatedAt: Date.now(),
    });
    await regenerateProtocolFromProfile(updated);
    showToast(`Age set to ${num} (${num < 18 ? 'Teen mode active' : 'Adult mode unlocked'})`);
  };

  const handleRunSelfCheck = async () => {
    setCheckingDiag(true);
    const items: SelfCheckItem[] = [];

    // 1. IndexedDB read/write
    try {
      const s = await db.settings.get('app');
      await db.settings.put(s ?? settings);
      items.push({ id: 'idb', label: 'Database read/write (IndexedDB)', ok: true, detail: 'Read & write verified' });
    } catch (err) {
      items.push({ id: 'idb', label: 'Database read/write (IndexedDB)', ok: false, detail: err instanceof Error ? err.message : 'Failed' });
    }

    // 2. Persistent storage
    try {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const est = await getStorageUsageEstimate();
      items.push({
        id: 'storage',
        label: 'Persistent storage & quota',
        ok: true,
        detail: `${persisted ? 'Persistent granted' : 'Standard browser quota'} · Using ${est.usageMbLabel}`,
      });
    } catch {
      items.push({ id: 'storage', label: 'Persistent storage & quota', ok: false, detail: 'Storage API unavailable' });
    }

    // 3. Service Worker & Cache
    try {
      const hasSw = 'serviceWorker' in navigator;
      const regs = hasSw ? await navigator.serviceWorker.getRegistrations() : [];
      const cachesCount = 'caches' in window ? (await caches.keys()).length : 0;
      items.push({
        id: 'sw',
        label: 'Service worker & offline cache',
        ok: hasSw && (regs.length > 0 || cachesCount > 0),
        detail: hasSw ? `${regs.length} SW active · ${cachesCount} cache buckets` : 'SW unsupported',
      });
    } catch {
      items.push({ id: 'sw', label: 'Service worker & offline cache', ok: false, detail: 'Cache check failed' });
    }

    // 4. Camera permission state
    try {
      if (navigator.permissions?.query) {
        const cam = await navigator.permissions.query({ name: 'camera' as PermissionName });
        items.push({ id: 'cam', label: 'Camera permission', ok: cam.state !== 'denied', detail: `State: ${cam.state}` });
      } else {
        items.push({ id: 'cam', label: 'Camera permission', ok: typeof navigator.mediaDevices?.getUserMedia === 'function', detail: typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'API available' : 'Unavailable' });
      }
    } catch {
      items.push({ id: 'cam', label: 'Camera permission', ok: Boolean(navigator.mediaDevices), detail: 'Browser prompt on use' });
    }

    // 5. Notification permission state
    const notifPerm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
    items.push({
      id: 'notif',
      label: 'Notification permission',
      ok: notifPerm === 'granted',
      detail: `Permission: ${notifPerm} (in-app & .ics always work)`,
    });

    // 6. /api/health
    const healthRes = await apiRequest<{ status?: string; services?: { geminiConfigured?: boolean } }>('/api/health', { timeoutMs: 5000 });
    items.push({
      id: 'health',
      label: '/api/health reachability',
      ok: healthRes.ok,
      detail: healthRes.ok
        ? `Alive · AI key ${healthRes.data.services?.geminiConfigured ? 'configured' : 'not set'}`
        : healthRes.error,
    });

    // 7. /api/analyze-food GET
    const foodRes = await apiRequest<{ ok?: boolean; status?: string }>('/api/analyze-food', { timeoutMs: 5000 });
    items.push({
      id: 'food-api',
      label: '/api/analyze-food reachability',
      ok: foodRes.ok,
      detail: foodRes.ok ? 'Endpoint alive' : foodRes.error,
    });

    // 8. MediaPipe files loaded
    try {
      const mpResp = await fetch('/mediapipe/face_landmarker.task', { method: 'HEAD' });
      items.push({
        id: 'mediapipe',
        label: 'MediaPipe local files',
        ok: mpResp.ok,
        detail: mpResp.ok ? 'face_landmarker.task ready' : `HTTP ${mpResp.status}`,
      });
    } catch {
      items.push({ id: 'mediapipe', label: 'MediaPipe local files', ok: false, detail: 'Could not reach /mediapipe/face_landmarker.task' });
    }

    setDiagResults(items);
    setErrorLog(getErrorLog());
    setCheckingDiag(false);
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
          Local-first IndexedDB storage · Optional online AI features when opted in · v
          {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.2.0'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Appearance & Profile */}
        <div className="lg:col-span-6 space-y-4">
          <AboutMeSection profile={profile} />

          <div className="ascend-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold">Appearance &amp; Units</h2>
              <button
                type="button"
                onClick={onOpenOnboarding}
                className="text-xs font-semibold text-[var(--accent)]"
              >
                {profile.name.trim() ? `Edit Profile (${profile.name.trim()})` : 'Edit Profile'}
              </button>
            </div>

            <div>
              <span className="block text-xs font-medium mb-2">Theme Mode</span>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'system', label: 'System', icon: <Monitor className="w-4 h-4" /> },
                  { id: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
                  { id: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> },
                ] as Array<{ id: ThemeMode; label: string; icon: React.ReactNode }>).map((t) => {
                  const active = settings.theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => updateSettings({ theme: t.id })}
                      className={`inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border min-h-[44px] transition ${
                        active
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/40'
                          : 'bg-slate-100 dark:bg-white/5 border-transparent'
                      }`}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Easy Mode vs Pro Mode */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div>
                <span className="text-xs font-medium block">View Mode</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {settings.easyMode !== false
                    ? 'Easy mode: simple words, 6 key tasks, zero clutter'
                    : 'Pro mode: all telemetry, formulas & full dashboard'}
                </span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {([
                  { val: true, label: 'Easy' },
                  { val: false, label: 'Pro' },
                ] as const).map((opt) => (
                  <button
                    key={String(opt.val)}
                    type="button"
                    onClick={() => updateSettings({ easyMode: opt.val })}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border min-h-[44px] transition ${
                      (settings.easyMode !== false) === opt.val
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/40'
                        : 'bg-slate-100 dark:bg-white/5 border-transparent'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tone & Sound */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div>
                <span className="text-xs font-medium block mb-1.5">App Tone</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { id: 'normal', label: 'Normal' },
                    { id: 'chill', label: 'Chill' },
                    { id: 'serious', label: 'Serious' },
                  ] as Array<{ id: ToneMode; label: string }>).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateSettings({ tone: opt.id })}
                      className={`py-2 rounded-xl text-xs font-semibold border min-h-[44px] transition ${
                        (settings.tone ?? 'normal') === opt.id
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/40'
                          : 'bg-slate-100 dark:bg-white/5 border-transparent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-medium block mb-1.5">Check-off Sound</span>
                <button
                  type="button"
                  onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
                  className={`w-full inline-flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border min-h-[44px] transition ${
                    settings.soundEnabled
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/40'
                      : 'bg-slate-100 dark:bg-white/5 border-transparent'
                  }`}
                >
                  {settings.soundEnabled ? (
                    <>
                      <Volume2 className="w-4 h-4" /> Gentle chime on
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-4 h-4" /> Silent (haptic only)
                    </>
                  )}
                </button>
              </div>
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
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border shrink-0 min-h-[40px] transition ${
                  settings.slangTierNames ?? true
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent'
                }`}
              >
                {(settings.slangTierNames ?? true) ? 'On' : 'Off'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div>
                <span className="text-xs font-medium block">Include skin tone estimate in scans</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  When off, PSL LAB skips skin texture/evenness scoring on photos
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSettings({
                    includeSkinScoreInScans: !(settings.includeSkinScoreInScans ?? true),
                  })
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border shrink-0 min-h-[40px] transition ${
                  settings.includeSkinScoreInScans ?? true
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent'
                }`}
              >
                {(settings.includeSkinScoreInScans ?? true) ? 'On' : 'Off'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div>
                <span className="text-xs font-medium block">Day starts at 4:00 AM</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Late-night logs before 04:00 stay on yesterday&apos;s streak day
                </span>
              </div>
              <button
                type="button"
                onClick={() => updateSettings({ dayStartsAt4am: !settings.dayStartsAt4am })}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border shrink-0 min-h-[40px] transition ${
                  settings.dayStartsAt4am
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent'
                }`}
              >
                {settings.dayStartsAt4am ? '4 AM' : '12 AM'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div>
                <span className="text-xs font-medium block">Arabic hint under key labels</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Shows friendly Egyptian Arabic glosses under key actions
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSettings({ arabicHintsEnabled: !settings.arabicHintsEnabled })
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border shrink-0 min-h-[40px] transition ${
                  settings.arabicHintsEnabled
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent'
                }`}
              >
                {settings.arabicHintsEnabled ? 'On' : 'Off'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div>
                <span className="text-xs font-medium block">Arabic-Indic numbers (٠١٢٣)</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Optional display digits for daily targets &amp; summaries
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSettings({ arabicIndicDigits: !settings.arabicIndicDigits })
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border shrink-0 min-h-[40px] transition ${
                  settings.arabicIndicDigits
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent'
                }`}
              >
                {settings.arabicIndicDigits ? '١٢٣' : '123'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-white/10">
              <div>
                <span className="text-xs font-medium block">Friday &amp; holiday relaxed mode</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Lightens Friday&apos;s daily stack gently when on
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSettings({ relaxedFridayMode: !settings.relaxedFridayMode })
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border shrink-0 min-h-[40px] transition ${
                  settings.relaxedFridayMode
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                    : 'bg-slate-100 dark:bg-white/5 border-transparent'
                }`}
              >
                {settings.relaxedFridayMode ? 'On' : 'Off'}
              </button>
            </div>

            {/* Age unlock form (F4 safety rule) */}
            <form onSubmit={handleSaveAge} className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Age verification (safety rule)</span>
                {isAgeUnknown(profile) && (
                  <span className="text-[11px] font-semibold text-amber-500">
                    Unset (teen safety locked)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={10}
                  max={100}
                  placeholder="Enter your age"
                  value={ageDraft}
                  onChange={(e) => setAgeDraft(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
                >
                  Save Age
                </button>
              </div>
            </form>
          </div>

          {/* Online Features & Consent */}
          <div className="ascend-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-[var(--accent)]" />
              <div>
                <h2 className="font-display text-base font-bold">Online AI Features (Opt-In)</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Face scans stay 100% on-device. Only these optional tools send requests when turned on.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-semibold block">AI Food Chat, Voice &amp; Photo</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Sends food text, voice note, or meal photo when used; audio &amp; photos are never stored
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({
                      onlineConsentSeen: true,
                      onlineFoodEnabled: !settings.onlineFoodEnabled,
                    })
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border min-h-[40px] ${
                    settings.onlineFoodEnabled
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                      : 'bg-slate-100 dark:bg-white/5 border-transparent'
                  }`}
                >
                  {settings.onlineFoodEnabled ? 'Enabled' : 'Off'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs pt-2 border-t border-slate-200 dark:border-white/10">
                <div>
                  <span className="font-semibold block">Online AI Coach</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    When off, Coach uses your built-in offline FAQ &amp; context
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({
                      onlineConsentSeen: true,
                      onlineCoachEnabled: !settings.onlineCoachEnabled,
                    })
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border min-h-[40px] ${
                    settings.onlineCoachEnabled
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                      : 'bg-slate-100 dark:bg-white/5 border-transparent'
                  }`}
                >
                  {settings.onlineCoachEnabled ? 'Enabled' : 'Off'}
                </button>
              </div>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[var(--accent)]" /> Reminders
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Active path: {getReminderDeliveryInfo().label}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    downloadRemindersIcs(settings);
                    showToast('Downloaded ascend-reminders.ics');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[36px]"
                >
                  Export .ics
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await requestReminderPermission();
                    showToast(
                      res === 'granted'
                        ? 'Notifications enabled'
                        : 'Using in-app reminder banners + .ics export',
                      'info'
                    );
                  }}
                  className="text-xs font-semibold text-[var(--accent)] min-h-[36px]"
                >
                  Enable OS Alerts
                </button>
              </div>
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

            <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-2 text-xs">
              <span className="block font-medium">
                Training window &amp; quiet hours (non-urgent alerts stay muted)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Training start
                  </label>
                  <input
                    type="time"
                    value={settings.trainingWindowStart ?? '18:00'}
                    onChange={(e) => updateSettings({ trainingWindowStart: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Training end
                  </label>
                  <input
                    type="time"
                    value={settings.trainingWindowEnd ?? '20:00'}
                    onChange={(e) => updateSettings({ trainingWindowEnd: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Quiet hours start
                  </label>
                  <input
                    type="time"
                    value={settings.reminders.quietHoursStart ?? '23:00'}
                    onChange={(e) =>
                      updateSettings({
                        reminders: { ...settings.reminders, quietHoursStart: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Quiet hours end
                  </label>
                  <input
                    type="time"
                    value={settings.reminders.quietHoursEnd ?? '07:00'}
                    onChange={(e) =>
                      updateSettings({
                        reminders: { ...settings.reminders, quietHoursEnd: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num"
                  />
                </div>
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
          <ConnectionsSection />
          <PrivacyInventorySection settings={settings} />

          <div className="ascend-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold">Backup &amp; Restore</h2>
              <span className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                Last backup: {settings.lastBackupDate ?? 'Never'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleExport(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                <Download className="w-4 h-4" /> Export JSON
              </button>
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold cursor-pointer min-h-[44px]">
                <Upload className="w-4 h-4" /> Restore Backup
                <input type="file" accept=".json,application/json" onChange={handleImportFile} className="hidden" />
              </label>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeQuitInExport}
                onChange={(e) => setIncludeQuitInExport(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              <span>Include Quit list items &amp; reflections in exported backup</span>
            </label>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-2">
              <p className="text-xs font-semibold">Optional AES-GCM Encrypted Backup</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Backup passphrase"
                  value={backupPassphrase}
                  onChange={(e) => setBackupPassphrase(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-base sm:text-xs min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={() => handleExport(true)}
                  className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[44px]"
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
                    className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#131815] text-base sm:text-xs min-h-[44px]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[44px]"
                  >
                    Decrypt
                  </button>
                </div>
              </form>
            )}

            {backupPreview && (
              <div className="p-3.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/35 space-y-2 text-xs">
                <p className="font-bold">Backup Preview (Schema v{backupPreview.version})</p>
                <p className="text-slate-600 dark:text-slate-300">
                  Exported: {backupPreview.exportedAt.slice(0, 19).replace('T', ' ')} ·{' '}
                  {backupPreview.totalRecords} total records
                  {backupPreview.includesQuitHabits ? ' · Includes Quit habits' : ''}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmBackupRestore}
                    className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] font-bold min-h-[40px]"
                  >
                    Confirm &amp; Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingBackupJson(null);
                      setBackupPreview(null);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-white/10 font-semibold min-h-[40px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* PIN lock */}
          <div className="ascend-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold flex items-center gap-2">
                <Lock className="w-4 h-4 text-[var(--accent)]" /> PIN lock
              </h2>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {settings.pinHash ? 'On' : 'Off'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Screen lock only (not encryption). No lock screen appears unless you turn on PIN lock here.
            </p>
            {settings.pinHash ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-500 font-semibold">4-digit PIN lock active</span>
                <button
                  type="button"
                  onClick={() => updateSettings({ pinHash: null })}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-semibold min-h-[44px]"
                >
                  Turn Off PIN lock
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
                  className="flex-1 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-base sm:text-xs min-h-[44px]"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold min-h-[44px]"
                >
                  Enable PIN lock
                </button>
              </form>
            )}
          </div>

          {/* About my data & Storage */}
          <div className="ascend-card p-4 space-y-3 text-xs">
            <h2 className="font-display text-base font-bold">About my data</h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Your profile, logs, meals, and scans live separately on each device inside this browser&apos;s local storage. To move your progress between phone and PC, export a JSON backup above and import it on your other device.
            </p>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Local Storage Summary</p>
                <span className="font-mono-num text-[11px] text-[var(--accent)]">
                  Est. usage: {storageUsageLabel}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono-num">
                {Object.entries(storageCounts).map(([k, v]) => (
                  <div key={k} className="p-2 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
                    <div className="text-slate-500 capitalize text-[11px]">{k}</div>
                    <div className="text-sm font-bold">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* F7 Diagnostics & Self-Check */}
            <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[var(--accent)]" /> Diagnostics &amp; Self-Check
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Version {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.2.0'} · Build{' '}
                    {typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__.slice(0, 10) : 'local'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunSelfCheck}
                  disabled={checkingDiag}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[40px]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingDiag ? 'animate-spin' : ''}`} />
                  {checkingDiag ? 'Checking...' : 'Run self-check'}
                </button>
              </div>

              {diagResults && (
                <div className="space-y-1.5">
                  {diagResults.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{item.label}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.detail}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                          item.ok
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : 'bg-amber-500/15 text-amber-500'
                        }`}
                      >
                        {item.ok ? 'PASS' : 'WARN'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorLog(getErrorLog());
                    setShowErrorLog((v) => !v);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-[11px] font-semibold min-h-[36px]"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Error log ({errorLog.length})
                </button>
                {errorLog.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(errorLog, null, 2)], {
                          type: 'application/json',
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `ascend-error-log-${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-[11px] font-semibold min-h-[36px]"
                    >
                      Export error log
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearErrorLog();
                        setErrorLog([]);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-[11px] font-semibold min-h-[36px]"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>

              {showErrorLog && (
                <div className="max-h-40 overflow-y-auto space-y-1 p-2.5 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 font-mono-num text-[11px]">
                  {errorLog.length === 0 ? (
                    <p className="text-slate-500">No recorded errors.</p>
                  ) : (
                    errorLog.map((rec) => (
                      <div key={rec.id} className="border-b border-slate-200 dark:border-white/10 pb-1">
                        <span className="text-[var(--accent)]">{rec.source}</span>: {rec.message}
                      </div>
                    ))
                  )}
                </div>
              )}
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 text-rose-500 font-semibold min-h-[44px]"
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
                      className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#131815] font-mono-num text-base sm:text-xs min-h-[44px]"
                    />
                    <button
                      type="button"
                      onClick={handleWipeAll}
                      className="px-3.5 py-2 rounded-xl bg-rose-500 text-white font-semibold min-h-[44px]"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-white/10 font-semibold min-h-[44px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* About ASCEND Card */}
          <div className="ascend-card p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 text-[var(--accent)] flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="font-display text-base font-bold">{en.aboutAscend.title}</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {en.aboutAscend.version}
                  </p>
                </div>
              </div>
              {isInstalled && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-semibold">
                  <Check className="w-3.5 h-3.5" /> Installed
                </span>
              )}
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {en.aboutAscend.installBody} {en.safety.scoreFooter}
            </p>
            {!isInstalled && (
              <button
                type="button"
                onClick={() => (isInstallable ? install() : setShowIOSGuide(true))}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
              >
                <Smartphone className="w-4 h-4" />
                {isInstallable ? en.aboutAscend.installTitle : 'How to Add to Home Screen'}
              </button>
            )}
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
