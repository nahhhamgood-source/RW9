import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  enforcePostSecurity,
  readJsonBodyWithLimit,
  redactSecrets,
  sendJson,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from './_security.js';

// Change this model ID (or set GEMINI_FOOD_MODEL in Vercel Environment Variables) to switch models.
export const GEMINI_FOOD_MODEL = process.env.GEMINI_FOOD_MODEL?.trim() || 'gemini-3.1-flash-lite';

export const config = {
  maxDuration: 60,
};

interface AnalyzeFoodBody {
  imageBase64?: string;
  mimeType?: string;
  context?: string;
  mealNote?: string;
}

const FOOD_SYSTEM_PROMPT = `You are a practical, realistic nutrition estimator for ASCEND.
Analyze the provided food photo (and optional user context) conservatively:
1. Identify the overall meal name and any clearly visible food items/components.
2. Estimate realistic portion weight in grams (portion_g), calories (kcal), protein_g, carbs_g, fats_g, sodium_mg (account for sauces, marinades, dressings, cheeses, restaurant seasoning), and sugar_g (added/refined sugar where identifiable, otherwise conservative estimate).
3. Set confidence between 0 and 1 (e.g., 0.85 for a clear single-plate home meal, 0.45 for dark/blurry/mixed sauces/covered containers).
4. Do NOT hallucinate hidden side dishes. Briefly explain key assumptions or uncertainty in notes.
5. Keep all numeric estimates realistic and non-negative.`;

const FOOD_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: 'Concise name of the meal or dish (3-7 words).' },
    portion_g: { type: Type.NUMBER, description: 'Total estimated edible portion in grams.' },
    calories: { type: Type.NUMBER, description: 'Total estimated calories in kcal.' },
    protein_g: { type: Type.NUMBER, description: 'Total protein in grams.' },
    carbs_g: { type: Type.NUMBER, description: 'Total carbohydrates in grams.' },
    fats_g: { type: Type.NUMBER, description: 'Total fats in grams.' },
    sodium_mg: { type: Type.NUMBER, description: 'Total estimated sodium in milligrams.' },
    sugar_g: { type: Type.NUMBER, description: 'Total estimated sugar in grams.' },
    confidence: { type: Type.NUMBER, description: 'Confidence score from 0 to 1.' },
    notes: { type: Type.STRING, description: 'Short note on portion cues, sauces, or uncertainty.' },
    items: {
      type: Type.ARRAY,
      description: 'Optional list of distinct items visible on the plate.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          portion_g: { type: Type.NUMBER },
          calories: { type: Type.NUMBER },
          protein_g: { type: Type.NUMBER },
          carbs_g: { type: Type.NUMBER },
          fats_g: { type: Type.NUMBER },
          sodium_mg: { type: Type.NUMBER },
          sugar_g: { type: Type.NUMBER },
          notes: { type: Type.STRING },
        },
        required: ['name', 'portion_g', 'calories', 'protein_g', 'carbs_g', 'fats_g', 'sodium_mg', 'sugar_g'],
      },
    },
  },
  required: ['name', 'portion_g', 'calories', 'protein_g', 'carbs_g', 'fats_g', 'sodium_mg', 'sugar_g', 'confidence', 'notes'],
};

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DECODED_IMAGE_BYTES = 480 * 1024;

