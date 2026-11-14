import React, { Suspense, lazy, useEffect, useState } from 'react';
import {
  RotateCcw,
  Trash2,
  Eye,
  EyeOff,
  SlidersHorizontal,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import { db } from '../db/database';
import {
  getPslTierMeta,
  getScannerState,
  initFaceLandmarker,
  PSL_HONEST_DISCLAIMER,
  subscribeScannerStatus,
} from '../lib/faceAnalysis';
import { daysBetween, toLocalDateKey } from '../lib/date';
import { BeforeAfterSlider, SmoothAreaChart } from '../components/ui/Charts';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import type { AppSettings, FaceScanResult } from '../types';

const GuidedFaceScanner = lazy(() =>
  import('../components/psl/GuidedFaceScanner').then((m) => ({ default: m.GuidedFaceScanner }))
);

const FacialAestheticsReport = lazy(() =>
  import('../components/psl/FacialAestheticsReport').then((m) => ({
    default: m.FacialAestheticsReport,
  }))
);

interface PslLabScreenProps {
  scans: FaceScanResult[];
  settings: AppSettings;
  onBack?: () => void;
}

export const PslLabScreen: React.FC<PslLabScreenProps> = ({ scans, settings, onBack }) => {
  const [subTab, setSubTab] = useState<'scan' | 'results' | 'journal'>(
    scans.length > 0 ? 'results' : 'scan'
  );
  const [engineStatus, setEngineStatus] = useState(getScannerState());
  const [selectedResultId, setSelectedResultId] = useState<number | null>(scans[0]?.id ?? null);
  const [augmentScan, setAugmentScan] = useState<FaceScanResult | null>(null);

  // Journal comparison indices
  const [compareA, setCompareA] = useState(0);
  const [compareB, setCompareB] = useState(1);

  useEffect(() => {
    const unsub = subscribeScannerStatus(() => setEngineStatus(getScannerState()));
    initFaceLandmarker().catch(() => {});
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (scans.length > 0 && !selectedResultId) {
      setSelectedResultId(scans[0].id ?? null);
    }
  }, [scans, selectedResultId]);

  const activeScan = scans.find((s) => s.id === selectedResultId) ?? scans[0] ?? null;
  const todayKey = toLocalDateKey();
  const scansToday = scans.filter((s) => s.date === todayKey).length;
  const daysSinceLastScan = scans[0] ? daysBetween(scans[0].date, todayKey) : null;
  const thumbnailScans = scans.filter((s) => Boolean(s.frontThumbnail));

  if (subTab === 'scan') {
    return (
      <ErrorBoundary screenName="Face Scanner">
        <Suspense
          fallback={
            <div className="ascend-card p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Starting guided multi-angle scanner...
            </div>
          }
        >
          <GuidedFaceScanner
            saveThumbnails={settings.saveThumbnails}
            augmentScan={augmentScan}
            onCancel={() => {
              setAugmentScan(null);
              if (scans.length > 0) setSubTab('results');
              else if (onBack) onBack();
              else setSubTab('results');
            }}
            onScanSaved={(newId) => {
              setAugmentScan(null);
              setSelectedResultId(newId);
              setSubTab('results');
            }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">PSL LAB</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            On-device 478-landmark multi-angle analysis · Zero cloud upload ·{' '}
            <span
              className={
                engineStatus.status === 'ready'
                  ? 'text-[var(--accent)] font-semibold'
                  : engineStatus.status === 'error'
                  ? 'text-rose-500 font-semibold'
                  : 'text-amber-500 font-semibold'
              }
            >
              {engineStatus.status === 'ready'
                ? 'Scanner ready'
                : engineStatus.status === 'loading'
                ? 'Loading local model...'
                : engineStatus.status === 'error'
                ? 'Scanner load error'
                : 'Ready on open'}
            </span>
          </p>
        </div>

        {engineStatus.status === 'error' && (
          <button
            type="button"
            onClick={() => initFaceLandmarker(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500 text-white text-xs font-semibold min-h-[40px]"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry Scanner
          </button>
        )}
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-1.5 p-1 rounded-2xl bg-slate-200/70 dark:bg-white/5 w-fit max-w-full overflow-x-auto">
        {([
          { id: 'scan', label: 'Multi-Angle Scanner' },
          { id: 'results', label: `Report (${scans.length})` },
          { id: 'journal', label: 'Compare & Journal' },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (t.id === 'scan') setAugmentScan(null);
              setSubTab(t.id);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px] whitespace-nowrap shrink-0 transition ${
              subTab === t.id
                ? 'bg-white dark:bg-[#0E1612] text-slate-900 dark:text-white shadow-sm border border-transparent dark:border-emerald-500/20'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {scansToday >= 3 && (
        <div className="ascend-card p-3.5 bg-amber-500/10 border-amber-500/40 flex gap-2.5 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <span>
            You have run {scansToday} scans today. True facial changes track best across 14-day intervals under steady window light.
          </span>
        </div>
      )}

      {/* RESULTS TAB */}
      {subTab === 'results' && (
        <div key="results-tab" className="ascend-panel-enter space-y-4">
          {!activeScan ? (
            <div className="ascend-card p-8 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No scans analyzed yet. Launch the Multi-Angle Scanner to generate your report.
              </p>
              <button
                type="button"
                onClick={() => {
                  setAugmentScan(null);
                  setSubTab('scan');
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
              >
                <Camera className="w-4 h-4" /> Start Guided Scan
              </button>
            </div>
          ) : (
            <ErrorBoundary screenName="Facial Aesthetics Report">
              <Suspense
                fallback={
                  <div className="ascend-card p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    Rendering report...
                  </div>
                }
              >
                <FacialAestheticsReport
                  activeScan={activeScan}
                  scans={scans}
                  slangTierNames={settings.slangTierNames ?? true}
                  onSelectScan={(id) => setSelectedResultId(id)}
                  onStartNewScan={() => {
                    setAugmentScan(null);
                    setSubTab('scan');
                  }}
                  onAddSidePhotos={(scan) => {
                    setAugmentScan(scan);
                    setSubTab('scan');
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
      )}

      {/* COMPARE & PHOTO JOURNAL TAB */}
      {subTab === 'journal' && (
        <div key="journal-tab" className="ascend-panel-enter space-y-4">
          <div className="ascend-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <p className="font-semibold text-sm">
                14-Day Rescan Cadence{' '}
                {daysSinceLastScan !== null
                  ? daysSinceLastScan >= 14
                    ? '— Ready for next check-in'
                    : `— ${14 - daysSinceLastScan} days until next recommended scan`
                  : '— Log your baseline scan'}
              </p>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                Me vs. me tracking only. Thumbnails are optional; landmark measurements always save locally.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                db.settings.update('app', { saveThumbnails: !settings.saveThumbnails })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[40px]"
            >
              {settings.saveThumbnails ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              Thumbnails: {settings.saveThumbnails ? 'On' : 'Off'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-6 ascend-card p-4 space-y-3">
              <h2 className="font-display text-base font-bold">Personal Estimate Trend</h2>
              <SmoothAreaChart
                points={[...scans].reverse().map((s) => ({ label: s.date.slice(5), value: s.pslEstimate }))}
                unit="/8"
                minVal={2.0}
                maxVal={8.0}
                emptyLabel="Complete 2+ scans (ideally 14 days apart) to compare your personal trend."
              />
            </div>

            <div className="lg:col-span-6 ascend-card p-4 space-y-3">
              <h2 className="font-display text-base font-bold flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" />
                Side-by-Side Comparison
              </h2>
              {thumbnailScans.length < 2 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  Save at least 2 scans with thumbnails enabled to compare side-by-side.
                </p>
              ) : (
                <>
                  <div className="flex gap-2 text-xs">
                    <select
                      value={compareA}
                      onChange={(e) => setCompareA(Number(e.target.value))}
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5"
                    >
                      {thumbnailScans.map((s, idx) => (
                        <option key={s.id} value={idx}>
                          {s.date} ({s.pslEstimate}/8)
                        </option>
                      ))}
                    </select>
                    <select
                      value={compareB}
                      onChange={(e) => setCompareB(Number(e.target.value))}
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5"
                    >
                      {thumbnailScans.map((s, idx) => (
                        <option key={s.id} value={idx}>
                          {s.date} ({s.pslEstimate}/8)
                        </option>
                      ))}
                    </select>
                  </div>
                  <BeforeAfterSlider
                    beforeSrc={thumbnailScans[compareA]?.frontThumbnail || thumbnailScans[0].frontThumbnail!}
                    afterSrc={thumbnailScans[compareB]?.frontThumbnail || thumbnailScans[1].frontThumbnail!}
                    beforeLabel={thumbnailScans[compareA]?.date || 'Earlier'}
                    afterLabel={thumbnailScans[compareB]?.date || 'Later'}
                  />
                </>
              )}
            </div>
          </div>

          {/* Scan History List */}
          <div className="ascend-card p-4 space-y-3">
            <h2 className="font-display text-base font-bold">Scan History ({scans.length})</h2>
            {scans.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                No saved scans yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-white/10">
                {scans.map((s) => {
                  const meta = getPslTierMeta(s.pslEstimate, settings.slangTierNames ?? true);
                  return (
                    <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {s.frontThumbnail ? (
                          <img
                            src={s.frontThumbnail}
                            alt={`Scan ${s.date}`}
                            className="w-12 h-12 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center font-mono-num text-xs font-bold shrink-0">
                            {s.pslEstimate}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {s.date} · <span className="font-mono-num">{s.pslEstimate}/8</span> ({meta.bracketLabel})
                            {s.scanConfidence !== undefined && (
                              <span className="ml-1.5 text-xs font-mono-num text-slate-500 dark:text-slate-400">
                                · Conf {Math.round(s.scanConfidence * 100)}%
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {s.isImplausible
                              ? 'Unusual scan — retake with neutral face'
                              : `Quality ${s.qualityScore}/100 · Light ${s.lightingScore}/100 · Angles: ${s.anglesCaptured.join(', ')}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedResultId(s.id!);
                            setSubTab('results');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => db.scans.delete(s.id!)}
                          aria-label="Delete scan"
                          className="p-2 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 pt-1">
            {PSL_HONEST_DISCLAIMER}
          </p>
        </div>
      )}
    </div>
  );
};
