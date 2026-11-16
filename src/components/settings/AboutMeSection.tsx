import React, { useMemo, useState } from 'react';
import { Check, Edit3, RotateCcw, ShieldAlert, Trash2, UserCheck } from 'lucide-react';
import {
  createDefaultAboutMe,
  isUnder18OrGrowing,
  regenerateProtocolFromProfile,
  saveAndVerifyProfile,
} from '../../db/database';
import { computeDailyNutritionTargets, resolveSafeDietGoal } from '../../lib/nutrition';
import type { AboutMeItemKey, AboutMeProfile, UserProfile } from '../../types';
import { useToast } from '../ui/ToastProvider';

interface AboutMeSectionProps {
  profile: UserProfile;
}

const ITEM_META: Array<{ key: AboutMeItemKey; title: string }> = [
  { key: 'location_foods', title: 'Egypt & Everyday Foods' },
  { key: 'training_camp', title: 'Gym, MMA & Tournament Weight' },
  { key: 'eating_pattern', title: 'Current Eating Rhythm' },
  { key: 'identity_focus', title: 'Goals & Daily Focus' },
  { key: 'support_style', title: 'Coach & Support Style' },
];

export const AboutMeSection: React.FC<AboutMeSectionProps> = ({ profile }) => {
  const { showToast } = useToast();
  const about: AboutMeProfile = useMemo(
    () => profile.aboutMe ?? createDefaultAboutMe(profile.weightKg),
    [profile.aboutMe, profile.weightKg]
  );

  const [editingKey, setEditingKey] = useState<AboutMeItemKey | null>(null);

  // Draft fields when editing
  const [regionDraft, setRegionDraft] = useState(about.countryRegion);
  const [foodsDraft, setFoodsDraft] = useState(about.localFoods.join(', '));
  const [disciplinesDraft, setDisciplinesDraft] = useState(about.trainingDisciplines.join(', '));
  const [ageDraft, setAgeDraft] = useState(profile.ageExplicitlySet ? String(profile.age) : '');
  const [currentWeightDraft, setCurrentWeightDraft] = useState(
    about.currentWeightKg ? String(about.currentWeightKg) : String(profile.weightKg || '')
  );
  const [targetWeightDraft, setTargetWeightDraft] = useState(
    about.targetWeightKg ? String(about.targetWeightKg) : ''
  );
  const [weightClassDraft, setWeightClassDraft] = useState(
    about.weightClassKg ? String(about.weightClassKg) : ''
  );
  const [tournamentDateDraft, setTournamentDateDraft] = useState(about.tournamentDate ?? '');
  const [eatingDraft, setEatingDraft] = useState(about.eatingPattern);
  const [identityDraft, setIdentityDraft] = useState(about.identityFocus);
  const [supportDraft, setSupportDraft] = useState(about.supportStyle);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const deletedSet = new Set(about.deletedKeys ?? []);
  const visibleItems = ITEM_META.filter((m) => !deletedSet.has(m.key));
  const unconfirmedCount = visibleItems.filter((m) => {
    const st = about.statuses?.[m.key] ?? 'suggested';
    return st === 'suggested';
  }).length;

  const isTeenSafe = isUnder18OrGrowing(profile);

  const persistAboutMe = async (
    nextAbout: AboutMeProfile,
    profilePatch?: Partial<UserProfile>,
    toastMsg?: string,
    options?: { syncProtocol?: boolean; syncNutrition?: boolean }
  ) => {
    let updatedProfile: UserProfile = {
      ...profile,
      ...profilePatch,
      aboutMe: {
        ...nextAbout,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    };
    if (options?.syncNutrition) {
      const safeGoal = resolveSafeDietGoal(updatedProfile);
      const nextTargets = computeDailyNutritionTargets(updatedProfile, safeGoal.goal);
      updatedProfile = {
        ...updatedProfile,
        dietGoal: safeGoal.goal,
        calorieGoal: nextTargets.calories,
        proteinTargetG: nextTargets.proteinG,
        waterTargetMl: nextTargets.debloatWaterMl,
      };
    }
    const verified = await saveAndVerifyProfile(updatedProfile);
    if (profilePatch?.ageExplicitlySet || options?.syncProtocol) {
      await regenerateProtocolFromProfile(verified);
    }
    if (toastMsg) showToast(toastMsg);
  };

  const openEditor = (key: AboutMeItemKey) => {
    setRegionDraft(about.countryRegion);
    setFoodsDraft(about.localFoods.join(', '));
    setDisciplinesDraft(about.trainingDisciplines.join(', '));
    setAgeDraft(profile.ageExplicitlySet ? String(profile.age) : '');
    setCurrentWeightDraft(
      about.currentWeightKg ? String(about.currentWeightKg) : String(profile.weightKg || '')
    );
    setTargetWeightDraft(about.targetWeightKg ? String(about.targetWeightKg) : '');
    setWeightClassDraft(about.weightClassKg ? String(about.weightClassKg) : '');
    setTournamentDateDraft(about.tournamentDate ?? '');
    setEatingDraft(about.eatingPattern);
    setIdentityDraft(about.identityFocus);
    setSupportDraft(about.supportStyle);
    setEditingKey(key);
  };

  const handleConfirmItem = async (key: AboutMeItemKey) => {
    const needsProtocolSync =
      key === 'training_camp' || key === 'eating_pattern' || key === 'identity_focus' || key === 'location_foods';
    await persistAboutMe(
      {
        ...about,
        statuses: { ...about.statuses, [key]: 'confirmed' },
      },
      undefined,
      needsProtocolSync ? 'Confirmed — Daily 6 plan synced' : 'Confirmed — saved on this device',
      { syncProtocol: needsProtocolSync, syncNutrition: key === 'training_camp' }
    );
  };

  const handleConfirmAllRemaining = async () => {
    const nextStatuses = { ...about.statuses };
    for (const item of visibleItems) {
      if (!nextStatuses[item.key] || nextStatuses[item.key] === 'suggested') {
        nextStatuses[item.key] = 'confirmed';
      }
    }
    await persistAboutMe(
      { ...about, statuses: nextStatuses },
      undefined,
      'All confirmed — Daily 6 & targets synced',
      { syncProtocol: true, syncNutrition: true }
    );
  };

  const handleDeleteItem = async (key: AboutMeItemKey) => {
    const nextDeleted = Array.from(new Set([...(about.deletedKeys ?? []), key]));
    const nextStatuses = { ...about.statuses };
    delete nextStatuses[key];
    await persistAboutMe(
      {
        ...about,
        deletedKeys: nextDeleted,
        statuses: nextStatuses,
      },
      undefined,
      'Item removed from About me'
    );
    if (editingKey === key) setEditingKey(null);
  };

  const handleSaveEdit = async (e: React.FormEvent, key: AboutMeItemKey) => {
    e.preventDefault();
    const nextAbout: AboutMeProfile = {
      ...about,
      statuses: { ...about.statuses, [key]: 'edited' },
    };
    const profilePatch: Partial<UserProfile> = {};

    if (key === 'location_foods') {
      nextAbout.countryRegion = regionDraft.trim() || 'Egypt';
      nextAbout.localFoods = foodsDraft
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (key === 'training_camp') {
      nextAbout.trainingDisciplines = disciplinesDraft
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const parsedAge = Math.round(Number(ageDraft));
      if (ageDraft.trim() && Number.isFinite(parsedAge) && parsedAge >= 10 && parsedAge <= 100) {
        profilePatch.age = parsedAge;
        profilePatch.ageExplicitlySet = true;
      }

      const curW = Number(currentWeightDraft);
      if (Number.isFinite(curW) && curW >= 25 && curW <= 300) {
        nextAbout.currentWeightKg = Number(curW.toFixed(1));
        profilePatch.weightKg = Number(curW.toFixed(1));
      } else {
        nextAbout.currentWeightKg = null;
      }

      const tgtW = Number(targetWeightDraft);
      nextAbout.targetWeightKg =
        targetWeightDraft.trim() && Number.isFinite(tgtW) && tgtW >= 25 && tgtW <= 300
          ? Number(tgtW.toFixed(1))
          : null;

      const clsW = Number(weightClassDraft);
      nextAbout.weightClassKg =
        weightClassDraft.trim() && Number.isFinite(clsW) && clsW >= 30 && clsW <= 200
          ? Number(clsW.toFixed(1))
          : null;

      nextAbout.tournamentDate = tournamentDateDraft.trim() || null;
      nextAbout.tournamentUpcoming = Boolean(nextAbout.tournamentDate || nextAbout.weightClassKg);
    } else if (key === 'eating_pattern') {
      nextAbout.eatingPattern = eatingDraft.trim();
    } else if (key === 'identity_focus') {
      nextAbout.identityFocus = identityDraft.trim();
    } else if (key === 'support_style') {
      nextAbout.supportStyle = supportDraft.trim();
    }

    const weightChanged = profilePatch.weightKg !== undefined && profilePatch.weightKg !== profile.weightKg;
    const syncProtocol =
      key === 'training_camp' || key === 'eating_pattern' || key === 'identity_focus' || key === 'location_foods';
    await persistAboutMe(
      nextAbout,
      profilePatch,
      syncProtocol ? 'Saved & synced daily plan' : 'Saved changes',
      { syncProtocol, syncNutrition: weightChanged || Boolean(profilePatch.ageExplicitlySet) }
    );
    setEditingKey(null);
  };

  const handleDeleteEverything = async () => {
    await persistAboutMe(
      {
        countryRegion: '',
        localFoods: [],
        trainingDisciplines: [],
        tournamentUpcoming: false,
        tournamentDate: null,
        weightClassKg: null,
        currentWeightKg: null,
        targetWeightKg: null,
        eatingPattern: '',
        identityFocus: '',
        supportStyle: '',
        statuses: {},
        deletedKeys: ITEM_META.map((m) => m.key),
      },
      undefined,
      'Deleted everything in About me'
    );
    setConfirmDeleteAll(false);
    setEditingKey(null);
  };

  const handleRestoreSuggested = async () => {
    await persistAboutMe(
      createDefaultAboutMe(profile.weightKg),
      undefined,
      'Suggested About me restored — confirm what fits you'
    );
  };

  const renderSummaryText = (key: AboutMeItemKey): string => {
    switch (key) {
      case 'location_foods':
        return `${about.countryRegion || 'Region unset'} · Street & home staples: ${
          about.localFoods.length ? about.localFoods.join(', ') : 'None listed'
        }`;
      case 'training_camp': {
        const parts = [
          about.trainingDisciplines.length ? about.trainingDisciplines.join(' + ') : 'Training unset',
          `Age: ${profile.ageExplicitlySet ? `${profile.age}` : 'Unset (teen safety on)'}`,
          `Current: ${about.currentWeightKg ?? profile.weightKg ?? '--'} kg`,
        ];
        if (about.weightClassKg) parts.push(`Weight class: ${about.weightClassKg} kg`);
        if (about.targetWeightKg) parts.push(`Target: ${about.targetWeightKg} kg`);
        if (about.tournamentDate) parts.push(`Tournament: ${about.tournamentDate}`);
        return parts.join(' · ');
      }
      case 'eating_pattern':
        return about.eatingPattern || 'Not set';
      case 'identity_focus':
        return about.identityFocus || 'Not set';
      case 'support_style':
        return about.supportStyle || 'Not set';
    }
  };

  return (
    <section className="ascend-card p-4 space-y-3" id="about-me-settings">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[var(--accent)]" /> About me
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Stored on this device only. Nothing here is assumed silently — confirm, edit, or delete each item anytime.
          </p>
        </div>
        {unconfirmedCount > 0 && (
          <button
            type="button"
            onClick={handleConfirmAllRemaining}
            className="px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px] shrink-0"
          >
            Confirm all ({unconfirmedCount})
          </button>
        )}
      </div>

      {visibleItems.length === 0 ? (
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs space-y-2">
          <p className="text-slate-600 dark:text-slate-300">
            All &quot;About me&quot; notes are cleared.
          </p>
          <button
            type="button"
            onClick={handleRestoreSuggested}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-200 dark:bg-white/10 font-semibold min-h-[38px]"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Load suggested profile to review
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleItems.map((item) => {
            const status = about.statuses?.[item.key] ?? 'suggested';
            const isSuggested = status === 'suggested';
            const isEditing = editingKey === item.key;

            return (
              <div
                key={item.key}
                className={`p-3.5 rounded-2xl border space-y-2.5 ${
                  isSuggested
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/35'
                    : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold flex items-center gap-2 flex-wrap">
                      <span>{item.title}</span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          isSuggested
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                        }`}
                      >
                        {isSuggested ? 'Suggested · Is this right?' : status === 'edited' ? 'Edited & saved' : 'Confirmed'}
                      </span>
                    </p>
                    {!isEditing && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {renderSummaryText(item.key)}
                      </p>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <form onSubmit={(e) => handleSaveEdit(e, item.key)} className="space-y-2.5 text-xs">
                    {item.key === 'location_foods' && (
                      <>
                        <div>
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            Country / Region
                          </label>
                          <input
                            type="text"
                            value={regionDraft}
                            onChange={(e) => setRegionDraft(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131E] border border-slate-200 dark:border-white/15 min-h-[40px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            Everyday &amp; street foods (comma separated)
                          </label>
                          <textarea
                            rows={2}
                            value={foodsDraft}
                            onChange={(e) => setFoodsDraft(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131E] border border-slate-200 dark:border-white/15"
                          />
                        </div>
                      </>
                    )}

                    {item.key === 'training_camp' && (
                      <>
                        <div>
                          <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                            Sports &amp; training background
                          </label>
                          <input
                            type="text"
                            value={disciplinesDraft}
                            onChange={(e) => setDisciplinesDraft(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131E] border border-slate-200 dark:border-white/15 min-h-[40px]"
                          />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                              Age (years)
                            </label>
                            <input
                              type="number"
                              min={10}
                              max={100}
                              placeholder="Optional"
                              value={ageDraft}
                              onChange={(e) => setAgeDraft(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131E] border border-slate-200 dark:border-white/15 font-mono-num min-h-[40px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                              Current weight (kg)
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min={25}
                              max={300}
                              value={currentWeightDraft}
                              onChange={(e) => setCurrentWeightDraft(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131E] border border-slate-200 dark:border-white/15 font-mono-num min-h-[40px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                              Weight class (kg)
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min={30}
                              max={200}
                              placeholder="Coach-set"
                              value={weightClassDraft}
                              onChange={(e) => setWeightClassDraft(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131E] border border-slate-200 dark:border-white/15 font-mono-num min-h-[40px]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                              Target weight (kg)
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min={25}
                              max={300}
                              placeholder="Optional"
                              value={targetWeightDraft}
                              onChange={(e) => setTargetWeightDraft(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131E] border border-slate-200 dark:border-white/15 font-mono-num min-h-[40px]"
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-2">
                            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                              Tournament date
                            </label>
                            <input
                              type="date"
                              value={tournamentDateDraft}
                              onChange={(e) => setTournamentDateDraft(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131E] border border-slate-200 dark:border-white/15 font-mono-num min-h-[40px]"
                            />
                          </div>
                        </div>
                        {isTeenSafe && (
                          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>
                              Age unset or under 18: ASCEND keeps fat-loss cuts locked and leaves any fight-camp weight-class decisions to your coach and doctor.
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {item.key === 'eating_pattern' && (
                      <textarea
                        rows={2}
                        value={eatingDraft}
                        onChange={(e) => setEatingDraft(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131E] border border-slate-200 dark:border-white/15"
                      />
                    )}

                    {item.key === 'identity_focus' && (
                      <textarea
                        rows={2}
                        value={identityDraft}
                        onChange={(e) => setIdentityDraft(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131E] border border-slate-200 dark:border-white/15"
                      />
                    )}

                    {item.key === 'support_style' && (
                      <textarea
                        rows={2}
                        value={supportDraft}
                        onChange={(e) => setSupportDraft(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0D131E] border border-slate-200 dark:border-white/15"
                      />
                    )}

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] font-bold min-h-[38px]"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingKey(null)}
                        className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-white/10 font-semibold min-h-[38px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {isSuggested && (
                      <button
                        type="button"
                        onClick={() => handleConfirmItem(item.key)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px]"
                      >
                        <Check className="w-3.5 h-3.5" /> Confirm right
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditor(item.key)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[36px]"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.key)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-rose-500 hover:bg-rose-500/10 text-xs font-semibold min-h-[36px]"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {visibleItems.length > 0 && (
        <div className="pt-2 border-t border-slate-200 dark:border-white/10">
          {!confirmDeleteAll ? (
            <button
              type="button"
              onClick={() => setConfirmDeleteAll(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-500 hover:underline min-h-[36px]"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete everything about me
            </button>
          ) : (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-rose-600 dark:text-rose-300">
                Remove all About me items on this device?
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteEverything}
                  className="px-3 py-1.5 rounded-lg bg-rose-500 text-white font-bold min-h-[34px]"
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAll(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-white/10 font-semibold min-h-[34px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
