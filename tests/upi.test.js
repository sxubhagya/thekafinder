import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUpiLink, normalizeAmount, UPI_PRESETS } from '../lib/upi.js';

test('builds a payee link with amount, name and note', () => {
  const link = buildUpiLink({ vpa: '9058309001@superyes', name: 'Soubhagya', amount: 100, note: 'Theka Finder' });
  assert.equal(link, 'upi://pay?pa=9058309001@superyes&pn=Soubhagya&am=100&cu=INR&tn=Theka%20Finder');
});

test('omits the amount when none is given so the payer can type their own', () => {
  const link = buildUpiLink({ vpa: 'a.b@okaxis', name: 'X' });
  assert.ok(!link.includes('am='));
  assert.ok(link.includes('cu=INR'));
});

test('rejects fractional, zero, negative and absurd amounts', () => {
  for (const bad of [0, -5, 1.5, 100001, 'abc', NaN, null, undefined]) assert.equal(normalizeAmount(bad), null);
  assert.equal(normalizeAmount('200'), 200);
});

test('rejects an invalid UPI address instead of building a link to nowhere', () => {
  assert.throws(() => buildUpiLink({ vpa: 'not a vpa' }));
  assert.throws(() => buildUpiLink({ vpa: '' }));
  assert.throws(() => buildUpiLink({ vpa: 'a@b&am=1' }));
});

test('encodes names so extra parameters cannot be smuggled in', () => {
  const link = buildUpiLink({ vpa: 'a.b@okaxis', name: 'Sou&am=999', amount: 50 });
  assert.equal((link.match(/am=/g) || []).length, 1);
  assert.ok(link.includes('am=50'));
});

test('presets are valid amounts', () => {
  for (const p of UPI_PRESETS) assert.equal(normalizeAmount(p), p);
});
