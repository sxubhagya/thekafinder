/**
 * Vercel Serverless Function: GET /api/place-hours?place_id=...
 *
 * Live opening hours for ONE place, from Places API (New) Place Details.
 * The browser calls this only for the store the compass is locked on, and
 * responses are cached at the edge for 5 minutes, so cost stays small.
 *
 * Response: { hours: { openNow, nextOpenTime, nextCloseTime } | null,
 *             businessStatus, utcOffsetMinutes }
 * `hours` is null when Google has no hours for the place (the client then
 * shows "Hours unavailable" and falls back to crowd votes).
 */
import { getClientIp, createRateLimiter } from '../lib/http.js';

const isLimited = createRateLimiter({ windowMs: 60 * 1000, max: 30 });
const PLACE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const FIELDS = 'businessStatus,currentOpeningHours,utcOffsetMinutes';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed. Use GET.' });
  }

  if (isLimited(getClientIp(req))) {
    return res.status(429).json({ error: 'Too Many Requests', message: 'Rate limit exceeded. Please wait a minute.' });
  }

  const placeId = String(req.query?.place_id || '');
  if (!PLACE_ID.test(placeId)) {
    return res.status(400).json({ error: 'place_id is missing or malformed.' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Google Places API key is not configured on this server.', hours: null });
  }

  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELDS },
    });

    if (response.status === 404) return res.status(200).json({ hours: null });
    if (!response.ok) {
      console.error('Place Details error', response.status, await response.text().catch(() => ''));
      return res.status(502).json({ error: 'Failed to fetch place hours.', hours: null });
    }

    const place = await response.json();
    const cur = place.currentOpeningHours;
    const hours = cur && typeof cur.openNow === 'boolean'
      ? { openNow: cur.openNow, nextOpenTime: cur.nextOpenTime || null, nextCloseTime: cur.nextCloseTime || null }
      : null;

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      hours,
      businessStatus: place.businessStatus || null,
      utcOffsetMinutes: typeof place.utcOffsetMinutes === 'number' ? place.utcOffsetMinutes : null,
    });
  } catch (error) {
    console.error('place-hours error:', error);
    return res.status(502).json({ error: 'Failed to fetch place hours.', hours: null });
  }
}
