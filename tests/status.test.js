import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStatus, whenLabel } from '../lib/status.js';

// 2026-11-17 15:30 in IST (UTC+5:30)  ==  10:00 UTC
const NOW = Date.parse('2026-11-17T10:00:00Z');
const IST = 330;
const at = (iso) => iso; // readability

test('open with a distant close time shows the close time in the place’s time zone', () => {
  const s = resolveStatus({ now: NOW, hours: { openNow: true, nextCloseTime: at('2026-11-17T16:30:00Z'), utcOffsetMinutes: IST } });
  assert.equal(s.label, 'Open · closes 10 PM');
  assert.equal(s.tone, 'open');
  assert.equal(s.source, 'google');
});

test('closes within 30 minutes becomes "closing"', () => {
  const s = resolveStatus({ now: NOW, hours: { openNow: true, nextCloseTime: at('2026-11-17T10:18:00Z'), utcOffsetMinutes: IST } });
  assert.equal(s.state, 'closing');
  assert.equal(s.label, 'Closes in 18 min');
  assert.equal(s.tone, 'closing');
});

test('closed shows when it next opens, with "tomorrow" for the next local day', () => {
  const s = resolveStatus({ now: NOW, hours: { openNow: false, nextOpenTime: at('2026-11-18T04:30:00Z'), utcOffsetMinutes: IST } });
  assert.equal(s.label, 'Closed · opens tomorrow 10 AM');
  assert.equal(s.tone, 'closed');
});

test('closed and opening later the same local day shows just the time', () => {
  const s = resolveStatus({ now: Date.parse('2026-11-17T02:00:00Z'), hours: { openNow: false, nextOpenTime: at('2026-11-17T04:30:00Z'), utcOffsetMinutes: IST } });
  assert.equal(s.label, 'Closed · opens 10 AM');
});

test('open flag without times still says open', () => {
  assert.equal(resolveStatus({ now: NOW, hours: { openNow: true } }).label, 'Open now');
  assert.equal(resolveStatus({ now: NOW, hours: { openNow: false } }).label, 'Closed');
});

test('permanently closed wins over everything, even strong crowd votes', () => {
  const s = resolveStatus({ now: NOW, hours: { businessStatus: 'CLOSED_PERMANENTLY', openNow: true }, votes: { openCount: 20, closedCount: 0 } });
  assert.equal(s.label, 'Permanently closed');
  assert.equal(s.tone, 'closed');
});

test('temporarily closed is closed', () => {
  assert.equal(resolveStatus({ now: NOW, hours: { businessStatus: 'CLOSED_TEMPORARILY', openNow: true } }).label, 'Temporarily closed');
});

test('crowd overrides live "open" only with enough votes and a clear majority', () => {
  const hours = { openNow: true, nextCloseTime: at('2026-11-17T16:30:00Z'), utcOffsetMinutes: IST };
  const s = resolveStatus({ now: NOW, hours, votes: { openCount: 3, closedCount: 9 } });
  assert.equal(s.state, 'disputed');
  assert.equal(s.label, 'Reported closed · 9 of 12');
  assert.equal(s.source, 'crowd');
});

test('crowd does not override on a weak signal', () => {
  const hours = { openNow: true, nextCloseTime: at('2026-11-17T16:30:00Z'), utcOffsetMinutes: IST };
  assert.equal(resolveStatus({ now: NOW, hours, votes: { openCount: 1, closedCount: 3 } }).source, 'google', 'only 4 votes');
  assert.equal(resolveStatus({ now: NOW, hours, votes: { openCount: 4, closedCount: 6 } }).source, 'google', '60% is not a clear majority');
});

test('crowd can correct "closed" when it clearly says open', () => {
  const s = resolveStatus({ now: NOW, hours: { openNow: false }, votes: { openCount: 8, closedCount: 1 } });
  assert.equal(s.label, 'Reported open · 8 of 9');
});

test('no hours and no votes is "Hours unavailable", never a guess', () => {
  const s = resolveStatus({ now: NOW });
  assert.equal(s.label, 'Hours unavailable');
  assert.equal(s.tone, 'neutral');
  assert.equal(s.source, 'none');
});

test('no hours but a few agreeing votes speaks for the crowd', () => {
  assert.equal(resolveStatus({ now: NOW, votes: { openCount: 3, closedCount: 0 } }).label, 'Reported open · 3 of 3');
  assert.equal(resolveStatus({ now: NOW, votes: { openCount: 1, closedCount: 1 } }).label, 'Hours unavailable');
});

test('whenLabel falls back to a weekday beyond tomorrow', () => {
  // Fri 2026-11-20 10:00 IST
  assert.equal(whenLabel(Date.parse('2026-11-20T04:30:00Z'), NOW, IST), 'Fri 10 AM');
});

test('time formatting keeps minutes only when non-zero', () => {
  const s = resolveStatus({ now: NOW, hours: { openNow: true, nextCloseTime: at('2026-11-17T17:00:00Z'), utcOffsetMinutes: IST } });
  assert.equal(s.label, 'Open · closes 10:30 PM');
});
