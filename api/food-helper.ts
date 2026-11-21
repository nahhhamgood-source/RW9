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

interface FoodHelperBody {
  mode?: 'menu' | 'label' | 'barcode';
  menuText?: string;
  imageBase64?: string;
  mimeType?: string;
  kcalLeft?: number;
  proteinLeftG?: number;
  goal?: string;
  barcode?: string;
}

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DECODED_IMAGE_BYTES = 1_500_000;
const ATTEMPT_TIMEOUT_MS = 12_000;

const MENU_HELPER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: 'Brief 1-sentence menu overview.' },
    picks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          dishName: { type: Type.STRING },
          portionLabel: { type: Type.STRING },
          estimatedKcal: { type: Type.NUMBER },
          kcalRange: { type: Type.STRING },
          estimatedProteinG: { type: Type.NUMBER },
          estimatedSodiumMg: { type: Type.NUMBER },
          reasonLine: { type: Type.STRING, description: 'One concise practical line explaining why this fits.' },
        },
        required: ['dishName', 'portionLabel', 'estimatedKcal', 'kcalRange', 'estimatedProteinG', 'reasonLine'],
      },
    },
  },
  required: ['summary', 'picks'],
};

const LABEL_READER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    productName: { type: Type.STRING },
    servingLabel: { type: Type.STRING },
    kcal: { type: Type.NUMBER },
    proteinG: { type: Type.NUMBER },
    carbsG: { type: Type.NUMBER },
    fatsG: { type: Type.NUMBER },
    sodiumMg: { type: Type.NUMBER },
    addedSugarG: { type: Type.NUMBER },
    confidence: { type: Type.STRING },
  },
  required: ['productName', 'servingLabel', 'kcal', 'proteinG', 'confidence'],
};

function roundKcal(n: number): number {
  const safe = Math.max(0, Number.isFinite(n) ? n : 0);
  if (safe < 100) return Math.round(safe / 5) * 5;
  return Math.round(safe / 10) * 10;
}

