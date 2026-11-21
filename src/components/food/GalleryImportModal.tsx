import React, { useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Shield, Sparkles, Trash2, X } from 'lucide-react';
import { saveMealScanEntry } from '../../db/database';
import { en } from '../../i18n/en';
import { apiRequest, hasOnlineConsent } from '../../lib/api';
import { toLocalDateKey } from '../../lib/date';
import { roundKcal, roundProtein } from '../../lib/foodChatParser';
import { computeDebloatImpact, prepareMealImageAssets } from '../../lib/nutrition';
import { groupGalleryFilesByMealTime, type GalleryMealCluster } from '../../lib/realLifeFood';
import { OnlineConsentModal } from '../modals/OnlineConsentModal';
import { useToast } from '../ui/ToastProvider';
import type { AppSettings, MealFoodItem, MealType } from '../../types';

interface ScannedClusterResult {
  clusterId: string;
  dateKey: string;
  mealType: MealType;
  captureTimeLabel: string;
  previewDataUrl: string;
  thumbnailDataUrl: string;
  mealTitle: string;
  kcal: number;
  proteinG: number;
  sodiumMg: number;
  addedSugarG: number;
  items: MealFoodItem[];
  status: 'pending' | 'scanning' | 'ready' | 'error';
  errorMsg?: string;
}

interface AnalyzeFoodApiResp {
  mealTitle: string;
  confidence: 'High' | 'Medium' | 'Low';
  items: MealFoodItem[];
  summaryNote: string;
}

interface GalleryImportModalProps {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSavedBatch?: (count: number) => void;
}

