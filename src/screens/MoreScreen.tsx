import React, { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Ban,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  Dumbbell,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Palette,
  Ruler,
  ScanFace,
  Search,
  Settings,
  Shirt,
  Sparkles,
  TrendingUp,
  Utensils,
} from 'lucide-react';
import { EmptyState } from '../components/ui/Skeletons';
import type { UserProfile, XpState } from '../types';
import { getRankForLevel } from '../data/badges';

interface MoreScreenProps {
  profile: UserProfile;
  xpState: XpState;
  onNavigate: (screen: string, subTab?: string) => void;
  onOpenCoach: () => void;
  onOpenReminders: () => void;
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
  xpState,
  onNavigate,
  onOpenCoach,
  onOpenReminders,
}) => {
  const [search, setSearch] = useState('');

  const modules: ModuleLink[] = useMemo(
    () => [
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
    [onNavigate, onOpenCoach, onOpenReminders]
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

  return (
    <div className="space-y-4">
      {/* Header + Profile Summary */}
      <div className="ascend-card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">More &amp; All Tools</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {profile.name.trim() ? `${profile.name.trim()} · ` : ''}
            Level {xpState.level} {getRankForLevel(xpState.level)} · {xpState.currentStreak}d streak
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
