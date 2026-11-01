import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKGROUND_DEFAULT_MS, IDLE_DEFAULT_MS, MAX_RECENT, cleanSettings, defaultSettings, isTouchDevice, lockTimes, pushRecent } from '../src/public/js/settings.js';

test('KM-004 AC07 defaults: 10 minutes idle, 60 seconds in the background', () => {
  assert.equal(IDLE_DEFAULT_MS, 600000);
  assert.equal(BACKGROUND_DEFAULT_MS, 60000);
  assert.deepEqual(cleanSettings(null), defaultSettings());
});

test('KM-004 AC07 a damaged value falls back to the default rather than weakening the lock', () => {
  for (const bad of [undefined, null, 'x', -1, 0.5, Infinity, NaN, 1e12, 61000, '60000', {}]) {
    const s = cleanSettings({ idleMs: bad, backgroundMs: bad === 0 ? 1 : bad });
    assert.equal(s.idleMs, IDLE_DEFAULT_MS, String(bad));
    assert.equal(s.backgroundMs, BACKGROUND_DEFAULT_MS, String(bad));
  }
  for (const raw of ['x', 7, [], true]) assert.deepEqual(cleanSettings(raw), defaultSettings());
});

test('KM-004 AC07 valid choices are kept, including locking at once', () => {
  assert.deepEqual(cleanSettings({ idleMs: 60000, backgroundMs: 0, recents: ['a'] }), { idleMs: 60000, backgroundMs: 0, recents: ['a'] });
});

test('KM-004 AC12 recents from disk: only non-empty strings, no repeats, at most 5', () => {
  assert.deepEqual(cleanSettings({ recents: 'x' }).recents, []);
  assert.deepEqual(cleanSettings({ recents: [1, null, '', 'a', 'a', 'b', {}] }).recents, ['a', 'b']);
  assert.equal(cleanSettings({ recents: ['1', '2', '3', '4', '5', '6', '7'] }).recents.length, MAX_RECENT);
});

test('KM-004 AC12 pushRecent puts the id first, moves a repeat, keeps at most 5, leaves the input alone', () => {
  const input = ['a', 'b'];
  assert.deepEqual(pushRecent(input, 'c'), ['c', 'a', 'b']);
  assert.deepEqual(input, ['a', 'b']);
  assert.deepEqual(pushRecent(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
  assert.deepEqual(pushRecent(['1', '2', '3', '4', '5'], '6'), ['6', '1', '2', '3', '4']);
});

test('KM-004 AC06 AC07 touch uses the background rule, computers the idle rule (F-AUTH-11)', () => {
  const s = { idleMs: 60000, backgroundMs: 15000, recents: [] };
  assert.deepEqual(lockTimes(s, true), { idleMs: IDLE_DEFAULT_MS, backgroundMs: 15000 });
  assert.deepEqual(lockTimes(s, false), { idleMs: 60000, backgroundMs: null });
});

test('KM-004 touch is decided by input type, and a browser without matchMedia counts as a computer', () => {
  assert.equal(isTouchDevice({ matchMedia: (q) => ({ matches: q === '(hover: none) and (pointer: coarse)' }) }), true);
  assert.equal(isTouchDevice({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(isTouchDevice({}), false);
});
