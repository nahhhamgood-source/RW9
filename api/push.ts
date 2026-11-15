import {
  enforcePostSecurity,
  readJsonBodyWithLimit,
  sendJson,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from './_security.js';

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse): Promise<void> {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || '';
  const pushConfigured = Boolean(publicKey && privateKey);

  if (req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      pushConfigured,
      vapidPublicKey: pushConfigured ? publicKey : null,
      fallback: 'in-app-and-ics',
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  if (!enforcePostSecurity(req, res, 'push', { limitPerMin: 15 })) {
    return;
  }

  if (!pushConfigured) {
    sendJson(res, 503, {
      ok: false,
      code: 'VAPID_NOT_CONFIGURED',
      error: 'Web Push VAPID keys are not configured on this server; using in-app banners and .ics calendar fallback.',
    });
    return;
  }

  try {
    const body = await readJsonBodyWithLimit<{ endpoint?: string }>(req, 16_000);
    if (!body?.endpoint || !body.endpoint.startsWith('https://')) {
      sendJson(res, 400, { ok: false, error: 'Valid HTTPS push subscription endpoint required.' });
      return;
    }
    // Note: without an external persistent DB, stateless serverless acknowledgment keeps no PII on server.
    sendJson(res, 200, {
      ok: true,
      registered: true,
      note: 'Push subscription validated cleanly.',
    });
  } catch (err) {
    sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid push payload.',
    });
  }
}
