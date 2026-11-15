import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Crown, ScanFace, Sparkles, Dumbbell } from 'lucide-react';
import { CareScreen } from './CareScreen';
import { ScreenSkeleton } from '../components/ui/Skeletons';
import { TierLadderCard } from '../components/psl/TierLadderCard';
import { FaceExercisesPanel } from '../components/exercises/FaceExercisesPanel';
import { getPslTierMeta } from '../lib/faceMetricsConstants';
import { en } from '../i18n/en';
import type {
  AppSettings,
  FaceScanResult,
  HairPreference,
  OutfitRecord,
  OwnedProduct,
  PuffinessLogEntry,
  SkinEntry,
  UserProfile,
  WardrobeItem,
} from '../types';

const PslLabScreen = lazy(() =>
  import('./PslLabScreen').then((m) => ({ default: m.PslLabScreen }))
);

interface FaceHubScreenProps {
  profile: UserProfile;
  settings: AppSettings;
  products: OwnedProduct[];
  skinEntries: SkinEntry[];
  hairPrefs: HairPreference[];
  wardrobe: WardrobeItem[];
  outfits: OutfitRecord[];
  scans: FaceScanResult[];
  puffinessLogs: PuffinessLogEntry[];
  initialTab?: string;
  onBackToPlan: () => void;
  onAskCoach?: () => void;
}

export const FaceHubScreen: React.FC<FaceHubScreenProps> = ({
  profile,
  settings,
  products,
  skinEntries,
  hairPrefs,
  wardrobe,
  outfits,
  scans,
  puffinessLogs,
  initialTab,
  onBackToPlan,
  onAskCoach,
}) => {
  const resolveTab = (t?: string): 'scanner' | 'care' | 'exercises' => {
    if (t === 'care' || t === 'skin' || t === 'hair' || t === 'style' || t === 'lean_face') {
      return 'care';
    }
    if (t === 'exercises') return 'exercises';
    return 'scanner';
  };

  const [tab, setTab] = useState<'scanner' | 'care' | 'exercises'>(() => resolveTab(initialTab));
  const [showLadder, setShowLadder] = useState(false);

  useEffect(() => {
    if (initialTab) setTab(resolveTab(initialTab));
  }, [initialTab]);

  const careSubTab =
    initialTab === 'skin' || initialTab === 'hair' || initialTab === 'style' || initialTab === 'lean_face'
      ? initialTab
      : undefined;

  const latestScan = scans[0] ?? null;
  const slangTiers = settings.slangTierNames ?? true;
  const latestTier = latestScan ? getPslTierMeta(latestScan.pslEstimate, slangTiers) : null;

  return (
    <div className="space-y-4">
      {/* Your Tier Card */}
      <section className="ascend-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/35 text-[var(--accent)] flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Your tier
              </p>
              {latestScan && latestTier ? (
                <p className="font-display text-base font-bold truncate">
                  {latestTier.bracketLabel}{' '}
                  <span className="font-mono-num text-sm text-[var(--accent)]">
                    · {latestScan.pslEstimate}/8
                  </span>
                </p>
              ) : (
                <p className="font-display text-sm font-bold">
                  Run your first scan to see your baseline tier
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onAskCoach && (
              <button
                type="button"
                onClick={onAskCoach}
                className="px-3 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold min-h-[40px]"
              >
                Ask why
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowLadder((v) => !v)}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[40px]"
            >
              {showLadder ? 'Hide tier ladder' : 'Tier ladder'}
            </button>
          </div>
        </div>

        {showLadder && (
          <TierLadderCard
            score={latestScan ? latestScan.pslEstimate : null}
            slangTierNames={slangTiers}
            compact
          />
        )}
      </section>

      <div
        role="tablist"
        aria-label="Face hub sections"
        className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-200/80 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10"
      >
        {([
          { id: 'scanner', label: en.faceHub.scanner, icon: <ScanFace className="w-4 h-4" /> },
          { id: 'care', label: en.faceHub.care, icon: <Sparkles className="w-4 h-4" /> },
          { id: 'exercises', label: en.faceHub.exercises, icon: <Dumbbell className="w-4 h-4" /> },
        ] as const).map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-semibold min-h-[44px] transition ${
                active
                  ? 'bg-white dark:bg-[var(--accent)] text-slate-900 dark:text-[var(--accent-contrast)] shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'scanner' && (
        <Suspense fallback={<ScreenSkeleton />}>
          <PslLabScreen scans={scans} settings={settings} onBack={onBackToPlan} />
        </Suspense>
      )}

      {tab === 'care' && (
        <CareScreen
          profile={profile}
          products={products}
          skinEntries={skinEntries}
          hairPrefs={hairPrefs}
          wardrobe={wardrobe}
          outfits={outfits}
          scans={scans}
          puffinessLogs={puffinessLogs}
          initialTab={careSubTab}
        />
      )}

      {tab === 'exercises' && (
        <FaceExercisesPanel profile={profile} settings={settings} />
      )}

      <p className="text-center text-xs text-slate-500 dark:text-slate-400 pt-1">
        {en.safety.scoreFooter}
      </p>
    </div>
  );
};
