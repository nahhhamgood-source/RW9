import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Barcode,
  BookmarkPlus,
  Calendar,
  Camera,
  Check,
  ImagePlus,
  ListFilter,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Square,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import {
  db,
  deleteMealTemplate,
  isAgeUnknown,
  isUnder18OrGrowing,
  saveMealScanEntry,
  saveMealTemplate,
} from '../../db/database';
import { en } from '../../i18n/en';
import { apiRequest, hasOnlineConsent } from '../../lib/api';
import { addDays, toLocalDateKey } from '../../lib/date';
import {
  apiResponseToDraftItems,
  applyFollowUpChip,
  draftItemToMealFoodItem,
  parseMultiMealTextLocally,
  roundKcal,
  roundProtein,
} from '../../lib/foodChatParser';
import { computeDebloatImpact, prepareMealImageAssets } from '../../lib/nutrition';
import { getRealLifeSettings, parseDeliveryOrSharedText } from '../../lib/realLifeFood';
import { OnlineConsentModal } from '../modals/OnlineConsentModal';
import { useToast } from '../ui/ToastProvider';
import { FoodFinderModal } from './FoodFinderModal';
import { FoodResultCard } from './FoodResultCard';
import { MenuHelperModal } from './MenuHelperModal';
import { QuickRecallModal } from './QuickRecallModal';
import type { DraftFoodItem, FoodChatApiResponse, FollowUpChip } from './foodChatTypes';
import type {
  AppSettings,
  MealFullness,
  MealScanEntry,
  MealType,
  SavedMealTemplate,
  UserProfile,
} from '../../types';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtorLike = new () => SpeechRecognitionInstanceLike;

interface TellMeFoodBoxProps {
  profile: UserProfile;
  settings: AppSettings;
  mealScans: MealScanEntry[];
  selectedSlot: MealType;
  selectedDate?: string;
  onChangeDate?: (dateKey: string) => void;
  onChangeSlot?: (slot: MealType) => void;
  onOpenCamera?: (slot: MealType) => void;
  onOpenGalleryImport?: () => void;
  onSaved?: (entryId: number, slot: MealType) => void;
  initialPrefillText?: string;
  isSharedInput?: boolean;
  autoFocusMic?: boolean;
  kcalLeft?: number;
  proteinLeftG?: number;
  compact?: boolean;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtorLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtorLike;
    webkitSpeechRecognition?: SpeechRecognitionCtorLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const TellMeFoodBox: React.FC<TellMeFoodBoxProps> = ({
  profile,
  settings,
  mealScans,
  selectedSlot,
  selectedDate: controlledDate,
  onChangeDate,
  onChangeSlot,
  onOpenCamera,
  onOpenGalleryImport,
  onSaved,
  initialPrefillText,
  isSharedInput = false,
  autoFocusMic = false,
  kcalLeft = 700,
  proteinLeftG = 35,
  compact = false,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();
  const yesterdayKey = addDays(todayKey, -1);
  const twoDaysAgoKey = addDays(todayKey, -2);
  const minCatchupDate = addDays(todayKey, -7);

  const [internalDate, setInternalDate] = useState<string>(todayKey);
  const activeDate = controlledDate ?? internalDate;
  const setActiveDate = (next: string) => {
    const clamped = next > todayKey ? todayKey : next < minCatchupDate ? minCatchupDate : next;
    setInternalDate(clamped);
    onChangeDate?.(clamped);
  };

  const realLife = useMemo(() => getRealLifeSettings(settings), [settings]);
  const arabicDigits = Boolean(settings.arabicIndicDigits);

  const showProteinFeedback = useMemo(() => {
    if (isUnder18OrGrowing(profile) || isAgeUnknown(profile)) return false;
    return Boolean(profile.ageExplicitlySet && profile.dietGoal && (profile.proteinTargetG ?? 0) > 0);
  }, [profile]);

  const [inputText, setInputText] = useState(initialPrefillText ?? '');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftFoodItem[]>([]);
  const [unmatchedText, setUnmatchedText] = useState<string[]>([]);
  const [parseSourceNote, setParseSourceNote] = useState<string | null>(null);
  const [sharedNoticeVisible, setSharedNoticeVisible] = useState(Boolean(isSharedInput && initialPrefillText));

  // Voice states
  const speechSupported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);
  const [voiceLang, setVoiceLang] = useState<'en' | 'ar'>('en');
  const [listeningSpeech, setListeningSpeech] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceStatusNote, setVoiceStatusNote] = useState<string | null>(null);
  const [editableTranscript, setEditableTranscript] = useState<string | null>(null);

  // Real life helpers & Modals
  const [finderOpen, setFinderOpen] = useState(false);
  const [menuHelperOpen, setMenuHelperOpen] = useState(false);
  const [recallOpen, setRecallOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [preciseToolsOpen, setPreciseToolsOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const labelFileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const [swapSearchHint, setSwapSearchHint] = useState('');
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingConsentActionRef = useRef<(() => void) | null>(null);
  const pendingAudioRef = useRef<{ base64: string; mime: string } | null>(null);

  const [lastSavedEntry, setLastSavedEntry] = useState<{
    id: number;
    title: string;
    fullness?: MealFullness;
  } | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<number | null>(null);

  const cleanupMedia = () => {
    if (recordIntervalRef.current) {
      window.clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    audioChunksRef.current = [];
  };

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      cleanupMedia();
    };
  }, []);

