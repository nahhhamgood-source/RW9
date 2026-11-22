import React, { useMemo, useState } from 'react';
import { Check, Compass, EyeOff, Search, ShieldCheck, X } from 'lucide-react';
import { MINDSET_PATHS } from '../../data/pathsCatalog';
import { db } from '../../db/database';
import { getMindsetPathsSettings } from '../../lib/mindsetEngine';
import type { AppSettings, MindsetPathId, MindsetPathsSettings, PathSelectionMode } from '../../types';

interface PathPickerModalProps {
  open: boolean;
  settings: AppSettings;
  onClose: (picked: boolean) => void;
}

export const PathPickerModal: React.FC<PathPickerModalProps> = ({
  open,
  settings,
  onClose,
}) => {
  const mp = getMindsetPathsSettings(settings);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'real_person' | 'story' | 'custom'>('all');

  const updateMp = async (patch: Partial<MindsetPathsSettings>) => {
    const next: MindsetPathsSettings = { ...mp, ...patch };
    await db.settings.update('app', { mindsetPaths: next });
  };

  const filteredPaths = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MINDSET_PATHS.filter((p) => {
      if (mp.hiddenPathIds.includes(p.id)) return false;
      if (filter !== 'all' && p.category !== filter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.oneLineIdea.toLowerCase().includes(q) ||
        p.takeThis.toLowerCase().includes(q)
      );
    });
  }, [query, filter, mp.hiddenPathIds]);

  if (!open) return null;

  const selectedCount = (mp.mainPathId ? 1 : 0) + mp.inspirationIds.length;

  const handleToggleCheckbox = async (id: MindsetPathId) => {
    if (mp.mainPathId === id) {
      // Promote first inspiration if one exists
      const [firstInsp, ...rest] = mp.inspirationIds;
      await updateMp({
        mainPathId: firstInsp ?? null,
        inspirationIds: rest,
      });
      return;
    }
    if (mp.inspirationIds.includes(id)) {
      await updateMp({
        inspirationIds: mp.inspirationIds.filter((x) => x !== id),
      });
      return;
    }
    if (!mp.mainPathId) {
      await updateMp({ mainPathId: id, pathsEnabled: true });
      return;
    }
    if (mp.inspirationIds.length < 2) {
      await updateMp({ inspirationIds: [...mp.inspirationIds, id], pathsEnabled: true });
    } else {
      // Replace oldest inspiration smoothly
      await updateMp({
        inspirationIds: [mp.inspirationIds[1], id],
        pathsEnabled: true,
      });
    }
  };

  const handleDone = async () => {
    await updateMp({
      pickerCompleted: selectedCount > 0,
      pathsEnabled: true,
    });
    onClose(selectedCount > 0);
  };

  const handleSkip = async () => {
    await updateMp({
      pickerCompleted: false,
    });
    onClose(false);
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="path-picker-title"
    >
      <div className="ascend-card w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden bg-[var(--bg-surface-solid)]">
        {/* Sticky Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] space-y-3 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" /> Mindset Paths · {selectedCount} selected
              </p>
              <h2 id="path-picker-title" className="font-display text-lg font-bold">
                Pick your people
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real athletes first, then story archetypes. Pick 1 main + up to 2 inspirations (switch or turn off anytime).
              </p>
            </div>
            <button
              type="button"
              onClick={handleSkip}
              aria-label="Close picker"
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search + Category Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Khabib, Goggins, Hacker, Boxer..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs min-h-[38px]"
              />
            </div>
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
                  onClick={() => setFilter(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold min-h-[34px] ${
                    filter === tab.id
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-slate-100 dark:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rotation Mode Selector */}
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { id: 'mix_all', label: 'Mix all (default)' },
              { id: 'one_per_day', label: 'One character a day' },
              { id: 'single', label: 'Single main path' },
            ] as Array<{ id: PathSelectionMode; label: string }>).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => updateMp({ mode: m.id })}
                className={`py-2 px-2 rounded-lg text-[11px] font-semibold min-h-[36px] ${
                  mp.mode === m.id
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/40'
                    : 'bg-slate-100 dark:bg-white/5'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Cards */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {filteredPaths.map((path) => {
            const isMain = mp.mainPathId === path.id;
            const isInsp = mp.inspirationIds.includes(path.id);
            const checked = isMain || isInsp;
            const title = path.id === 'custom' ? mp.customPath.name : path.name;

            return (
              <div
                key={path.id}
                className={`p-3.5 rounded-2xl border transition space-y-2 ${
                  checked
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleCheckbox(path.id)}
                    className="flex items-start gap-3 text-left flex-1 min-w-0"
                  >
                    <span
                      className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        checked
                          ? 'bg-[var(--accent)] border-transparent text-[var(--accent-contrast)]'
                          : 'border-slate-400/50 bg-transparent'
                      }`}
                    >
                      {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: path.colorHex }}
                        />
                        <span className="text-sm font-bold">{title}</span>
                        {isMain && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--accent)] text-[var(--accent-contrast)] text-[10px] font-bold">
                            Main
                          </span>
                        )}
                        {isInsp && (
                          <span className="px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-bold">
                            Inspiration
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {path.inspiredByLabel}
                      </p>
                      <p className="text-xs mt-1">{path.oneLineIdea}</p>
                    </div>
                  </button>

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
                    className="p-2 rounded-lg hover:bg-white/10 text-slate-400 shrink-0"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-1.5 text-[11px] pl-8">
                  <p className="text-emerald-400">
                    <span className="font-bold">Take:</span> {path.takeThis}
                  </p>
                  <p className="text-rose-400">
                    <span className="font-bold">Leave:</span> {path.leaveThis}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 shrink-0 bg-[var(--bg-surface-solid)]">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Safety & health guardrails always stay active.</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleSkip}
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[42px]"
            >
              Skip, choose later
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[42px]"
            >
              Done ({selectedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
