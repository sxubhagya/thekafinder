/**
 * Vercel Serverless Function: GET /api/places
 * Queries the Google Places API Nearby Search securely on the backend.
 * Keeps the Google Maps API key hidden from frontend users.
 */

// Global cache to track request rates per IP in warm serverless containers
const ipCache = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 20; // Maximum 20 requests per minute per IP

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown-ip';
}

function isRateLimited(ip) {
  const now = Date.now();
  if (!ipCache.has(ip)) {
    ipCache.set(ip, []);
  }
  
  // Filter timestamps to only keep those within the rate limit window
  const timestamps = ipCache.get(ip).filter(time => now - time < RATE_LIMIT_WINDOW);
  timestamps.push(now);
  ipCache.set(ip, timestamps);
  
  return timestamps.length > MAX_REQUESTS;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed. Use GET.' });
  }

  // Apply IP-based Rate Limiting
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    console.warn(`Rate limit exceeded for IP: ${clientIp}`);
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please wait a minute before making more requests.'
    });
  }

  const { lat, lon, radius } = req.query;

  // Validate parameters
  if (!lat || !lon) {
    return res.status(400).json({
      error: 'Missing required query parameters: lat and lon must be specified.'
    });
  }

  const searchRadius = radius ? parseInt(radius, 10) : 5000;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  // Check if API key is configured
  if (!apiKey) {
    console.warn('Google Places API key is missing on the server.');
    return res.status(503).json({
      error: 'Google Places API key is not configured on this server.',
      fallback: true,
      results: []
    });
  }

  try {
    // Construct Google Places Nearby Search URL
    const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${searchRadius}&type=liquor_store&key=${apiKey}`;

    const response = await fetch(googleUrl);
    if (!response.ok) {
      throw new Error(`Google Maps API responded with HTTP status ${response.status}`);
    }

    const data = await response.json();

    // Check status returned in response body
    if (data.status === 'ZERO_RESULTS') {
      return res.status(200).json({ results: [] });
    }

    if (data.status !== 'OK') {
      console.error(`Google Places API error: ${data.status} - ${data.error_message || 'No details provided'}`);
      return res.status(500).json({
        error: `Google Places API request failed with status: ${data.status}`,
        message: data.error_message || 'Internal API restriction or quota issue.',
        fallback: true,
        results: []
      });
    }

    // Map and normalize Google Places API response to our app's structure
    const results = (data.results || []).map(place => {
      return {
        id: place.place_id,
        name: place.name || 'Liquor Store',
        lat: place.geometry?.location?.lat,
        lon: place.geometry?.location?.lng,
        address: place.vicinity || 'Coordinates locked',
        openNow: place.opening_hours?.open_now,
        source: 'Google Maps'
      };
    }).filter(place => place.lat !== undefined && place.lon !== undefined);

    return res.status(200).json({ results });

  } catch (error) {
    console.error('Serverless function error fetching Google Places:', error);
    return res.status(500).json({
      error: 'Failed to fetch coordinates from Google Places.',
      message: error.message,
      fallback: true,
      results: []
    });
  }
}
