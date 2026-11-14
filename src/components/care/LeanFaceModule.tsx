import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Droplets,
  Eye,
  Info,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { addProtocolToPlan, db, getOrCreateDailyLog } from '../../db/database';
import { toLocalDateKey } from '../../lib/date';
import { calculateMifflinStJeor } from '../../lib/fitness';
import { BeforeAfterSlider } from '../ui/Charts';
import { useToast } from '../ui/ToastProvider';
import type { PuffinessLogEntry, UserProfile } from '../../types';

interface LeanFaceModuleProps {
  profile: UserProfile;
  puffinessLogs: PuffinessLogEntry[];
}

export const LeanFaceModule: React.FC<LeanFaceModuleProps> = ({
  profile,
  puffinessLogs,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();

  const [puffiness, setPuffiness] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [sleepHours, setSleepHours] = useState('7.5');
  const [alcoholOrSalty, setAlcoholOrSalty] = useState(false);
  const [weeklyPhoto, setWeeklyPhoto] = useState<string>('');
  const [photoIdxA, setPhotoIdxA] = useState(0);
  const [photoIdxB, setPhotoIdxB] = useState(1);

  const weightKg = Math.max(35, profile.weightKg || 74);
  const heightCm = Math.max(120, profile.heightCm || 178);
  const age = Math.max(12, profile.age || 24);
  const isUnder18 = age < 18;

  const cutMetrics = useMemo(() => {
    const calc = calculateMifflinStJeor({
      sex: profile.sex,
      weightKg,
      heightCm,
      age,
      activityLevel: profile.activityLevel || 'moderate',
      goalMode: 'cut',
    });
    const minProtein = Math.round(weightKg * 1.6);
    const maxProtein = Math.round(weightKg * 2.2);
    const minPaceKg = Number((weightKg * 0.005).toFixed(2));
    const maxPaceKg = Number((weightKg * 0.01).toFixed(2));
    const bwWaterMl = Math.round(Math.max(1800, Math.min(3800, weightKg * 35)));
    return {
      ...calc,
      minProtein,
      maxProtein,
      minPaceKg,
      maxPaceKg,
      bwWaterMl,
    };
  }, [profile.sex, weightKg, heightCm, age, profile.activityLevel]);

  const sortedLogs = useMemo(
    () => [...puffinessLogs].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt),
    [puffinessLogs]
  );

  const recentLogs = useMemo(() => [...sortedLogs].reverse().slice(0, 14), [sortedLogs]);

  const photoLogs = useMemo(
    () => [...sortedLogs].reverse().filter((l) => Boolean(l.photoDataUrl)),
    [sortedLogs]
  );

  // Real data pattern analysis (strictly unlocked after 14 logs)
  const myPatternSummary = useMemo(() => {
    if (sortedLogs.length < 14) return null;
    const saltyLogs = sortedLogs.filter((l) => l.alcoholOrSaltyMeal);
    const cleanLogs = sortedLogs.filter((l) => !l.alcoholOrSaltyMeal);
    const avgSalty = saltyLogs.length
      ? Number((saltyLogs.reduce((s, l) => s + l.puffiness, 0) / saltyLogs.length).toFixed(2))
      : null;
    const avgClean = cleanLogs.length
      ? Number((cleanLogs.reduce((s, l) => s + l.puffiness, 0) / cleanLogs.length).toFixed(2))
      : null;

    const shortSleep = sortedLogs.filter((l) => l.sleepHours > 0 && l.sleepHours < 7);
    const goodSleep = sortedLogs.filter((l) => l.sleepHours >= 7);
    const avgShortSleep = shortSleep.length
      ? Number((shortSleep.reduce((s, l) => s + l.puffiness, 0) / shortSleep.length).toFixed(2))
      : null;
    const avgGoodSleep = goodSleep.length
      ? Number((goodSleep.reduce((s, l) => s + l.puffiness, 0) / goodSleep.length).toFixed(2))
      : null;

    const overallAvg = Number(
      (sortedLogs.reduce((s, l) => s + l.puffiness, 0) / sortedLogs.length).toFixed(2)
    );

    return {
      totalDays: sortedLogs.length,
      overallAvg,
      avgSalty,
      avgClean,
      saltyCount: saltyLogs.length,
      cleanCount: cleanLogs.length,
      avgShortSleep,
      avgGoodSleep,
      shortSleepCount: shortSleep.length,
      goodSleepCount: goodSleep.length,
    };
  }, [sortedLogs]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 560 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        setWeeklyPhoto(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveMorningCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    const hrs = Math.max(0, Math.min(18, Number(sleepHours) || 0));
    await db.puffinessLogs.add({
      date: todayKey,
      puffiness,
      sleepHours: hrs,
      alcoholOrSaltyMeal: alcoholOrSalty,
      photoDataUrl: weeklyPhoto || undefined,
      createdAt: Date.now(),
    });
    await getOrCreateDailyLog(todayKey);
    await db.dailyLogs.update(todayKey, {
      morningPuffiness: puffiness <= 2 ? 'none' : puffiness === 3 ? 'mild' : 'noticeable',
      sleepHours: hrs,
      updatedAt: Date.now(),
    });
    setWeeklyPhoto('');
    showToast('Morning puffiness check saved');
  };

  const handleQuickAddHabit = async (protocolId: string, label: string) => {
    const added = await addProtocolToPlan(protocolId, 'Lean Face');
    if (added) {
      showToast(`Added "${label}" to Today's Stack`);
    }
  };

  const chartLogs = sortedLogs.slice(-14);

  return (
    <div className="space-y-4">
      {/* 1. What really changes the cheeks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 ascend-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-display text-base font-bold">
              What Really Changes the Cheeks
            </h2>
            <span className="px-2.5 py-0.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-bold uppercase tracking-wider">
              Direct &amp; Honest
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Facial fat cannot be spot-reduced. Cheek slimness comes from two real levers:{' '}
            <strong>overall body fat</strong> and <strong>daily water retention</strong>.
          </p>

          {isUnder18 ? (
            <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 space-y-1.5 text-xs">
              <p className="font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                <Info className="w-4 h-4 shrink-0" />
                Under 18 / Still Growing — Talk to a Doctor
              </p>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Cut calculators are hidden while you are still growing. Focus on resistance training, 8–9 hours of sleep, hydration, and whole-food quality rather than calorie restriction.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-black/35 border border-slate-200 dark:border-white/10 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-[var(--accent)] uppercase tracking-wider text-[11px]">
                  Safe Cut Baseline (Mifflin-St Jeor)
                </span>
                <span className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400">
                  Floor: ≥ {cutMetrics.safeFloor} kcal/day
                </span>
              </div>
              <p className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400">
                {cutMetrics.formulaLabel}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-num">
                <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
                  <div className="text-[10px] text-slate-500">Maintenance</div>
                  <div className="text-sm font-bold">{cutMetrics.tdee} kcal</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
                  <div className="text-[10px] text-slate-500">Safe Cut Target</div>
                  <div className="text-sm font-bold text-[var(--accent)]">
                    {cutMetrics.recommendedCalories} kcal
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
                  <div className="text-[10px] text-slate-500">Pace (0.5–1%/wk)</div>
                  <div className="text-sm font-bold">
                    {cutMetrics.minPaceKg}–{cutMetrics.maxPaceKg} kg
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
                  <div className="text-[10px] text-slate-500">Protein (1.6–2.2g/kg)</div>
                  <div className="text-sm font-bold">
                    {cutMetrics.minProtein}–{cutMetrics.maxProtein} g
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stop-cutting signs card */}
        <div className="lg:col-span-5 ascend-card p-5 space-y-3 border-amber-500/25">
          <h2 className="font-display text-base font-bold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Stop-Cutting Signs
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Extreme cutting makes a face look older and tired, not &ldquo;hollow&rdquo;. Pause your deficit and return to maintenance if you notice:
          </p>
          <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            <li>• Low daily energy or weak gym performance</li>
            <li>• Poor or fragmented sleep</li>
            <li>• Constant hunger or obsessing over food</li>
            <li>• A gaunt, drained, or dark-under-eye look</li>
          </ul>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-white/10">
            Calories are always clamped above your safe floor ({cutMetrics.safeFloor} kcal).
          </p>
        </div>
      </div>

      {/* 2. Light Debloat Tasks */}
      <section className="ascend-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold flex items-center gap-2">
              <Droplets className="w-4 h-4 text-[var(--accent)]" />
              Light Debloat Tasks
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Scaled to your bodyweight ({weightKg} kg →{' '}
              <strong className="font-mono-num text-[var(--accent)]">
                {(cutMetrics.bwWaterMl / 1000).toFixed(2)} L/day
              </strong>{' '}
              target, not a fixed 4 L)
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleQuickAddHabit('face-debloat-water', 'Consistent Hydration')}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold min-h-[44px]"
            >
              <Plus className="w-3.5 h-3.5" /> Add Water Habit
            </button>
            <button
              type="button"
              onClick={() => handleQuickAddHabit('body-10min-walk', '10-min Walk')}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
            >
              <Plus className="w-3.5 h-3.5" /> Add 10m Walk
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/20 space-y-1.5">
            <p className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Do Consistently
            </p>
            <ul className="space-y-1 text-slate-600 dark:text-slate-300">
              <li>• Consistent daily water (~{(cutMetrics.bwWaterMl / 1000).toFixed(2)} L based on {weightKg} kg)</li>
              <li>• Moderate, steady salt intake (never zero sodium)</li>
              <li>• Limit alcohol, added sugar, and ultra-processed meals</li>
              <li>• 7–9 hours of sleep + a 10-minute outdoor walk</li>
              <li>• Potassium-rich foods (spinach, potato, banana, avocado)</li>
            </ul>
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-500/[0.06] border border-rose-500/25 space-y-1.5">
            <p className="font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Banned / Skip Completely
            </p>
            <ul className="space-y-1 text-slate-600 dark:text-slate-300">
              <li>• Dehydration tricks or cutting water</li>
              <li>• Diuretics or &ldquo;water pills&rdquo;</li>
              <li>• Sauna dumping for facial slimming</li>
              <li>• &ldquo;Water fasting&rdquo; to chase hollow cheeks</li>
            </ul>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              Rebound water retention after dehydration makes morning puffiness worse.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Real Morning Puffiness Log & 14-Day Pattern */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 10-second Morning Check Form */}
        <form onSubmit={handleSaveMorningCheck} className="lg:col-span-5 ascend-card p-5 space-y-3.5">
          <div>
            <h2 className="font-display text-base font-bold">10-Second Morning Check</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Log your real data only. Patterns unlock after 14 days of entries.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5">
              Face puffiness right now (1 = Sharp, 5 = Puffy)
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {([1, 2, 3, 4, 5] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setPuffiness(lvl)}
                  className={`py-2.5 rounded-xl font-mono-num text-sm font-bold min-h-[44px] border transition ${
                    puffiness === lvl
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent'
                      : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Sleep hours
              </label>
              <input
                type="number"
                step="0.5"
                min={0}
                max={16}
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-base sm:text-xs min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Alcohol / salty meal?
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setAlcoholOrSalty(false)}
                  className={`py-2 rounded-xl text-xs font-semibold min-h-[44px] border ${
                    !alcoholOrSalty
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/40'
                      : 'bg-slate-100 dark:bg-white/5 border-transparent'
                  }`}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setAlcoholOrSalty(true)}
                  className={`py-2 rounded-xl text-xs font-semibold min-h-[44px] border ${
                    alcoholOrSalty
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'bg-slate-100 dark:bg-white/5 border-transparent'
                  }`}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold cursor-pointer min-h-[44px]">
              <Camera className="w-4 h-4 text-[var(--accent)]" />
              {weeklyPhoto ? 'Weekly Photo Ready' : 'Weekly Same-Setup Photo (Opt)'}
              <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
            </label>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
            >
              Save Check-In
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Weekly photo tip: same spot, same lighting, neutral expression.
          </p>
        </form>

        {/* Real Log Chart + Personal Pattern Card */}
        <div className="lg:col-span-7 ascend-card p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold">
              My Puffiness Log ({sortedLogs.length} entries)
            </h2>
            {sortedLogs.length < 14 && sortedLogs.length > 0 && (
              <span className="text-[11px] font-mono-num text-[var(--accent)]">
                {sortedLogs.length}/14 days for pattern
              </span>
            )}
          </div>

          {sortedLogs.length === 0 ? (
            <div className="py-8 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 text-center space-y-1.5">
              <Sparkles className="w-5 h-5 text-[var(--accent)] mx-auto opacity-80" />
              <p className="text-xs font-semibold">No morning puffiness logs yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Log your first 10-second morning check on the left. Nothing is fabricated—charts and personal triggers appear from your real entries.
              </p>
            </div>
          ) : (
            <>
              {myPatternSummary ? (
                <div className="space-y-3">
                  {/* Simple 14-day Puffiness Bar Chart */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-black/35 border border-slate-200 dark:border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Last {chartLogs.length} checks (1 sharp → 5 puffy)</span>
                      <span className="font-mono-num">Avg: {myPatternSummary.overallAvg}/5</span>
                    </div>
                    <div
                      className="grid gap-1 items-end h-20 pt-2"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(1, chartLogs.length)}, minmax(0, 1fr))`,
                      }}
                    >
                      {chartLogs.map((entry, idx) => {
                        const heightPct = (entry.puffiness / 5) * 100;
                        return (
                          <div
                            key={entry.id ?? idx}
                            title={`${entry.date}: Puffiness ${entry.puffiness}/5, Sleep ${entry.sleepHours}h`}
                            className="flex flex-col items-center justify-end h-full gap-1"
                          >
                            <div
                              className={`w-full rounded-t-md ${
                                entry.puffiness >= 4
                                  ? 'bg-amber-400'
                                  : entry.puffiness === 3
                                  ? 'bg-sky-400'
                                  : 'bg-[var(--accent)]'
                              }`}
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pattern Found in MY Data */}
                  <div className="p-3.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 space-y-1.5 text-xs">
                    <p className="font-bold text-[var(--accent)]">
                      Pattern Found in Your {myPatternSummary.totalDays} Logs
                    </p>
                    {myPatternSummary.avgSalty !== null && myPatternSummary.avgClean !== null ? (
                      <p>
                        • After alcohol/salty meals ({myPatternSummary.saltyCount}d): avg puffiness{' '}
                        <strong className="font-mono-num">{myPatternSummary.avgSalty}/5</strong> vs{' '}
                        <strong className="font-mono-num">{myPatternSummary.avgClean}/5</strong> on clean nights.
                      </p>
                    ) : (
                      <p>
                        • Alcohol/salty trigger split needs both &ldquo;Yes&rdquo; and &ldquo;No&rdquo; nights in your logs.
                      </p>
                    )}
                    {myPatternSummary.avgShortSleep !== null && myPatternSummary.avgGoodSleep !== null ? (
                      <p>
                        • Sleep &lt; 7h ({myPatternSummary.shortSleepCount}d): avg{' '}
                        <strong className="font-mono-num">{myPatternSummary.avgShortSleep}/5</strong> vs{' '}
                        <strong className="font-mono-num">{myPatternSummary.avgGoodSleep}/5</strong> with 7h+ sleep.
                      </p>
                    ) : (
                      <p>
                        • Sleep impact split will compare &lt; 7h vs ≥ 7h once both exist in your logs.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300">
                  Keep logging daily morning checks — your 14-day chart and personal pattern analysis unlock after{' '}
                  <strong className="font-mono-num">{14 - sortedLogs.length}</strong> more days.
                </div>
              )}

              {/* Recent Real Log Entries */}
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-mono-num font-semibold">{log.date}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {' '}· Puffiness {log.puffiness}/5 · Sleep {log.sleepHours}h ·{' '}
                        {log.alcoholOrSaltyMeal ? 'Alcohol/salty meal' : 'Clean night'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => log.id && db.puffinessLogs.delete(log.id)}
                      aria-label="Delete puffiness log"
                      className="p-1.5 text-slate-400 hover:text-rose-400 shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Weekly Same-Setup Photos */}
          {photoLogs.length >= 2 && (
            <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold">Weekly Photo Compare</span>
                <div className="flex gap-1.5">
                  <select
                    value={photoIdxA}
                    onChange={(e) => setPhotoIdxA(Number(e.target.value))}
                    className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-base sm:text-xs"
                  >
                    {photoLogs.map((p, idx) => (
                      <option key={p.id} value={idx}>
                        {p.date}
                      </option>
                    ))}
                  </select>
                  <select
                    value={photoIdxB}
                    onChange={(e) => setPhotoIdxB(Number(e.target.value))}
                    className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-base sm:text-xs"
                  >
                    {photoLogs.map((p, idx) => (
                      <option key={p.id} value={idx}>
                        {p.date}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <BeforeAfterSlider
                beforeSrc={photoLogs[photoIdxA]?.photoDataUrl || photoLogs[0].photoDataUrl!}
                afterSrc={photoLogs[photoIdxB]?.photoDataUrl || photoLogs[1].photoDataUrl!}
                beforeLabel={photoLogs[photoIdxA]?.date || 'Earlier'}
                afterLabel={photoLogs[photoIdxB]?.date || 'Later'}
              />
            </div>
          )}
        </div>
      </div>

      {/* 4 & 5. Hollow Cheeks & Bone + Hunter Eyes (Honest Info Cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hollow Cheeks & Bone */}
        <section className="ascend-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold">Hollow Cheeks &amp; Bone</h2>
            <span className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-white/10 text-[10px] font-bold">
              Anatomy Reality
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Cheek hollowness depends mostly on <strong>overall leanness</strong>,{' '}
            <strong>zygomatic/jaw bone structure</strong>, and the{' '}
            <strong>buccal fat pad (genetic)</strong>.
          </p>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Facial Exercises &amp; Heavy Chewing for Bone</span>
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 text-[10px] font-bold">
                Not proven
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              Adult facial bone does NOT gain mass from exercises or chewing. What changes how structure looks: leanness, clear skin, a flattering haircut, grooming, upright posture, and neck/traps &amp; shoulder training.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              Buccal Fat Removal (Info Only)
            </p>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              Surgical excision is irreversible, carries normal surgical risks, and can make the face look older or gaunt over time as natural facial fat decreases. Consult a board-certified surgeon for medical evaluation.
            </p>
          </div>
        </section>

        {/* Hunter Eyes */}
        <section className="ascend-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold flex items-center gap-2">
              <Eye className="w-4 h-4 text-[var(--accent)]" />
              &ldquo;Hunter Eyes&rdquo; Look
            </h2>
            <span className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-white/10 text-[10px] font-bold">
              Anatomy Reality
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Eye shape, orbital support, and canthal tilt are mostly bone and genetics and{' '}
            <strong>cannot be trained</strong> with exercises.
          </p>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs space-y-1">
            <p className="font-semibold text-[var(--accent)]">What Actually Changes the Look</p>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              Overall leanness, 7–9 h sleep, morning de-puffing, clean brow grooming, a haircut that frames the forehead/temples, good lighting/camera angle, and well-proportioned glasses.
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              Eyelid / Canthal Surgery (Info Only)
            </p>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              Procedures around the eyelids or lateral canthus carry functional and cosmetic risks; talk to a qualified specialist if ever considering medical options.
            </p>
          </div>
        </section>
      </div>

      <p className="text-center text-[11px] text-slate-500 dark:text-slate-500 pt-1">
        Self-tracking estimates, not medical advice.
      </p>
    </div>
  );
};
