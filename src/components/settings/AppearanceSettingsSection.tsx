import React, { useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Contrast,
  Palette,
  RotateCcw,
  ShieldCheck,
  Shuffle,
  Sliders,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { db } from '../../db/database';
import { toLocalDateKey } from '../../lib/date';
import {
  ACCENT_SWATCHES,
  APP_ICON_OPTIONS,
  THEME_PRESETS,
  createDefaultLookAndFeelSettings,
  evaluateAccentContrast,
  getLookAndFeelSettings,
  normalizeHex,
  pickSurprisePreset,
  playUiSound,
  resolveEffectiveLookAndFeel,
} from '../../lib/themes';
import { AppBrandLogo } from '../ui/AppBrandLogo';
import type {
  AnimationLevel,
  AppIconId,
  AppSettings,
  BackgroundStyle,
  CardStyle,
  CornerStyle,
  DensityMode,
  FontHeadingStyle,
  HapticLevel,
  IconStyle,
  LookAndFeelSettings,
  ThemePresetId,
} from '../../types';

interface AppearanceSettingsSectionProps {
  settings: AppSettings;
}

export const AppearanceSettingsSection: React.FC<AppearanceSettingsSectionProps> = ({
  settings,
}) => {
  const laf = getLookAndFeelSettings(settings);
  const [hexDraft, setHexDraft] = useState(laf.customAccentHex ?? '');
  const [hexError, setHexError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(laf.displayAppName);

  const systemDark =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const resolved = useMemo(
    () => resolveEffectiveLookAndFeel({ settings, systemDark }),
    [settings, systemDark]
  );

  const contrastCheck = useMemo(
    () => evaluateAccentContrast(resolved.accentHex, resolved.resolvedPreset.bgSurfaceSolid),
    [resolved.accentHex, resolved.resolvedPreset.bgSurfaceSolid]
  );

  const updateLookAndFeel = async (patch: Partial<LookAndFeelSettings>) => {
    const next: LookAndFeelSettings = { ...laf, ...patch };
    const topUpdates: Partial<AppSettings> = { lookAndFeel: next };
    if (patch.soundsEnabled !== undefined) {
      topUpdates.soundEnabled = patch.soundsEnabled;
    }
    if (patch.preset === 'light_clean') {
      topUpdates.theme = 'light';
    } else if (patch.preset && patch.preset !== 'default') {
      topUpdates.theme = 'dark';
    }
    await db.settings.update('app', topUpdates);
    playUiSound({ ...settings, ...topUpdates, lookAndFeel: next }, 'click');
  };

  const handlePresetPick = async (presetId: ThemePresetId) => {
    const def = THEME_PRESETS.find((p) => p.id === presetId);
    if (!def) return;
    await updateLookAndFeel({
      preset: presetId,
      scheduleEnabled: false,
      surpriseDateKey: null,
      surprisePreset: null,
      customAccentHex: null,
      cornerStyle: def.defaultCorner,
      cardStyle: def.defaultCardStyle,
      backgroundStyle: def.defaultBgStyle,
      fontStyle: def.defaultFontStyle,
    });
    setHexDraft('');
    setHexError(null);
  };

  const handleSurpriseMe = async () => {
    const todayKey = toLocalDateKey();
    const picked = pickSurprisePreset(todayKey, resolved.resolvedPreset.id);
    const def = THEME_PRESETS.find((p) => p.id === picked);
    await updateLookAndFeel({
      preset: picked,
      scheduleEnabled: false,
      surpriseDateKey: todayKey,
      surprisePreset: picked,
      customAccentHex: null,
      cornerStyle: def?.defaultCorner ?? laf.cornerStyle,
      cardStyle: def?.defaultCardStyle ?? laf.cardStyle,
      backgroundStyle: def?.defaultBgStyle ?? laf.backgroundStyle,
      fontStyle: def?.defaultFontStyle ?? laf.fontStyle,
    });
  };

  const handleApplyHex = async () => {
    const norm = normalizeHex(hexDraft);
    if (!norm) {
      setHexError('Enter a valid hex code like #38BDF8');
      return;
    }
    setHexError(null);
    await updateLookAndFeel({ customAccentHex: norm });
  };

  const handleResetToDefault = async () => {
    const defaults = createDefaultLookAndFeelSettings();
    setHexDraft('');
    setHexError(null);
    setNameDraft(defaults.displayAppName);
    await db.settings.update('app', {
      theme: 'dark',
      accent: 'sky',
      soundEnabled: false,
      lookAndFeel: defaults,
    });
  };

  return (
    <section id="appearance-settings" className="ascend-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-[var(--accent)]" />
          <div>
            <h2 className="text-sm font-bold">Look & Feel</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Pure CSS-variable themes · Instant switch · Private styling
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSurpriseMe}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold min-h-[36px]"
          >
            <Shuffle className="w-3.5 h-3.5" /> Surprise me
          </button>
          <button
            type="button"
            onClick={handleResetToDefault}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[36px]"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to default
          </button>
        </div>
      </div>

      {/* Live Preview Strip */}
      <div
        className="p-4 border transition-colors"
        style={{
          backgroundColor: resolved.resolvedPreset.bgPage,
          borderColor: resolved.resolvedPreset.borderSubtle,
          borderRadius: 'var(--ascend-radius-card, 22px)',
          color: resolved.resolvedPreset.textPrimary,
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: `${resolved.accentHex}22`,
                color: resolved.accentHex,
                border: `1px solid ${resolved.accentHex}55`,
              }}
            >
              <AppBrandLogo iconId={laf.appIconId} iconStyle={laf.iconStyle} className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate font-display">
                {laf.displayAppName} · {resolved.resolvedPreset.name}
              </p>
              <p className="text-[11px] truncate" style={{ color: resolved.resolvedPreset.textSecondary }}>
                Live preview · {laf.cornerStyle} corners · {laf.cardStyle} cards · {laf.textScalePct}% text
              </p>
            </div>
          </div>
          <span
            className="px-3 py-1.5 text-[11px] font-bold shrink-0"
            style={{
              backgroundColor: resolved.accentHex,
              color: resolved.accentContrast,
              borderRadius: 'var(--ascend-radius-btn, 14px)',
            }}
          >
            Sample CTA
          </span>
        </div>
      </div>

      {/* Theme Presets Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Themes (True Black & Clean Daylight)
          </p>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Active: {resolved.resolvedPreset.name}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {THEME_PRESETS.map((preset) => {
            const active = !laf.scheduleEnabled && laf.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetPick(preset.id)}
                className={`p-2.5 rounded-xl border text-left transition min-h-[60px] ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] hover:border-[var(--accent)]/40'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-4 h-4 rounded-full border border-white/25 shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${preset.bgPage} 50%, ${preset.accent} 50%)`,
                      }}
                    />
                    <span className="text-xs font-bold truncate">{preset.name}</span>
                  </div>
                  {active && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                  {preset.tagline}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* System Mode & Schedule */}
      <div className="grid sm:grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-2">
          <p className="text-xs font-semibold">Base Brightness Mode</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(['dark', 'light', 'system'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={async () => {
                  await db.settings.update('app', {
                    theme: mode,
                    lookAndFeel: {
                      ...laf,
                      preset: mode === 'light' ? 'light_clean' : laf.preset === 'light_clean' ? 'obsidian' : laf.preset,
                      scheduleEnabled: false,
                    },
                  });
                }}
                className={`py-2 rounded-lg text-xs font-semibold capitalize min-h-[38px] ${
                  !laf.scheduleEnabled && settings.theme === mode
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <label className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 flex items-center justify-between gap-3 cursor-pointer">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold">Schedule (Auto Day/Night)</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Light Clean by day (07:00–19:00), dark at night
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={laf.scheduleEnabled}
            onChange={(e) => updateLookAndFeel({ scheduleEnabled: e.target.checked })}
            className="w-5 h-5 accent-[var(--accent)]"
          />
        </label>
      </div>

      {/* Accent Swatches & WCAG AA Check */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Contrast className="w-3.5 h-3.5 text-[var(--accent)]" />
            <p className="text-xs font-bold">Accent Color (12 presets + custom hex)</p>
          </div>
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
              contrastCheck.passesAA
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            AA {contrastCheck.ratioOnSurface}:1 on card · {contrastCheck.ratioOnButton}:1 on button
          </span>
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
          {ACCENT_SWATCHES.map((sw) => {
            const hex = resolved.resolvedIsDark ? sw.hex : sw.lightHex;
            const active = resolved.accentHex.toUpperCase() === hex.toUpperCase();
            return (
              <button
                key={sw.label}
                type="button"
                title={`${sw.label} (${hex})`}
                aria-label={`Accent ${sw.label}`}
                onClick={() => {
                  setHexDraft(hex);
                  setHexError(null);
                  updateLookAndFeel({ customAccentHex: hex });
                }}
                className={`h-9 rounded-lg border flex items-center justify-center transition ${
                  active ? 'ring-2 ring-white border-white scale-105' : 'border-white/20'
                }`}
                style={{ backgroundColor: hex }}
              >
                {active && <Check className="w-3.5 h-3.5 text-black/80" />}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="#38BDF8"
            value={hexDraft}
            onChange={(e) => {
              setHexDraft(e.target.value);
              setHexError(null);
            }}
            aria-label="Custom accent hex color"
            className="w-32 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-mono-num min-h-[40px]"
          />
          <button
            type="button"
            onClick={handleApplyHex}
            className="px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[40px]"
          >
            Apply hex
          </button>
          {laf.customAccentHex && (
            <button
              type="button"
              onClick={() => {
                setHexDraft('');
                setHexError(null);
                updateLookAndFeel({ customAccentHex: null });
              }}
              className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[40px]"
            >
              Use preset accent
            </button>
          )}
          {hexError && <span className="text-[11px] text-rose-400">{hexError}</span>}
        </div>
        {!contrastCheck.passesAA && (
          <p className="text-[11px] text-amber-400">
            Heads up: this custom color has low contrast ({contrastCheck.ratioOnSurface}:1). Pick a brighter tint on dark themes or darker ink on light themes for effortless reading.
          </p>
        )}
      </div>

      {/* Shape, Surface, Typography & Density */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] space-y-1.5">
          <p className="text-[11px] font-bold text-slate-500">Corners</p>
          <div className="grid grid-cols-3 gap-1">
            {(['sharp', 'soft', 'pill'] as CornerStyle[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateLookAndFeel({ cornerStyle: c })}
                className={`py-1.5 rounded-lg text-[11px] font-semibold capitalize ${
                  laf.cornerStyle === c
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-white dark:bg-white/5'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] space-y-1.5">
          <p className="text-[11px] font-bold text-slate-500">Cards</p>
          <div className="grid grid-cols-3 gap-1">
            {(['flat', 'glass', 'outlined'] as CardStyle[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => updateLookAndFeel({ cardStyle: s })}
                className={`py-1.5 rounded-lg text-[11px] font-semibold capitalize ${
                  laf.cardStyle === s
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-white dark:bg-white/5'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] space-y-1.5">
          <p className="text-[11px] font-bold text-slate-500">Density & Font</p>
          <div className="grid grid-cols-2 gap-1">
            {(['comfortable', 'compact'] as DensityMode[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => updateLookAndFeel({ density: d })}
                className={`py-1.5 rounded-lg text-[11px] font-semibold capitalize ${
                  laf.density === d
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-white dark:bg-white/5'
                }`}
              >
                {d === 'comfortable' ? 'Comfy' : 'Compact'}
              </button>
            ))}
            {(['sans', 'mono'] as FontHeadingStyle[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => updateLookAndFeel({ fontStyle: f })}
                className={`py-1.5 rounded-lg text-[11px] font-semibold capitalize ${
                  laf.fontStyle === f
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-white dark:bg-white/5'
                }`}
              >
                {f === 'sans' ? 'Sans' : 'Mono'}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-slate-500">Text size</p>
            <span className="text-[11px] font-mono-num font-bold text-[var(--accent)]">
              {laf.textScalePct}%
            </span>
          </div>
          <input
            type="range"
            min={100}
            max={130}
            step={5}
            value={laf.textScalePct}
            onChange={(e) => updateLookAndFeel({ textScalePct: Number(e.target.value) })}
            className="w-full accent-[var(--accent)]"
          />
          <div className="grid grid-cols-2 gap-1 pt-1">
            {(['line', 'filled'] as IconStyle[]).map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => updateLookAndFeel({ iconStyle: ic })}
                className={`py-1 rounded-lg text-[10.5px] font-semibold capitalize ${
                  laf.iconStyle === ic
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/40'
                    : 'bg-white dark:bg-white/5'
                }`}
              >
                {ic} icons
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Optional Background Texture & Motion / Feel */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" /> Background Layer
            </p>
            <label className="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={laf.batterySaverMode}
                onChange={(e) => updateLookAndFeel({ batterySaverMode: e.target.checked })}
                className="accent-[var(--accent)]"
              />
              Battery saver
            </label>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {(['none', 'gradient', 'noise', 'scanline', 'ambient'] as BackgroundStyle[]).map((bg) => (
              <button
                key={bg}
                type="button"
                onClick={() => updateLookAndFeel({ backgroundStyle: bg })}
                className={`py-1.5 rounded-lg text-[11px] font-semibold capitalize ${
                  laf.backgroundStyle === bg
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-white dark:bg-white/5'
                }`}
              >
                {bg}
              </button>
            ))}
          </div>
          <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
            Ambient CSS drift stays under 5% CPU and auto-pauses with Reduced Motion or Battery Saver.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] space-y-2">
          <p className="text-xs font-bold flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[var(--accent)]" /> Motion, Haptics & Sounds
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10.5px] text-slate-500 mb-1">Animations</p>
              <div className="grid grid-cols-3 gap-1">
                {(['off', 'light', 'full'] as AnimationLevel[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateLookAndFeel({ animationLevel: m })}
                    className={`py-1.5 rounded-lg text-[10.5px] font-semibold capitalize ${
                      laf.animationLevel === m
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-white dark:bg-white/5'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10.5px] text-slate-500 mb-1">Haptics</p>
              <div className="grid grid-cols-2 gap-1">
                {(['off', 'light'] as HapticLevel[]).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => updateLookAndFeel({ haptics: h })}
                    className={`py-1.5 rounded-lg text-[10.5px] font-semibold capitalize ${
                      laf.haptics === h
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-white dark:bg-white/5'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={laf.soundsEnabled}
                onChange={(e) => updateLookAndFeel({ soundsEnabled: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <Volume2 className="w-3.5 h-3.5 text-[var(--accent)]" />
              UI sounds (off by default)
            </label>
            {laf.soundsEnabled && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => playUiSound(settings, 'done')}
                  className="px-2 py-1 rounded bg-white dark:bg-white/10 text-[10.5px] font-semibold"
                >
                  Test chime
                </button>
                <button
                  type="button"
                  onClick={() => playUiSound(settings, 'level_up')}
                  className="px-2 py-1 rounded bg-white dark:bg-white/10 text-[10.5px] font-semibold"
                >
                  Level up
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* App Identity: 6 Abstract Icons, Private Display Name, Launch, Boot Line & Console */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-3">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
          <p className="text-xs font-bold">Private App Icon, Name & Launch Modes</p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {APP_ICON_OPTIONS.map((opt) => {
            const active = laf.appIconId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateLookAndFeel({ appIconId: opt.id as AppIconId })}
                className={`p-2 rounded-xl border flex flex-col items-center gap-1 min-h-[60px] transition ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'
                }`}
              >
                <AppBrandLogo iconId={opt.id} iconStyle={laf.iconStyle} className="w-4 h-4" />
                <span className="text-[10.5px] font-semibold">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-2.5 items-end">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500">
              Private header / tab name
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                maxLength={24}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="ASCEND"
                className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs min-h-[40px]"
              />
              <button
                type="button"
                onClick={() => updateLookAndFeel({ displayAppName: nameDraft.trim() || 'ASCEND' })}
                className="px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[40px]"
              >
                Save
              </button>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span>Quick logo fade at launch (&lt;0.6s)</span>
              <input
                type="checkbox"
                checked={laf.launchAnimation === 'logo_fade'}
                onChange={(e) =>
                  updateLookAndFeel({ launchAnimation: e.target.checked ? 'logo_fade' : 'none' })
                }
                className="accent-[var(--accent)]"
              />
            </label>
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span>Show Boot Line (Day X · sessions · Ready)</span>
              <input
                type="checkbox"
                checked={laf.bootLineEnabled}
                onChange={(e) => updateLookAndFeel({ bootLineEnabled: e.target.checked })}
                className="accent-[var(--accent)]"
              />
            </label>
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span>Operator Console panel on Today</span>
              <input
                type="checkbox"
                checked={laf.operatorConsoleOnToday}
                onChange={(e) => updateLookAndFeel({ operatorConsoleOnToday: e.target.checked })}
                className="accent-[var(--accent)]"
              />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
};
