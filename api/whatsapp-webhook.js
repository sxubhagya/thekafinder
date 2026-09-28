import crypto from 'crypto';

// In-memory rate limiting cache for serverless container instances
const phoneRateLimitCache = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MIN = 5; // Max 5 messages per minute per phone number

/**
 * Validates Meta HMAC SHA-256 signature against WHATSAPP_APP_SECRET
 */
function verifySignature(req, rawBody) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    // If not configured in development, skip verification
    return true;
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return false;
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

/**
 * Checks if a specific phone number is sending too many requests
 */
function isRateLimited(phoneNumber) {
  const now = Date.now();
  if (!phoneRateLimitCache.has(phoneNumber)) {
    phoneRateLimitCache.set(phoneNumber, []);
  }

  const timestamps = phoneRateLimitCache.get(phoneNumber).filter(t => now - t < RATE_LIMIT_WINDOW);
  timestamps.push(now);
  phoneRateLimitCache.set(phoneNumber, timestamps);

  return timestamps.length > MAX_REQUESTS_PER_MIN;
}

/**
 * Haversine formula to compute distance in meters between two coordinates
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Searches for the nearest liquor store using Google Places API or OpenStreetMap fallback
 */
async function findNearestLiquorStore(lat, lon) {
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

  // 1. Try Google Places Nearby Search if configured
  if (googleApiKey) {
    try {
      const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=5000&type=liquor_store&key=${googleApiKey}`;
      const res = await fetch(googleUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const stores = data.results.map(place => ({
            name: place.name || 'Liquor Store',
            address: place.vicinity || 'Nearby',
            lat: place.geometry?.location?.lat,
            lon: place.geometry?.location?.lng,
            openNow: place.opening_hours?.open_now,
            distance: calculateHaversineDistance(lat, lon, place.geometry?.location?.lat, place.geometry?.location?.lng)
          })).sort((a, b) => a.distance - b.distance);

          if (stores.length > 0) {
            return stores[0];
          }
        }
      }
    } catch (err) {
      console.warn('Google Places API search failed in WhatsApp bot, falling back to OSM:', err);
    }
  }

  // 2. OpenStreetMap Overpass API Fallback
  try {
    const osmEndpoint = 'https://overpass-api.de/api/interpreter';
    const query = `[out:json][timeout:10];
      (
        node["shop"="alcohol"](around:5000,${lat},${lon});
        node["shop"="wine"](around:5000,${lat},${lon});
        node["shop"="liquor"](around:5000,${lat},${lon});
        node["shop"="beverages"]["alcohol"="yes"](around:5000,${lat},${lon});
      );
      out body 10;`;

    const osmRes = await fetch(osmEndpoint, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (osmRes.ok) {
      const data = await osmRes.json();
      if (data.elements && data.elements.length > 0) {
        const stores = data.elements.map(el => ({
          name: el.tags?.name || 'Local Wine & Beer Shop',
          address: el.tags?.['addr:street'] || el.tags?.['addr:suburb'] || 'Near your coordinates',
          lat: el.lat,
          lon: el.lon,
          openNow: undefined,
          distance: calculateHaversineDistance(lat, lon, el.lat, el.lon)
        })).sort((a, b) => a.distance - b.distance);

        if (stores.length > 0) {
          return stores[0];
        }
      }
    }
  } catch (osmErr) {
    console.warn('OSM search also failed in WhatsApp bot:', osmErr);
  }

  return null;
}

/**
 * Sends a message via Meta WhatsApp Cloud API
 */
async function sendWhatsAppMessage(to, messagePayload) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.warn('WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing in environment variables.');
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      ...messagePayload
    })
  });
}

/**
 * Main Webhook Handler
 */
export default async function handler(req, res) {
  // --- 1. GET: Meta Webhook Verification Handshake ---
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'theka_finder_verify_token';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('WhatsApp Webhook successfully verified with Meta.');
      return res.status(200).send(challenge);
    } else {
      console.warn('WhatsApp Webhook verification failed. Token mismatch.');
      return res.status(403).json({ error: 'Verification token mismatch' });
    }
  }

  // --- 2. POST: Handle Incoming WhatsApp Messages ---
  if (req.method === 'POST') {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    // Cryptographic Signature Security Check
    if (!verifySignature(req, rawBody)) {
      console.error('Invalid WhatsApp X-Hub-Signature-256 header.');
      return res.status(403).json({ error: 'Invalid HMAC signature' });
    }

    const body = req.body;

    // Check if this event contains incoming messages
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) {
      // Could be message delivery receipts (sent, delivered, read) - acknowledge with 200 OK
      return res.status(200).json({ status: 'ok' });
    }

    const from = message.from; // Sender phone number
    const messageType = message.type;

    // Apply per-phone rate limiting
    if (isRateLimited(from)) {
      console.warn(`Rate limit triggered for WhatsApp sender: ${from}`);
      await sendWhatsAppMessage(from, {
        type: 'text',
        text: {
          body: "Bhai saans lele thoda! ⏳ You're sending requests too fast. Try again in 60 seconds."
        }
      });
      return res.status(200).json({ status: 'rate_limited' });
    }

    // --- CASE A: User sent a Location Pin ---
    if (messageType === 'location') {
      const lat = message.location?.latitude;
      const lon = message.location?.longitude;

      if (!lat || !lon) {
        await sendWhatsAppMessage(from, {
          type: 'text',
          text: { body: "Couldn't read coordinates from that pin. Please try sharing location again! 📍" }
        });
        return res.status(200).json({ status: 'missing_coords' });
      }

      const nearestTheka = await findNearestLiquorStore(lat, lon);

      if (!nearestTheka) {
        await sendWhatsAppMessage(from, {
          type: 'text',
          text: {
            body: "🌵 Oops! No verified thekas or liquor stores found within 5km of your location. You might be in a dry zone or remote area.\n\nOpen the WebApp to check: https://thekafinder.vercel.app"
          }
        });
        return res.status(200).json({ status: 'no_stores_found' });
      }

      // Calculations
      const steps = Math.round(nearestTheka.distance / 0.76);
      const walkMins = Math.max(1, Math.round(nearestTheka.distance / 80));
      const gmapsLink = `https://www.google.com/maps/dir/?api=1&destination=${nearestTheka.lat},${nearestTheka.lon}`;
      const uberLink = `https://m.uber.com/ul/?client_id=CschlSNhiPzFV_VMeToCbrthhALuYkjyD_Ew0GCT&action=setPickup&pickup=my_location&dropoff[latitude]=${nearestTheka.lat}&dropoff[longitude]=${nearestTheka.lon}&dropoff[nickname]=${encodeURIComponent(nearestTheka.name)}`;
      const compassLink = `https://thekafinder.vercel.app`;

      const responseText = `📍 *Nearest Theka Locked!* 🍻\n\n` +
        `🏪 *${nearestTheka.name}*\n` +
        `📍 ${nearestTheka.address}\n` +
        `📏 *${nearestTheka.distance} meters away* (~${steps} steps • ${walkMins} min walk)\n` +
        `${nearestTheka.openNow === true ? '🟢 *Status:* Open Now\n' : ''}` +
        `\n👇 *Quick Actions:*\n` +
        `🧭 *Live Compass:* ${compassLink}\n` +
        `🗺️ *Google Maps:* ${gmapsLink}\n` +
        `🚖 *Book Cab (Uber):* ${uberLink}\n\n` +
        `_Drinking and driving is a strict NO. Enjoy responsibly!_ 🍺`;

      await sendWhatsAppMessage(from, {
        type: 'text',
        text: { body: responseText }
      });

      return res.status(200).json({ status: 'location_processed' });
    }

    // --- CASE B: User sent a Text Query ---
    if (messageType === 'text') {
      const rawText = (message.text?.body || '').trim().toLowerCase();

      // Guardrail: Drop long text (>200 chars) to prevent prompt injection or spam
      if (rawText.length > 200) {
        await sendWhatsAppMessage(from, {
          type: 'text',
          text: { body: "Bhai itna lamba text? 😅 Just drop your WhatsApp location pin to find the nearest theka!" }
        });
        return res.status(200).json({ status: 'text_too_long' });
      }

      // Check greetings
      const isGreeting = /^(hi|hello|hey|yo|sup|namaste|pranam|ram ram|kese ho|help|start)\b/i.test(rawText);
      const isThekaQuery = /(theka|theke|beer|daaru|daru|wine|alcohol|sharaab|sharba|liquor|whisky|scotch|vodka|rum|tasmac|bevco|ahata|pegg|bottle)/i.test(rawText);
      const isPunjabi = /(kithe|veere|paji|daaru kithe|theka kithe)/i.test(rawText);

      let reply = '';
      if (isPunjabi) {
        reply = "Veere tension na le! 🍻 Thalle '+' ya '📎' dabake apni location bhejo, jithe vadiya theka hou othe da rasta kadh ke dinda! 🧭";
      } else if (isThekaQuery) {
        reply = "Bhai daaru ka jugaad ho jayega! 🍻 Par bina location ke compass kaise ghumega? 🧭\n\nNeeche '+' ya '📎' dabao -> *Location* -> *'Send your current location'* bhejo, sabse nazdeek wala theka dhoond ke deta hoon! 🏃‍♂️";
      } else if (isGreeting) {
        reply = "Yo! 🍻 Theka Finder bot at your service.\n\nLooking for the nearest chilled beer or liquor store? Just tap the 📎 (attachment) or '+' icon -> *Location* -> *'Send your current location'* and I'll point you straight to it! 🧭";
      } else {
        reply = "Bhai theka dhoondna hai? 🍻 Apni location share karo (Tap '+' or '📎' -> Location) aur compass direction lelo! 🧭";
      }

      await sendWhatsAppMessage(from, {
        type: 'text',
        text: { body: reply }
      });

      return res.status(200).json({ status: 'text_processed' });
    }

    // Default response for unhandled message types (stickers, audio, media)
    await sendWhatsAppMessage(from, {
      type: 'text',
      text: { body: "Bhai bas apni Location pin bhejo (📎 -> Location) to find the nearest theka! 🍻" }
    });

    return res.status(200).json({ status: 'media_ignored' });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
