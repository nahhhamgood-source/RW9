import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  enforcePostSecurity,
  readJsonBodyWithLimit,
  redactSecrets,
  sendJson,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from './_security.js';

export const GEMINI_FOOD_MODEL = process.env.GEMINI_FOOD_MODEL?.trim() || 'gemini-3.1-flash-lite';

export const config = {
  maxDuration: 30,
};

interface FoodChatBody {
  text?: string;
  audioBase64?: string;
  mime?: string;
  lang?: string;
  mealType?: string;
  locale?: string;
}

const ALLOWED_AUDIO_MIME = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/aac',
  'audio/x-m4a',
]);

const MAX_DECODED_AUDIO_BYTES = 1_500_000;
const ATTEMPT_TIMEOUT_MS = 11_500;
const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

const FOOD_CHAT_SYSTEM_PROMPT = `You are a practical Egyptian nutrition assistant for ASCEND.
The user tells you what they ate in English, Egyptian Arabic, or Franco-Arabic (e.g., "akalt 2 ra3if 3eish w foul", "شربت نسكافيه بلبن").
Your job:
1. If audio is provided, first transcribe accurately into "transcript" (keeping Egyptian/Arabic/English food words clear).
2. Identify each distinct food/drink item in one sentence and detect mealType (breakfast, lunch, dinner, snack) from context or keep the provided default.
3. Use deep Egyptian home & street food knowledge (ful medames, ta'miya, baladi loaf ~plate-size, fino, eish shami, fiteer, koshari, molokhia, mahshi, macaroni bechamel/tagine, jibna areesh/beida, shakshuka, hawawshi, shawarma, kibda, sogoq, pane, kofta, nescafe/shai/ahwa with milk/sugar).
4. Express EVERY portion in everyday human units ONLY: cup (~150ml), mug (~250ml), big mug (~350ml), glass, baladi loaf, sandwich (small/regular/big), fist, plate (quarter/half/full), palm, piece, spoon, bowl.
5. NEVER ask for grams, ounces, or exact macros. NEVER moralize about food or give medical advice.
6. Round calories (kcal) to the nearest 5 or 10 (e.g., 60 kcal for Nescafe with milk mug). Round proteinG to the nearest integer gram. For restaurant/mixed dishes (koshari, hawawshi, shawarma, macaroni tagine, fiteer), provide realistic kcalMin and kcalMax bounds.
7. Ask the minimum: set needsQuestion=true ONLY when size, milk/sugar, or loaf/plate count is clearly missing. When asking, provide 3 to 5 short, tappable chips (include "Usual / average portion" if helpful) where qtyMultiplier scales the base item or extraKcal/extraProteinG adds milk/sugar.`;

const FOOD_CHAT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: {
      type: Type.STRING,
      description: 'Clean transcript of what the user said or typed.',
    },
    mealType: {
      type: Type.STRING,
      description: 'breakfast, lunch, dinner, or snack',
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Clear English food name' },
          nameAr: { type: Type.STRING, description: 'Short Egyptian Arabic name' },
          icon: { type: Type.STRING, description: 'Single relevant food emoji' },
          category: {
            type: Type.STRING,
            description: 'Breakfast, Egyptian home food, Street food, Fast food, Drinks, Sweets, Fruit, or Snacks',
          },
          portionLabel: {
            type: Type.STRING,
            description: 'Everyday portion label like "1 baladi loaf", "mug (~250 ml)", "2 eggs", "average portion"',
          },
          quantity: { type: Type.NUMBER, description: 'Numeric quantity in the chosen everyday unit' },
          unit: { type: Type.STRING, description: 'Unit word e.g. loaf, mug, bowl, sandwich, piece, plate, fist, spoon' },
          kcal: { type: Type.NUMBER, description: 'Estimated calories rounded to nearest 5 or 10' },
          kcalMin: { type: Type.NUMBER, description: 'Lower calorie bound for mixed/street dishes (0 if single whole food)' },
          kcalMax: { type: Type.NUMBER, description: 'Upper calorie bound for mixed/street dishes (0 if single whole food)' },
          proteinG: { type: Type.NUMBER, description: 'Estimated protein in whole grams' },
          sodiumMg: { type: Type.NUMBER, description: 'Estimated sodium in mg' },
          confidence: { type: Type.STRING, description: 'High, Medium, or Low' },
          needsQuestion: { type: Type.BOOLEAN, description: 'True only if portion or drink add-on is missing' },
          question: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING, description: 'Short everyday follow-up question' },
              chips: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING, description: 'Short button label' },
                    value: { type: Type.STRING, description: 'Resulting everyday portion label' },
                    qtyMultiplier: { type: Type.NUMBER, description: 'Scale factor on base kcal & proteinG (default 1)' },
                    extraKcal: { type: Type.NUMBER, description: 'Extra kcal for add-ons like milk/sugar (default 0)' },
                    extraProteinG: { type: Type.NUMBER, description: 'Extra protein g for add-ons like milk (default 0)' },
                  },
                  required: ['label', 'value', 'qtyMultiplier', 'extraKcal', 'extraProteinG'],
                },
              },
            },
            required: ['text', 'chips'],
          },
        },
        required: [
          'name',
          'nameAr',
          'icon',
          'portionLabel',
          'quantity',
          'unit',
          'kcal',
          'proteinG',
          'confidence',
          'needsQuestion',
        ],
      },
    },
  },
  required: ['transcript', 'mealType', 'items'],
};

