import React, { useMemo, useState } from 'react';
import { Check, Loader2, Plus, Search, Sparkles, Star, X } from 'lucide-react';
import {
  FOOD_CATALOG,
  FOOD_CATALOG_CATEGORIES,
  type FoodCatalogItem,
} from '../../data/foodCatalog';
import { db } from '../../db/database';
import { apiRequest, hasOnlineConsent } from '../../lib/api';
import {
  applyDirectPortionEdit,
  buildEditablePortionChips,
  catalogItemToDraft,
  estimateCustomFoodLocally,
  normalizeFoodSearchText,
} from '../../lib/foodChatParser';
import { useToast } from '../ui/ToastProvider';
import type { DraftFoodItem, FoodChatApiResponse } from './foodChatTypes';
import type {
  AppSettings,
  CustomFoodEntry,
  FoodCatalogCategory,
  MealScanEntry,
  MealType,
} from '../../types';

interface FoodFinderModalProps {
  open: boolean;
  settings: AppSettings;
  mealScans: MealScanEntry[];
  currentSlot: MealType;
  initialSearch?: string;
  swapTargetName?: string;
  onClose: () => void;
  onSelectDraft: (draft: DraftFoodItem) => void;
  onRequestOnlineConsent?: () => void;
}

type FinderFilterTab =
  | 'All'
  | 'My usual'
  | 'Favorites'
  | 'Recent'
  | FoodCatalogCategory;