function extractUpstreamError(err: unknown, apiKey?: string): {
  status: number;
  error: string;
  detail: string;
} {
  const errObj = (err && typeof err === 'object' ? err : {}) as {
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
    name?: unknown;
  };

  const rawDetail = redactSecrets(
    err instanceof Error ? err.message : typeof errObj.message === 'string' ? errObj.message : String(err || 'Unknown upstream error'),
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

  if (errObj.name === 'AbortError' || /aborted/i.test(rawDetail)) {
    return {
      status: 504,
      error: 'Gemini vision request timed out after 20s.',
      detail: rawDetail || 'Upstream Gemini call aborted at 20000ms.',
    };
  }
  if (/API_KEY_INVALID|invalid api key|API key not valid/i.test(rawDetail) || status === 401) {
    return { status: status === 401 ? 401 : 400, error: 'Invalid Gemini API key.', detail: rawDetail };
  }
  if (status === 403 || /PERMISSION_DENIED/i.test(rawDetail)) {
    return { status: 403, error: 'Gemini API permission denied (403).', detail: rawDetail };
  }
  if (status === 404 || /NOT_FOUND|is not found for API version/i.test(rawDetail)) {
    return { status: 404, error: `Gemini model "${GEMINI_FOOD_MODEL}" was not found (404).`, detail: rawDetail };
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(rawDetail)) {
    return { status: 429, error: 'Gemini API quota or rate limit exceeded (429).', detail: rawDetail };
  }
  if (status === 400 || /INVALID_ARGUMENT|Unable to process input image/i.test(rawDetail)) {
    return { status: 400, error: 'Invalid request or unreadable food image (400).', detail: rawDetail };
  }
  return { status, error: `Gemini food scan failed (${status}).`, detail: rawDetail };
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse): Promise<void> {
  const reqId = `food-${Date.now().toString(36)}`;
  const tStart = Date.now();
  console.log(`[${reqId}] step=start method=${req.method}`);

  if (req.method === 'GET') {
    console.log(`[${reqId}] step=health_check ms=${Date.now() - tStart}`);
    sendJson(res, 200, { ok: true, status: 'alive' });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, {
      ok: false,
      error: 'Method not allowed. Use GET or POST.',
      detail: `Received HTTP ${req.method || 'UNKNOWN'}`,
    });
    return;
  }

  if (!enforcePostSecurity(req, res, 'analyze-food', { limitPerMin: 15 })) {
    return;
  }

  let apiKey = '';
  try {
    const tParseStart = Date.now();
    let body: AnalyzeFoodBody;
    try {
      body = await readJsonBodyWithLimit<AnalyzeFoodBody>(req, 720_000);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Malformed JSON payload';
      console.log(`[${reqId}] step=parse_body_error ms=${Date.now() - tParseStart} detail=${detail}`);
      sendJson(res, 400, { ok: false, error: 'Invalid or oversized JSON request.', detail });
      return;
    }
    console.log(`[${reqId}] step=parse_body ms=${Date.now() - tParseStart}`);

    const rawBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    if (!rawBase64) {
      sendJson(res, 400, {
        ok: false,
        error: 'No food image received.',
        detail: 'Request JSON must include a non-empty imageBase64 field.',
      });
      return;
    }

    const cleanedBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanedBase64)) {
      sendJson(res, 400, {
        ok: false,
        error: 'Invalid base64 image encoding.',
      });
      return;
    }

    const approxBytes = Math.round((cleanedBase64.length * 3) / 4);
    if (approxBytes > MAX_DECODED_IMAGE_BYTES) {
      sendJson(res, 413, {
        ok: false,
        error: `Image is too large (${Math.round(approxBytes / 1024)} KB). Keep photos under 480 KB.`,
      });
      return;
    }

    const rawMime = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : 'image/jpeg';
    const mimeType = ALLOWED_IMAGE_MIME.has(rawMime) ? rawMime : 'image/jpeg';
    const contextText = (typeof body.context === 'string' ? body.context : body.mealNote || '')
      .trim()
      .slice(0, 240);
    console.log(
      `[${reqId}] step=validate_image ms=${Date.now() - tStart} approxKB=${Math.round(approxBytes / 1024)} mimeType=${mimeType}`
    );

    apiKey = process.env.GEMINI_API_KEY?.trim() || '';
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      console.log(`[${reqId}] step=missing_api_key ms=${Date.now() - tStart}`);
      sendJson(res, 503, {
        ok: false,
        code: 'MISSING_API_KEY',
        error: 'GEMINI_API_KEY is not configured on the server.',
        detail: 'Set GEMINI_API_KEY in Vercel Project Settings → Environment Variables and redeploy.',
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

    const prompt = contextText
      ? `Estimate nutrition for this meal photo. User context: "${contextText}". Return structured JSON.`
      : 'Estimate portion weight in grams, calories, protein, carbs, fats, sodium, sugar, and confidence (0-1) for this food photo. Return structured JSON.';

    const tGeminiStart = Date.now();
    const geminiController = new AbortController();
    const geminiTimeout = setTimeout(() => {
      console.log(`[${reqId}] step=gemini_abort_trigger afterMs=${Date.now() - tGeminiStart}`);
      geminiController.abort();
    }, 20_000);

    console.log(`[${reqId}] step=gemini_call_start model=${GEMINI_FOOD_MODEL}`);
    let response;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_FOOD_MODEL,
        contents: {
          parts: [
            { inlineData: { mimeType, data: cleanedBase64 } },
            { text: prompt },
          ],
        },
        config: {
          abortSignal: geminiController.signal,
          thinkingConfig: {
            thinkingLevel: GEMINI_FOOD_MODEL.includes('flash-lite')
              ? ThinkingLevel.MINIMAL
              : ThinkingLevel.LOW,
          },
          systemInstruction: FOOD_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: FOOD_RESPONSE_SCHEMA,
        },
      });
    } finally {
      clearTimeout(geminiTimeout);
    }
    console.log(`[${reqId}] step=gemini_call_done ms=${Date.now() - tGeminiStart}`);

    const tFormatStart = Date.now();
    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      sendJson(res, 502, {
        ok: false,
        error: 'Vision model returned an empty response.',
        detail: `Model ${GEMINI_FOOD_MODEL} returned empty response.text.`,
      });
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Invalid JSON from Gemini';
      sendJson(res, 502, { ok: false, error: 'Model returned malformed JSON.', detail });
      return;
    }

    const clampNum = (v: unknown, fallback = 0, decimals = 0) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return fallback;
      const factor = 10 ** decimals;
      return Math.round(n * factor) / factor;
    };

    const rawConfidence = Number(parsed.confidence);
    const confidence = Number.isFinite(rawConfidence)
      ? Math.max(0, Math.min(1, Number(rawConfidence.toFixed(2))))
      : 0.6;

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems.map((it: Record<string, unknown>, idx: number) => ({
      id: `item-${Date.now()}-${idx}`,
      name: String(it.name || `Food Item ${idx + 1}`).trim(),
      portion_g: Math.max(5, clampNum(it.portion_g, 100, 0)),
      calories: clampNum(it.calories, 0, 0),
      protein_g: clampNum(it.protein_g, 0, 1),
      carbs_g: clampNum(it.carbs_g, 0, 1),
      fats_g: clampNum(it.fats_g, 0, 1),
      sodium_mg: clampNum(it.sodium_mg, 0, 0),
      sugar_g: clampNum(it.sugar_g, 0, 1),
      notes: typeof it.notes === 'string' ? it.notes.trim() : '',
    }));

    const data = {
      name: String(parsed.name || 'Estimated Meal').trim(),
      portion_g: Math.max(5, clampNum(parsed.portion_g, 250, 0)),
      calories: clampNum(parsed.calories, 0, 0),
      protein_g: clampNum(parsed.protein_g, 0, 1),
      carbs_g: clampNum(parsed.carbs_g, 0, 1),
      fats_g: clampNum(parsed.fats_g, 0, 1),
      sodium_mg: clampNum(parsed.sodium_mg, 0, 0),
      sugar_g: clampNum(parsed.sugar_g, 0, 1),
      confidence,
      notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
      items,
    };

    console.log(
      `[${reqId}] step=complete formatMs=${Date.now() - tFormatStart} totalMs=${Date.now() - tStart} model=${GEMINI_FOOD_MODEL}`
    );
    sendJson(res, 200, { ok: true, data });
  } catch (err) {
    const mapped = extractUpstreamError(err, apiKey);
    console.log(
      `[${reqId}] step=upstream_error ms=${Date.now() - tStart} status=${mapped.status} error=${mapped.error} detail=${mapped.detail}`
    );
    sendJson(res, mapped.status, {
      ok: false,
      error: mapped.error,
      detail: mapped.detail,
    });
  }
}
