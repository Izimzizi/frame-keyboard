import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShift } from '../src/shift.js';
import { PAGES } from '../src/layout.js';
import { normalizeSettings } from '../src/settings.js';

test('shift: tap once is one capital', () => {
  const s = createShift();
  assert.equal(s.tap(0), 'once');
  assert.equal(s.apply('a'), 'A');
  assert.equal(s.state, 'off');
  assert.equal(s.apply('b'), 'b');
});

test('shift: double tap locks, tap again unlocks', () => {
  const s = createShift();
  s.tap(1000);
  assert.equal(s.tap(1200), 'lock');
  assert.equal(s.apply('a'), 'A');
  assert.equal(s.apply('b'), 'B');
  assert.equal(s.tap(5000), 'off');
});

test('shift: a slow second tap turns shift off', () => {
  const s = createShift();
  s.tap(0);
  assert.equal(s.tap(2000), 'off');
});

test('layout: QWERTY is the only page and has 5 rows', () => {
  assert.deepEqual(Object.keys(PAGES), ['qwerty']);
  assert.equal(PAGES.qwerty.length, 5);
  for (const row of PAGES.qwerty) {
    for (const key of row) assert.ok(key.w > 0, key.id);
  }
});

test('settings: defaults, and unknown or mistyped values are dropped', () => {
  assert.equal(normalizeSettings({}).sound, true);
  assert.equal(normalizeSettings({ sound: false }).sound, false);
  assert.equal(normalizeSettings({ sound: 'no' }).sound, true);
  assert.equal(normalizeSettings({ metaCode: 227 }).metaCode, 227);
  assert.equal('conversion' in normalizeSettings({ conversion: false }), false);
  assert.equal(normalizeSettings(null).autoCapitalize, false);
});
