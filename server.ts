import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const NUTRITION_SYSTEM_PROMPT = `You are an elite precision clinical sports nutritionist and facial-debloating dietary analyst for ASCEND.OS.
Analyze the provided meal photograph (and optional user note) with strict visual realism:
1. Identify EVERY distinct visible food item, protein, carbohydrate, vegetable, oil/dressing, sauce, or beverage on the plate/bowl.
2. Estimate realistic portion weight in grams (portionGrams) using visual plate geometry, utensil scale, and standard culinary density.
3. Calculate exact nutritional values for THAT specific portion weight:
   - calories (kcal)
   - proteinG (grams)
   - carbsG (grams)
   - fatsG (grams)
   - sodiumMg (milligrams — explicitly account for soy sauce, marinades, dressings, cheeses, cured meats, restaurant seasoning, or salted snacks)
   - addedSugarG (grams — explicitly distinguish added/refined sugars in glazes, sauces, drinks, and desserts from whole-fruit natural sugar)
4. Do NOT hallucinate invisible side dishes. If something is ambiguous (e.g., oil sheen or hidden dressing), reflect it conservatively in sodium/fats and explain briefly in notes.
5. Keep mealTitle concise and accurate (3-7 words). Provide a crisp 1-2 sentence scientific summaryNote covering facial water-retention/debloat impact (sodium, glycemic load, potassium balance) and protein quality.`;

const NUTRITION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mealTitle: {
      type: Type.STRING,
      description: 'Concise 3 to 7 word title describing the meal.',
    },
    confidence: {
      type: Type.STRING,
      description: 'Visual estimation confidence: High, Medium, or Low.',
    },
    items: {
      type: Type.ARRAY,
      description: 'Every individual food item identified on the plate.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Specific food item name.' },
          portionGrams: { type: Type.NUMBER, description: 'Estimated weight in grams.' },
          calories: { type: Type.NUMBER, description: 'Calories in kcal for this portion.' },
          proteinG: { type: Type.NUMBER, description: 'Protein in grams.' },
          carbsG: { type: Type.NUMBER, description: 'Total carbohydrates in grams.' },
          fatsG: { type: Type.NUMBER, description: 'Total fats in grams.' },
          sodiumMg: { type: Type.NUMBER, description: 'Sodium in milligrams.' },
          addedSugarG: { type: Type.NUMBER, description: 'Added sugar in grams.' },
          notes: { type: Type.STRING, description: 'Brief preparation or sauce note.' },
        },
        required: [
          'name',
          'portionGrams',
          'calories',
          'proteinG',
          'carbsG',
          'fatsG',
          'sodiumMg',
          'addedSugarG',
        ],
      },
    },
    summaryNote: {
      type: Type.STRING,
      description: '1-2 sentence scientific insight on macro quality and facial debloating impact.',
    },
  },
  required: ['mealTitle', 'confidence', 'items', 'summaryNote'],
};

interface RawAnalyzeBody {
  imageBase64?: string;
  mimeType?: string;
  mealNote?: string;
}

async function generateWithRetry(ai: GoogleGenAI, imageBase64: string, mimeType: string, mealNote?: string) {
  const promptText = mealNote?.trim()
    ? `Analyze all food items in this photo. User context note: "${mealNote.trim()}". Return strict structured JSON.`
    : 'Analyze all visible food items, estimate exact gram portions, macros, calories, sodium (mg), and added sugars (g). Return strict structured JSON.';

  const parts = [
    {
      inlineData: {
        mimeType,
        data: imageBase64,
      },
    },
    { text: promptText },
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction: NUTRITION_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: NUTRITION_RESPONSE_SCHEMA,
        },
      });
      return response;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('400') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
        throw err;
      }
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 700));
      }
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '14mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'ascend-nutrition-vision' });
  });

  app.post('/api/nutrition/analyze', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as RawAnalyzeBody;
      const rawBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
      if (!rawBase64) {
        res.status(400).json({ error: 'No meal image data received. Please snap or upload a food photo.' });
        return;
      }

      const cleanedBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
      const mimeType =
        typeof body.mimeType === 'string' && body.mimeType.startsWith('image/')
          ? body.mimeType
          : 'image/jpeg';

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'Gemini API key is not configured in Settings > Secrets (GEMINI_API_KEY). Configure it to run AI Vision meal scans.',
        });
        return;
      }

      const response = await generateWithRetry(ai, cleanedBase64, mimeType, body.mealNote);
      const text = (response.text ?? '').trim();
      if (!text) {
        res.status(502).json({ error: 'Vision model returned an empty analysis. Please retry with a clearer angle.' });
        return;
      }

      const parsed = JSON.parse(text);
      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      if (rawItems.length === 0) {
        res.status(422).json({
          error: 'No food items could be clearly identified in this photo. Try a well-lit top-down angle or add manually.',
        });
        return;
      }

      const normalizedItems = rawItems.map((it: Record<string, unknown>, idx: number) => {
        const portionGrams = Math.max(1, Math.round(Number(it.portionGrams) || 100));
        return {
          id: `item-${Date.now()}-${idx}`,
          name: String(it.name || `Food Item ${idx + 1}`).trim(),
          portionGrams,
          baseGrams: portionGrams,
          calories: Math.max(0, Math.round(Number(it.calories) || 0)),
          proteinG: Math.max(0, Number((Number(it.proteinG) || 0).toFixed(1))),
          carbsG: Math.max(0, Number((Number(it.carbsG) || 0).toFixed(1))),
          fatsG: Math.max(0, Number((Number(it.fatsG) || 0).toFixed(1))),
          sodiumMg: Math.max(0, Math.round(Number(it.sodiumMg) || 0)),
          addedSugarG: Math.max(0, Number((Number(it.addedSugarG) || 0).toFixed(1))),
          notes: typeof it.notes === 'string' ? it.notes.trim() : '',
        };
      });

      const confidenceRaw = String(parsed.confidence || 'Medium');
      const confidence =
        confidenceRaw === 'High' || confidenceRaw === 'Low' ? confidenceRaw : 'Medium';

      res.json({
        mealTitle: String(parsed.mealTitle || 'Analyzed Meal').trim(),
        confidence,
        items: normalizedItems,
        summaryNote: String(parsed.summaryNote || '').trim(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Meal vision analysis failed.';
      if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID') || msg.includes('403')) {
        res.status(403).json({
          error: 'Gemini API access denied. Check GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        res.status(429).json({
          error: 'Vision API quota temporarily reached. Please wait a moment and try again.',
        });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ASCEND.OS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ASCEND.OS server:', err);
  process.exit(1);
});
