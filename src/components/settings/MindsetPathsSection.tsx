import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  EyeOff,
  Plus,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { CURATED_PROTOCOLS, PROTOCOL_MAP } from '../../data/protocols';
import { MINDSET_PATHS } from '../../data/pathsCatalog';
import { addProtocolToPlan, db } from '../../db/database';
import {
  LESSONS_BY_PATH,
  getMindsetPathsSettings,
  getPathDefinitionForUser,
} from '../../lib/mindsetEngine';
import type { AppSettings, MindsetPathId, MindsetPathsSettings, PathSelectionMode } from '../../types';

interface MindsetPathsSectionProps {
  settings: AppSettings;
  onOpenPicker?: () => void;
}

export const MindsetPathsSection: React.FC<MindsetPathsSectionProps> = ({
  settings,
  onOpenPicker,
}) => {
  const mp = getMindsetPathsSettings(settings);
  const [lessonsOpen, setLessonsOpen] = useState(false);
  const [addedHint, setAddedHint] = useState<string | null>(null);
  const [customName, setCustomName] = useState(mp.customPath.name);
  const [customStatement, setCustomStatement] = useState(mp.customPath.identityStatement);

  const updateMp = async (patch: Partial<MindsetPathsSettings>) => {
    const next: MindsetPathsSettings = { ...mp, ...patch };
    await db.settings.update('app', { mindsetPaths: next });
  };

  const activeMain = mp.mainPathId
    ? getPathDefinitionForUser(mp.mainPathId, mp)
    : getPathDefinitionForUser('eagle', mp);
  const lessonsForPreview = LESSONS_BY_PATH[activeMain.id] ?? [];

  const handleAddProtocol = async (protocolId: string) => {
    const def = PROTOCOL_MAP[protocolId];
    if (!def) return;
    await addProtocolToPlan(protocolId, activeMain.shortName);
    setAddedHint(`Added "${def.title}" to Today`);
    window.setTimeout(() => setAddedHint(null), 2200);
  };

  const handleToggleCustomHabit = async (protocolId: string) => {
    const cur = mp.customPath.habitProtocolIds;
    let nextIds: string[];
    if (cur.includes(protocolId)) {
      if (cur.length <= 1) return;
      nextIds = cur.filter((id) => id !== protocolId);
    } else if (cur.length < 3) {
      nextIds = [...cur, protocolId];
    } else {
      nextIds = [...cur.slice(1), protocolId];
    }
    await updateMp({
      customPath: { ...mp.customPath, habitProtocolIds: nextIds },
    });
  };

  const handleToggleInspiration = async (id: MindsetPathId) => {
    if (mp.mainPathId === id) return;
    const exists = mp.inspirationIds.includes(id);
    if (exists) {
      await updateMp({
        inspirationIds: mp.inspirationIds.filter((x) => x !== id),
      });
    } else {
      const next = [...mp.inspirationIds.slice(-1), id];
      await updateMp({ inspirationIds: next, pickerCompleted: true });
    }
  };

  return (
    <section id="paths-settings" className="ascend-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[var(--accent)]" />
          <div>
            <h2 className="text-sm font-bold">Mindset Paths & Daily Cut</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Inspiration only · Never weakens safety or medical rules
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onOpenPicker && (
            <button
              type="button"
              onClick={onOpenPicker}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px]"
            >
              Open Full Picker
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={mp.pathsEnabled}
              onChange={(e) => updateMp({ pathsEnabled: e.target.checked })}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            Enabled
          </label>
        </div>
      </div>

      {/* Mode Selector + Spoiler-Free Toggle */}
      <div className="grid sm:grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] space-y-1.5">
          <p className="text-[11px] font-bold text-slate-500">Path Mode</p>
          <div className="grid grid-cols-3 gap-1">
            {([
              { id: 'mix_all', label: 'Mix all' },
              { id: 'one_per_day', label: 'One a day' },
              { id: 'single', label: 'Single main' },
            ] as Array<{ id: PathSelectionMode; label: string }>).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => updateMp({ mode: m.id })}
                className={`py-2 px-1 rounded-lg text-[11px] font-semibold min-h-[38px] ${
                  mp.mode === m.id
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-white dark:bg-white/5'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <label className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] flex items-center justify-between gap-2 cursor-pointer">
          <div>
            <p className="text-xs font-semibold">Spoiler-free lesson mode</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Strips plot specifics from story-inspired Daily Cuts
            </p>
          </div>
          <input
            type="checkbox"
            checked={mp.spoilerFreeDefault}
            onChange={(e) => updateMp({ spoilerFreeDefault: e.target.checked })}
            className="w-4 h-4 accent-[var(--accent)]"
          />
        </label>
      </div>

      {/* Pick 1 Main + Up to 2 Inspirations (Real People FIRST, then Story, then Custom) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold">
            Pick 1 Main Path + up to 2 Inspirations (Real people listed first)
          </p>
          {mp.hiddenPathIds.length > 0 && (
            <button
              type="button"
              onClick={() => updateMp({ hiddenPathIds: [] })}
              className="text-[11px] font-semibold text-[var(--accent)] hover:underline"
            >
              Unhide {mp.hiddenPathIds.length} hidden
            </button>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          {MINDSET_PATHS.filter((p) => !mp.hiddenPathIds.includes(p.id)).map((path) => {
            const isMain = mp.mainPathId === path.id;
            const isInsp = mp.inspirationIds.includes(path.id);
            const resolvedTitle = path.id === 'custom' ? mp.customPath.name : path.name;

            return (
              <div
                key={path.id}
                className={`p-3 rounded-xl border space-y-2 transition ${
                  isMain
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : isInsp
                    ? 'border-[var(--accent)]/45 bg-slate-50 dark:bg-white/[0.05]'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: path.colorHex }}
                      />
                      <span className="text-xs font-bold truncate">{resolvedTitle}</span>
                    </div>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {path.isRealPerson ? 'Real person · Values paraphrase' : path.category === 'custom' ? 'Custom identity' : 'Story archetype'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateMp({
                        hiddenPathIds: [...mp.hiddenPathIds, path.id],
                        mainPathId: mp.mainPathId === path.id ? null : mp.mainPathId,
                        inspirationIds: mp.inspirationIds.filter((x) => x !== path.id),
                      })
                    }
                    title="Hide this path"
                    className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-slate-400"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                  {path.oneLineIdea}
                </p>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateMp({
                        mainPathId: isMain ? null : path.id,
                        inspirationIds: mp.inspirationIds.filter((x) => x !== path.id),
                        pickerCompleted: true,
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold min-h-[32px] ${
                      isMain
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'bg-slate-100 dark:bg-white/10'
                    }`}
                  >
                    {isMain ? 'Main ✓' : 'Set Main'}
                  </button>
                  {!isMain && mp.mode !== 'single' && (
                    <button
                      type="button"
                      onClick={() => handleToggleInspiration(path.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold min-h-[32px] ${
                        isInsp
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/40'
                          : 'bg-slate-100 dark:bg-white/10'
                      }`}
                    >
                      {isInsp ? 'Inspired ✓' : '+ Inspiration'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Path Reality Check, Habits & 30-Lesson Preview */}
      {mp.mainPathId && (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold">
                Main Path Breakdown: {activeMain.name}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {activeMain.inspiredByLabel} · Tag: {activeMain.evidenceTag}
              </p>
            </div>
            {addedHint && <span className="text-[11px] font-semibold text-emerald-400">{addedHint}</span>}
          </div>

          {activeMain.guardrailNote && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-start gap-2 text-[11px]">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{activeMain.guardrailNote}</span>
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-2 text-[11px]">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="font-bold text-emerald-400 mb-0.5">Take this</p>
              <p>{activeMain.takeThis}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <p className="font-bold text-rose-400 mb-0.5">Leave this</p>
              <p>{activeMain.leaveThis}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <p className="font-bold text-slate-400 mb-0.5">Cost</p>
              <p>{activeMain.cost}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-500">
              6 Linked App Habits (uses existing tasks only · tap to add to Today):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {activeMain.habitProtocolIds.map((pid) => {
                const def = PROTOCOL_MAP[pid];
                if (!def) return null;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => handleAddProtocol(pid)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-[11px] font-semibold hover:border-[var(--accent)]"
                  >
                    <Plus className="w-3 h-3 text-[var(--accent)]" />
                    {def.title}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Badge ladder: <span className="font-semibold text-slate-700 dark:text-slate-200">{activeMain.badgeNames.join(' → ')}</span>
          </div>

          <button
            type="button"
            onClick={() => setLessonsOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]"
          >
            <BookOpen className="w-3.5 h-3.5" />
            {lessonsOpen ? 'Hide' : 'Preview all'} {lessonsForPreview.length} lessons
            {lessonsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {lessonsOpen && (
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {lessonsForPreview.map((l) => (
                <div
                  key={l.id}
                  className="p-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[11px]"
                >
                  <p className="font-bold">
                    #{l.dayIndex} · {l.title}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {mp.spoilerFreeDefault ? l.ideaSpoilerFree : l.idea}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Custom Path Builder */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Wrench className="w-4 h-4 text-[var(--accent)]" />
          <p className="text-xs font-bold">Custom Path ("Build my own path")</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={customName}
            maxLength={32}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Path name (e.g. My Code)"
            className="px-3 py-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs min-h-[40px]"
          />
          <input
            type="text"
            value={customStatement}
            maxLength={140}
            onChange={(e) => setCustomStatement(e.target.value)}
            placeholder="I am the kind of person who..."
            className="px-3 py-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs min-h-[40px]"
          />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-slate-500">Pick 3 existing habits for your Custom Path:</p>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {CURATED_PROTOCOLS.slice(0, 14).map((p) => {
              const selected = mp.customPath.habitProtocolIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleToggleCustomHabit(p.id)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-semibold ${
                    selected
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10'
                  }`}
                >
                  {selected && <Check className="w-3 h-3" />}
                  {p.title}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              updateMp({
                customPath: {
                  ...mp.customPath,
                  name: customName.trim() || 'My Code',
                  identityStatement:
                    customStatement.trim() || 'I am the kind of person who keeps daily promises.',
                },
              })
            }
            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px]"
          >
            Save Custom Path
          </button>
        </div>
      </div>

      {/* Daily Cut & Daily Video Notifications */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Bell className="w-4 h-4 text-[var(--accent)]" />
          <p className="text-xs font-bold">Optional Inspiration Notifications (max 6/day total)</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mp.dailyCutNotifEnabled}
                onChange={(e) => updateMp({ dailyCutNotifEnabled: e.target.checked })}
                className="accent-[var(--accent)]"
              />
              <span>Daily Cut ready</span>
            </label>
            <input
              type="time"
              value={mp.dailyCutNotifTime}
              onChange={(e) => updateMp({ dailyCutNotifTime: e.target.value })}
              className="px-2 py-1 rounded bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-mono-num"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mp.dailyVideoNotifEnabled}
                onChange={(e) => updateMp({ dailyVideoNotifEnabled: e.target.checked })}
                className="accent-[var(--accent)]"
              />
              <span>Today&apos;s video is ready</span>
            </label>
            <input
              type="time"
              value={mp.dailyVideoNotifTime}
              onChange={(e) => updateMp({ dailyVideoNotifTime: e.target.value })}
              className="px-2 py-1 rounded bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-mono-num"
            />
          </div>
        </div>
      </div>
    </section>
  );
};
