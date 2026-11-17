/**
 * Vercel Serverless Function: GET /api/places?lat=..&lon=..
 *
 * Nearby Search on the server so the Google key never reaches the browser.
 *
 * Changes from the first version:
 *  - rankby=distance, so the nearest stores come back first. The default
 *    (prominence) can leave the genuinely nearest shop out of the 20 results
 *    in a dense city. Google does not allow `radius` together with
 *    rankby=distance, so the client filters by distance itself.
 *  - lat/lon are validated numbers (they used to be pasted into the URL as-is).
 *  - Permanently closed places are dropped; temporarily closed ones are flagged.
 *  - No CORS headers: only this site's own pages call this endpoint.
 */
import { getClientIp, createRateLimiter, boundedNumber } from '../lib/http.js';

const isLimited = createRateLimiter({ windowMs: 60 * 1000, max: 20 });

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed. Use GET.' });
  }

  const ip = getClientIp(req);
  if (isLimited(ip)) {
    console.warn(`Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({ error: 'Too Many Requests', message: 'Rate limit exceeded. Please wait a minute before making more requests.' });
  }

  const lat = boundedNumber(req.query?.lat, -90, 90);
  const lon = boundedNumber(req.query?.lon, -180, 180);
  if (lat === null || lon === null) {
    return res.status(400).json({ error: 'lat and lon must be valid coordinates.' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('Google Places API key is missing on the server.');
    return res.status(503).json({ error: 'Google Places API key is not configured on this server.', fallback: true, results: [] });
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${lat},${lon}`);
    url.searchParams.set('rankby', 'distance');
    url.searchParams.set('type', 'liquor_store');
    url.searchParams.set('key', apiKey);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google Maps API responded with HTTP status ${response.status}`);
    const data = await response.json();

    if (data.status === 'ZERO_RESULTS') return res.status(200).json({ results: [] });
    if (data.status !== 'OK') {
      console.error(`Google Places API error: ${data.status} - ${data.error_message || 'No details provided'}`);
      return res.status(500).json({ error: `Google Places API request failed with status: ${data.status}`, message: data.error_message || 'Internal API restriction or quota issue.', fallback: true, results: [] });
    }

    const results = (data.results || [])
      .filter((place) => place.business_status !== 'CLOSED_PERMANENTLY')
      .map((place) => ({
        id: place.place_id,
        name: place.name || 'Liquor Store',
        lat: place.geometry?.location?.lat,
        lon: place.geometry?.location?.lng,
        address: place.vicinity || 'Coordinates locked',
        openNow: place.opening_hours?.open_now,
        businessStatus: place.business_status,
        source: 'Google Maps',
      }))
      .filter((place) => place.lat !== undefined && place.lon !== undefined);

    return res.status(200).json({ results });
  } catch (error) {
    console.error('Serverless function error fetching Google Places:', error);
    return res.status(500).json({ error: 'Failed to fetch coordinates from Google Places.', message: error.message, fallback: true, results: [] });
  }
}
