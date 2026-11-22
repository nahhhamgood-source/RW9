import type {
  AppIconId,
  AppSettings,
  BackgroundStyle,
  CardStyle,
  CornerStyle,
  DensityMode,
  FontHeadingStyle,
  LookAndFeelSettings,
  ThemePresetId,
} from '../types';

export interface ThemePresetDefinition {
  id: ThemePresetId;
  name: string;
  tagline: string;
  isDark: boolean;
  bgPage: string;
  bgSurface: string;
  bgSurfaceSolid: string;
  textPrimary: string;
  textSecondary: string;
  borderSubtle: string;
  accent: string;
  accentSecondary: string;
  accentContrast: string;
  defaultCorner: CornerStyle;
  defaultCardStyle: CardStyle;
  defaultBgStyle: BackgroundStyle;
  defaultFontStyle: FontHeadingStyle;
}

export const THEME_PRESETS: ThemePresetDefinition[] = [
  {
    id: 'default',
    name: 'Default Sky',
    tagline: 'Original ASCEND slate and sky blue',
    isDark: true,
    bgPage: '#06090F',
    bgSurface: 'rgba(13, 19, 31, 0.84)',
    bgSurfaceSolid: '#0D131F',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    borderSubtle: 'rgba(56, 189, 248, 0.16)',
    accent: '#38BDF8',
    accentSecondary: '#0EA5E9',
    accentContrast: '#04131E',
    defaultCorner: 'soft',
    defaultCardStyle: 'glass',
    defaultBgStyle: 'gradient',
    defaultFontStyle: 'sans',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    tagline: 'Pure OLED black, silver hairlines, cool accent',
    isDark: true,
    bgPage: '#000000',
    bgSurface: 'rgba(10, 12, 16, 0.92)',
    bgSurfaceSolid: '#0A0C10',
    textPrimary: '#F8FAFC',
    textSecondary: '#9CA3AF',
    borderSubtle: 'rgba(226, 232, 240, 0.14)',
    accent: '#38BDF8',
    accentSecondary: '#7DD3FC',
    accentContrast: '#02131D',
    defaultCorner: 'soft',
    defaultCardStyle: 'outlined',
    defaultBgStyle: 'none',
    defaultFontStyle: 'sans',
  },
  {
    id: 'carbon',
    name: 'Carbon',
    tagline: 'Dark graphite texture and sharp corners',
    isDark: true,
    bgPage: '#0D0E11',
    bgSurface: 'rgba(22, 24, 29, 0.94)',
    bgSurfaceSolid: '#16181D',
    textPrimary: '#F4F4F5',
    textSecondary: '#A1A1AA',
    borderSubtle: 'rgba(255, 255, 255, 0.12)',
    accent: '#34D399',
    accentSecondary: '#10B981',
    accentContrast: '#03170F',
    defaultCorner: 'sharp',
    defaultCardStyle: 'flat',
    defaultBgStyle: 'noise',
    defaultFontStyle: 'sans',
  },
  {
    id: 'noir_gold',
    name: 'Noir Gold',
    tagline: 'True black with matte gold luxury accents',
    isDark: true,
    bgPage: '#050506',
    bgSurface: 'rgba(15, 14, 11, 0.92)',
    bgSurfaceSolid: '#0F0E0B',
    textPrimary: '#FAF7F0',
    textSecondary: '#B8B0A0',
    borderSubtle: 'rgba(234, 179, 8, 0.22)',
    accent: '#EAB308',
    accentSecondary: '#CA8A04',
    accentContrast: '#141003',
    defaultCorner: 'soft',
    defaultCardStyle: 'outlined',
    defaultBgStyle: 'gradient',
    defaultFontStyle: 'sans',
  },
  {
    id: 'blood_noir',
    name: 'Blood Noir',
    tagline: 'Black and deep crimson for fight camp focus',
    isDark: true,
    bgPage: '#070405',
    bgSurface: 'rgba(18, 9, 12, 0.92)',
    bgSurfaceSolid: '#12090C',
    textPrimary: '#FDF2F4',
    textSecondary: '#BCA4AA',
    borderSubtle: 'rgba(251, 113, 133, 0.22)',
    accent: '#FB7185',
    accentSecondary: '#E11D48',
    accentContrast: '#1F040A',
    defaultCorner: 'sharp',
    defaultCardStyle: 'outlined',
    defaultBgStyle: 'gradient',
    defaultFontStyle: 'sans',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    tagline: 'Console black with crisp phosphor green & monospace',
    isDark: true,
    bgPage: '#020604',
    bgSurface: 'rgba(6, 16, 10, 0.94)',
    bgSurfaceSolid: '#06100A',
    textPrimary: '#ECFDF5',
    textSecondary: '#86EFAC',
    borderSubtle: 'rgba(74, 222, 128, 0.24)',
    accent: '#4ADE80',
    accentSecondary: '#F59E0B',
    accentContrast: '#021709',
    defaultCorner: 'sharp',
    defaultCardStyle: 'outlined',
    defaultBgStyle: 'scanline',
    defaultFontStyle: 'mono',
  },
  {
    id: 'void_violet',
    name: 'Void Violet',
    tagline: 'Deep obsidian black with violet aura',
    isDark: true,
    bgPage: '#05040A',
    bgSurface: 'rgba(15, 11, 26, 0.88)',
    bgSurfaceSolid: '#0F0B1A',
    textPrimary: '#F5F3FF',
    textSecondary: '#B8AED8',
    borderSubtle: 'rgba(167, 139, 250, 0.24)',
    accent: '#A78BFA',
    accentSecondary: '#8B5CF6',
    accentContrast: '#0E0720',
    defaultCorner: 'soft',
    defaultCardStyle: 'glass',
    defaultBgStyle: 'gradient',
    defaultFontStyle: 'sans',
  },
  {
    id: 'steel',
    name: 'Steel',
    tagline: 'Clean technical dark steel blue',
    isDark: true,
    bgPage: '#08101C',
    bgSurface: 'rgba(15, 25, 42, 0.90)',
    bgSurfaceSolid: '#0F192A',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    borderSubtle: 'rgba(96, 165, 250, 0.20)',
    accent: '#60A5FA',
    accentSecondary: '#3B82F6',
    accentContrast: '#051224',
    defaultCorner: 'sharp',
    defaultCardStyle: 'flat',
    defaultBgStyle: 'none',
    defaultFontStyle: 'mono',
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    tagline: 'Pure black, white, and neutral grey only',
    isDark: true,
    bgPage: '#050505',
    bgSurface: 'rgba(18, 18, 18, 0.94)',
    bgSurfaceSolid: '#121212',
    textPrimary: '#FAFAFA',
    textSecondary: '#A3A3A3',
    borderSubtle: 'rgba(255, 255, 255, 0.16)',
    accent: '#F5F5F5',
    accentSecondary: '#D4D4D4',
    accentContrast: '#0A0A0A',
    defaultCorner: 'sharp',
    defaultCardStyle: 'outlined',
    defaultBgStyle: 'none',
    defaultFontStyle: 'sans',
  },
  {
    id: 'light_clean',
    name: 'Light Clean',
    tagline: 'Crisp daylight theme with high-contrast ink',
    isDark: false,
    bgPage: '#F4F7FA',
    bgSurface: '#FFFFFF',
    bgSurfaceSolid: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    borderSubtle: 'rgba(15, 23, 42, 0.10)',
    accent: '#0369A1',
    accentSecondary: '#0284C7',
    accentContrast: '#FFFFFF',
    defaultCorner: 'soft',
    defaultCardStyle: 'flat',
    defaultBgStyle: 'none',
    defaultFontStyle: 'sans',
  },
];