  useEffect(() => {
    if (autoFocusMic) {
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [autoFocusMic]);

  useEffect(() => {
    if (initialPrefillText && initialPrefillText.trim()) {
      const cleaned = parseDeliveryOrSharedText(initialPrefillText).cleanedText;
      setInputText(cleaned);
      setSharedNoticeVisible(isSharedInput);
      void parseText(cleaned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrefillText]);

  const parseText = async (raw: string, forceOnlineAi = false) => {
    const trimmed = parseDeliveryOrSharedText(raw).cleanedText;
    if (!trimmed) {
      showToast('Type or say what you ate first.', 'info');
      return;
    }

    setLastSavedEntry(null);
    setVoiceStatusNote(null);
    setUnmatchedText([]);
    setParsing(true);

    const canUseOnlineAi =
      typeof navigator !== 'undefined' &&
      navigator.onLine &&
      (forceOnlineAi || hasOnlineConsent(settings, 'food'));

    try {
      if (canUseOnlineAi) {
        const res = await apiRequest<FoodChatApiResponse>('/api/food-chat', {
          method: 'POST',
          timeoutMs: 24_000,
          body: {
            text: trimmed,
            lang: voiceLang === 'ar' ? 'ar-EG' : 'en',
            mealType: selectedSlot,
            locale: 'eg',
          },
        });
        if (res.ok && res.data.items.length > 0) {
          const mapped = apiResponseToDraftItems(res.data);
          const distinctSlots = new Set(mapped.map((m) => m.mealType || res.data.mealType || selectedSlot));
          if (distinctSlots.size === 1 && res.data.mealType && onChangeSlot) {
            onChangeSlot(res.data.mealType);
          }
          setDraftItems(mapped);
          setEditableTranscript(null);
          setParseSourceNote(
            distinctSlots.size > 1
              ? `Split into ${distinctSlots.size} meals via AI · edit or save all`
              : 'Estimated via AI · adjust with chips if needed'
          );
          setParsing(false);
          return;
        }
      }
    } catch {
      // fall through seamlessly to offline matcher
    }

    // Local bilingual + Franco-Arabic multi-meal parser (works 100% offline)
    const groups = parseMultiMealTextLocally(
      trimmed,
      selectedSlot,
      settings.customFoodCatalog ?? []
    );
    const allItems = groups.flatMap((g) =>
      g.items.map((it) => ({ ...it, mealType: g.mealType }))
    );
    const allUnmatched = groups.flatMap((g) => g.unmatchedSegments);

    if (groups.length === 1 && groups[0].mealType !== selectedSlot && onChangeSlot) {
      onChangeSlot(groups[0].mealType);
    }

    setDraftItems(allItems);
    setUnmatchedText(allUnmatched);
    setEditableTranscript(null);

    if (allItems.length === 0) {
      setParseSourceNote(
        'Could not match that offline — pick from list, use 30s Recall, or ask AI.'
      );
    } else if (allUnmatched.length > 0) {
      setParseSourceNote(
        `Matched ${allItems.length} item(s) locally. Some words were skipped: "${allUnmatched.join(', ')}".`
      );
    } else if (groups.length > 1) {
      setParseSourceNote(`Split into ${groups.length} meals offline · estimates only`);
    } else {
      setParseSourceNote('Matched offline from your food library · estimates only');
    }

    setParsing(false);
  };

  const sendRecordedAudioToAi = async (base64: string, mime: string) => {
    setParsing(true);
    setVoiceStatusNote('Processing voice note (audio is discarded right after)...');
    try {
      const res = await apiRequest<FoodChatApiResponse>('/api/food-chat', {
        method: 'POST',
        timeoutMs: 24_000,
        body: {
          audioBase64: base64,
          mime,
          lang: voiceLang === 'ar' ? 'ar-EG' : 'en',
          mealType: selectedSlot,
          locale: 'eg',
        },
      });
      pendingAudioRef.current = null;
      if (!res.ok) {
        setVoiceStatusNote(
          `${res.error} Type what you ate or tap Pick from list.`
        );
        return;
      }
      if (res.data.transcript) {
        setInputText(res.data.transcript);
        setEditableTranscript(res.data.transcript);
      }
      if (res.data.items.length > 0) {
        const mapped = apiResponseToDraftItems(res.data);
        const distinctSlots = new Set(mapped.map((m) => m.mealType || res.data.mealType || selectedSlot));
        if (distinctSlots.size === 1 && res.data.mealType && onChangeSlot) {
          onChangeSlot(res.data.mealType);
        }
        setDraftItems(mapped);
        setParseSourceNote('Heard & estimated (audio deleted from memory)');
      } else if (res.data.transcript) {
        const groups = parseMultiMealTextLocally(
          res.data.transcript,
          selectedSlot,
          settings.customFoodCatalog ?? []
        );
        setDraftItems(groups.flatMap((g) => g.items.map((it) => ({ ...it, mealType: g.mealType }))));
      }
      setVoiceStatusNote(null);
    } catch {
      pendingAudioRef.current = null;
      setVoiceStatusNote('Voice upload failed. Type it or pick from the list.');
    } finally {
      pendingAudioRef.current = null;
      setParsing(false);
    }
  };

  const startMediaRecorderFallback = async () => {
    setVoiceStatusNote(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceStatusNote(
        'Microphone recording is unavailable in this browser. Type your meal or pick from the list.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = [...audioChunksRef.current];
        const actualMime = recorder.mimeType || mimeType || 'audio/webm';
        cleanupMedia();
        setRecordingAudio(false);
        setRecordSeconds(0);

        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: actualMime });
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result || '');
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] || '' : dataUrl;
          if (!base64) return;
          if (!hasOnlineConsent(settings, 'food')) {
            pendingAudioRef.current = { base64, mime: actualMime };
            pendingConsentActionRef.current = () => {
              if (pendingAudioRef.current) {
                const payload = pendingAudioRef.current;
                pendingAudioRef.current = null;
                sendRecordedAudioToAi(payload.base64, payload.mime);
              }
            };
            setConsentOpen(true);
            return;
          }
          await sendRecordedAudioToAi(base64, actualMime);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      setRecordingAudio(true);
      setRecordSeconds(0);
      recordIntervalRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          if (prev >= 29) {
            try {
              mediaRecorderRef.current?.stop();
            } catch {
              // ignore
            }
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      cleanupMedia();
      setRecordingAudio(false);
      setVoiceStatusNote(
        'Microphone permission denied or blocked. Type your food or pick from the list.'
      );
    }
  };

  const handleToggleMic = async () => {
    setVoiceStatusNote(null);

    if (listeningSpeech) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setListeningSpeech(false);
      return;
    }

    if (recordingAudio) {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // ignore
      }
      return;
    }

    const SpeechCtor = getSpeechRecognitionCtor();
    if (SpeechCtor) {
      try {
        const rec = new SpeechCtor();
        rec.lang = voiceLang === 'ar' ? 'ar-EG' : 'en-US';
        rec.interimResults = true;
        rec.continuous = false;
        let finalText = '';

        rec.onresult = (event) => {
          let interim = '';
          let done = '';
          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) done += `${res[0].transcript} `;
            else interim += res[0].transcript;
          }
          finalText = (done || interim).trim();
          if (finalText) {
            setInputText(finalText);
            setEditableTranscript(finalText);
          }
        };

        rec.onerror = (ev) => {
          setListeningSpeech(false);
          if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
            setVoiceStatusNote('Microphone permission denied. Type it or pick from the list.');
          } else {
            // Fallback to MediaRecorder if Web Speech fails (common on embedded WebViews)
            startMediaRecorderFallback();
          }
        };

