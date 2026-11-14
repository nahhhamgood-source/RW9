import { GoogleGenAI, Type } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
  method?: string;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (payload: unknown) => void;
}

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
        required: [
          'name',
          'portion_g',
          'calories',
          'protein_g',
          'carbs_g',
          'fats_g',
          'sodium_mg',
          'sugar_g',
        ],
      },
    },
  },
  required: [
    'name',
    'portion_g',
    'calories',
    'protein_g',
    'carbs_g',
    'fats_g',
    'sodium_mg',
    'sugar_g',
    'confidence',
    'notes',
  ],
};

function sendJson(res: VercelResponse, statusCode: number, body: Record<string, unknown>) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode).json(body);
    return;
  }
  res.statusCode = statusCode;
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: VercelRequest): Promise<AnalyzeFoodBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as AnalyzeFoodBody;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as AnalyzeFoodBody;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as AnalyzeFoodBody;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    let body: AnalyzeFoodBody;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { ok: false, error: 'Invalid JSON request body.' });
      return;
    }

    const rawBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    if (!rawBase64) {
      sendJson(res, 400, { ok: false, error: 'No food image received.' });
      return;
    }

    const cleanedBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
    const mimeType =
      typeof body.mimeType === 'string' && body.mimeType.startsWith('image/')
        ? body.mimeType
        : 'image/jpeg';
    const contextText = (typeof body.context === 'string' ? body.context : body.mealNote || '').trim();

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      sendJson(res, 503, {
        ok: false,
        code: 'MISSING_API_KEY',
        error: 'Food scan is unavailable because GEMINI_API_KEY is not configured on the server.',
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

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          { inlineData: { mimeType, data: cleanedBase64 } },
          { text: prompt },
        ],
      },
      config: {
        systemInstruction: FOOD_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: FOOD_RESPONSE_SCHEMA,
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      sendJson(res, 502, {
        ok: false,
        error: 'Vision model returned an empty response. Please retry or use manual entry.',
      });
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      sendJson(res, 502, {
        ok: false,
        error: 'Could not read structured nutrition estimate. Please retry.',
      });
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

    sendJson(res, 200, { ok: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Food analysis failed.';
    if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID') || msg.includes('403')) {
      sendJson(res, 403, {
        ok: false,
        code: 'INVALID_API_KEY',
        error: 'Gemini API key was rejected. Check GEMINI_API_KEY in environment settings.',
      });
      return;
    }
    if (msg.includes('INVALID_ARGUMENT') || msg.includes('Unable to process input image') || msg.includes('400')) {
      sendJson(res, 400, {
        ok: false,
        error: 'The uploaded photo could not be processed. Please retake a clear food photo.',
      });
      return;
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      sendJson(res, 429, {
        ok: false,
        error: 'Vision service rate limit reached. Wait a moment and retry.',
      });
      return;
    }
    sendJson(res, 500, {
      ok: false,
      error: 'Food scan is unavailable right now. Please retry or use manual entry.',
    });
  }
}