export const THEME_PRESET_MAP: Record<ThemePresetId, ThemePresetDefinition> = THEME_PRESETS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<ThemePresetId, ThemePresetDefinition>
);

export const ACCENT_SWATCHES: Array<{ label: string; hex: string; lightHex: string }> = [
  { label: 'Sky', hex: '#38BDF8', lightHex: '#0369A1' },
  { label: 'Emerald', hex: '#34D399', lightHex: '#047857' },
  { label: 'Matte Gold', hex: '#EAB308', lightHex: '#92400E' },
  { label: 'Crimson', hex: '#FB7185', lightHex: '#BE123C' },
  { label: 'Terminal Green', hex: '#4ADE80', lightHex: '#15803D' },
  { label: 'Violet', hex: '#A78BFA', lightHex: '#6D28D9' },
  { label: 'Steel Blue', hex: '#60A5FA', lightHex: '#1D4ED8' },
  { label: 'Amber', hex: '#FBBF24', lightHex: '#B45309' },
  { label: 'Cyan', hex: '#22D3EE', lightHex: '#0E7490' },
  { label: 'Silver', hex: '#E2E8F0', lightHex: '#334155' },
  { label: 'Coral', hex: '#FDA4AF', lightHex: '#9F1239' },
  { label: 'Teal', hex: '#2DD4BF', lightHex: '#0F766E' },
];

