import React, { useRef, useState } from 'react';
import { Camera, Check, Loader2, Sparkles, UtensilsCrossed, X } from 'lucide-react';
import { saveMealScanEntry } from '../../db/database';
import { en } from '../../i18n/en';
import { apiRequest, hasOnlineConsent } from '../../lib/api';
import { computeDebloatImpact, prepareMealImageAssets } from '../../lib/nutrition';
import { toLocalDateKey } from '../../lib/date';
import { OnlineConsentModal } from '../modals/OnlineConsentModal';
import { useToast } from '../ui/ToastProvider';
import type { AppSettings, MealFoodItem, MealType, UserProfile } from '../../types';

interface MenuPick {
  dishName: string;
  portionLabel: string;
  estimatedKcal: number;
  kcalRange: string;
  estimatedProteinG: number;
  estimatedSodiumMg: number;
  reasonLine: string;
}

interface MenuHelperModalProps {
  open: boolean;
  profile: UserProfile;
  settings: AppSettings;
  dateKey?: string;
  mealSlot: MealType;
  kcalLeft: number;
  proteinLeftG: number;
  onClose: () => void;
  onSaved?: (entryId: number, slot: MealType) => void;
}

export const MenuHelperModal: React.FC<MenuHelperModalProps> = ({
  open,
  profile,
  settings,
  dateKey = toLocalDateKey(),
  mealSlot,
  kcalLeft,
  proteinLeftG,
  onClose,
  onSaved,
}) => {
  const { showToast } = useToast();
  const [menuText, setMenuText] = useState('');
  const [menuPreview, setMenuPreview] = useState<string | null>(null);
  const [pendingAsset, setPendingAsset] = useState<{ base64: string; mimeType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [picks, setPicks] = useState<MenuPick[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingRunRef = useRef<(() => void) | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const assets = await prepareMealImageAssets(file);
      setMenuPreview(assets.previewDataUrl);
      setPendingAsset({ base64: assets.apiBase64, mimeType: assets.mimeType });
      setError(null);
    } catch {
      setError('Could not read that image. Try typing 2-4 menu dishes instead.');
    }
  };

  const runMenuCheck = async () => {
    if (!menuText.trim() && !pendingAsset) {
      setError('Type a few dishes from the menu or pick a menu photo.');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Menu helper needs internet. Or look for grilled meat/chicken + salad + regular rice/bread.');
      return;
    }
    if (!hasOnlineConsent(settings, 'food')) {
      pendingRunRef.current = () => {
        void runMenuCheck();
      };
      setConsentOpen(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ summary: string; picks: MenuPick[] }>('/api/food-helper', {
        method: 'POST',
        timeoutMs: 20_000,
        body: {
          mode: 'menu',
          menuText: menuText.trim(),
          imageBase64: pendingAsset?.base64,
          mimeType: pendingAsset?.mimeType,
          kcalLeft: Math.max(250, Math.round(kcalLeft || 650)),
          proteinLeftG: Math.max(15, Math.round(proteinLeftG || 30)),
          goal: profile.dietGoal ?? 'maintain',
        },
      });
      if (!res.ok) {
        setError(res.error || 'Could not analyze that menu.');
      } else {
        setSummary(res.data.summary);
        setPicks(res.data.picks ?? []);
      }
    } catch {
      setError('Network error reaching menu helper.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogPick = async (pick: MenuPick, idx: number) => {
    setSavingIdx(idx);
    try {
      const item: MealFoodItem = {
        id: `menu-${Date.now()}-${idx}`,
        name: pick.dishName,
        icon: '🍽️',
        portionLabel: pick.portionLabel,
        kcalRange: pick.kcalRange,
        confidence: 'Low',
        portionGrams: 350,
        baseGrams: 350,
        calories: pick.estimatedKcal,
        proteinG: pick.estimatedProteinG,
        carbsG: Math.round((pick.estimatedKcal * 0.4) / 4),
        fatsG: Math.round((pick.estimatedKcal * 0.32) / 9),
        sodiumMg: pick.estimatedSodiumMg || 750,
        addedSugarG: 4,
      };
      const debloat = computeDebloatImpact(item.sodiumMg, item.addedSugarG);
      const id = await saveMealScanEntry({
        date: dateKey,
        timestamp: Date.now(),
        mealType: mealSlot,
        mealTitle: pick.dishName,
        confidence: 'Low',
        items: [item],
        totalCalories: item.calories,
        totalProteinG: item.proteinG,
        totalCarbsG: item.carbsG,
        totalFatsG: item.fatsG,
        totalSodiumMg: item.sodiumMg,
        totalAddedSugarG: item.addedSugarG,
        debloatStatus: debloat.status,
        debloatHeadline: debloat.headline,
        summaryNote: `${pick.kcalRange} · Menu helper estimate`,
        isManual: true,
        isEstimate: true,
        estimateRangeLabel: pick.kcalRange,
        sourceKind: 'normal',
      });
      showToast(`Logged "${pick.dishName}" (estimate)`);
      onSaved?.(id, mealSlot);
      onClose();
    } finally {
      setSavingIdx(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm no-print">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Menu helper
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Suggests a dish that fits your day · Estimates only
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu helper"
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          <textarea
            rows={3}
            value={menuText}
            onChange={(e) => setMenuText(e.target.value)}
            placeholder="Type a few options on the menu (e.g., grilled chicken platter, creamy pasta, burger & fries, shish tawook)..."
            className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-sm"
          />

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[42px]"
            >
              <Camera className="w-4 h-4 text-[var(--accent)]" />
              {menuPreview ? 'Change menu photo' : 'Photo of menu'}
            </button>
            <button
              type="button"
              disabled={loading || (!menuText.trim() && !pendingAsset)}
              onClick={runMenuCheck}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[42px] disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Suggest best fit
            </button>
          </div>

          {menuPreview && (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 max-h-40">
              <img src={menuPreview} alt="Menu preview" className="w-full h-36 object-cover" />
              <button
                type="button"
                onClick={() => {
                  setMenuPreview(null);
                  setPendingAsset(null);
                }}
                className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/70 text-white text-[10px] font-bold"
              >
                Remove
              </button>
            </div>
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Location EXIF is stripped before photo upload. Nothing is saved on our server.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-700 dark:text-amber-300">
            {error}
          </div>
        )}

        {picks.length > 0 && (
          <div className="space-y-2.5">
            {summary && (
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{summary}</p>
            )}
            {picks.map((pick, i) => (
              <div
                key={`${pick.dishName}-${i}`}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {pick.dishName}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {pick.portionLabel} · {pick.kcalRange} · ~{pick.estimatedProteinG}g protein · estimate
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={savingIdx !== null}
                    onClick={() => handleLogPick(pick, i)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[36px] shrink-0"
                  >
                    {savingIdx === i ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Log to {en.meals[mealSlot]}
                  </button>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">{pick.reasonLine}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <OnlineConsentModal
        open={consentOpen}
        featureName="AI Food Scan"
        settings={settings}
        onAccept={() => {
          setConsentOpen(false);
          const fn = pendingRunRef.current;
          pendingRunRef.current = null;
          fn?.();
        }}
        onDecline={() => {
          setConsentOpen(false);
          pendingRunRef.current = null;
        }}
      />
    </div>
  );
};