        rec.onend = () => {
          setListeningSpeech(false);
          if (finalText.trim()) {
            setEditableTranscript(finalText.trim());
          }
        };

        recognitionRef.current = rec;
        setListeningSpeech(true);
        rec.start();
        return;
      } catch {
        setListeningSpeech(false);
      }
    }

    await startMediaRecorderFallback();
  };

  const activeQuestionItem = draftItems.find(
    (it) => it.needsQuestion && it.questionsQueue.length > 0
  );
  const activeQuestion = activeQuestionItem?.questionsQueue[0];

  const handleAnswerFollowUp = (item: DraftFoodItem, chip: FollowUpChip) => {
    const updated = applyFollowUpChip(item, chip);
    setDraftItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
  };

  const handleSkipFollowUp = (item: DraftFoodItem) => {
    const nextQueue = item.questionsQueue.slice(1);
    setDraftItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? {
              ...it,
              questionsQueue: nextQueue,
              needsQuestion: nextQueue.length > 0,
            }
          : it
      )
    );
  };

  const saveItemsList = async (itemsToSave: DraftFoodItem[], forcedSlot?: MealType) => {
    if (itemsToSave.length === 0) return;
    setSaving(true);
    try {
      // Group by slot if items come from multi-meal parsing
      const bySlot = new Map<MealType, DraftFoodItem[]>();
      for (const it of itemsToSave) {
        const s = forcedSlot ?? it.mealType ?? selectedSlot;
        const arr = bySlot.get(s) ?? [];
        arr.push(it);
        bySlot.set(s, arr);
      }

      let lastId = 0;
      let lastSlot: MealType = selectedSlot;
      let lastTitle = '';
      let sumSavedKcal = 0;
      let sumSavedPro = 0;

      for (const [slotKey, slotItems] of bySlot.entries()) {
        const mealItems = slotItems.map(draftItemToMealFoodItem);
        const totalCalories = roundKcal(slotItems.reduce((s, it) => s + it.kcal, 0));
        const totalProteinG = roundProtein(slotItems.reduce((s, it) => s + it.proteinG, 0));
        const totalSodiumMg = Math.round(slotItems.reduce((s, it) => s + it.sodiumMg, 0));
        const totalAddedSugarG = Math.round(
          slotItems.reduce((s, it) => s + it.baseAddedSugarG, 0)
        );
        const totalCarbsG = Math.round(slotItems.reduce((s, it) => s + it.baseCarbsG, 0));
        const totalFatsG = Math.round(slotItems.reduce((s, it) => s + it.baseFatsG, 0));

        const title = slotItems.map((it) => `${it.name} (${it.portionLabel})`).join(' + ');
        const debloat = computeDebloatImpact(totalSodiumMg, totalAddedSugarG);
        const lowestConf = slotItems.some((i) => i.confidence === 'Low')
          ? 'Low'
          : slotItems.some((i) => i.confidence === 'Medium')
          ? 'Medium'
          : 'High';

        lastId = await saveMealScanEntry({
          date: activeDate,
          timestamp: Date.now(),
          mealType: slotKey,
          mealTitle: title,
          confidence: lowestConf,
          items: mealItems,
          totalCalories,
          totalProteinG,
          totalCarbsG,
          totalFatsG,
          totalSodiumMg,
          totalAddedSugarG,
          debloatStatus: debloat.status,
          debloatHeadline: debloat.headline,
          summaryNote: `${en.meals[slotKey]} · ${activeDate === todayKey ? 'Today' : activeDate}`,
          isManual: true,
          sourceKind: isSharedInput ? 'share_target' : 'normal',
        });
        lastSlot = slotKey;
        lastTitle = title;
        sumSavedKcal += totalCalories;
        sumSavedPro += totalProteinG;
      }

      const savedCatalogIds = itemsToSave
        .map((it) => it.catalogId)
        .filter((cid): cid is string => Boolean(cid));
      if (savedCatalogIds.length > 0) {
        const mergedRecent = Array.from(
          new Set([...savedCatalogIds, ...(settings.recentFoodIds ?? [])])
        ).slice(0, 25);
        await db.settings.update('app', { recentFoodIds: mergedRecent });
      }

      const remainingIds = new Set(itemsToSave.map((x) => x.id));
      setDraftItems((prev) => prev.filter((it) => !remainingIds.has(it.id)));
      if (itemsToSave.length === draftItems.length) {
        setInputText('');
        setParseSourceNote(null);
      }

      setLastSavedEntry({ id: lastId, title: lastTitle });
      showToast(
        `Saved to ${activeDate === todayKey ? 'Today' : activeDate} (~${sumSavedKcal} kcal, ${sumSavedPro} g protein)`
      );
      onSaved?.(lastId, lastSlot);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCurrentAsTemplate = async () => {
    if (draftItems.length === 0) return;
    const defaultTitle = draftItems.map((d) => d.name).slice(0, 2).join(' + ');
    const tmpl: SavedMealTemplate = {
      id: `tmpl-${Date.now()}`,
      title: defaultTitle,
      mealType: selectedSlot,
      icon: draftItems[0]?.icon || '🍲',
      portionLabel: draftItems.map((d) => d.portionLabel).join(', '),
      kcal: roundKcal(draftItems.reduce((s, d) => s + d.kcal, 0)),
      proteinG: roundProtein(draftItems.reduce((s, d) => s + d.proteinG, 0)),
      sodiumMg: Math.round(draftItems.reduce((s, d) => s + d.sodiumMg, 0)),
      items: draftItems.map((d) => ({
        name: d.name,
        portionLabel: d.portionLabel,
        kcal: d.kcal,
        proteinG: d.proteinG,
        sodiumMg: d.sodiumMg,
        icon: d.icon,
      })),
      createdAt: Date.now(),
    };
    await saveMealTemplate(tmpl);
    showToast(`Saved "${tmpl.title}" as reusable family meal template`);
  };

  const handleUseTemplate = (tmpl: SavedMealTemplate) => {
    const loaded: DraftFoodItem[] = tmpl.items.map((it, idx) => ({
      id: `tmpl-draft-${Date.now()}-${idx}`,
      name: it.name,
      nameAr: '',
      icon: it.icon || tmpl.icon || '🍲',
      mealType: tmpl.mealType,
      category: 'Egyptian home food',
      portionLabel: it.portionLabel || tmpl.portionLabel,
      quantity: 1,
      unit: 'serving',
      baseKcal: roundKcal(it.kcal),
      baseProteinG: roundProtein(it.proteinG),
      baseSodiumMg: it.sodiumMg || 400,
      baseCarbsG: Math.round((it.kcal * 0.44) / 4),
      baseFatsG: Math.round((it.kcal * 0.32) / 9),
      baseAddedSugarG: 2,
      extraKcal: 0,
      extraProteinG: 0,
      kcal: roundKcal(it.kcal),
      proteinG: roundProtein(it.proteinG),
      sodiumMg: it.sodiumMg || 400,
      confidence: 'Medium',
      followUpKind: 'hand_plate',
      questionsQueue: [],
      needsQuestion: false,
      source: 'list',
    }));
    setDraftItems((prev) => [...prev, ...loaded]);
    if (onChangeSlot) onChangeSlot(tmpl.mealType);
    setTemplatesOpen(false);
    setParseSourceNote(`Loaded template "${tmpl.title}" — edit portion below or save`);
  };

  const handleLookupBarcode = async () => {
    const clean = barcodeInput.replace(/\D/g, '');
    if (clean.length < 6) {
      showToast('Enter a valid barcode (6+ digits).', 'info');
      return;
    }
    if (!hasOnlineConsent(settings, 'food')) {
      pendingConsentActionRef.current = () => {
        void handleLookupBarcode();
      };
      setConsentOpen(true);
      return;
    }
    setBarcodeBusy(true);
    try {
      const res = await apiRequest<{
        name: string;
        portionLabel: string;
        kcal: number;
        proteinG: number;
        carbsG: number;
        fatsG: number;
        sodiumMg: number;
      }>('/api/food-helper', {
        method: 'POST',
        timeoutMs: 12_000,
        body: { mode: 'barcode', barcode: clean },
      });
      if (!res.ok) {
        showToast(res.error || 'Product not found in Open Food Facts.', 'warning');
      } else {
        setDraftItems((prev) => [
          ...prev,
          {
            id: `barcode-${Date.now()}`,
            name: res.data.name,
            nameAr: '',
            icon: '🏷️',
            mealType: selectedSlot,
            category: 'Snacks',
            portionLabel: res.data.portionLabel,
            quantity: 1,
            unit: 'serving',
            baseKcal: roundKcal(res.data.kcal),
            baseProteinG: roundProtein(res.data.proteinG),
            baseSodiumMg: res.data.sodiumMg || 120,
            baseCarbsG: res.data.carbsG || 0,
            baseFatsG: res.data.fatsG || 0,
            baseAddedSugarG: 0,
            extraKcal: 0,
            extraProteinG: 0,
            kcal: roundKcal(res.data.kcal),
            proteinG: roundProtein(res.data.proteinG),
            sodiumMg: res.data.sodiumMg || 120,
            confidence: 'High',
            followUpKind: 'count',
            questionsQueue: [],
            needsQuestion: false,
            source: 'local',
          },
        ]);
        setBarcodeInput('');
        setParseSourceNote('Loaded from Open Food Facts barcode database');
      }
    } finally {
      setBarcodeBusy(false);
    }
  };

  const handleLabelPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!hasOnlineConsent(settings, 'food')) {
      showToast('Turn on AI Food Scan consent first to read nutrition labels.', 'info');
      setConsentOpen(true);
      return;
    }
    setLabelBusy(true);
    try {
      const assets = await prepareMealImageAssets(file);
      const res = await apiRequest<{
        productName: string;
        servingLabel: string;
        kcal: number;
        proteinG: number;
        carbsG: number;
        fatsG: number;
        sodiumMg: number;
        addedSugarG: number;
        confidence: 'High' | 'Medium' | 'Low';
      }>('/api/food-helper', {
        method: 'POST',
        timeoutMs: 20_000,
        body: {
          mode: 'label',
          imageBase64: assets.apiBase64,
          mimeType: assets.mimeType,
        },
      });
      if (!res.ok) {
        showToast(res.error || 'Could not read nutrition label.', 'warning');
      } else {
        setDraftItems((prev) => [
          ...prev,
          {
            id: `label-${Date.now()}`,
            name: res.data.productName,
            nameAr: '',
            icon: '📋',
            mealType: selectedSlot,
            category: 'Snacks',
            portionLabel: res.data.servingLabel,
            quantity: 1,
            unit: 'serving',
            baseKcal: roundKcal(res.data.kcal),
            baseProteinG: roundProtein(res.data.proteinG),
            baseSodiumMg: res.data.sodiumMg || 120,
            baseCarbsG: res.data.carbsG || 0,
            baseFatsG: res.data.fatsG || 0,
            baseAddedSugarG: res.data.addedSugarG || 0,
            extraKcal: 0,
            extraProteinG: 0,
            kcal: roundKcal(res.data.kcal),
            proteinG: roundProtein(res.data.proteinG),
            sodiumMg: res.data.sodiumMg || 120,
            confidence: res.data.confidence,
            followUpKind: 'count',
            questionsQueue: [],
            needsQuestion: false,
            source: 'photo',
          },
        ]);
        setParseSourceNote('Read from nutrition label (location EXIF stripped)');
      }
    } finally {
      setLabelBusy(false);
    }
  };

  const handleSetFullness = async (fullness: MealFullness) => {
    if (!lastSavedEntry) return;
    await db.mealScans.update(lastSavedEntry.id, { fullness });
    setLastSavedEntry({ ...lastSavedEntry, fullness });
    const label =
      fullness === 'still_hungry'
        ? 'Still hungry'
        : fullness === 'good'
        ? 'Good'
        : 'Very full';
    showToast(`Saved fullness: ${label}`);
  };

  const draftTotals = useMemo(() => {
    const kcal = roundKcal(draftItems.reduce((s, i) => s + i.kcal, 0));
    const proteinG = roundProtein(draftItems.reduce((s, i) => s + i.proteinG, 0));
    return { kcal, proteinG };
  }, [draftItems]);

  return (
    <div className="space-y-3">
      {/* Main "Tell me" Card */}
      <div
        className={`${
          compact
            ? 'p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10'
            : 'ascend-card p-4 sm:p-5'
        } space-y-3`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Just tell me what you ate
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Type or speak in English, Egyptian Arabic, or Franco — no grams needed.
            </p>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-white/5 p-0.5 border border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => setVoiceLang('en')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold min-h-[30px] ${
                voiceLang === 'en'
                  ? 'bg-white dark:bg-[var(--accent)] text-slate-900 dark:text-[var(--accent-contrast)] shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setVoiceLang('ar')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold min-h-[30px] ${
                voiceLang === 'ar'
                  ? 'bg-white dark:bg-[var(--accent)] text-slate-900 dark:text-[var(--accent-contrast)] shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              AR (مصري)
            </button>
          </div>
        </div>

        {/* Day Picker Bar (Today / Yesterday / 2 days ago / Pick date up to 7 days back) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 mr-0.5">
            <Calendar className="w-3 h-3" /> For:
          </span>
          {[
            { key: todayKey, label: 'Today' },
            { key: yesterdayKey, label: 'Yesterday' },
            { key: twoDaysAgoKey, label: '2 days ago' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setActiveDate(opt.key)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold min-h-[30px] border transition ${
                activeDate === opt.key
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent'
                  : 'bg-slate-100 dark:bg-white/[0.05] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <input
            type="date"
            value={activeDate}
            min={minCatchupDate}
            max={todayKey}
            aria-label="Pick catch-up date (up to 7 days back)"
            onChange={(e) => {
              if (e.target.value) setActiveDate(e.target.value);
            }}
            className="px-2 py-1 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 text-[11px] font-semibold min-h-[30px]"
          />
        </div>

        {sharedNoticeVisible && (
          <div className="p-2.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/25 flex items-center justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-200">
            <span>{en.realLife.shareHonestNote}</span>
            <button
              type="button"
              onClick={() => setSharedNoticeVisible(false)}
              className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Big Input Row */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            parseText(inputText);
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Lunch was fiteer, dinner was mahshi · or 2 eggs + baladi bread"
            aria-label="What did you eat?"
            className="flex-1 min-w-0 px-3.5 py-3 rounded-2xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-base min-h-[48px]"
          />
          <button
            type="submit"
            disabled={parsing || !inputText.trim()}
            aria-label="Parse meal"
            className="px-4 py-3 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-bold min-h-[48px] min-w-[48px] inline-flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">Go</span>
          </button>
        </form>

        {/* Editable live transcript confirmation bar (Voice) */}
        {editableTranscript !== null && (
          <div className="p-2.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-700 dark:text-slate-200">
              Heard: <strong>"{editableTranscript}"</strong> — fix above or tap Parse.
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => parseText(inputText)}
                className="px-3 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] font-bold min-h-[36px]"
              >
                Parse
              </button>
              <button
                type="button"
                onClick={() => setEditableTranscript(null)}
                aria-label="Dismiss transcript notice"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Primary Tool Row: Mic · Camera · Pick from list */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleToggleMic}
            disabled={parsing}
            className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl text-xs font-bold min-h-[44px] border transition ${
              listeningSpeech || recordingAudio
                ? 'bg-rose-500 text-white border-transparent animate-pulse'
                : 'bg-slate-100 dark:bg-white/[0.06] border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100'
            }`}
          >
            {recordingAudio ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop ({recordSeconds}s)
              </>
            ) : listeningSpeech ? (
              <>
                <MicOff className="w-4 h-4" />
                Listening...
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 text-[var(--accent)]" />
                Speak
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (onOpenCamera) {
                onOpenCamera(selectedSlot);
              } else {
                showToast('Open Food tab camera to snap a meal photo.', 'info');
              }
            }}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-slate-100 min-h-[44px]"
          >
            <Camera className="w-4 h-4 text-[var(--accent)]" />
            Photo
          </button>

          <button
            type="button"
            onClick={() => {
              setSwapTargetId(null);
              setSwapSearchHint('');
              setFinderOpen(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-800 dark:text-slate-100 min-h-[44px]"
          >
            <ListFilter className="w-4 h-4 text-[var(--accent)]" />
            Pick from list
          </button>
        </div>

        {/* Secondary Real-Life Tools: Recall (30s) · Menu helper · Family templates · Gallery */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setRecallOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-700 dark:text-slate-200 min-h-[34px]"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
            What did I eat? (30s)
          </button>
          <button
            type="button"
            onClick={() => setMenuHelperOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-700 dark:text-slate-200 min-h-[34px]"
          >
            <UtensilsCrossed className="w-3.5 h-3.5 text-[var(--accent)]" />
            Menu helper
          </button>
          <button
            type="button"
            onClick={() => setTemplatesOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-700 dark:text-slate-200 min-h-[34px]"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
            Family templates ({(settings.mealTemplates ?? []).length})
          </button>
          {onOpenGalleryImport && realLife.galleryImportEnabled && (
            <button
              type="button"
              onClick={onOpenGalleryImport}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-700 dark:text-slate-200 min-h-[34px]"
            >
              <ImagePlus className="w-3.5 h-3.5 text-[var(--accent)]" />
              Gallery batch
            </button>
          )}
          {realLife.loggingDetail === 'precise' && (
            <button
              type="button"
              onClick={() => setPreciseToolsOpen((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[11px] font-bold text-[var(--accent)] min-h-[34px]"
            >
              <Barcode className="w-3.5 h-3.5" />
              Precise tools
            </button>
          )}
        </div>

        {/* Reusable Family Meal Templates Drawer */}
        {templatesOpen && (
          <div className="p-3 rounded-2xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Saved family & usual meals
              </p>
              <button
                type="button"
                onClick={() => setTemplatesOpen(false)}
                className="text-xs text-slate-500"
              >
                Close
              </button>
            </div>
            {(settings.mealTemplates ?? []).length === 0 ? (
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <p>No saved templates yet. Parse or log any meal and tap "Save as template", or try this starter:</p>
                <button
                  type="button"
                  onClick={() =>
                    handleUseTemplate({
                      id: 'starter-moms-friday-lunch',
                      title: "Mom's Friday lunch (rice + veg + chicken)",
                      mealType: 'lunch',
                      icon: '🍲',
                      portionLabel: '1 generous plate',
                      kcal: 940,
                      proteinG: 42,
                      sodiumMg: 950,
                      items: [
                        {
                          name: "Mom's Friday lunch (rice + veg + chicken)",
                          portionLabel: '1 generous plate',
                          kcal: 940,
                          proteinG: 42,
                          sodiumMg: 950,
                          icon: '🍲',
                        },
                      ],
                      createdAt: Date.now(),
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 font-semibold text-xs"
                >
                  🍲 Load "Mom's Friday lunch" (~940 kcal)
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {(settings.mealTemplates ?? []).map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10"
                  >
                    <button
                      type="button"
                      onClick={() => handleUseTemplate(tmpl)}
                      className="flex-1 text-left text-xs min-w-0"
                    >
                      <p className="font-bold text-slate-900 dark:text-white truncate">
                        {tmpl.icon} {tmpl.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        ~{tmpl.kcal} kcal · {tmpl.proteinG}g pro · {en.meals[tmpl.mealType]}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMealTemplate(tmpl.id)}
                      aria-label={`Delete template ${tmpl.title}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Optional Precise Tools (only when Logging Detail = Precise) */}
        {realLife.loggingDetail === 'precise' && preciseToolsOpen && (
          <div className="p-3 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/25 space-y-2.5">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              Precise mode tools (optional — never required)
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Barcode digits (Open Food Facts)"
                className="flex-1 min-w-[160px] px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-xs min-h-[38px]"
              />
              <button
                type="button"
                disabled={barcodeBusy}
                onClick={handleLookupBarcode}
                className="px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[38px]"
              >
                {barcodeBusy ? 'Looking up...' : 'Lookup barcode'}
              </button>
              <input
                ref={labelFileRef}
                type="file"
                accept="image/*"
                onChange={handleLabelPhoto}
                className="hidden"
              />
              <button
                type="button"
                disabled={labelBusy}
                onClick={() => labelFileRef.current?.click()}
                className="px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[38px]"
              >
                {labelBusy ? 'Reading label...' : 'Nutrition label photo'}
              </button>
            </div>
          </div>
        )}

        {/* Honest voice & privacy note */}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          {speechSupported
            ? 'Voice needs internet and a microphone permission. Say two meals at once ("Lunch was fiteer, dinner was mahshi") to split automatically. Audio is never stored.'
            : 'Voice note uses short mic recording (up to 30s) + internet. Audio is never stored after processing.'}
        </p>

        {voiceStatusNote && (
          <p className="text-xs text-amber-600 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
            {voiceStatusNote}
          </p>
        )}

        {parseSourceNote && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span>{parseSourceNote}</span>
            {unmatchedText.length > 0 && !hasOnlineConsent(settings, 'food') && (
              <button
                type="button"
                onClick={() => {
                  pendingConsentActionRef.current = () => parseText(inputText, true);
                  setConsentOpen(true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] font-bold min-h-[34px]"
              >
                <Sparkles className="w-3.5 h-3.5" /> Ask AI instead
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tiny Follow-up Question Card (Max 2 per item, skippable) */}
      {activeQuestionItem && activeQuestion && (
        <div className="p-4 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/35 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl shrink-0">{activeQuestionItem.icon}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  Quick check ({activeQuestion.step} of {activeQuestion.maxSteps}) ·{' '}
                  {activeQuestionItem.name}
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {activeQuestion.text}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleSkipFollowUp(activeQuestionItem)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-black/10 min-h-[34px] shrink-0"
            >
              Skip
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeQuestion.chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleAnswerFollowUp(activeQuestionItem, chip)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/15 text-xs font-bold text-slate-900 dark:text-white shadow-sm hover:border-[var(--accent)] min-h-[44px]"
              >
                {chip.icon && <span aria-hidden="true">{chip.icon}</span>}
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Parsed Food Result Cards */}
      {draftItems.length > 0 && (
        <div className="space-y-2.5">
          {draftItems.map((item) => (
            <FoodResultCard
              key={item.id}
              item={item}
              arabicDigits={arabicDigits}
              showProteinFeedback={showProteinFeedback}
              saving={saving}
              onUpdateItem={(updated) =>
                setDraftItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
              }
              onSwapItem={(target) => {
                setSwapTargetId(target.id);
                setSwapSearchHint(target.name.split('(')[0].trim());
                setFinderOpen(true);
              }}
              onRemoveItem={(id) =>
                setDraftItems((prev) => prev.filter((it) => it.id !== id))
              }
              onSaveItem={
                draftItems.length > 1 ? (single) => saveItemsList([single]) : undefined
              }
            />
          ))}

          <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-2.5">
            <div className="text-xs">
              <p className="font-mono-num font-bold text-slate-900 dark:text-white">
                Total: about {draftTotals.kcal} kcal · {draftTotals.proteinG} g protein
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Estimate · {activeDate === todayKey ? 'Today' : activeDate}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleSaveCurrentAsTemplate}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[40px]"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                Save template
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => saveItemsList(draftItems)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {new Set(draftItems.map((d) => d.mealType || selectedSlot)).size > 1
                  ? `Save all ${new Set(draftItems.map((d) => d.mealType || selectedSlot)).size} meals`
                  : `Save to ${en.meals[selectedSlot]}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Optional 1-tap Post-Meal Fullness Check-In */}
      {lastSavedEntry && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              Saved! How full are you? (optional)
            </p>
            <button
              type="button"
              onClick={() => setLastSavedEntry(null)}
              aria-label="Close fullness check"
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { id: 'still_hungry', label: 'Still hungry' },
              { id: 'good', label: 'Good' },
              { id: 'very_full', label: 'Very full' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSetFullness(opt.id)}
                className={`py-2 px-2 rounded-xl text-xs font-bold min-h-[42px] transition ${
                  lastSavedEntry.fullness === opt.id
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Built-in Searchable ~150-item Food Finder */}
      <FoodFinderModal
        open={finderOpen}
        settings={settings}
        mealScans={mealScans}
        currentSlot={selectedSlot}
        initialSearch={swapSearchHint}
        swapTargetName={
          swapTargetId
            ? draftItems.find((i) => i.id === swapTargetId)?.name
            : undefined
        }
        onClose={() => {
          setFinderOpen(false);
          setSwapTargetId(null);
          setSwapSearchHint('');
        }}
        onSelectDraft={(picked) => {
          setLastSavedEntry(null);
          if (swapTargetId) {
            setDraftItems((prev) =>
              prev.map((it) => (it.id === swapTargetId ? picked : it))
            );
            setSwapTargetId(null);
          } else {
            setDraftItems((prev) => [...prev, picked]);
          }
          setParseSourceNote('Picked from your food list · estimates only');
        }}
        onRequestOnlineConsent={() => {
          setFinderOpen(false);
          pendingConsentActionRef.current = () => setFinderOpen(true);
          setConsentOpen(true);
        }}
      />

      <MenuHelperModal
        open={menuHelperOpen}
        profile={profile}
        settings={settings}
        dateKey={activeDate}
        mealSlot={selectedSlot}
        kcalLeft={kcalLeft}
        proteinLeftG={proteinLeftG}
        onClose={() => setMenuHelperOpen(false)}
        onSaved={onSaved}
      />

      <QuickRecallModal
        open={recallOpen}
        dateKey={activeDate}
        initialSlot={selectedSlot}
        onClose={() => setRecallOpen(false)}
        onSaved={onSaved}
      />

      {/* Online AI Consent Gate for voice upload / AI text */}
      <OnlineConsentModal
        open={consentOpen}
        featureName="AI Food Scan"
        settings={settings}
        onAccept={() => {
          setConsentOpen(false);
          const fn = pendingConsentActionRef.current;
          pendingConsentActionRef.current = null;
          fn?.();
        }}
        onDecline={() => {
          setConsentOpen(false);
          pendingConsentActionRef.current = null;
          pendingAudioRef.current = null;
          setVoiceStatusNote(
            'Stayed offline. Voice recording discarded — type it or pick from the list.'
          );
        }}
      />
    </div>
  );
};