export const APP_ICON_OPTIONS: Array<{
  id: AppIconId;
  label: string;
  desc: string;
}> = [
  { id: 'peak', label: 'Peak', desc: 'Clean upward chevron ridge' },
  { id: 'monolith', label: 'Monolith', desc: 'Minimalist split pillar' },
  { id: 'orbit', label: 'Orbit', desc: 'Precision ring with center dot' },
  { id: 'prism', label: 'Prism', desc: 'Sharp faceted diamond frame' },
  { id: 'shield', label: 'Guard', desc: 'Disciplined geometric crest' },
  { id: 'pulse', label: 'Signal', desc: 'Operator waveform cadence' },
];

export function createDefaultLookAndFeelSettings(): LookAndFeelSettings {
  return {
    preset: 'default',
    scheduleEnabled: false,
    surpriseDateKey: null,
    surprisePreset: null,
    customAccentHex: null,
    cornerStyle: 'soft',
    cardStyle: 'glass',
    iconStyle: 'line',
    density: 'comfortable',
    fontStyle: 'sans',
    textScalePct: 100,
    backgroundStyle: 'gradient',
    batterySaverMode: false,
    animationLevel: 'light',
    haptics: 'light',
    soundsEnabled: false,
    launchAnimation: 'none',
    bootLineEnabled: true,
    operatorConsoleOnToday: false,
    appIconId: 'peak',
    displayAppName: 'ASCEND',
  };
}

export function getLookAndFeelSettings(settings?: Partial<AppSettings> | null): LookAndFeelSettings {
  const defaults = createDefaultLookAndFeelSettings();
  const raw = settings?.lookAndFeel;
  if (!raw) return defaults;
  return {
    ...defaults,
    ...raw,
    textScalePct: Math.max(100, Math.min(130, Number(raw.textScalePct) || 100)),
    displayAppName: (raw.displayAppName ?? 'ASCEND').trim() || 'ASCEND',
  };
}

// ============================================================================
// Color & WCAG AA Contrast Mathematics
// ============================================================================