export const FoodFinderModal: React.FC<FoodFinderModalProps> = ({
  open,
  settings,
  mealScans,
  currentSlot,
  initialSearch = '',
  swapTargetName,
  onClose,
  onSelectDraft,
  onRequestOnlineConsent,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState(initialSearch);
  const [activeTab, setActiveTab] = useState<FinderFilterTab>('All');
  const [pickingItem, setPickingItem] = useState<DraftFoodItem | null>(null);

  // Custom food builder state
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customCategory, setCustomCategory] = useState<FoodCatalogCategory>('Egyptian home food');
  const [customSizePreset, setCustomSizePreset] = useState<'light' | 'medium' | 'heavy'>('medium');
  const [customProteinLevel, setCustomProteinLevel] = useState<'low' | 'moderate' | 'high'>('moderate');
  const [customEstimating, setCustomEstimating] = useState(false);
  const [customPreview, setCustomPreview] = useState<{
    kcal: number;
    kcalRange?: string;
    proteinG: number;
    portionLabel: string;
    source: 'ai' | 'local';
  } | null>(null);

  const favoriteIds = useMemo(() => new Set(settings.favoriteFoodIds ?? []), [settings.favoriteFoodIds]);
  const recentIds = useMemo(() => settings.recentFoodIds ?? [], [settings.recentFoodIds]);

  const usualFoodNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of mealScans) {
      if (m.mealType && m.mealType !== currentSlot) continue;
      for (const it of m.items) {
        const key = it.name.split('(')[0].trim().toLowerCase();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (m.items.length === 0 && m.mealTitle) {
        const key = m.mealTitle.trim().toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [mealScans, currentSlot]);

  const customCatalogAsItems: FoodCatalogItem[] = useMemo(
    () =>
      (settings.customFoodCatalog ?? []).map((cf) => ({
        id: cf.id,
        name: cf.name,
        nameAr: cf.nameAr || '',
        icon: cf.icon || '🍽️',
        category: cf.category,
        slots: ['breakfast', 'lunch', 'dinner', 'snack'],
        aliases: [cf.name],
        defaultPortionLabel: cf.portionLabel,
        defaultQuantity: 1,
        unit: 'serving',
        kcal: cf.kcal,
        kcalRange: cf.kcalRange,
        proteinG: cf.proteinG,
        carbsG: cf.carbsG ?? 0,
        fatsG: cf.fatsG ?? 0,
        sodiumMg: cf.sodiumMg ?? 250,
        addedSugarG: cf.addedSugarG ?? 0,
        followUpKind: 'hand_plate',
        isMixedOrStreet: Boolean(cf.kcalRange),
        estimateNote: 'estimate',
      })),
    [settings.customFoodCatalog]
  );

  const allItems = useMemo(
    () => [...customCatalogAsItems, ...FOOD_CATALOG],
    [customCatalogAsItems]
  );

  const filteredItems = useMemo(() => {
    const q = normalizeFoodSearchText(search);
    let pool = allItems;

    if (activeTab === 'Favorites') {
      pool = pool.filter((it) => favoriteIds.has(it.id));
    } else if (activeTab === 'Recent') {
      const rank = new Map(recentIds.map((id, i) => [id, i]));
      pool = pool
        .filter((it) => rank.has(it.id))
        .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
    } else if (activeTab === 'My usual') {
      pool = pool
        .filter((it) => {
          const base = it.name.split('(')[0].trim().toLowerCase();
          return (usualFoodNames.get(base) ?? 0) > 0 || favoriteIds.has(it.id);
        })
        .sort((a, b) => {
          const ca = usualFoodNames.get(a.name.split('(')[0].trim().toLowerCase()) ?? 0;
          const cb = usualFoodNames.get(b.name.split('(')[0].trim().toLowerCase()) ?? 0;
          return cb - ca;
        });
    } else if (activeTab !== 'All') {
      pool = pool.filter((it) => it.category === activeTab);
    }

    if (!q) return pool;
    return pool.filter((it) => {
      const hay = normalizeFoodSearchText(`${it.name} ${it.nameAr} ${it.aliases.join(' ')}`);
      return hay.includes(q);
    });
  }, [allItems, activeTab, search, favoriteIds, recentIds, usualFoodNames]);

  if (!open) return null;

  const toggleFavorite = async (id: string) => {
    const next = new Set(settings.favoriteFoodIds ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    await db.settings.update('app', { favoriteFoodIds: Array.from(next) });
  };

  const startPickingItem = (item: FoodCatalogItem) => {
    const draft = catalogItemToDraft(item, { source: 'list', wantsAverage: false });
    draft.questionsQueue = [];
    draft.needsQuestion = false;
    setPickingItem(draft);
  };

  const confirmPick = async (draft: DraftFoodItem) => {
    if (draft.catalogId) {
      const prev = (settings.recentFoodIds ?? []).filter((id) => id !== draft.catalogId);
      await db.settings.update('app', {
        recentFoodIds: [draft.catalogId, ...prev].slice(0, 25),
      });
    }
    onSelectDraft(draft);
    setPickingItem(null);
    onClose();
  };

  const handleEstimateCustom = async (useAi: boolean) => {
    const name = customName.trim();
    if (!name) {
      showToast('Enter a food name first.', 'warning');
      return;
    }

    if (useAi) {
      if (!hasOnlineConsent(settings, 'food')) {
        onRequestOnlineConsent?.();
        return;
      }
      setCustomEstimating(true);
      try {
        const res = await apiRequest<FoodChatApiResponse>('/api/food-chat', {
          method: 'POST',
          timeoutMs: 22_000,
          body: {
            text: `${customAmount.trim() || '1 normal portion'} ${name}`,
            lang: 'en',
            mealType: currentSlot,
            locale: 'eg',
          },
        });
        if (res.ok && res.data.items.length > 0) {
          const first = res.data.items[0];
          setCustomPreview({
            kcal: first.kcal,
            kcalRange:
              first.kcalMin && first.kcalMax ? `about ${first.kcalMin}–${first.kcalMax} kcal` : undefined,
            proteinG: first.proteinG,
            portionLabel: first.portionLabel || customAmount.trim() || '1 serving',
            source: 'ai',
          });
          setCustomEstimating(false);
          return;
        }
      } catch {
        // Fall through to local estimate
      } finally {
        setCustomEstimating(false);
      }
    }

    const est = estimateCustomFoodLocally({
      name,
      portionText: customAmount,
      sizePreset: customSizePreset,
      proteinLevel: customProteinLevel,
    });
    setCustomPreview({
      kcal: est.kcal,
      kcalRange: est.kcalRange,
      proteinG: est.proteinG,
      portionLabel: est.portionLabel,
      source: 'local',
    });
  };

  const handleSaveCustomFood = async () => {
    const name = customName.trim();
    if (!name) return;
    const est =
      customPreview ??
      {
        ...estimateCustomFoodLocally({
          name,
          portionText: customAmount,
          sizePreset: customSizePreset,
          proteinLevel: customProteinLevel,
        }),
        source: 'local' as const,
      };

    const entry: CustomFoodEntry = {
      id: `custom-${Date.now()}`,
      name,
      icon: '🍽️',
      category: customCategory,
      portionLabel: est.portionLabel,
      kcal: est.kcal,
      kcalRange: est.kcalRange,
      proteinG: est.proteinG,
      createdAt: Date.now(),
    };

    const existing = settings.customFoodCatalog ?? [];
    await db.settings.update('app', {
      customFoodCatalog: [entry, ...existing],
    });

    const draft: DraftFoodItem = {
      id: `draft-${entry.id}`,
      catalogId: entry.id,
      name: entry.name,
      nameAr: '',
      icon: entry.icon,
      category: entry.category,
      portionLabel: entry.portionLabel,
      quantity: 1,
      unit: 'serving',
      baseKcal: entry.kcal,
      baseProteinG: entry.proteinG,
      baseSodiumMg: 260,
      baseCarbsG: 0,
      baseFatsG: 0,
      baseAddedSugarG: 0,
      extraKcal: 0,
      extraProteinG: 0,
      kcal: entry.kcal,
      proteinG: entry.proteinG,
      sodiumMg: 260,
      confidence: est.source === 'ai' ? 'Medium' : 'Low',
      followUpKind: 'hand_plate',
      questionsQueue: [],
      needsQuestion: false,
      source: 'custom',
    };

    showToast(`Saved "${entry.name}" to your food library`);
    setCustomOpen(false);
    setCustomName('');
    setCustomAmount('');
    setCustomPreview(null);
    await confirmPick(draft);
  };

  const filterTabs: FinderFilterTab[] = [
    'All',
    'My usual',
    'Favorites',
    'Recent',
    ...FOOD_CATALOG_CATEGORIES,
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-white dark:bg-[#0C121E] border border-slate-200 dark:border-white/15 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-2 shrink-0">
          <div>
            <h2 className="font-display text-lg font-bold">
              {swapTargetName ? `Swap "${swapTargetName}"` : 'Pick from food list'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {allItems.length} everyday &amp; Egyptian items · all numbers are estimates
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close food list"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search + Custom Food toggle */}
        <div className="p-3 sm:p-4 space-y-2.5 border-b border-slate-200 dark:border-white/10 shrink-0">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search foul, eggs, koshari, نسكافيه, shawarma..."
                aria-label="Search food list"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-base sm:text-sm min-h-[44px]"
              />
            </div>
            <button
              type="button"
              onClick={() => setCustomOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold min-h-[44px] shrink-0"
            >
              <Plus className="w-4 h-4" /> Custom food
            </button>
          </div>

          {/* Scrollable category & quick tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {filterTabs.map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap min-h-[38px] transition ${
                    active
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Food Panel */}
        {customOpen && (
          <div className="p-4 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10 space-y-3 shrink-0 overflow-y-auto max-h-[52vh]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-[var(--accent)]">Add your own food (saved to your list)</p>
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="text-xs font-semibold text-slate-500"
              >
                Hide
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={customName}
                onChange={(e) => {
                  setCustomName(e.target.value);
                  setCustomPreview(null);
                }}
                placeholder="Food name (e.g., Mom's kofta rice bowl)"
                className="px-3 py-2.5 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-base sm:text-sm min-h-[44px]"
              />
              <input
                type="text"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setCustomPreview(null);
                }}
                placeholder="About how much? (e.g., 1 bowl, half plate)"
                className="px-3 py-2.5 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-base sm:text-sm min-h-[44px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1">Size feel</p>
                <div className="grid grid-cols-3 gap-1">
                  {(['light', 'medium', 'heavy'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => {
                        setCustomSizePreset(sz);
                        setCustomPreview(null);
                      }}
                      className={`py-2 rounded-xl text-xs font-semibold min-h-[38px] capitalize ${
                        customSizePreset === sz
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1">Protein level</p>
                <div className="grid grid-cols-3 gap-1">
                  {([
                    { id: 'low', label: 'Mostly carbs' },
                    { id: 'moderate', label: 'Mixed' },
                    { id: 'high', label: 'Meat/eggs' },
                  ] as const).map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        setCustomProteinLevel(pl.id);
                        setCustomPreview(null);
                      }}
                      className={`py-2 rounded-xl text-xs font-semibold min-h-[38px] ${
                        customProteinLevel === pl.id
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10'
                      }`}
                    >
                      {pl.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value as FoodCatalogCategory)}
                aria-label="Custom food category"
                className="px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[40px]"
              >
                {FOOD_CATALOG_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={customEstimating}
                onClick={() => handleEstimateCustom(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold min-h-[40px]"
              >
                {customEstimating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Ask AI to estimate
              </button>
              <button
                type="button"
                onClick={() => handleEstimateCustom(false)}
                className="px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[40px]"
              >
                Preview offline
              </button>
            </div>

            {customPreview && (
              <div className="p-3 rounded-xl bg-white dark:bg-[#0D131F] border border-[var(--accent)]/35 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs">
                  <p className="font-bold">
                    {customName} ({customPreview.portionLabel})
                  </p>
                  <p className="font-mono-num text-[var(--accent)] mt-0.5">
                    {customPreview.kcalRange ?? `about ${customPreview.kcal} kcal`} · {customPreview.proteinG} g protein · estimate
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveCustomFood}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[40px]"
                >
                  <Check className="w-3.5 h-3.5" /> Save &amp; Add
                </button>
              </div>
            )}
          </div>
        )}

        {/* Portion Picker Banner when an item is tapped */}
        {pickingItem && (
          <div className="p-4 bg-[var(--accent-soft)] border-b border-[var(--accent)]/30 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl">{pickingItem.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">
                    {pickingItem.name} {pickingItem.nameAr ? `· ${pickingItem.nameAr}` : ''}
                  </p>
                  <p className="text-xs font-mono-num text-[var(--accent)]">
                    {pickingItem.portionLabel}: ~{pickingItem.kcal} kcal · {pickingItem.proteinG} g protein
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPickingItem(null)}
                aria-label="Cancel portion pick"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Choose portion (everyday size):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {buildEditablePortionChips(pickingItem).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setPickingItem(applyDirectPortionEdit(pickingItem, chip))}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold min-h-[40px] ${
                    pickingItem.portionLabel === chip.value
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => confirmPick(pickingItem)}
                className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[42px]"
              >
                <Check className="w-4 h-4" /> Use this
              </button>
            </div>
          </div>
        )}

        {/* Food Catalog List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                No foods matched "{search}".
              </p>
              <button
                type="button"
                onClick={() => {
                  setCustomName(search.trim());
                  setCustomOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
              >
                <Plus className="w-4 h-4" /> Add "{search.trim() || 'custom food'}" &amp; ask AI
              </button>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isFav = favoriteIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2.5"
                >
                  <button
                    type="button"
                    onClick={() => startPickingItem(item)}
                    className="flex items-start gap-2.5 min-w-0 flex-1 text-left"
                  >
                    <span className="w-10 h-10 rounded-xl bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 flex items-center justify-center text-xl shrink-0">
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {item.name}
                        </span>
                        {item.nameAr && (
                          <span className="text-xs text-slate-500 dark:text-slate-400" dir="rtl">
                            {item.nameAr}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        {item.defaultPortionLabel} ·{' '}
                        <span className="font-mono-num font-semibold text-[var(--accent)]">
                          {item.kcalRange ?? `~${item.kcal} kcal`}
                        </span>{' '}
                        ·{' '}
                        <span className="font-mono-num font-semibold text-emerald-600 dark:text-emerald-400">
                          {item.proteinG} g protein
                        </span>{' '}
                        · <span className="text-slate-400">{item.estimateNote}</span>
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(item.id)}
                      aria-label={isFav ? `Remove ${item.name} from favorites` : `Favorite ${item.name}`}
                      className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-200/70 dark:hover:bg-white/10"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => startPickingItem(item)}
                      className="px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[42px]"
                    >
                      Pick
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
