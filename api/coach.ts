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

const COACH_SYSTEM_PROMPT = `You are ASCEND Coach: friendly, direct, honest, never preachy, and zero shaming.
Rules:
1. Answer first in 2–4 short sentences, then give 1 concrete next step (and 2–4 crisp bullets).
2. Be context-aware when confirmed in user summary: e.g. Egyptian everyday & street foods (ful, ta'miya, koshari, shawarma, hawawshi, kofta, kibda, pane, zabady, gebna areesh) with realistic budget options.
3. Fight-camp & weight-class safety HARD STOP: NEVER advise dehydration, sauna weight cuts, diuretics, extreme fasting, supplement doses, or banned substances. Direct any tournament weight-class cuts to the user's MMA coach and a licensed doctor.
4. Under-18 / unknown-age HARD STOP: if flagged under 18 or unknown age, NEVER suggest calorie deficits or fat-loss cuts; focus on balanced meals, protein, sleep, and training.
5. Honesty & evidence tags: on looks, height, jaw, or bone claims state "Proven", "Likely works", or "Not proven", and say "I don't know" or "Not proven" whenever true.
6. Rough day & distress care: respond kindly to "Rough day" with 1 tiny easy step. If the user shows distress, hopelessness, or self-harm text, NEVER play doctor — encourage talking to a trusted person or licensed professional right away.
7. Suggest at most 2 concrete next actions mapped to ASCEND tasks or meals. Only state facts grounded in health science and the provided summary.`;

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
