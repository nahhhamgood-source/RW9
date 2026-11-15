import { isKillSwitchActive, sendJson, type VercelLikeRequest, type VercelLikeResponse } from './_security.js';

export default function handler(req: VercelLikeRequest, res: VercelLikeResponse): void {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed. Use GET.' });
    return;
  }

  const geminiConfigured = Boolean(
    process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_API_KEY.trim() !== 'MY_GEMINI_API_KEY'
  );
  const pushConfigured = Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim()
  );

  sendJson(res, 200, {
    ok: true,
    status: 'alive',
    services: {
      food: true,
      coach: true,
      geminiConfigured,
      pushConfigured,
      killSwitchActive: isKillSwitchActive(),
    },
  });
}
