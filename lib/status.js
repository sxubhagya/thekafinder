/**
 * Open / closed resolution for a store.
 *
 * Order of truth:
 *   1. Live opening hours for that place (Google Places `currentOpeningHours`
 *      and `businessStatus`). This is the source of record.
 *   2. Crowd votes (last 12 h) override it only when they clearly disagree.
 *   3. Otherwise "Hours unavailable". We never guess 10 AM - 10 PM.
 *
 * Pure functions, no DOM and no network, so the browser and the tests share them.
 */

export const SOON_MINUTES = 30;       // "Closes in N min" window
export const MIN_VOTES = 5;           // votes needed to override live hours
export const MIN_VOTES_NO_HOURS = 3;  // votes needed to speak when we have no hours at all
export const DISAGREE_RATIO = 0.7;    // share of votes that must disagree to override

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Wall-clock parts of `ts` in the place's own time zone (utcOffsetMinutes), or the device's if unknown. */
function localParts(ts, utcOffsetMinutes) {
  const d = new Date(ts);
  if (typeof utcOffsetMinutes !== 'number') {
    return { h: d.getHours(), m: d.getMinutes(), dow: d.getDay(), day: Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 };
  }
  const s = new Date(d.getTime() + utcOffsetMinutes * 60000);
  return { h: s.getUTCHours(), m: s.getUTCMinutes(), dow: s.getUTCDay(), day: Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) / 86400000 };
}

export function formatClock({ h, m }) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

/** "10 PM" today, "tomorrow 10 AM" next day, "Mon 10 AM" beyond that. */
export function whenLabel(ts, now, utcOffsetMinutes) {
  const t = localParts(ts, utcOffsetMinutes);
  const n = localParts(now, utcOffsetMinutes);
  const clock = formatClock(t);
  const diff = t.day - n.day;
  if (diff <= 0) return clock;
  if (diff === 1) return `tomorrow ${clock}`;
  return `${DAYS[t.dow]} ${clock}`;
}

function baseFromHours(hours, now) {
  if (!hours) return null;
  const off = hours.utcOffsetMinutes;

  if (hours.businessStatus === 'CLOSED_PERMANENTLY') {
    return { state: 'closed', tone: 'closed', label: 'Permanently closed', permanent: true };
  }
  if (hours.businessStatus === 'CLOSED_TEMPORARILY') {
    return { state: 'closed', tone: 'closed', label: 'Temporarily closed' };
  }
  if (typeof hours.openNow !== 'boolean') return null;

  if (hours.openNow) {
    const close = hours.nextCloseTime ? Date.parse(hours.nextCloseTime) : NaN;
    if (Number.isNaN(close) || close < now) return { state: 'open', tone: 'open', label: 'Open now' };
    const mins = Math.round((close - now) / 60000);
    if (mins <= SOON_MINUTES) return { state: 'closing', tone: 'closing', label: `Closes in ${Math.max(mins, 1)} min` };
    return { state: 'open', tone: 'open', label: `Open · closes ${whenLabel(close, now, off)}` };
  }

  const open = hours.nextOpenTime ? Date.parse(hours.nextOpenTime) : NaN;
  if (Number.isNaN(open) || open < now) return { state: 'closed', tone: 'closed', label: 'Closed' };
  return { state: 'closed', tone: 'closed', label: `Closed · opens ${whenLabel(open, now, off)}` };
}

/**
 * @param {object}  input
 * @param {object=} input.hours  { openNow, nextOpenTime, nextCloseTime, businessStatus, utcOffsetMinutes }
 * @param {object=} input.votes  { openCount, closedCount, totalCount } for the last 12 h
 * @param {number=} input.now    epoch ms (defaults to Date.now())
 * @returns {{state:string, tone:'open'|'closing'|'closed'|'neutral', source:'google'|'crowd'|'none', label:string}}
 */
export function resolveStatus({ hours = null, votes = null, now = Date.now() } = {}) {
  const base = baseFromHours(hours, now);
  const open = votes?.openCount || 0;
  const closed = votes?.closedCount || 0;
  const total = votes?.totalCount ?? open + closed;

  if (base) {
    if (base.permanent) return { state: base.state, tone: base.tone, source: 'google', label: base.label };
    if (total >= MIN_VOTES) {
      if ((base.tone === 'open' || base.tone === 'closing') && closed / total >= DISAGREE_RATIO) {
        return { state: 'disputed', tone: 'closing', source: 'crowd', label: `Reported closed · ${closed} of ${total}` };
      }
      if (base.tone === 'closed' && open / total >= DISAGREE_RATIO) {
        return { state: 'disputed', tone: 'closing', source: 'crowd', label: `Reported open · ${open} of ${total}` };
      }
    }
    return { state: base.state, tone: base.tone, source: 'google', label: base.label };
  }

  if (total >= MIN_VOTES_NO_HOURS) {
    if (open / total >= 0.6) return { state: 'open', tone: 'open', source: 'crowd', label: `Reported open · ${open} of ${total}` };
    if (closed / total >= 0.6) return { state: 'closed', tone: 'closed', source: 'crowd', label: `Reported closed · ${closed} of ${total}` };
  }
  return { state: 'unknown', tone: 'neutral', source: 'none', label: 'Hours unavailable' };
}
