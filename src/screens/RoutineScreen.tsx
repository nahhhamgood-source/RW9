import React, { useMemo, useState } from 'react';
import { Check, Plus, RefreshCw, Trash2, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { CURATED_PROTOCOLS } from '../data/protocols';
import {
  addProtocolToPlan,
  db,
  regenerateProtocolFromProfile,
  toggleTaskCompletion,
} from '../db/database';
import { daysBetween, toLocalDateKey } from '../lib/date';
import type {
  ActiveProtocolTask,
  ProtocolCategory,
  TaskCompletion,
  TimeBlock,
  UserProfile,
} from '../types';
import { useToast } from '../components/ui/ToastProvider';

interface RoutineScreenProps {
  profile: UserProfile;
  tasks: ActiveProtocolTask[];
  completions: TaskCompletion[];
  selectedDate: string;
}

export const RoutineScreen: React.FC<RoutineScreenProps> = ({
  profile,
  tasks,
  completions,
  selectedDate,
}) => {
  const { showToast } = useToast();
  const [view, setView] = useState<'plan' | 'library' | 'roadmap'>('plan');
  const [catFilter, setCatFilter] = useState<'all' | ProtocolCategory>('all');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customAction, setCustomAction] = useState('');
  const [customBlock, setCustomBlock] = useState<TimeBlock>('morning');
  const [customCategory, setCustomCategory] = useState<ProtocolCategory>('skin');
  const [customMinutes, setCustomMinutes] = useState(5);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const completedIds = useMemo(
    () => new Set(completions.filter((c) => c.date === selectedDate).map((c) => c.taskId)),
    [completions, selectedDate]
  );

  const currentWeek = useMemo(() => {
    const startKey = toLocalDateKey(new Date(profile.createdAt || Date.now()));
    const days = Math.max(0, daysBetween(startKey, toLocalDateKey()));
    return Math.min(12, Math.floor(days / 7) + 1);
  }, [profile.createdAt]);

  const blocks: Array<{ key: TimeBlock; label: string }> = [
    { key: 'morning', label: 'Morning Block' },
    { key: 'afternoon', label: 'Afternoon Block' },
    { key: 'evening', label: 'Evening Block' },
  ];

  const handleToggle = async (task: ActiveProtocolTask) => {
    await toggleTaskCompletion(selectedDate, task);
  };

  const handleMoveBlock = async (task: ActiveProtocolTask, block: TimeBlock) => {
    await db.protocolTasks.update(task.id, { block });
    showToast(`Moved to ${block}`);
  };

  const handleRemoveTask = async (task: ActiveProtocolTask) => {
    await db.protocolTasks.update(task.id, { enabled: false });
    showToast(`Removed ${task.title} from active plan`, 'info');
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customAction.trim()) return;
    const id = `custom-${Date.now()}`;
    await db.protocolTasks.put({
      id,
      protocolId: id,
      title: customTitle.trim(),
      actionLine: customAction.trim(),
      block: customBlock,
      category: customCategory,
      minutes: Math.max(1, customMinutes),
      xp: 15,
      steps: [],
      evidence: 'Likely works',
      why: 'User-added personal consistency item.',
      isCustom: true,
      enabled: true,
      sortOrder: tasks.length + 1,
    });
    setCustomTitle('');
    setCustomAction('');
    setShowCustomForm(false);
    showToast('Custom task added');
  };

  const handleRebuild = async () => {
    await regenerateProtocolFromProfile(profile);
    showToast('Protocol rebuilt from your current profile & latest scan');
  };

  const enabledTasks = tasks.filter((t) => t.enabled);
  const enabledProtocolIds = new Set(enabledTasks.map((t) => t.protocolId));

  const filteredLibrary = CURATED_PROTOCOLS.filter((p) =>
    catFilter === 'all' ? true : p.category === catFilter
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Daily Protocol</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Rule-based plan · {enabledTasks.length} active tasks · Week {currentWeek} of 12
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowCustomForm(!showCustomForm)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            Add Custom
          </button>
          <button
            type="button"
            onClick={handleRebuild}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#131815] border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[40px]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Rebuild Plan
          </button>
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex gap-1.5 p-1 rounded-2xl bg-slate-200/70 dark:bg-white/5 w-fit max-w-full overflow-x-auto">
        {([
          { id: 'plan', label: 'Daily Blocks' },
          { id: 'library', label: '30 Curated Protocols' },
          { id: 'roadmap', label: '12-Week Roadmap' },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition min-h-[38px] ${
              view === t.id
                ? 'bg-white dark:bg-[#0E1612] text-slate-900 dark:text-white shadow-sm border border-transparent dark:border-emerald-500/20'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showCustomForm && (
        <form onSubmit={handleAddCustom} className="ascend-card p-4 space-y-3">
          <h2 className="font-display text-sm font-bold">New Custom Task</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Title (2-4 words, e.g. Evening Floss)"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              required
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-h-[44px]"
            />
            <input
              type="text"
              placeholder="1-line action starting with a verb"
              value={customAction}
              onChange={(e) => setCustomAction(e.target.value)}
              required
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm min-h-[44px]"
            />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <select
              value={customBlock}
              onChange={(e) => setCustomBlock(e.target.value as TimeBlock)}
              className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs min-h-[44px]"
            >
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
            <select
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value as ProtocolCategory)}
              className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs min-h-[44px]"
            >
              <option value="skin">Skin</option>
              <option value="sleep">Sleep</option>
              <option value="hydration">Hydration</option>
              <option value="hair">Hair</option>
              <option value="posture">Posture</option>
              <option value="training">Training</option>
              <option value="presence">Presence</option>
            </select>
            <input
              type="number"
              min={1}
              max={120}
              value={customMinutes}
              onChange={(e) => setCustomMinutes(Number(e.target.value))}
              className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono-num text-xs min-h-[44px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCustomForm(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[40px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[40px]"
            >
              Save Task
            </button>
          </div>
        </form>
      )}

      {view === 'plan' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {blocks.map((blk) => {
            const blockTasks = enabledTasks.filter((t) => t.block === blk.key);
            return (
              <div key={blk.key} className="ascend-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-bold">{blk.label}</h2>
                  <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                    {blockTasks.reduce((s, t) => s + t.minutes, 0)}m
                  </span>
                </div>

                {blockTasks.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                    No tasks scheduled in {blk.label.toLowerCase()}.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-white/10">
                    {blockTasks.map((task) => {
                      const done = completedIds.has(task.id);
                      const isExp = expandedId === task.id;
                      return (
                        <div key={task.id} className="py-3 first:pt-1 last:pb-1">
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() => handleToggle(task)}
                              className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                done
                                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                                  : 'border-2 border-slate-300 dark:border-white/25'
                              }`}
                            >
                              {done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className={`text-sm font-semibold ${done ? 'line-through opacity-50' : ''}`}>
                                  {task.title}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedId(isExp ? null : task.id)}
                                  className="p-1 text-slate-400"
                                >
                                  {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {task.actionLine}
                              </p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {task.minutes}m · {task.evidence}
                                  {task.sourceFocusArea ? ` · Focus: ${task.sourceFocusArea}` : ''}
                                </span>
                                <div className="flex items-center gap-1">
                                  <select
                                    value={task.block}
                                    onChange={(e) => handleMoveBlock(task, e.target.value as TimeBlock)}
                                    aria-label={`Move ${task.title} block`}
                                    className="text-[11px] bg-slate-100 dark:bg-white/5 rounded-lg px-2 py-1"
                                  >
                                    <option value="morning">AM</option>
                                    <option value="afternoon">PM</option>
                                    <option value="evening">Eve</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTask(task)}
                                    aria-label={`Remove ${task.title}`}
                                    className="p-1.5 text-slate-400 hover:text-rose-500"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {isExp && (
                                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-white/10 text-xs space-y-1.5">
                                  <p><strong>Why:</strong> {task.why}</p>
                                  {task.steps.map((s, idx) => (
                                    <p key={idx} className="text-slate-500 dark:text-slate-400">
                                      {idx + 1}. {s}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === 'library' && (
        <div className="space-y-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(['all', 'sleep', 'hydration', 'skin', 'hair', 'posture', 'training', 'presence'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCatFilter(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap min-h-[36px] ${
                  catFilter === cat
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-white dark:bg-[#131815] border border-slate-200 dark:border-white/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredLibrary.map((p) => {
              const active = enabledProtocolIds.has(p.id);
              return (
                <div key={p.id} className="ascend-card p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-sm font-bold">{p.title}</h3>
                      <span className="text-[11px] font-semibold text-[var(--accent)] shrink-0">
                        {p.evidence}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{p.actionLine}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      <strong>Why:</strong> {p.why}
                    </p>
                    {p.safetyNote && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-300 mt-1.5">
                        Safety: {p.safetyNote}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                      {p.category} · {p.minutes}m · +{p.xp} XP
                    </span>
                    <button
                      type="button"
                      disabled={active}
                      onClick={async () => {
                        await addProtocolToPlan(p.id);
                        showToast(`Added ${p.title} to active plan`);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold min-h-[36px] ${
                        active
                          ? 'bg-slate-100 dark:bg-white/5 text-slate-400'
                          : 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      }`}
                    >
                      {active ? 'In Plan' : 'Add to Plan'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'roadmap' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              phase: 'Week 1: Foundations',
              active: currentWeek === 1,
              desc: 'Lock sleep anchor, morning daylight, water target, gentle cleanser, moisturizer, and daily SPF.',
              goal: 'Keep friction low so 80%+ completion feels effortless.',
            },
            {
              phase: 'Weeks 2–4: Build',
              active: currentWeek >= 2 && currentWeek <= 4,
              desc: 'Dial in protein intake, 3-day full-body training, posture resets, and 4-week skin barrier tracking.',
              goal: 'First 14-day PSL LAB comparison under identical window lighting.',
            },
            {
              phase: 'Weeks 5–12: Push & Refine',
              active: currentWeek >= 5,
              desc: 'Progressive gym overload, haircut/barber calibration, style capsule polish, and optional gradual skincare actives if basics are rock-solid.',
              goal: 'Evaluate real 90-day consistency and monthly Ascension Reports.',
            },
          ].map((stage) => (
            <div
              key={stage.phase}
              className={`ascend-card p-5 space-y-2.5 ${
                stage.active ? 'ring-1 ring-[var(--accent)] ascend-hero-glow' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]">
                  <Calendar className="w-3.5 h-3.5" />
                  {stage.active ? `Current Stage (Wk ${currentWeek})` : 'Roadmap Phase'}
                </span>
              </div>
              <h3 className="font-display text-base font-bold">{stage.phase}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{stage.desc}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-white/10">
                <strong>Target:</strong> {stage.goal}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
