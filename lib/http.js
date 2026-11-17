/**
 * Small helpers shared by the serverless functions in /api.
 * (Kept outside /api so Vercel does not turn them into routes.)
 */

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown-ip';
}

/**
 * Sliding-window rate limiter. In-memory, so it is per warm serverless
 * instance: a best-effort brake, not a hard guarantee. Stale IPs are swept
 * so the map cannot grow forever.
 */
export function createRateLimiter({ windowMs = 60 * 1000, max = 20 } = {}) {
  const hits = new Map();
  let lastSweep = Date.now();
  return function isLimited(ip) {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [key, stamps] of hits) {
        if (!stamps.length || now - stamps[stamps.length - 1] >= windowMs) hits.delete(key);
      }
      lastSweep = now;
    }
    const stamps = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    stamps.push(now);
    hits.set(ip, stamps);
    return stamps.length > max;
  };
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** Trimmed string capped at `max` characters, or '' if it is not a string. */
export const clampStr = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Finite number inside [min, max], else null. */
export function boundedNumber(value, min, max) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