function extractUpstreamError(err: unknown, apiKey?: string): { status: number; error: string } {
  const errObj = (err && typeof err === 'object' ? err : {}) as {
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
    name?: unknown;
  };
  const msg = redactSecrets(
    err instanceof Error ? err.message : typeof errObj.message === 'string' ? errObj.message : String(err || ''),
    apiKey
  );
  if (errObj.name === 'AbortError' || /aborted/i.test(msg)) {
    return { status: 504, error: 'Food helper request timed out. Try again or enter manually.' };
  }
  const num = Number(errObj.status ?? errObj.statusCode);
  if (num === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) {
    return { status: 429, error: 'Daily AI limit reached. Try again later or enter estimate manually.' };
  }
  if (num === 401 || num === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
    return { status: num === 403 ? 403 : 400, error: 'Gemini API key check failed on server.' };
  }
  return { status: Number.isInteger(num) && num >= 400 && num <= 599 ? num : 500, error: 'Could not read that food input right now.' };
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse): Promise<void> {
  if (req.method === 'GET') {
    sendJson(res, 200, { ok: true, status: 'alive' });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed. Use POST.' });
    return;
  }
  if (!enforcePostSecurity(req, res, 'food-helper', { limitPerMin: 20 })) {
    return;
  }

  let body: FoodHelperBody;
  try {
    body = await readJsonBodyWithLimit<FoodHelperBody>(req, 2_200_000);
  } catch {
    sendJson(res, 400, { ok: false, error: 'Invalid or oversized request payload.' });
    return;
  }

  const mode = body.mode;

  // Mode 1: Open Food Facts barcode lookup (no Gemini key required)
  if (mode === 'barcode') {
    const rawCode = typeof body.barcode === 'string' ? body.barcode.replace(/\D/g, '') : '';
    if (rawCode.length < 6 || rawCode.length > 18) {
      sendJson(res, 400, { ok: false, error: 'Enter a valid barcode (6 to 18 digits).' });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7500);
    try {
      const resp = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(rawCode)}.json?fields=product_name,brands,serving_size,nutriments`,
        {
          signal: controller.signal,
          headers: { 'User-Agent': 'ASCEND-PWA/2.3 (self-care-tracker)' },
        }
      );
      if (!resp.ok) {
        sendJson(res, 404, { ok: false, error: 'Product not found in Open Food Facts.' });
        return;
      }
      const data = (await resp.json()) as {
        status?: number;
        product?: {
          product_name?: string;
          brands?: string;
          serving_size?: string;
          nutriments?: Record<string, number | string | undefined>;
        };
      };
      if (data.status !== 1 || !data.product) {
        sendJson(res, 404, { ok: false, error: 'Barcode not found in Open Food Facts. You can log it manually.' });
        return;
      }
      const p = data.product;
      const n = p.nutriments ?? {};
      const kcalServing = Number(n['energy-kcal_serving'] ?? n['energy-kcal_100g'] ?? 0);
      const proteinServing = Number(n['proteins_serving'] ?? n['proteins_100g'] ?? 0);
      const sodiumG = Number(n['sodium_serving'] ?? n['sodium_100g'] ?? 0);
      const saltG = Number(n['salt_serving'] ?? n['salt_100g'] ?? 0);
      const sodiumMg = sodiumG > 0 ? Math.round(sodiumG * 1000) : Math.round(saltG * 400);
      const carbsG = Number(n['carbohydrates_serving'] ?? n['carbohydrates_100g'] ?? 0);
      const fatsG = Number(n['fat_serving'] ?? n['fat_100g'] ?? 0);
      const hasServing = n['energy-kcal_serving'] !== undefined;

      const labelName = [p.brands, p.product_name].filter(Boolean).join(' ').trim() || `Packaged item (${rawCode})`;
      sendJson(res, 200, {
        ok: true,
        data: {
          barcode: rawCode,
          name: labelName.slice(0, 90),
          portionLabel: p.serving_size?.trim() || (hasServing ? '1 serving' : '100g'),
          kcal: roundKcal(Number.isFinite(kcalServing) ? kcalServing : 0),
          proteinG: Math.max(0, Math.round(Number.isFinite(proteinServing) ? proteinServing : 0)),
          carbsG: Math.max(0, Math.round(Number.isFinite(carbsG) ? carbsG : 0)),
          fatsG: Math.max(0, Math.round(Number.isFinite(fatsG) ? fatsG : 0)),
          sodiumMg: Math.max(0, Number.isFinite(sodiumMg) ? sodiumMg : 120),
          source: 'Open Food Facts',
        },
      });
      return;
    } catch {
      sendJson(res, 502, { ok: false, error: 'Could not reach Open Food Facts right now.' });
      return;
    } finally {
      clearTimeout(timer);
    }
  }

  // Modes 2 & 3 require Gemini API key
  const apiKey = process.env.GEMINI_API_KEY?.trim() || '';
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    sendJson(res, 503, { ok: false, error: 'GEMINI_API_KEY is not configured on the server.' });
    return;
  }

  const rawImage = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const cleanImage = rawImage.includes(',') ? rawImage.split(',')[1] || '' : rawImage;
  const cleanText = typeof body.menuText === 'string' ? body.menuText.trim().slice(0, 2000) : '';

  if (cleanImage) {
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanImage)) {
      sendJson(res, 400, { ok: false, error: 'Invalid image payload.' });
      return;
    }
    const approxBytes = Math.round((cleanImage.length * 3) / 4);
    if (approxBytes > MAX_DECODED_IMAGE_BYTES) {
      sendJson(res, 413, { ok: false, error: 'Image too large. Please pick a smaller image.' });
      return;
    }
    const mime = typeof body.mimeType === 'string' ? body.mimeType.split(';')[0].trim().toLowerCase() : 'image/jpeg';
    if (!ALLOWED_IMAGE_MIME.has(mime)) {
      sendJson(res, 415, { ok: false, error: 'Unsupported image format.' });
      return;
    }
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

  try {
    if (mode === 'menu') {
      if (!cleanText && !cleanImage) {
        sendJson(res, 400, { ok: false, error: 'Type dishes or upload a menu photo.' });
        return;
      }
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (cleanImage) {
        parts.push({ inlineData: { mimeType: body.mimeType || 'image/jpeg', data: cleanImage } });
      }
      const kcalLeft = Number.isFinite(Number(body.kcalLeft)) ? Math.round(Number(body.kcalLeft)) : 700;
      const proteinLeftG = Number.isFinite(Number(body.proteinLeftG)) ? Math.round(Number(body.proteinLeftG)) : 35;
      const goal = typeof body.goal === 'string' ? body.goal.slice(0, 40) : 'balanced';
      parts.push({
        text: `Goal: ${goal}. Remaining today: ~${kcalLeft} kcal and ~${proteinLeftG}g protein. Menu text (if provided): "${cleanText}". Pick the best 1-2 menu items that fit comfortably without starving or shaming, give realistic calorie range estimates and 1 short practical reason per dish.`,
      });

      const response = await ai.models.generateContent({
        model: GEMINI_FOOD_MODEL,
        contents: { parts },
        config: {
          abortSignal: controller.signal,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          systemInstruction:
            'You are a practical restaurant & outing menu helper. Suggest 1-2 realistic dishes from the menu that fit protein & calorie needs. Never moralize, never suggest fasting/skipping food. Always label calories as rough estimates.',
          responseMimeType: 'application/json',
          responseSchema: MENU_HELPER_SCHEMA,
        },
      });
      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        summary?: string;
        picks?: Array<Record<string, unknown>>;
      };
      const picks = (Array.isArray(parsed.picks) ? parsed.picks : []).slice(0, 3).map((pk) => ({
        dishName: String(pk.dishName || 'Grilled option').slice(0, 80),
        portionLabel: String(pk.portionLabel || '1 standard plate').slice(0, 60),
        estimatedKcal: roundKcal(Number(pk.estimatedKcal) || 550),
        kcalRange: String(pk.kcalRange || 'estimate').slice(0, 40),
        estimatedProteinG: Math.max(0, Math.round(Number(pk.estimatedProteinG) || 28)),
        estimatedSodiumMg: Math.max(0, Math.round(Number(pk.estimatedSodiumMg) || 750)),
        reasonLine: String(pk.reasonLine || 'Balanced protein and comfortable calories.').slice(0, 140),
      }));
      sendJson(res, 200, {
        ok: true,
        data: {
          summary: String(parsed.summary || 'Top estimated fits from this menu:').slice(0, 160),
          picks,
        },
      });
      return;
    }

    if (mode === 'label') {
      if (!cleanImage) {
        sendJson(res, 400, { ok: false, error: 'Upload a nutrition label photo first.' });
        return;
      }
      const response = await ai.models.generateContent({
        model: GEMINI_FOOD_MODEL,
        contents: {
          parts: [
            { inlineData: { mimeType: body.mimeType || 'image/jpeg', data: cleanImage } },
            { text: 'Read the Nutrition Facts / nutrition table per serving and extract values into JSON.' },
          ],
        },
        config: {
          abortSignal: controller.signal,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          systemInstruction:
            'Extract exact nutrition values per serving from the nutrition label photo. If serving size is in 100g, label it clearly.',
          responseMimeType: 'application/json',
          responseSchema: LABEL_READER_SCHEMA,
        },
      });
      const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
      sendJson(res, 200, {
        ok: true,
        data: {
          productName: String(parsed.productName || 'Packaged food').slice(0, 80),
          servingLabel: String(parsed.servingLabel || '1 serving').slice(0, 50),
          kcal: roundKcal(Number(parsed.kcal) || 0),
          proteinG: Math.max(0, Math.round(Number(parsed.proteinG) || 0)),
          carbsG: Math.max(0, Math.round(Number(parsed.carbsG) || 0)),
          fatsG: Math.max(0, Math.round(Number(parsed.fatsG) || 0)),
          sodiumMg: Math.max(0, Math.round(Number(parsed.sodiumMg) || 120)),
          addedSugarG: Math.max(0, Math.round(Number(parsed.addedSugarG) || 0)),
          confidence: parsed.confidence === 'High' || parsed.confidence === 'Low' ? parsed.confidence : 'Medium',
        },
      });
      return;
    }

    sendJson(res, 400, { ok: false, error: 'Unsupported food-helper mode.' });
  } catch (err) {
    const mapped = extractUpstreamError(err, apiKey);
    sendJson(res, mapped.status, { ok: false, error: mapped.error });
  } finally {
    clearTimeout(timer);
  }
}