export function normalizeHex(hex: string): string | null {
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean}`.toUpperCase();
  }
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const intVal = parseInt(norm.slice(1), 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b);
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const bright = Math.max(lumA, lumB);
  const dark = Math.min(lumA, lumB);
  return Number(((bright + 0.05) / (dark + 0.05)).toFixed(2));
}

export function autoContrastText(bgHex: string): '#05080E' | '#FFFFFF' {
  const darkRatio = getContrastRatio(bgHex, '#05080E');
  const whiteRatio = getContrastRatio(bgHex, '#FFFFFF');
  return darkRatio >= whiteRatio ? '#05080E' : '#FFFFFF';
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(56, 189, 248, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export interface AccentContrastCheck {
  ratioOnSurface: number;
  ratioOnButton: number;
  passesAA: boolean;
  contrastText: '#05080E' | '#FFFFFF';
}

export function evaluateAccentContrast(accentHex: string, surfaceHex: string): AccentContrastCheck {
  const norm = normalizeHex(accentHex) ?? '#38BDF8';
  const contrastText = autoContrastText(norm);
  const ratioOnSurface = getContrastRatio(norm, surfaceHex);
  const ratioOnButton = getContrastRatio(contrastText, norm);
  return {
    ratioOnSurface,
    ratioOnButton,
    passesAA: ratioOnSurface >= 4.5 && ratioOnButton >= 4.5,
    contrastText,
  };
}

export function pickSurprisePreset(dateKey: string, currentPreset?: ThemePresetId): ThemePresetId {
  const candidates = THEME_PRESETS.map((p) => p.id).filter((id) => id !== currentPreset);
  const seed = dateKey.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return candidates[seed % candidates.length] ?? 'obsidian';
}

export function resolveEffectiveLookAndFeel(params: {
  settings: Partial<AppSettings>;
  systemDark: boolean;
  now?: Date;
}): {
  resolvedPreset: ThemePresetDefinition;
  resolvedIsDark: boolean;
  laf: LookAndFeelSettings;
  accentHex: string;
  accentContrast: string;
} {
  const { settings, systemDark, now = new Date() } = params;
  const laf = getLookAndFeelSettings(settings);

  // Determine base dark vs light from Schedule, Light Clean preset, or ThemeMode
  let presetId: ThemePresetId = laf.preset;
  if (laf.surpriseDateKey && laf.surprisePreset && laf.surpriseDateKey === toYmd(now)) {
    presetId = laf.surprisePreset;
  }

  let resolvedIsDark: boolean;
  if (laf.scheduleEnabled) {
    const hr = now.getHours();
    const isDaytime = hr >= 7 && hr < 19;
    resolvedIsDark = !isDaytime;
    if (isDaytime) {
      presetId = 'light_clean';
    } else if (presetId === 'light_clean') {
      presetId = 'obsidian';
    }
  } else if (presetId === 'light_clean') {
    resolvedIsDark = false;
  } else if (presetId !== 'default') {
    // True-black/dark presets run dark natively unless the user explicitly chooses light mode
    resolvedIsDark = settings.theme === 'light' ? false : true;
  } else {
    resolvedIsDark =
      settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  }

  const basePreset =
    THEME_PRESET_MAP[presetId] ??
    (resolvedIsDark ? THEME_PRESET_MAP.default : THEME_PRESET_MAP.light_clean);

  // If user chose 'default' + light theme or a dark preset + explicit light theme:
  const effectivePreset: ThemePresetDefinition =
    !resolvedIsDark && basePreset.isDark
      ? {
          ...THEME_PRESET_MAP.light_clean,
          id: basePreset.id,
          name: basePreset.name,
          accent: basePreset.id === 'default' ? '#0284C7' : THEME_PRESET_MAP.light_clean.accent,
        }
      : basePreset;

  let accentHex = effectivePreset.accent;
  let accentContrast = effectivePreset.accentContrast;

  if (laf.customAccentHex) {
    const norm = normalizeHex(laf.customAccentHex);
    if (norm) {
      accentHex = norm;
      accentContrast = autoContrastText(norm);
    }
  } else if (presetId === 'default' && settings.accent) {
    const legacyDark: Record<string, { hex: string; contrast: string }> = {
      sky: { hex: '#38BDF8', contrast: '#04131E' },
      mint: { hex: '#34D399', contrast: '#03150E' },
      violet: { hex: '#A78BFA', contrast: '#0C0818' },
      amber: { hex: '#FBBF24', contrast: '#141005' },
    };
    const legacyLight: Record<string, { hex: string; contrast: string }> = {
      sky: { hex: '#0284C7', contrast: '#FFFFFF' },
      mint: { hex: '#059669', contrast: '#FFFFFF' },
      violet: { hex: '#7C3AED', contrast: '#FFFFFF' },
      amber: { hex: '#B45309', contrast: '#FFFFFF' },
    };
    const chosen = (resolvedIsDark ? legacyDark : legacyLight)[settings.accent];
    if (chosen) {
      accentHex = chosen.hex;
      accentContrast = chosen.contrast;
    }
  }

  return {
    resolvedPreset: effectivePreset,
    resolvedIsDark,
    laf,
    accentHex,
    accentContrast,
  };
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getShareCardPalette(settings: Partial<AppSettings>): {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  good: string;
  warn: string;
  border: string;
} {
  const systemDark =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const { resolvedPreset, resolvedIsDark, accentHex } = resolveEffectiveLookAndFeel({
    settings,
    systemDark,
  });
  return {
    bg: resolvedPreset.bgPage,
    surface: resolvedPreset.bgSurfaceSolid,
    text: resolvedPreset.textPrimary,
    muted: resolvedPreset.textSecondary,
    accent: accentHex,
    good: resolvedIsDark ? '#34D399' : '#059669',
    warn: resolvedIsDark ? '#FBBF24' : '#D97706',
    border: resolvedPreset.borderSubtle,
  };
}

export function applyLookAndFeelToDocument(settings: AppSettings, systemDark: boolean): boolean {
  if (typeof document === 'undefined') return true;
  const root = document.documentElement;
  const reducedMotion = Boolean(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  const { resolvedPreset, resolvedIsDark, laf, accentHex, accentContrast } =
    resolveEffectiveLookAndFeel({ settings, systemDark });

  if (resolvedIsDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  root.setAttribute('data-theme-preset', resolvedPreset.id);
  root.setAttribute('data-accent', settings.accent || 'sky');
  root.setAttribute('data-corner', laf.cornerStyle);
  root.setAttribute('data-card-style', laf.cardStyle);
  root.setAttribute('data-icon-style', laf.iconStyle);
  root.setAttribute('data-density', laf.density);
  root.setAttribute('data-font-style', laf.fontStyle);

  const effectiveMotion =
    reducedMotion || laf.animationLevel === 'off' ? 'off' : laf.animationLevel;
  root.setAttribute('data-motion', effectiveMotion);

  const effectiveBg: BackgroundStyle =
    laf.backgroundStyle === 'ambient' &&
    (reducedMotion || laf.batterySaverMode || effectiveMotion === 'off')
      ? 'none'
      : laf.backgroundStyle;
  root.setAttribute('data-bg-style', effectiveBg);

  root.style.setProperty('--bg-page', resolvedPreset.bgPage);
  root.style.setProperty('--bg-surface', resolvedPreset.bgSurface);
  root.style.setProperty('--bg-surface-solid', resolvedPreset.bgSurfaceSolid);
  root.style.setProperty('--text-primary', resolvedPreset.textPrimary);
  root.style.setProperty('--text-secondary', resolvedPreset.textSecondary);
  root.style.setProperty('--border-subtle', resolvedPreset.borderSubtle);
  root.style.setProperty('--accent', accentHex);
  root.style.setProperty('--accent-secondary', resolvedPreset.accentSecondary);
  root.style.setProperty('--accent-contrast', accentContrast);
  root.style.setProperty('--accent-soft', hexToRgba(accentHex, resolvedIsDark ? 0.14 : 0.11));
  root.style.setProperty('--accent-glow', hexToRgba(accentHex, resolvedIsDark ? 0.22 : 0.16));

  // Corner radius CSS token
  const radiusMap: Record<CornerStyle, { card: string; btn: string }> = {
    sharp: { card: '8px', btn: '6px' },
    soft: { card: '22px', btn: '14px' },
    pill: { card: '28px', btn: '9999px' },
  };
  root.style.setProperty('--ascend-radius-card', radiusMap[laf.cornerStyle].card);
  root.style.setProperty('--ascend-radius-btn', radiusMap[laf.cornerStyle].btn);

  // Text size scaling (100% - 130%)
  const clampedScale = Math.max(100, Math.min(130, laf.textScalePct || 100));
  root.style.fontSize = `${clampedScale}%`;

  // Browser theme-color & private display title
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', resolvedPreset.bgPage);
  }
  const safeName = (laf.displayAppName || 'ASCEND').trim() || 'ASCEND';
  if (document.title !== `${safeName} — Personal OS`) {
    document.title = `${safeName} — Personal OS`;
  }

  return resolvedIsDark;
}

// ============================================================================
// Sounds (OFF by default) & Haptics
// ============================================================================

export function triggerUiHaptic(settings?: Partial<AppSettings> | null, pattern: number | number[] = 10): void {
  const laf = getLookAndFeelSettings(settings);
  if (laf.haptics === 'off') return;
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore unsupported vibration APIs
  }
}

export function playUiSound(
  settings: Partial<AppSettings> | null | undefined,
  kind: 'click' | 'done' | 'level_up'
): void {
  const laf = getLookAndFeelSettings(settings);
  const soundActive = Boolean(laf.soundsEnabled || settings?.soundEnabled);
  triggerUiHaptic(settings, kind === 'level_up' ? [14, 40, 18] : 10);
  if (!soundActive || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const playNote = (freqStart: number, freqEnd: number, offset: number, dur: number, gainPeak: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqStart, now + offset);
      osc.frequency.exponentialRampToValueAtTime(freqEnd, now + offset + dur * 0.7);
      gain.gain.setValueAtTime(gainPeak, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + dur + 0.01);
    };

    if (kind === 'click') {
      playNote(440, 520, 0, 0.06, 0.03);
    } else if (kind === 'done') {
      playNote(587.33, 880, 0, 0.14, 0.045);
    } else {
      playNote(523.25, 659.25, 0, 0.12, 0.05);
      playNote(659.25, 1046.5, 0.1, 0.18, 0.055);
    }
  } catch {
    // Autoplay blocked before gesture — safe to ignore
  }
}
