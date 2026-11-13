import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Scissors,
  Shirt,
  Plus,
  Trash2,
  Star,
  Copy,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import { db, recalculateXpAndBadges } from '../db/database';
import { HAIRCUT_BY_FACE_SHAPE, SKIN_STARTER_GUIDE, STYLE_BASICS } from '../data/care';
import { toLocalDateKey } from '../lib/date';
import { BeforeAfterSlider } from '../components/ui/Charts';
import type {
  FaceScanResult,
  FaceShape,
  HairPreference,
  OutfitRecord,
  OwnedProduct,
  SkinEntry,
  SkinType,
  UserProfile,
  WardrobeItem,
} from '../types';
import { useToast } from '../components/ui/ToastProvider';

interface CareScreenProps {
  profile: UserProfile;
  products: OwnedProduct[];
  skinEntries: SkinEntry[];
  hairPrefs: HairPreference[];
  wardrobe: WardrobeItem[];
  outfits: OutfitRecord[];
  scans: FaceScanResult[];
}

export const CareScreen: React.FC<CareScreenProps> = ({
  profile,
  products,
  skinEntries,
  hairPrefs,
  wardrobe,
  outfits,
  scans,
}) => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'skin' | 'hair' | 'style'>('skin');

  // Skin Lab state
  const [prodName, setProdName] = useState('');
  const [prodSlot, setProdSlot] = useState<OwnedProduct['routineSlot']>('am');
  const [prodActive, setProdActive] = useState('');
  const [hydration, setHydration] = useState(4);
  const [irritation, setIrritation] = useState(0);
  const [breakouts, setBreakouts] = useState(0);
  const [skinNotes, setSkinNotes] = useState('');
  const [skinPhoto, setSkinPhoto] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>(toLocalDateKey());
  const [compareIdxA, setCompareIdxA] = useState(0);
  const [compareIdxB, setCompareIdxB] = useState(1);

  // Hair state
  const latestFaceShape: FaceShape = scans[0]?.faceShape ?? profile.detectedFaceShape ?? 'oval';
  const [selectedFaceShape, setSelectedFaceShape] = useState<FaceShape>(latestFaceShape);

  // Style state
  const [itemName, setItemName] = useState('');
  const [itemCat, setItemCat] = useState<WardrobeItem['category']>('top');
  const [itemColor, setItemColor] = useState('Navy');
  const [itemFit, setItemFit] = useState<WardrobeItem['fit']>('regular');
  const [outfitName, setOutfitName] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);

  const skinProducts = products.filter((p) => p.domain === 'skin');
  const hairProducts = products.filter((p) => p.domain === 'hair');
  const skinStarter = SKIN_STARTER_GUIDE[profile.skinType];

  const avgHydration = useMemo(() => {
    if (!skinEntries.length) return 0;
    const sum = skinEntries.reduce((s, e) => s + e.hydrationRating, 0);
    return Number((sum / skinEntries.length).toFixed(1));
  }, [skinEntries]);

  const persistentBreakoutWarning = useMemo(() => {
    const recent = skinEntries.slice(0, 10);
    return recent.filter((e) => e.breakoutsCount >= 4 || e.irritationLevel >= 2).length >= 3;
  }, [skinEntries]);

  const skinPhotos = useMemo(
    () => skinEntries.filter((e) => Boolean(e.photoDataUrl)),
    [skinEntries]
  );

  // Month calendar dots for skin diary
  const calendarDays = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const loggedDates = new Set(skinEntries.map((e) => e.date));
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { day: d, key, hasEntry: loggedDates.has(key) };
    });
  }, [skinEntries]);

  const selectedDayEntries = useMemo(
    () => skinEntries.filter((e) => e.date === selectedDay),
    [skinEntries, selectedDay]
  );

  const handleAddProduct = async (domain: 'skin' | 'hair', e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim()) return;
    await db.products.add({
      domain,
      name: prodName.trim(),
      brand: '',
      category: domain === 'skin' ? 'Skincare' : 'Haircare',
      routineSlot: prodSlot,
      activeIngredient: prodActive.trim(),
      patchTested: false,
      notes: '',
      startedDate: toLocalDateKey(),
      inUse: true,
    });
    setProdName('');
    setProdActive('');
    showToast('Added to owned inventory');
  };

  const handleSkinPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetW = 360;
        const targetH = Math.round((img.height / img.width) * targetW);
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.getContext('2d')?.drawImage(img, 0, 0, targetW, targetH);
        setSkinPhoto(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSkinEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    await db.skinEntries.add({
      date: selectedDay,
      hydrationRating: hydration,
      irritationLevel: irritation,
      breakoutsCount: breakouts,
      notes: skinNotes.trim(),
      photoDataUrl: skinPhoto || undefined,
      productsUsed: skinProducts.filter((p) => p.inUse).map((p) => p.name),
      createdAt: Date.now(),
    });
    setSkinNotes('');
    setSkinPhoto('');
    await recalculateXpAndBadges();
    showToast('Skin diary entry saved');
  };

  const handleSaveHairCut = async (title: string, barberScript: string) => {
    await db.hairPreferences.add({
      title,
      faceShape: selectedFaceShape,
      barberScript,
      washFrequencyDays: profile.hairType === 'straight' ? 2 : profile.hairType === 'coily' ? 7 : 3,
      isFavorite: true,
      createdAt: Date.now(),
    });
    showToast(`Saved "${title}" to hair favorites`);
  };

  const handleAddWardrobeItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    await db.wardrobeItems.add({
      name: itemName.trim(),
      category: itemCat,
      color: itemColor,
      fit: itemFit,
      season: 'all',
      notes: '',
    });
    setItemName('');
    showToast('Added piece to wardrobe');
  };

  const handleSaveOutfit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outfitName.trim() || selectedItemIds.length === 0) return;
    await db.outfits.add({
      date: toLocalDateKey(),
      name: outfitName.trim(),
      itemIds: selectedItemIds,
      occasion: 'Daily',
      notes: '',
      isSavedCombo: true,
    });
    setOutfitName('');
    setSelectedItemIds([]);
    showToast('Outfit combo saved');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Care Hub</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Evidence-backed basics first · Track only products &amp; clothes you own
        </p>
      </div>

      <div className="flex gap-1.5 p-1 rounded-2xl bg-slate-200/70 dark:bg-white/5 w-fit max-w-full overflow-x-auto">
        {([
          { id: 'skin', label: 'Skin Lab', icon: <Sparkles className="w-3.5 h-3.5" /> },
          { id: 'hair', label: 'Hair & Grooming', icon: <Scissors className="w-3.5 h-3.5" /> },
          { id: 'style', label: 'Style', icon: <Shirt className="w-3.5 h-3.5" /> },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px] whitespace-nowrap shrink-0 transition ${
              tab === t.id
                ? 'bg-white dark:bg-[#0E1612] text-slate-900 dark:text-white shadow-sm border border-transparent dark:border-emerald-500/20'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* SKIN LAB */}
      {tab === 'skin' && (
        <div className="space-y-4">
          {persistentBreakoutWarning && (
            <div className="ascend-card p-4 bg-amber-500/10 border-amber-500/40 flex gap-3 items-start text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-200">
                  Persistent Breakouts or Irritation Detected
                </p>
                <p className="text-amber-700 dark:text-amber-200/85 mt-0.5">
                  Your recent Skin Diary entries show recurring flare-ups or irritation. Pause actives for a 7-day barrier reset and consult a board-certified dermatologist for tailored medical care.
                </p>
              </div>
            </div>
          )}

          {/* Skin Type Questionnaire & Gentle Routine */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 ascend-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold">Skin Type &amp; Gentle Core</h2>
                <select
                  value={profile.skinType}
                  onChange={(e) =>
                    db.profile.update('me', { skinType: e.target.value as SkinType, updatedAt: Date.now() })
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold capitalize"
                >
                  <option value="normal">Normal</option>
                  <option value="oily">Oily</option>
                  <option value="dry">Dry</option>
                  <option value="combination">Combination</option>
                  <option value="sensitive">Sensitive</option>
                </select>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">{skinStarter.summary}</p>
              <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                <div>
                  <p className="font-semibold text-[var(--accent)] mb-1">AM Basics</p>
                  <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                    {skinStarter.am.map((s) => (
                      <li key={s}>• {s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-violet-400 mb-1">PM Basics</p>
                  <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                    {skinStarter.pm.map((s) => (
                      <li key={s}>• {s}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-white/10">
                <strong>Avoid:</strong> {skinStarter.avoid} Actives are optional only after 4+ calm weeks.
              </p>
            </div>

            {/* Product Inventory */}
            <div className="lg:col-span-7 ascend-card p-4 space-y-3">
              <h2 className="font-display text-base font-bold">My Skincare Products ({skinProducts.length})</h2>
              <form onSubmit={(e) => handleAddProduct('skin', e)} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <input
                  type="text"
                  placeholder="Product name (e.g. CeraVe Gentle Cleanser)"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="sm:col-span-5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs min-h-[40px]"
                />
                <input
                  type="text"
                  placeholder="Key ingredient (opt)"
                  value={prodActive}
                  onChange={(e) => setProdActive(e.target.value)}
                  className="sm:col-span-3 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs min-h-[40px]"
                />
                <select
                  value={prodSlot}
                  onChange={(e) => setProdSlot(e.target.value as OwnedProduct['routineSlot'])}
                  className="sm:col-span-2 px-2 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs min-h-[40px]"
                >
                  <option value="am">AM</option>
                  <option value="pm">PM</option>
                  <option value="both">AM/PM</option>
                </select>
                <button
                  type="submit"
                  className="sm:col-span-2 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[40px]"
                >
                  Add
                </button>
              </form>

              {skinProducts.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                  Add only products you actually own to track patch-testing and AM/PM usage.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-white/10">
                  {skinProducts.map((prod) => (
                    <div key={prod.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{prod.name}</div>
                        <div className="text-slate-500 dark:text-slate-400 uppercase text-[11px]">
                          {prod.routineSlot} {prod.activeIngredient ? `· ${prod.activeIngredient}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => db.products.update(prod.id!, { patchTested: !prod.patchTested })}
                          className={`px-2.5 py-1 rounded-lg font-medium ${
                            prod.patchTested
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : 'bg-slate-100 dark:bg-white/5 text-slate-500'
                          }`}
                        >
                          {prod.patchTested ? 'Patch Tested' : 'Mark Tested'}
                        </button>
                        <button
                          type="button"
                          onClick={() => db.products.delete(prod.id!)}
                          aria-label="Delete product"
                          className="p-1.5 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Skin Diary + Month Calendar + Before/After Slider */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-6 ascend-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold">Skin Diary Calendar</h2>
                <span className="font-mono-num text-xs text-[var(--accent)]">
                  Avg Feel: {avgHydration ? `${avgHydration}/5` : 'No logs'}
                </span>
              </div>

              <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-all"
                  style={{ width: `${(avgHydration / 5) * 100}%` }}
                />
              </div>

              <div className="grid grid-cols-7 gap-1.5 pt-1">
                {calendarDays.map((d) => {
                  const selected = d.key === selectedDay;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setSelectedDay(d.key)}
                      className={`h-9 rounded-xl flex flex-col items-center justify-center text-xs font-mono-num transition ${
                        selected
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-bold'
                          : 'bg-slate-100 dark:bg-white/5 hover:bg-[var(--accent-soft)]'
                      }`}
                    >
                      <span>{d.day}</span>
                      {d.hasEntry && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                            selected ? 'bg-[var(--accent-contrast)]' : 'bg-[var(--accent)]'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedDayEntries.length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-2 text-xs">
                  {selectedDayEntries.map((entry) => (
                    <div key={entry.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] flex justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          Hydration {entry.hydrationRating}/5 · Irritation {entry.irritationLevel}/3 · Breakouts {entry.breakoutsCount}
                        </p>
                        {entry.notes && <p className="text-slate-500 dark:text-slate-400 mt-0.5">{entry.notes}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => db.skinEntries.delete(entry.id!)}
                        className="text-slate-400 hover:text-rose-500 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 ascend-card p-4 space-y-3">
              <h2 className="font-display text-base font-bold">Log Skin Check-In ({selectedDay})</h2>
              <form onSubmit={handleSaveSkinEntry} className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Hydration (1-5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={hydration}
                      onChange={(e) => setHydration(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-sm min-h-[42px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Irritation (0-3)</label>
                    <input
                      type="number"
                      min={0}
                      max={3}
                      value={irritation}
                      onChange={(e) => setIrritation(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-sm min-h-[42px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Breakouts</label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={breakouts}
                      onChange={(e) => setBreakouts(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 font-mono-num text-sm min-h-[42px]"
                    />
                  </div>
                </div>
                <textarea
                  rows={2}
                  placeholder="Notes on feel, redness, diet/sleep links..."
                  value={skinNotes}
                  onChange={(e) => setSkinNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold cursor-pointer min-h-[40px]">
                    <Camera className="w-4 h-4 text-[var(--accent)]" />
                    {skinPhoto ? 'Photo Attached' : 'Attach Texture Photo'}
                    <input type="file" accept="image/*" onChange={handleSkinPhotoUpload} className="hidden" />
                  </label>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[40px]"
                  >
                    Save Entry
                  </button>
                </div>
              </form>

              {skinPhotos.length >= 2 && (
                <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">Texture Compare</span>
                    <div className="flex gap-1.5">
                      <select
                        value={compareIdxA}
                        onChange={(e) => setCompareIdxA(Number(e.target.value))}
                        className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/5"
                      >
                        {skinPhotos.map((p, idx) => (
                          <option key={p.id} value={idx}>{p.date}</option>
                        ))}
                      </select>
                      <select
                        value={compareIdxB}
                        onChange={(e) => setCompareIdxB(Number(e.target.value))}
                        className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/5"
                      >
                        {skinPhotos.map((p, idx) => (
                          <option key={p.id} value={idx}>{p.date}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <BeforeAfterSlider
                    beforeSrc={skinPhotos[compareIdxA]?.photoDataUrl || skinPhotos[0].photoDataUrl!}
                    afterSrc={skinPhotos[compareIdxB]?.photoDataUrl || skinPhotos[1].photoDataUrl!}
                    beforeLabel={skinPhotos[compareIdxA]?.date || 'Earlier'}
                    afterLabel={skinPhotos[compareIdxB]?.date || 'Later'}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HAIR & GROOMING */}
      {tab === 'hair' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 ascend-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold">Haircut &amp; Barber Phrase Cards</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Matched to face shape ({scans[0] ? `from scan: ${scans[0].faceShape}` : 'select manually'})
                  </p>
                </div>
                <select
                  value={selectedFaceShape}
                  onChange={(e) => setSelectedFaceShape(e.target.value as FaceShape)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold capitalize min-h-[38px]"
                >
                  {(['oval', 'square', 'round', 'diamond', 'heart', 'oblong'] as FaceShape[]).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300">
                {HAIRCUT_BY_FACE_SHAPE[selectedFaceShape].summary}
              </p>

              <div className="space-y-3">
                {HAIRCUT_BY_FACE_SHAPE[selectedFaceShape].cuts.map((cut) => (
                  <div key={cut.name} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-sm font-bold">{cut.name}</h3>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(cut.barberScript);
                            showToast('Barber script copied');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200/70 dark:bg-white/10 text-[11px] font-semibold"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveHairCut(cut.name, cut.barberScript)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-semibold"
                        >
                          <Star className="w-3 h-3" /> Save
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{cut.whyItWorks}</p>
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      Say to barber: “{cut.barberScript}”
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="ascend-card p-4 space-y-3">
                <h2 className="font-display text-base font-bold">Wash Cadence &amp; Owned Hair Products</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Hair type: <strong className="capitalize">{profile.hairType}</strong> · Recommended wash every{' '}
                  <strong>{profile.hairType === 'straight' ? '1–2 days' : profile.hairType === 'coily' ? '5–7 days' : '2–4 days'}</strong>.
                </p>

                <form onSubmit={(e) => handleAddProduct('hair', e)} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add shampoo, conditioner, matte clay..."
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs min-h-[40px]"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[40px]"
                  >
                    Add
                  </button>
                </form>

                {hairProducts.map((hp) => (
                  <div key={hp.id} className="flex items-center justify-between text-xs py-1.5 border-t border-slate-200 dark:border-white/10">
                    <span>{hp.name}</span>
                    <button
                      type="button"
                      onClick={() => db.products.delete(hp.id!)}
                      className="text-slate-400 hover:text-rose-500 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="ascend-card p-4 space-y-2.5">
                <h2 className="font-display text-base font-bold">Saved Barber Favorites ({hairPrefs.length})</h2>
                {hairPrefs.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tap Save on any haircut card to store your barber script offline.
                  </p>
                ) : (
                  hairPrefs.map((fav) => (
                    <div key={fav.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] text-xs space-y-1">
                      <div className="flex justify-between font-semibold">
                        <span>{fav.title} ({fav.faceShape})</span>
                        <button
                          type="button"
                          onClick={() => db.hairPreferences.delete(fav.id!)}
                          className="text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400">{fav.barberScript}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STYLE */}
      {tab === 'style' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-4">
            <div className="ascend-card p-4 space-y-3">
              <h2 className="font-display text-base font-bold">Wardrobe Inventory ({wardrobe.length})</h2>
              <form onSubmit={handleAddWardrobeItem} className="grid grid-cols-2 sm:grid-cols-12 gap-2">
                <input
                  type="text"
                  placeholder="Piece (e.g. Oxford Shirt)"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="col-span-2 sm:col-span-5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs min-h-[40px]"
                />
                <select
                  value={itemCat}
                  onChange={(e) => setItemCat(e.target.value as WardrobeItem['category'])}
                  className="sm:col-span-3 px-2 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs min-h-[40px]"
                >
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="outerwear">Outerwear</option>
                  <option value="footwear">Footwear</option>
                  <option value="accessory">Accessory</option>
                </select>
                <input
                  type="text"
                  placeholder="Color"
                  value={itemColor}
                  onChange={(e) => setItemColor(e.target.value)}
                  className="sm:col-span-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs min-h-[40px]"
                />
                <button
                  type="submit"
                  className="col-span-2 sm:col-span-2 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[40px]"
                >
                  Add
                </button>
              </form>

              {wardrobe.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                  Add your staple shirts, trousers, jackets, and shoes to build clean outfit combinations.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {wardrobe.map((item) => {
                    const selected = selectedItemIds.includes(item.id!);
                    return (
                      <div
                        key={item.id}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border ${
                          selected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : 'border-slate-200 dark:border-white/10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedItemIds((prev) =>
                              prev.includes(item.id!) ? prev.filter((x) => x !== item.id!) : [...prev, item.id!]
                            )
                          }
                          className="font-medium text-left"
                        >
                          {item.color} {item.name} ({item.category})
                        </button>
                        <button
                          type="button"
                          onClick={() => db.wardrobeItems.delete(item.id!)}
                          className="text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedItemIds.length > 0 && (
                <form onSubmit={handleSaveOutfit} className="flex gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
                  <input
                    type="text"
                    placeholder="Combo name (e.g. Smart Casual Navy)"
                    value={outfitName}
                    onChange={(e) => setOutfitName(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs min-h-[40px]"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-semibold min-h-[40px]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Save Outfit
                  </button>
                </form>
              )}
            </div>

            <div className="ascend-card p-4 space-y-2.5">
              <h2 className="font-display text-base font-bold">Saved Outfit Combos ({outfits.length})</h2>
              {outfits.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tap pieces above to select them and save an outfit combo.
                </p>
              ) : (
                outfits.map((o) => {
                  const pieces = wardrobe.filter((w) => o.itemIds.includes(w.id!));
                  return (
                    <div key={o.id} className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold">{o.name}</p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                          {pieces.map((p) => `${p.color} ${p.name}`).join(' · ')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => db.outfits.delete(o.id!)}
                        className="text-slate-400 hover:text-rose-500 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-5 ascend-card p-4 space-y-4">
            <div>
              <h2 className="font-display text-base font-bold">Fit Basics</h2>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 mt-2">
                {STYLE_BASICS.fitChecklist.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-white/10">
              <h3 className="font-display text-sm font-bold mb-2">Cohesive Color Palettes</h3>
              <div className="space-y-2.5">
                {STYLE_BASICS.colorPalettes.map((pal) => (
                  <div key={pal.name} className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] text-xs">
                    <div className="font-semibold">{pal.name}</div>
                    <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                      {pal.colors.join(' · ')} — {pal.bestFor}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
