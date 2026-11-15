import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  enforcePostSecurity,
  readJsonBodyWithLimit,
  redactSecrets,
  sendJson,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from './_security.js';

export const GEMINI_COACH_MODEL = process.env.GEMINI_COACH_MODEL?.trim() || 'gemini-3.1-flash-lite';

export const config = {
  maxDuration: 30,
};

interface CoachRequestBody {
  message?: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  contextSummary?: string;
  isUnder18?: boolean;
}

const COACH_SYSTEM_PROMPT = `You are ASCEND Coach: calm, short, practical, honest about what works and what does not.
Rules:
1. Give realistic, evidence-based guidance on habits, skin basics, sleep, hydration, nutrition, posture, exercise, and staying consistent.
2. Keep replies short (under ~110 words) and include 2-4 crisp bullet points.
3. Suggest at most 2 concrete next actions mapped to ASCEND habits or meals when relevant.
4. Never give medical diagnoses, never judge appearance harshly, and never give eating-disorder or extreme restriction advice.
5. If the user is under 18 / still growing (or asks about severe acne, hair loss, persistent pain, substance dependence, or rapid weight loss), advise talking to a parent, trusted adult, or doctor. Never recommend cutting calories for under-18/growing users.
6. Only state facts grounded in general health science and the user context summary provided.`;

const COACH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'Concise 2-5 word headline for the reply.' },
    reply: { type: Type.STRING, description: 'Calm, practical 1-2 sentence summary.' },
    bullets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Up to 4 short, practical bullet points.',
    },
    moreDetail: { type: Type.STRING, description: 'Short extra note (1-2 sentences).' },
    suggestions: {
      type: Type.ARRAY,
      description: 'At most 2 concrete ASCEND actions.',
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, description: 'Either "task" or "meal".' },
          title: { type: Type.STRING, description: 'Button label (3-6 words).' },
          protocolId: { type: Type.STRING, description: 'Optional protocol ID when type is "task".' },
          calories: { type: Type.NUMBER, description: 'Optional kcal estimate when type is "meal".' },
          proteinG: { type: Type.NUMBER, description: 'Optional protein grams when type is "meal".' },
        },
        required: ['type', 'title'],
      },
    },
    escalateNote: {
      type: Type.STRING,
      description: 'Optional safety reminder to speak with a parent or doctor when needed.',
    },
  },
  required: ['title', 'reply', 'bullets', 'moreDetail', 'suggestions'],
};

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse): Promise<void> {
  if (req.method === 'GET') {
    sendJson(res, 200, { ok: true, status: 'alive', service: 'coach' });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed. Use GET or POST.' });
    return;
  }

  if (!enforcePostSecurity(req, res, 'coach', { limitPerMin: 20 })) {
    return;
  }

  let apiKey = '';
  try {
    const body = await readJsonBodyWithLimit<CoachRequestBody>(req, 64_000);
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 800) : '';
    if (!message) {
      sendJson(res, 400, { ok: false, error: 'Please write a question for the coach.' });
      return;
    }

    apiKey = process.env.GEMINI_API_KEY?.trim() || '';
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      sendJson(res, 503, {
        ok: false,
        code: 'MISSING_API_KEY',
        error: 'Online coach key is not set on server; using local offline coach instead.',
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

    const historyText = Array.isArray(body.history)
      ? body.history
          .slice(-4)
          .map((h) => `${h.role === 'user' ? 'User' : 'Coach'}: ${String(h.text || '').slice(0, 240)}`)
          .join('\n')
      : '';

    const contextSummary =
      typeof body.contextSummary === 'string' ? body.contextSummary.trim().slice(0, 1400) : '';

    const userPrompt = [
      body.isUnder18 ? 'IMPORTANT SAFETY FLAG: User is under 18 or still growing.' : '',
      contextSummary ? `User local context summary:\n${contextSummary}` : '',
      historyText ? `Recent chat:\n${historyText}` : '',
      `User question: ${message}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 16_000);

    let response;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_COACH_MODEL,
        contents: { parts: [{ text: userPrompt }] },
        config: {
          abortSignal: controller.signal,
          thinkingConfig: {
            thinkingLevel: GEMINI_COACH_MODEL.includes('flash-lite')
              ? ThinkingLevel.MINIMAL
              : ThinkingLevel.LOW,
          },
          systemInstruction: COACH_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: COACH_RESPONSE_SCHEMA,
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    const raw = (response.text ?? '').trim();
    if (!raw) {
      sendJson(res, 502, { ok: false, error: 'Coach returned an empty reply.' });
      return;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 4)
      : [];
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.slice(0, 2).map((s: Record<string, unknown>) => ({
          type: s.type === 'meal' ? 'meal' : 'task',
          title: String(s.title || 'Add action').trim(),
          protocolId: typeof s.protocolId === 'string' ? s.protocolId.trim() : undefined,
          calories: typeof s.calories === 'number' ? Math.max(0, Math.round(s.calories)) : undefined,
          proteinG: typeof s.proteinG === 'number' ? Math.max(0, Math.round(s.proteinG)) : undefined,
        }))
      : [];

    sendJson(res, 200, {
      ok: true,
      data: {
        title: String(parsed.title || 'Coach Reply').trim(),
        reply: String(parsed.reply || '').trim(),
        bullets,
        moreDetail: String(parsed.moreDetail || '').trim(),
        suggestions,
        escalateNote:
          typeof parsed.escalateNote === 'string' && parsed.escalateNote.trim()
            ? parsed.escalateNote.trim()
            : undefined,
      },
    });
  } catch (err) {
    const rawDetail = redactSecrets(err instanceof Error ? err.message : String(err), apiKey);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    sendJson(res, isTimeout ? 504 : 500, {
      ok: false,
      error: isTimeout ? 'Online coach timed out; switched to offline mode.' : 'Online coach request failed.',
      detail: rawDetail,
    });
  }
}
