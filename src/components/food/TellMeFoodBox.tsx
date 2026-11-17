import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ListFilter,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import {
  db,
  isAgeUnknown,
  isUnder18OrGrowing,
  saveMealScanEntry,
} from '../../db/database';
import { en } from '../../i18n/en';
import { apiRequest, hasOnlineConsent } from '../../lib/api';
import { toLocalDateKey } from '../../lib/date';
import {
  apiResponseToDraftItems,
  applyFollowUpChip,
  draftItemToMealFoodItem,
  formatKcalEstimate,
  parseFoodTextLocally,
  roundKcal,
  roundProtein,
} from '../../lib/foodChatParser';
import { computeDebloatImpact } from '../../lib/nutrition';
import { OnlineConsentModal } from '../modals/OnlineConsentModal';
import { useToast } from '../ui/ToastProvider';
import { FoodFinderModal } from './FoodFinderModal';
import { FoodResultCard } from './FoodResultCard';
import type { DraftFoodItem, FoodChatApiResponse, FollowUpChip } from './foodChatTypes';
import type {
  AppSettings,
  MealFullness,
  MealScanEntry,
  MealType,
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
  onChangeSlot?: (slot: MealType) => void;
  onOpenCamera?: (slot: MealType) => void;
  onSaved?: (entryId: number, slot: MealType) => void;
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
  onChangeSlot,
  onOpenCamera,
  onSaved,
  compact = false,
}) => {
  const { showToast } = useToast();
  const todayKey = toLocalDateKey();
  const arabicDigits = Boolean(settings.arabicIndicDigits);

  const showProteinFeedback = useMemo(() => {
    if (isUnder18OrGrowing(profile) || isAgeUnknown(profile)) return false;
    return Boolean(profile.ageExplicitlySet && profile.dietGoal && (profile.proteinTargetG ?? 0) > 0);
  }, [profile]);

  const [inputText, setInputText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftFoodItem[]>([]);
  const [unmatchedText, setUnmatchedText] = useState<string[]>([]);
  const [parseSourceNote, setParseSourceNote] = useState<string | null>(null);

  // Voice states
  const speechSupported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);
  const [voiceLang, setVoiceLang] = useState<'en' | 'ar'>('en');
  const [listeningSpeech, setListeningSpeech] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceStatusNote, setVoiceStatusNote] = useState<string | null>(null);
  const [editableTranscript, setEditableTranscript] = useState<string | null>(null);

  // Modals & Post-save Fullness
  const [finderOpen, setFinderOpen] = useState(false);
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

  const parseText = async (raw: string, forceOnlineAi = false) => {
    const trimmed = raw.trim();
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
          if (res.data.mealType && onChangeSlot) {
            onChangeSlot(res.data.mealType);
          }
          setDraftItems(apiResponseToDraftItems(res.data));
          setEditableTranscript(null);
          setParseSourceNote('Estimated via AI · adjust with chips if needed');
          setParsing(false);
          return;
        }
      }
    } catch {
      // fall through seamlessly to offline matcher
    }

    // Local bilingual + Franco-Arabic parser fallback (works 100% offline)
    const localRes = parseFoodTextLocally(
      trimmed,
      selectedSlot,
      settings.customFoodCatalog ?? []
    );
    if (localRes.mealType !== selectedSlot && onChangeSlot) {
      onChangeSlot(localRes.mealType);
    }

    setDraftItems(localRes.items);
    setUnmatchedText(localRes.unmatchedSegments);
    setEditableTranscript(null);

    if (localRes.items.length === 0) {
      setParseSourceNote(
        'Could not match that offline — pick from list, add custom food, or ask AI.'
      );
    } else if (localRes.unmatchedSegments.length > 0) {
      setParseSourceNote(
        `Matched ${localRes.items.length} item(s) locally. Some words were skipped: "${localRes.unmatchedSegments.join(', ')}".`
      );
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
      if (res.data.mealType && onChangeSlot) {
        onChangeSlot(res.data.mealType);
      }
      if (res.data.items.length > 0) {
        setDraftItems(apiResponseToDraftItems(res.data));
        setParseSourceNote('Heard & estimated (audio deleted from memory)');
      } else if (res.data.transcript) {
        const local = parseFoodTextLocally(
          res.data.transcript,
          selectedSlot,
          settings.customFoodCatalog ?? []
        );
        setDraftItems(local.items);
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

  const saveItemsList = async (itemsToSave: DraftFoodItem[]) => {
    if (itemsToSave.length === 0) return;
    setSaving(true);
    try {
      const mealItems = itemsToSave.map(draftItemToMealFoodItem);
      const totalCalories = roundKcal(itemsToSave.reduce((s, it) => s + it.kcal, 0));
      const totalProteinG = roundProtein(itemsToSave.reduce((s, it) => s + it.proteinG, 0));
      const totalSodiumMg = Math.round(itemsToSave.reduce((s, it) => s + it.sodiumMg, 0));
      const totalAddedSugarG = Math.round(
        itemsToSave.reduce((s, it) => s + it.baseAddedSugarG, 0)
      );
      const totalCarbsG = Math.round(itemsToSave.reduce((s, it) => s + it.baseCarbsG, 0));
      const totalFatsG = Math.round(itemsToSave.reduce((s, it) => s + it.baseFatsG, 0));

      const title = itemsToSave
        .map((it) => `${it.name} (${it.portionLabel})`)
        .join(' + ');
      const debloat = computeDebloatImpact(totalSodiumMg, totalAddedSugarG);
      const lowestConf = itemsToSave.some((i) => i.confidence === 'Low')
        ? 'Low'
        : itemsToSave.some((i) => i.confidence === 'Medium')
        ? 'Medium'
        : 'High';

      const id = await saveMealScanEntry({
        date: todayKey,
        timestamp: Date.now(),
        mealType: selectedSlot,
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
        summaryNote: `${en.meals[selectedSlot]} · Tell me what you ate`,
        isManual: true,
      });

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

      setLastSavedEntry({ id, title });
      showToast(
        `Saved ${itemsToSave.length === 1 ? itemsToSave[0].name : `${itemsToSave.length} items`} (~${totalCalories} kcal, ${totalProteinG} g protein)`
      );
      onSaved?.(id, selectedSlot);
    } finally {
      setSaving(false);
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

        {/* Big Input Row */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            parseText(inputText);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="What did you eat? (e.g., 2 eggs + baladi bread, نسكافيه بلبن)"
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

        {/* Honest voice & privacy note */}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          {speechSupported
            ? 'Voice needs internet and a microphone permission. If it fails, type it or pick from the list. Audio is never stored after processing.'
            : 'Voice note uses short mic recording (up to 30s) + internet. If it fails, type it or pick from the list. Audio is never stored after processing.'}
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
                Estimate. Edit if it looks off.
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => saveItemsList(draftItems)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save to {en.meals[selectedSlot]}
            </button>
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