export const GalleryImportModal: React.FC<GalleryImportModalProps> = ({
  open,
  settings,
  onClose,
  onSavedBatch,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [clusters, setClusters] = useState<GalleryMealCluster[]>([]);
  const [results, setResults] = useState<ScannedClusterResult[]>([]);
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingClustersRef = useRef<GalleryMealCluster[] | null>(null);

  const readyCount = useMemo(
    () => results.filter((r) => r.status === 'ready').length,
    [results]
  );

  if (!open) return null;

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (fileList.length === 0) return;

    const grouped = groupGalleryFilesByMealTime(fileList, todayKey).slice(0, 8);
    setClusters(grouped);

    const initialCards: ScannedClusterResult[] = [];
    for (const cl of grouped) {
      try {
        const firstAsset = await prepareMealImageAssets(cl.files[0]);
        initialCards.push({
          clusterId: cl.clusterId,
          dateKey: cl.dateKey,
          mealType: cl.mealType,
          captureTimeLabel: cl.captureTimeLabel,
          previewDataUrl: firstAsset.previewDataUrl,
          thumbnailDataUrl: firstAsset.thumbnailDataUrl,
          mealTitle: `${en.meals[cl.mealType]} photo (${cl.captureTimeLabel})`,
          kcal: 550,
          proteinG: 24,
          sodiumMg: 650,
          addedSugarG: 5,
          items: [],
          status: 'pending',
        });
      } catch {
        // skip unreadable file
      }
    }
    setResults(initialCards);
  };

  const scanAllClusters = async (sourceClusters: GalleryMealCluster[]) => {
    if (sourceClusters.length === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast('You are offline — edit the quick calorie estimate below or save as meal estimate.', 'info');
      setResults((prev) =>
        prev.map((r) => ({
          ...r,
          status: 'ready',
          mealTitle: `${en.meals[r.mealType]} photo (${r.captureTimeLabel})`,
        }))
      );
      return;
    }

    if (!hasOnlineConsent(settings, 'food')) {
      pendingClustersRef.current = sourceClusters;
      setConsentOpen(true);
      return;
    }

    setAnalyzingAll(true);
    for (const cl of sourceClusters) {
      setResults((prev) =>
        prev.map((r) => (r.clusterId === cl.clusterId ? { ...r, status: 'scanning' } : r))
      );
      try {
        const assets = await prepareMealImageAssets(cl.files[0]);
        const res = await apiRequest<AnalyzeFoodApiResp>('/api/analyze-food', {
          method: 'POST',
          timeoutMs: 32_000,
          body: {
            imageBase64: assets.apiBase64,
            mimeType: assets.mimeType,
            mealNote: `${en.meals[cl.mealType]} photo (${cl.files.length} image${cl.files.length > 1 ? 's' : ''})`,
          },
        });
        if (!res.ok) {
          setResults((prev) =>
            prev.map((r) =>
              r.clusterId === cl.clusterId
                ? {
                    ...r,
                    status: 'error',
                    errorMsg: res.error || 'Could not scan photo — adjust numbers manually.',
                  }
                : r
            )
          );
          continue;
        }
        if (!res.data.items?.length) {
          setResults((prev) =>
            prev.map((r) =>
              r.clusterId === cl.clusterId
                ? {
                    ...r,
                    status: 'error',
                    errorMsg: 'Could not find food items — adjust numbers manually.',
                  }
                : r
            )
          );
          continue;
        }
        const totalKcal = roundKcal(res.data.items.reduce((s, it) => s + (it.calories || 0), 0));
        const totalPro = roundProtein(res.data.items.reduce((s, it) => s + (it.proteinG || 0), 0));
        const totalSod = Math.round(res.data.items.reduce((s, it) => s + (it.sodiumMg || 0), 0));
        const totalSug = Math.round(res.data.items.reduce((s, it) => s + (it.addedSugarG || 0), 0));
        setResults((prev) =>
          prev.map((r) =>
            r.clusterId === cl.clusterId
              ? {
                  ...r,
                  status: 'ready',
                  mealTitle: res.data.mealTitle || r.mealTitle,
                  kcal: totalKcal,
                  proteinG: totalPro,
                  sodiumMg: totalSod,
                  addedSugarG: totalSug,
                  items: res.data.items,
                }
              : r
          )
        );
      } catch {
        setResults((prev) =>
          prev.map((r) =>
            r.clusterId === cl.clusterId
              ? { ...r, status: 'error', errorMsg: 'Scan failed — you can still save an estimate.' }
              : r
          )
        );
      }
    }
    setAnalyzingAll(false);
  };

  const handleSaveConfirmed = async () => {
    const saveable = results.filter((r) => r.status === 'ready' || r.status === 'pending' || r.status === 'error');
    if (saveable.length === 0) return;
    setSavingAll(true);
    try {
      for (const card of saveable) {
        const items: MealFoodItem[] =
          card.items.length > 0
            ? card.items
            : [
                {
                  id: `gallery-${Date.now()}-${card.clusterId}`,
                  name: card.mealTitle,
                  icon: '📸',
                  portionLabel: 'Gallery photo estimate',
                  confidence: 'Low',
                  portionGrams: 380,
                  baseGrams: 380,
                  calories: roundKcal(card.kcal),
                  proteinG: roundProtein(card.proteinG),
                  carbsG: Math.round((card.kcal * 0.44) / 4),
                  fatsG: Math.round((card.kcal * 0.32) / 9),
                  sodiumMg: card.sodiumMg,
                  addedSugarG: card.addedSugarG,
                },
              ];
        const totalCalories = roundKcal(items.reduce((s, it) => s + it.calories, 0));
        const totalProteinG = roundProtein(items.reduce((s, it) => s + it.proteinG, 0));
        const debloat = computeDebloatImpact(card.sodiumMg, card.addedSugarG);

        await saveMealScanEntry({
          date: card.dateKey,
          timestamp: Date.now(),
          mealType: card.mealType,
          mealTitle: card.mealTitle,
          confidence: card.items.length > 0 ? 'Medium' : 'Low',
          items,
          totalCalories,
          totalProteinG,
          totalCarbsG: Math.round((totalCalories * 0.44) / 4),
          totalFatsG: Math.round((totalCalories * 0.32) / 9),
          totalSodiumMg: card.sodiumMg,
          totalAddedSugarG: card.addedSugarG,
          debloatStatus: debloat.status,
          debloatHeadline: debloat.headline,
          summaryNote: `Gallery import (${card.captureTimeLabel}) · Estimate`,
          photoThumbnail: settings.saveThumbnails ? card.thumbnailDataUrl : undefined,
          isEstimate: true,
          estimateRangeLabel: `about ${roundKcal(totalCalories * 0.85)}–${roundKcal(totalCalories * 1.18)} kcal`,
          sourceKind: 'gallery_import',
        });
      }
      showToast(`Saved ${saveable.length} gallery meal${saveable.length === 1 ? '' : 's'}`);
      onSavedBatch?.(saveable.length);
      onClose();
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm no-print">
      <div className="w-full max-w-xl rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <ImagePlus className="w-4 h-4 text-[var(--accent)]" />
              Add photos from my gallery
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Pick 1–8 food photos from your camera roll — grouped by time automatically
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close gallery import"
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/25 flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200">
          <Shield className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
          <span>
            Only photos you pick here are read. Location/EXIF data is stripped on your phone before scanning, and photos are not stored on our server.
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesSelected}
          className="hidden"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[44px]"
          >
            <ImagePlus className="w-4 h-4 text-[var(--accent)]" />
            {results.length > 0 ? 'Pick different photos' : 'Select food photos'}
          </button>
          {results.length > 0 && (
            <button
              type="button"
              disabled={analyzingAll}
              onClick={() => scanAllClusters(clusters)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
            >
              {analyzingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Scan {clusters.length} grouped meal{clusters.length === 1 ? '' : 's'} with AI
            </button>
          )}
        </div>

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((card) => (
              <div
                key={card.clusterId}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-2.5"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={card.previewDataUrl}
                    alt={card.mealTitle}
                    className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-white/10"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input
                      type="text"
                      value={card.mealTitle}
                      onChange={(e) =>
                        setResults((prev) =>
                          prev.map((r) =>
                            r.clusterId === card.clusterId ? { ...r, mealTitle: e.target.value } : r
                          )
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-xs font-bold"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      <select
                        value={card.mealType}
                        onChange={(e) =>
                          setResults((prev) =>
                            prev.map((r) =>
                              r.clusterId === card.clusterId
                                ? { ...r, mealType: e.target.value as MealType }
                                : r
                            )
                          )
                        }
                        className="px-2 py-1 rounded-lg bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-[11px] font-semibold"
                      >
                        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((s) => (
                          <option key={s} value={s}>
                            {en.meals[s]}
                          </option>
                        ))}
                      </select>
                      <span className="px-2 py-1 rounded-lg bg-slate-200/70 dark:bg-white/10 text-[11px] font-semibold">
                        {card.dateKey} · {card.captureTimeLabel}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setResults((prev) => prev.filter((r) => r.clusterId !== card.clusterId))
                    }
                    aria-label="Remove photo meal"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-500">
                      kcal
                      <input
                        type="number"
                        value={card.kcal}
                        onChange={(e) => {
                          const v = Math.max(0, Number(e.target.value) || 0);
                          setResults((prev) =>
                            prev.map((r) => (r.clusterId === card.clusterId ? { ...r, kcal: v, items: [] } : r))
                          );
                        }}
                        className="ml-1 w-16 px-2 py-1 rounded-lg bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 font-mono-num font-bold text-xs"
                      />
                    </label>
                    <label className="text-[11px] text-slate-500">
                      pro (g)
                      <input
                        type="number"
                        value={card.proteinG}
                        onChange={(e) => {
                          const v = Math.max(0, Number(e.target.value) || 0);
                          setResults((prev) =>
                            prev.map((r) =>
                              r.clusterId === card.clusterId ? { ...r, proteinG: v, items: [] } : r
                            )
                          );
                        }}
                        className="ml-1 w-14 px-2 py-1 rounded-lg bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 font-mono-num font-bold text-xs"
                      />
                    </label>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {card.status === 'scanning'
                      ? 'Scanning...'
                      : card.status === 'ready'
                      ? 'AI estimate ready'
                      : card.status === 'error'
                      ? card.errorMsg || 'Manual estimate'
                      : 'Ready to scan or edit'}
                  </span>
                </div>
              </div>
            ))}

            <button
              type="button"
              disabled={savingAll || analyzingAll}
              onClick={handleSaveConfirmed}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[46px]"
            >
              {savingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Confirm & save {results.length} meal{results.length === 1 ? '' : 's'}
              {readyCount > 0 ? ` (${readyCount} scanned)` : ''}
            </button>
          </div>
        )}
      </div>

      <OnlineConsentModal
        open={consentOpen}
        featureName="AI Food Scan"
        settings={settings}
        onAccept={() => {
          setConsentOpen(false);
          const cl = pendingClustersRef.current;
          pendingClustersRef.current = null;
          if (cl) void scanAllClusters(cl);
        }}
        onDecline={() => {
          setConsentOpen(false);
          pendingClustersRef.current = null;
        }}
      />
    </div>
  );
};
