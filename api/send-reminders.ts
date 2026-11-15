import { sendJson, type VercelLikeRequest, type VercelLikeResponse } from './_security.js';

export default function handler(req: VercelLikeRequest, res: VercelLikeResponse): void {
  if (req.method !== 'POST' && req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${cronSecret}`) {
      sendJson(res, 401, { ok: false, error: 'Unauthorized cron trigger.' });
      return;
    }
  }

  const pushConfigured = Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim()
  );
  if (!pushConfigured) {
    sendJson(res, 503, {
      ok: false,
      code: 'VAPID_NOT_CONFIGURED',
      error: 'Web Push VAPID keys not configured on server; reminders run locally via in-app scheduler & .ics export.',
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    sent: 0,
    note: 'Generic check-in dispatcher ready (no private habit titles transmitted).',
  });
}
