import React, { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Ban,
  Bell,
  BookOpen,
  CalendarRange,
  Check,
  ChevronRight,
  Download,
  Dumbbell,
  LayoutDashboard,
  Link2,
  ListChecks,
  MessageSquareText,
  Palette,
  Ruler,
  ScanFace,
  Search,
  Settings,
  Shield,
  Shirt,
  Sparkles,
  TrendingUp,
  Utensils,
  Compass,
} from 'lucide-react';
import { EmptyState } from '../components/ui/Skeletons';
import { MINDSET_PATHS } from '../data/pathsCatalog';
import { getBadgeTitleForPath, getMindsetPathsSettings } from '../lib/mindsetEngine';
import type { AppSettings, UserProfile, XpState } from '../types';
import { getRankForLevel } from '../data/badges';

interface MoreScreenProps {
  profile: UserProfile;
  settings?: AppSettings;
  xpState: XpState;
  onNavigate: (screen: string, subTab?: string) => void;
  onOpenCoach: () => void;
  onOpenReminders: () => void;
  onOpenPathPicker?: () => void;
}

interface ModuleLink {
  id: string;
  label: string;
  desc: string;
  category: string;
  icon: React.ReactNode;
  action: () => void;
}

export const MoreScreen: React.FC<MoreScreenProps> = ({
  profile,
  settings,
  xpState,
  onNavigate,
  onOpenCoach,
  onOpenReminders,
  onOpenPathPicker,
}) => {
  const [search, setSearch] = useState('');
  const [pathFilter, setPathFilter] = useState<'all' | 'real_person' | 'story' | 'custom'>('all');
  const [pathQuery, setPathQuery] = useState('');
  const mp = getMindsetPathsSettings(settings);
  const rankLabel = getBadgeTitleForPath(
    xpState.level,
    settings,
    getRankForLevel(xpState.level)
  );

  const modules: ModuleLink[] = useMemo(
    () => [
      {
        id: 'mindset-paths',
        label: 'Mindset Paths & Daily Cut',
        desc: 'Pick Real athletes or Story archetypes, mode, Daily Video & Chapters',
        category: 'Plan',
        icon: <Compass className="w-4 h-4 text-[var(--accent)]" />,
        action: () => (onOpenPathPicker ? onOpenPathPicker() : onNavigate('settings')),
      },
      {
        id: 'look-feel',
        label: 'Look & Feel (Themes)',
        desc: '9 true-black/light themes, custom accent hex, corners, motion & icons',
        category: 'System',
        icon: <Palette className="w-4 h-4 text-[var(--accent)]" />,
        action: () => onNavigate('settings'),
      },
      {
        id: 'diet',
        label: 'Diet',
        desc: 'Goals, calories, protein, weekly trend, What should I eat? & street food',
        category: 'Food',
        icon: <Utensils className="w-4 h-4 text-[var(--accent)]" />,
        action: () => onNavigate('diet'),
      },
      {
        id: 'fight-camp',
        label: 'Fight Camp Mode',
        desc: 'Safe weekly cut pace, training fuel & tournament countdown',
        category: 'Plan',
        icon: <Shield className="w-4 h-4 text-[var(--accent)]" />,
        action: () => onNavigate('plan', 'now'),
      },
      {
        id: 'weekly-review',
        label: 'Weekly Leader Review',
        desc: 'Sunday summary, training & sleep audit, and next week plan',
        category: 'Plan',
        icon: <CalendarRange className="w-4 h-4 text-emerald-400" />,
        action: () => onNavigate('plan', 'now'),
      },
      {
        id: 'connections',
        label: 'Connections & Import',
        desc: 'Import CSV/JSON exports, Share Target & Health Connect limits',
        category: 'Data',
        icon: <Link2 className="w-4 h-4 text-sky-400" />,
        action: () => onNavigate('settings'),
      },
      {
        id: 'progress',
        label: 'Progress / Insights',
        desc: 'Charts, weekly scores, badges, and milestones',
        category: 'Analytics',
        icon: <TrendingUp className="w-4 h-4 text-[var(--accent)]" />,
        action: () => onNavigate('health', 'trends'),
      },
      {
        id: 'trackers',
        label: 'Trackers (Body, Sleep & Gym)',
        desc: 'Weight, waist, sleep log, and workout split sessions',
        category: 'Body',
        icon: <Activity className="w-4 h-4 text-emerald-400" />,
        action: () => onNavigate('health', 'body'),
      },
      {
        id: 'nutrition-vault',
        label: 'AI Food & Debloat Vault',
        desc: 'Full plate history, portion sliders & sodium breakdown',
        category: 'Food',
        icon: <Utensils className="w-4 h-4 text-amber-400" />,
        action: () => onNavigate('health', 'meals'),
      },
      {
        id: 'skin-lab',
        label: 'Skin Lab',
        desc: 'Skin log, product shelf, AM/PM steps & barrier care',
        category: 'Looks Care',
        icon: <Sparkles className="w-4 h-4 text-sky-400" />,
        action: () => onNavigate('face', 'skin'),
      },
      {
        id: 'hair-grooming',
        label: 'Hair & Grooming',
        desc: 'Face-shape haircut picks, barber scripts & brow care',
        category: 'Looks Care',
        icon: <ScanFace className="w-4 h-4 text-violet-400" />,
        action: () => onNavigate('face', 'hair'),
      },
      {
        id: 'style',
        label: 'Style & Wardrobe',
        desc: 'Wardrobe items, saved outfits & proportion fit tips',
        category: 'Looks Care',
        icon: <Shirt className="w-4 h-4 text-pink-400" />,
        action: () => onNavigate('face', 'style'),
      },
      {
        id: 'face-exercises',
        label: 'Face Exercises',
        desc: 'Guided jawline release, de-puff sweep & posture drills',
        category: 'Face',
        icon: <Dumbbell className="w-4 h-4 text-[var(--accent)]" />,
        action: () => onNavigate('face', 'exercises'),
      },
      {
        id: 'academy',
        label: 'Academy & Myths',
        desc: 'Science-checked guides on skin, bone, sleep & debloat',
        category: 'Learn',
        icon: <BookOpen className="w-4 h-4 text-emerald-400" />,
        action: () => onNavigate('academy'),
      },
      {
        id: 'habit-library',
        label: 'Habit Library & Mind',
        desc: 'Browse all habits, mind check-ins & 12-week roadmap',
        category: 'Plan',
        icon: <ListChecks className="w-4 h-4 text-sky-400" />,
        action: () => onNavigate('routine', 'library'),
      },
      {
        id: 'grow',
        label: 'Height & Posture Hub',
        desc: 'WHO percentiles, parent outlook & daily growth habits',
        category: 'Grow',
        icon: <Ruler className="w-4 h-4 text-[var(--accent)]" />,
        action: () => onNavigate('grow'),
      },
      {
        id: 'quit-list',
        label: 'Quit habits (private)',
        desc: 'Open no-guilt urge timer & 30-day rate (hidden here by default)',
        category: 'Habits',
        icon: <Ban className="w-4 h-4 text-rose-400" />,
        action: () => onNavigate('health', 'quit'),
      },
      {
        id: 'reminders',
        label: 'Reminders',
        desc: 'Daily routine, SPF, hydration & monthly height alerts',
        category: 'Tools',
        icon: <Bell className="w-4 h-4 text-amber-400" />,
        action: onOpenReminders,
      },
      {
        id: 'coach',
        label: 'Coach',
        desc: 'Ask deterministic local coach about skin, bloat, scan or height',
        category: 'Tools',
        icon: <MessageSquareText className="w-4 h-4 text-[var(--accent)]" />,
        action: onOpenCoach,
      },
      {
        id: 'backup',
        label: 'Backup & Restore',
        desc: 'Export JSON or encrypted backup file on your device',
        category: 'Data',
        icon: <Download className="w-4 h-4 text-emerald-400" />,
        action: () => onNavigate('settings'),
      },
      {
        id: 'settings',
        label: 'Settings & Theme',
        desc: 'Slang tier names, Tone (Normal/Chill/Serious), PIN lock',
        category: 'System',
        icon: <Settings className="w-4 h-4 text-slate-400" />,
        action: () => onNavigate('settings'),
      },
      {
        id: 'dashboard',
        label: 'Dashboard (Pro Telemetry)',
        desc: 'Step sensor, sleep dial & full 28-day matrix',
        category: 'Pro',
        icon: <LayoutDashboard className="w-4 h-4 text-sky-400" />,
        action: () => onNavigate('dashboard'),
      },
    ],
    [onNavigate, onOpenCoach, onOpenReminders, onOpenPathPicker]
  );

  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.desc.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
    );
  }, [modules, search]);

  const filteredDirectoryPaths = useMemo(() => {
    const q = pathQuery.trim().toLowerCase();
    return MINDSET_PATHS.filter((p) => {
      if (pathFilter !== 'all' && p.category !== pathFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.oneLineIdea.toLowerCase().includes(q) ||
        p.takeThis.toLowerCase().includes(q)
      );
    });
  }, [pathFilter, pathQuery]);

  return (
    <div className="space-y-4">
      {/* Header + Profile Summary */}
      <div className="ascend-card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">More &amp; All Tools</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {profile.name.trim() ? `${profile.name.trim()} · ` : ''}
            Level {xpState.level} {rankLabel} · {xpState.currentStreak}d streak
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
        >
          <Palette className="w-4 h-4" /> Settings
        </button>
      </div>

      {/* Search Box */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search any tool: Skin Lab, Hair, Style, Quit list, Academy, Backup..."
          aria-label="Search modules and tools"
          className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-base min-h-[48px]"
        />
      </div>

      {/* Searchable Grid of Every Screen & Tool */}
      {filteredModules.length === 0 ? (
        <EmptyState
          title="No matching module"
          message="Try searching Skin, Hair, Style, Trackers, Coach, Backup, or Settings."
          actionLabel="Clear search"
          onAction={() => setSearch('')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filteredModules.map((mod) => (
            <button
              key={mod.id}
              type="button"
              onClick={mod.action}
              className="ascend-card p-4 flex items-center justify-between gap-3 text-left hover:border-[var(--accent)]/40 transition min-h-[68px]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center shrink-0">
                  {mod.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{mod.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{mod.desc}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Paths Directory (Search + Real people / Story / My custom filter) */}
      <section className="ascend-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-[var(--accent)]" /> Paths Directory
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Browse all Mindset Paths by category or open the full picker.
            </p>
          </div>
          {onOpenPathPicker && (
            <button
              type="button"
              onClick={onOpenPathPicker}
              className="px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px]"
            >
              Pick Paths
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={pathQuery}
            onChange={(e) => setPathQuery(e.target.value)}
            placeholder="Filter paths (Khabib, Goggins, Hacker, Strategist...)"
            className="flex-1 min-w-[180px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs min-h-[38px]"
          />
          <div className="flex items-center gap-1">
            {([
              { id: 'all', label: 'All' },
              { id: 'real_person', label: 'Real people' },
              { id: 'story', label: 'Story' },
              { id: 'custom', label: 'My custom' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPathFilter(tab.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold min-h-[34px] ${
                  pathFilter === tab.id
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-slate-100 dark:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          {filteredDirectoryPaths.map((p) => {
            const active = mp.mainPathId === p.id || mp.inspirationIds.includes(p.id);
            return (
              <div
                key={p.id}
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold truncate">{p.name}</span>
                  {active && (
                    <span className="text-[10px] font-bold text-[var(--accent)] shrink-0">Active</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{p.oneLineIdea}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Restored & Reachable Index */}
      <section className="ascend-card p-4 space-y-2 text-xs">
        <p className="font-bold flex items-center gap-1.5 text-[var(--accent)]">
          <Award className="w-4 h-4" /> Everything preserved &amp; restored
        </p>
        <ul className="space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
          <li className="flex items-start gap-1.5">
            <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
            <span>
              <strong>PSL LAB Slang Tiers ON by default:</strong> Chad (Elite), Chadlite, HTN (High-Tier Normie), True Normie, LTN (Low-Tier Normie), Developing.
            </span>
          </li>
          <li className="flex items-start gap-1.5">
            <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
            <span>
              <strong>Every v1 module reachable here:</strong> Progress / Insights, Trackers, AI Food &amp; Debloat Vault, Skin Lab, Hair &amp; Grooming, Style, Academy &amp; Myths, Quit list, Reminders, Coach, Backup, Settings, and Pro Dashboard.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
};
