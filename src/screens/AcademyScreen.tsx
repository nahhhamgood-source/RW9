import React, { useMemo, useState } from 'react';
import { Search, ShieldCheck, Stethoscope, ChevronDown, ChevronUp } from 'lucide-react';
import {
  ACADEMY_GUIDES,
  GLOSSARY_TERMS,
  MEDICAL_INFO_CARDS,
  MYTHS_WALL,
} from '../data/academy';

export const AcademyScreen: React.FC = () => {
  const [tab, setTab] = useState<'guides' | 'myths' | 'glossary' | 'medical'>('guides');
  const [query, setQuery] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<'All' | 'True' | 'Partly true' | 'False' | 'False and risky'>('All');
  const [openGuideId, setOpenGuideId] = useState<string | null>(ACADEMY_GUIDES[0].id);

  const q = query.trim().toLowerCase();

  const filteredGuides = useMemo(
    () =>
      ACADEMY_GUIDES.filter(
        (g) =>
          !q ||
          g.title.toLowerCase().includes(q) ||
          g.category.toLowerCase().includes(q) ||
          g.summary.some((s) => s.toLowerCase().includes(q))
      ),
    [q]
  );

  const filteredMyths = useMemo(
    () =>
      MYTHS_WALL.filter((m) => {
        const matchesVerdict = verdictFilter === 'All' || m.verdict === verdictFilter;
        const matchesQuery = !q || m.claim.toLowerCase().includes(q) || m.explanation.toLowerCase().includes(q);
        return matchesVerdict && matchesQuery;
      }),
    [q, verdictFilter]
  );

  const filteredGlossary = useMemo(
    () =>
      GLOSSARY_TERMS.filter(
        (t) =>
          !q ||
          t.term.toLowerCase().includes(q) ||
          t.meaning.toLowerCase().includes(q) ||
          t.honestTake.toLowerCase().includes(q)
      ),
    [q]
  );

  const filteredMedical = useMemo(
    () =>
      MEDICAL_INFO_CARDS.filter(
        (c) => !q || c.name.toLowerCase().includes(q) || c.whatItIs.toLowerCase().includes(q)
      ),
    [q]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Academy &amp; Myths Wall</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {ACADEMY_GUIDES.length} deep guides · {MYTHS_WALL.length} verified claims · Honest glossary · Neutral medical info cards
        </p>
      </div>

      {/* Honest on Bones Anchor */}
      <div className="ascend-card p-4 bg-[var(--accent-soft)] border-[var(--accent)]/30 flex gap-3 items-start text-xs">
        <ShieldCheck className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Honest Reality on Facial Bone &amp; Habits</p>
          <p className="text-slate-700 dark:text-slate-200 mt-0.5">
            Adult bone structure does not change from exercises, mewing, chewing devices, or “hunter eyes” squinting (<strong>Not proven</strong>). What genuinely changes appearance: body fat, skin clarity, hair, grooming, posture, sleep, debloat, sun care, teeth/smile, style fit, and neck/shoulder training.
          </p>
        </div>
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search offline guides, myths, or terms..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-[#131815] border border-slate-200 dark:border-white/10 text-xs min-h-[42px]"
          />
        </div>

        <div className="flex gap-1.5 p-1 rounded-2xl bg-slate-200/70 dark:bg-white/5 overflow-x-auto">
          {([
            { id: 'guides', label: `Guides (${ACADEMY_GUIDES.length})` },
            { id: 'myths', label: `Myths (${MYTHS_WALL.length})` },
            { id: 'glossary', label: 'Glossary' },
            { id: 'medical', label: 'Medical Info' },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap min-h-[36px] ${
                tab === t.id
                  ? 'bg-white dark:bg-[#1A211D] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 14 DEEP GUIDES */}
      {tab === 'guides' && (
        <div className="space-y-3">
          {filteredGuides.map((g) => {
            const isOpen = openGuideId === g.id;
            return (
              <div key={g.id} className="ascend-card p-4">
                <button
                  type="button"
                  onClick={() => setOpenGuideId(isOpen ? null : g.id)}
                  className="w-full flex items-center justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-[11px] font-semibold text-[var(--accent)]">
                      {g.category} · {g.evidence}
                    </div>
                    <h2 className="font-display text-base font-bold mt-0.5">{g.title}</h2>
                  </div>
                  {isOpen ? <ChevronUp className="w-5 h-5 shrink-0" /> : <ChevronDown className="w-5 h-5 shrink-0" />}
                </button>

                {isOpen && (
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-white/10 space-y-3 text-xs">
                    <div>
                      <p className="font-semibold mb-1">3-Bullet Summary</p>
                      <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                        {g.summary.map((s) => (
                          <li key={s}>• {s}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="font-semibold mb-1">Actionable Steps</p>
                        <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300">
                          {g.steps.map((st) => (
                            <li key={st}>{st}</li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <p className="font-semibold mb-1">Common Mistakes</p>
                        <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                          {g.commonMistakes.map((m) => (
                            <li key={m}>• {m}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] space-y-1">
                      <p><strong>Myth:</strong> {g.mythVsReality.myth}</p>
                      <p><strong>Reality:</strong> {g.mythVsReality.reality}</p>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      <strong>When to see a professional:</strong> {g.whenToSeeDoctor}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 42 MYTHS WALL */}
      {tab === 'myths' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(['All', 'True', 'Partly true', 'False', 'False and risky'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVerdictFilter(v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold min-h-[36px] ${
                  verdictFilter === v
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'bg-white dark:bg-[#131815] border border-slate-200 dark:border-white/10'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredMyths.map((m) => (
              <div key={m.id} className="ascend-card p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`font-bold ${
                      m.verdict === 'True'
                        ? 'text-emerald-500'
                        : m.verdict === 'Partly true'
                        ? 'text-amber-500'
                        : 'text-rose-500'
                    }`}
                  >
                    Verdict: {m.verdict}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">{m.evidence}</span>
                </div>
                <p className="text-sm font-semibold">{m.claim}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{m.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GLOSSARY */}
      {tab === 'glossary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredGlossary.map((t) => (
            <div key={t.term} className="ascend-card p-4 space-y-1.5 text-xs">
              <h2 className="font-display text-sm font-bold">{t.term}</h2>
              <p className="text-slate-600 dark:text-slate-300">{t.meaning}</p>
              <p className="text-[var(--accent)] font-medium pt-1">Honest take: {t.honestTake}</p>
            </div>
          ))}
        </div>
      )}

      {/* NEUTRAL MEDICAL INFO CARDS */}
      {tab === 'medical' && (
        <div className="space-y-3">
          <div className="ascend-card p-3.5 flex gap-2.5 items-center text-xs text-slate-600 dark:text-slate-300">
            <Stethoscope className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span>
              Educational overviews only—never dosing, never prescriptions. Always speak to a licensed physician or dermatologist.
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredMedical.map((c) => (
              <div key={c.id} className="ascend-card p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-bold">{c.name}</h2>
                  <span className="font-semibold text-[var(--accent)] shrink-0">{c.evidence}</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300"><strong>What it is:</strong> {c.whatItIs}</p>
                {c.evidenceDetail && (
                  <p className="text-slate-600 dark:text-slate-300"><strong>What the evidence says:</strong> {c.evidenceDetail}</p>
                )}
                <p className="text-amber-700 dark:text-amber-300"><strong>Risks:</strong> {c.risks}</p>
                {c.legal && (
                  <p className="text-slate-500 dark:text-slate-400"><strong>Legal:</strong> {c.legal}</p>
                )}
                {c.naturalSupport && (
                  <p className="text-emerald-700 dark:text-emerald-300"><strong>What actually supports it naturally:</strong> {c.naturalSupport}</p>
                )}
                <p className="text-slate-500 dark:text-slate-400"><strong>Guidance:</strong> {c.guidance}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