function normalizeAudioMime(rawMime?: string): string | null {
  if (!rawMime || typeof rawMime !== 'string') return 'audio/webm';
  const base = rawMime.split(';')[0].trim().toLowerCase();
  if (ALLOWED_AUDIO_MIME.has(base)) return base;
  return null;
}

function roundKcal(n: number): number {
  const safe = Math.max(0, Number.isFinite(n) ? n : 0);
  if (safe < 100) return Math.round(safe / 5) * 5;
  return Math.round(safe / 10) * 10;
}

function extractUpstreamError(err: unknown, apiKey?: string): {
  status: number;
  error: string;
  detail: string;
  retryable: boolean;
} {
  const errObj = (err && typeof err === 'object' ? err : {}) as {
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
    name?: unknown;
  };

  const rawDetail = redactSecrets(
    err instanceof Error ? err.message : typeof errObj.message === 'string' ? errObj.message : String(err || 'Upstream error'),
    apiKey
  );

  const numericStatus = Number(errObj.status ?? errObj.statusCode);
  let status = Number.isInteger(numericStatus) && numericStatus >= 400 && numericStatus <= 599 ? numericStatus : 500;
  if (status === 500) {
    if (/\b401\b|UNAUTHENTICATED/i.test(rawDetail)) status = 401;
    else if (/\b403\b|PERMISSION_DENIED/i.test(rawDetail)) status = 403;
    else if (/\b404\b|NOT_FOUND/i.test(rawDetail)) status = 404;
    else if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(rawDetail)) status = 429;
    else if (/\b400\b|API_KEY_INVALID|INVALID_ARGUMENT/i.test(rawDetail)) status = 400;
  }

  const isAbort = errObj.name === 'AbortError' || /aborted/i.test(rawDetail);
  if (isAbort) {
    return {
      status: 504,
      error: 'Food parser request timed out.',
      detail: 'Upstream model exceeded attempt limit.',
      retryable: true,
    };
  }
  if (/API_KEY_INVALID|invalid api key|API key not valid/i.test(rawDetail) || status === 401) {
    return { status: status === 401 ? 401 : 400, error: 'Invalid Gemini API key.', detail: 'Key check failed.', retryable: false };
  }
  if (status === 403 || /PERMISSION_DENIED/i.test(rawDetail)) {
    return { status: 403, error: 'Gemini API permission denied.', detail: 'Check API key permissions.', retryable: false };
  }
  if (status === 404 || /NOT_FOUND/i.test(rawDetail)) {
    return { status: 404, error: `Model "${GEMINI_FOOD_MODEL}" was not found.`, detail: 'Check GEMINI_FOOD_MODEL.', retryable: false };
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(rawDetail)) {
    return { status: 429, error: 'Daily AI limit reached. Using offline food matcher instead.', detail: 'Quota limit.', retryable: false };
  }
  if (status === 400 || /INVALID_ARGUMENT/i.test(rawDetail)) {
    return { status: 400, error: 'Could not read that food input or audio.', detail: 'Invalid request format.', retryable: false };
  }

  return {
    status,
    error: `Food AI failed (${status}). Falling back locally.`,
    detail: rawDetail,
    retryable: status >= 500,
  };
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse): Promise<void> {
  const reqId = `fchat-${Date.now().toString(36)}`;
  const tStart = Date.now();

  if (req.method === 'GET') {
    sendJson(res, 200, { ok: true, status: 'alive' });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed. Use POST.' });
    return;
  }

  if (!enforcePostSecurity(req, res, 'food-chat', { limitPerMin: 20 })) {
    return;
  }

  let apiKey = '';
  try {
    let body: FoodChatBody;
    try {
      body = await readJsonBodyWithLimit<FoodChatBody>(req, 2_200_000);
    } catch {
      sendJson(res, 400, { ok: false, error: 'Invalid or oversized request payload.' });
      return;
    }

    const cleanText = typeof body.text === 'string' ? body.text.trim().slice(0, 600) : '';
    const rawAudio = typeof body.audioBase64 === 'string' ? body.audioBase64.trim() : '';
    const cleanedAudio = rawAudio.includes(',') ? rawAudio.split(',')[1] || '' : rawAudio;

    if (!cleanText && !cleanedAudio) {
      sendJson(res, 400, { ok: false, error: 'Provide food text or a short voice note.' });
      return;
    }

    let audioMime: string | null = null;
    if (cleanedAudio) {
      if (!/^[A-Za-z0-9+/=]+$/.test(cleanedAudio)) {
        sendJson(res, 400, { ok: false, error: 'Invalid audio encoding.' });
        return;
      }
      const approxBytes = Math.round((cleanedAudio.length * 3) / 4);
      if (approxBytes > MAX_DECODED_AUDIO_BYTES) {
        sendJson(res, 413, { ok: false, error: 'Voice note is too long. Keep it under 30 seconds.' });
        return;
      }
      audioMime = normalizeAudioMime(body.mime);
      if (!audioMime) {
        sendJson(res, 415, { ok: false, error: 'Unsupported audio format.' });
        return;
      }
    }

    const lang = typeof body.lang === 'string' && body.lang.trim().toLowerCase().startsWith('ar') ? 'ar-EG' : 'en';
    const locale = typeof body.locale === 'string' ? body.locale.trim().slice(0, 10) : 'eg';
    const defaultMealType =
      typeof body.mealType === 'string' && VALID_MEAL_TYPES.has(body.mealType.trim().toLowerCase())
        ? body.mealType.trim().toLowerCase()
        : 'lunch';

    console.log(
      `[${reqId}] step=validated mode=${cleanedAudio ? 'audio' : 'text'} lang=${lang} locale=${locale}`
    );

    apiKey = process.env.GEMINI_API_KEY?.trim() || '';
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      sendJson(res, 503, {
        ok: false,
        code: 'MISSING_API_KEY',
        error: 'GEMINI_API_KEY is not configured on the server.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (cleanedAudio && audioMime) {
      parts.push({ inlineData: { mimeType: audioMime, data: cleanedAudio } });
    }
    const promptInstruction = cleanText
      ? `Locale: ${locale}. Language hint: ${lang}. Default mealType: ${defaultMealType}. Parse this meal description into everyday Egyptian portions and return JSON: "${cleanText}"`
      : `Locale: ${locale}. Language hint: ${lang}. Default mealType: ${defaultMealType}. Transcribe the audio note carefully (Egyptian Arabic / English / Franco), extract all foods/drinks in everyday portions, and return JSON.`;
    parts.push({ text: promptInstruction });

    let response;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
      try {
        response = await ai.models.generateContent({
          model: GEMINI_FOOD_MODEL,
          contents: { parts },
          config: {
            abortSignal: controller.signal,
            thinkingConfig: {
              thinkingLevel: GEMINI_FOOD_MODEL.includes('flash-lite')
                ? ThinkingLevel.MINIMAL
                : ThinkingLevel.LOW,
            },
            systemInstruction: FOOD_CHAT_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: FOOD_CHAT_RESPONSE_SCHEMA,
          },
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const mapped = extractUpstreamError(err, apiKey);
        if (attempt === 1 && mapped.retryable) {
          console.log(`[${reqId}] step=retry attempt=2 status=${mapped.status}`);
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }

    if (lastErr || !response) {
      throw lastErr || new Error('Empty upstream response');
    }

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      sendJson(res, 502, { ok: false, error: 'Model returned an empty response.' });
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      sendJson(res, 502, { ok: false, error: 'Model returned unreadable JSON.' });
      return;
    }

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const normalizedItems = rawItems.slice(0, 12).map((raw: Record<string, unknown>) => {
      const kcal = roundKcal(Number(raw.kcal) || 0);
      const rawMin = Number(raw.kcalMin) || 0;
      const rawMax = Number(raw.kcalMax) || 0;
      const proteinG = Math.max(0, Math.round(Number(raw.proteinG) || 0));
      const sodiumMg = Math.max(0, Math.round(Number(raw.sodiumMg) || 250));
      const conf =
        raw.confidence === 'High' || raw.confidence === 'Medium' || raw.confidence === 'Low'
          ? raw.confidence
          : 'Medium';

      const qObj =
        raw.question && typeof raw.question === 'object'
          ? (raw.question as { text?: unknown; chips?: unknown })
          : null;
      const chips = Array.isArray(qObj?.chips)
        ? qObj!.chips
            .slice(0, 5)
            .map((c: Record<string, unknown>) => ({
              label: String(c.label || 'Regular').trim().slice(0, 40),
              value: String(c.value || c.label || 'average portion').trim().slice(0, 50),
              qtyMultiplier:
                Number.isFinite(Number(c.qtyMultiplier)) && Number(c.qtyMultiplier) > 0
                  ? Number(c.qtyMultiplier)
                  : 1,
              extraKcal: Number.isFinite(Number(c.extraKcal)) ? Math.round(Number(c.extraKcal)) : 0,
              extraProteinG: Number.isFinite(Number(c.extraProteinG)) ? Math.round(Number(c.extraProteinG)) : 0,
            }))
        : [];

      const needsQuestion = Boolean(raw.needsQuestion) && chips.length > 0;

      return {
        name: String(raw.name || 'Food item').trim().slice(0, 80),
        nameAr: typeof raw.nameAr === 'string' ? raw.nameAr.trim().slice(0, 80) : '',
        icon: typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim().slice(0, 4) : '🍽️',
        category: typeof raw.category === 'string' ? raw.category.trim() : 'Egyptian home food',
        portionLabel: String(raw.portionLabel || 'average portion').trim().slice(0, 60),
        quantity: Number.isFinite(Number(raw.quantity)) && Number(raw.quantity) > 0 ? Number(raw.quantity) : 1,
        unit: String(raw.unit || 'serving').trim().slice(0, 24),
        kcal,
        kcalMin: rawMin > 0 && rawMax >= rawMin ? roundKcal(rawMin) : undefined,
        kcalMax: rawMin > 0 && rawMax >= rawMin ? roundKcal(rawMax) : undefined,
        proteinG,
        sodiumMg,
        confidence: conf,
        needsQuestion,
        question: needsQuestion && qObj
          ? {
              text: String(qObj.text || 'How big was it?').trim().slice(0, 90),
              chips,
            }
          : undefined,
      };
    });

    const detectedMeal =
      typeof parsed.mealType === 'string' && VALID_MEAL_TYPES.has(parsed.mealType.trim().toLowerCase())
        ? parsed.mealType.trim().toLowerCase()
        : defaultMealType;

    console.log(
      `[${reqId}] step=complete items=${normalizedItems.length} ms=${Date.now() - tStart} model=${GEMINI_FOOD_MODEL}`
    );

    sendJson(res, 200, {
      ok: true,
      data: {
        transcript:
          typeof parsed.transcript === 'string' && parsed.transcript.trim()
            ? parsed.transcript.trim().slice(0, 600)
            : cleanText,
        mealType: detectedMeal,
        items: normalizedItems,
      },
    });
  } catch (err) {
    const mapped = extractUpstreamError(err, apiKey);
    console.log(`[${reqId}] step=error status=${mapped.status} ms=${Date.now() - tStart}`);
    sendJson(res, mapped.status, {
      ok: false,
      error: mapped.error,
      detail: mapped.detail,
    });
  }
}
