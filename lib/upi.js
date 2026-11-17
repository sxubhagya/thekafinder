/**
 * UPI payment links. A `upi://pay` URL opens the payer's UPI app on a phone and is also what a
 * UPI QR code encodes, so one builder serves the "tap to pay" link and the QR.
 * Spec: NPCI UPI Linking Specification (pa, pn, am, cu, tn).
 */

export const UPI_PRESETS = [50, 100, 200];

/** Accepts a whole number of rupees between 1 and 100000; anything else means "no preset amount". */
export function normalizeAmount(amount) {
  const n = Number(amount);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : null;
}

/**
 * @param {{vpa: string, name?: string, amount?: number|string|null, note?: string}} p
 * @returns {string} upi://pay?... link; the amount is omitted when it is not a valid whole number
 */
export function buildUpiLink({ vpa, name = '', amount = null, note = '' }) {
  if (!/^[\w.\-]{2,256}@[A-Za-z][\w.\-]{1,64}$/.test(vpa || '')) throw new Error('Invalid UPI address');
  const params = [`pa=${encodeURIComponent(vpa).replace(/%40/g, '@')}`];
  if (name) params.push(`pn=${encodeURIComponent(name)}`);
  const am = normalizeAmount(amount);
  if (am !== null) params.push(`am=${am}`);
  params.push('cu=INR');
  if (note) params.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${params.join('&')}`;
}
