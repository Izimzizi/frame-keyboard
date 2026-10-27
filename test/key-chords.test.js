import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIPBOARD_CHORDS, MODIFIER_CODES, createModifiers, keyForChar, keyForName, planChord, setMetaCode } from '../src/key-chords.js';
import { planCalls } from '../src/output-plan.js';
import { releaseHeldKeys, sendKeyEvents } from '../src/steam.js';
import { PAGES, hasFlickGuide } from '../src/layout.js';

test('chords: letters, digits and US punctuation map to their keys', () => {
  assert.deepEqual(keyForChar('a'), { code: 4, shift: false });
  assert.deepEqual(keyForChar('z'), { code: 29, shift: false });
  assert.deepEqual(keyForChar('Z'), { code: 29, shift: true });
  assert.deepEqual(keyForChar('1'), { code: 30, shift: false });
  assert.deepEqual(keyForChar('0'), { code: 39, shift: false });
  assert.deepEqual(keyForChar('!'), { code: 30, shift: true });
  assert.deepEqual(keyForChar('/'), { code: 56, shift: false });
  assert.deepEqual(keyForChar('?'), { code: 56, shift: true });
  assert.equal(keyForChar('€'), null);
  assert.equal(keyForChar('あ'), null);
  assert.equal(keyForChar('ab'), null);
  assert.deepEqual(keyForName('Escape'), { code: 41, shift: false });
  assert.deepEqual(keyForName('Tab'), { code: 43, shift: false });
  assert.deepEqual(keyForName('ArrowUp'), { code: 82, shift: false });
  assert.deepEqual(keyForName('ArrowDown'), { code: 81, shift: false });
  assert.equal(keyForName('toString'), null);
});

test('chords: modifiers go down first and up last, in reverse order', () => {
  const { ctrl, alt, shift } = MODIFIER_CODES;
  assert.deepEqual(planChord({ ctrl: true }, keyForChar(CLIPBOARD_CHORDS.copy)), [[ctrl, true], [6, true], [6, false], [ctrl, false]]);
  assert.deepEqual(planChord({ ctrl: true, alt: true, shift: true }, keyForChar('t')), [
    [ctrl, true], [alt, true], [shift, true], [23, true], [23, false], [shift, false], [alt, false], [ctrl, false],
  ]);
  assert.deepEqual(planChord({}, keyForName('Escape')), [[41, true], [41, false]]);
});

test('chords: a shifted character adds Shift even when Shift is not lit', () => {
  const { ctrl, shift } = MODIFIER_CODES;
  assert.deepEqual(planChord({ ctrl: true }, keyForChar('?')), [[ctrl, true], [shift, true], [56, true], [56, false], [shift, false], [ctrl, false]]);
});

test('chords: every planned chord releases every key it presses', () => {
  for (const held of [{}, { ctrl: true }, { alt: true }, { ctrl: true, alt: true, shift: true }]) {
    const down = new Set();
    for (const [code, isDown] of planChord(held, keyForChar('A'))) {
      if (isDown) down.add(code);
      else down.delete(code);
    }
    assert.equal(down.size, 0);
  }
});

test('modifiers: tap arms, tap again cancels, and the next key takes them once', () => {
  const mods = createModifiers();
  assert.equal(mods.active, false);
  mods.toggle('ctrl');
  assert.equal(mods.ctrl, true);
  mods.toggle('ctrl');
  assert.equal(mods.active, false);
  mods.toggle('ctrl');
  mods.toggle('alt');
  assert.deepEqual(mods.take(), { ctrl: true, alt: true, meta: false });
  assert.equal(mods.active, false);
  assert.deepEqual(mods.take(), { ctrl: false, alt: false, meta: false });
  mods.toggle('alt');
  mods.clear();
  assert.equal(mods.active, false);
});

test('output: chords pass through the call plan in order', () => {
  const keys = planChord({ ctrl: true }, keyForChar('v'));
  assert.deepEqual(planCalls([{ text: 'ab' }, { keys }, { key: 'Enter' }], { buffered: false }), ['a', 'b', { keys }, 'Enter']);
});

test('output: a failing key-state call still releases every pressed key', () => {
  const calls = [];
  globalThis.SteamClient = {
    Input: {
      ControllerKeyboardSetKeyState: (code, down) => {
        calls.push([code, down]);
        if (code === 6 && down) throw new Error('boom');
      },
    },
  };
  try {
    const ok = sendKeyEvents(planChord({ ctrl: true, alt: true }, keyForChar('c')));
    assert.equal(ok, false);
    // Ctrl and Alt down, C down (throws), then C, Alt, Ctrl released.
    assert.deepEqual(calls, [[103, true], [100, true], [6, true], [6, false], [100, false], [103, false]]);
    calls.length = 0;
    releaseHeldKeys();
    assert.deepEqual(calls, []);
    assert.equal(sendKeyEvents(planChord({}, keyForName('Escape'))), true);
    assert.deepEqual(calls, [[41, true], [41, false]]);
  } finally {
    delete globalThis.SteamClient;
  }
});

test('output: without the key-state call a chord is dropped, never typed', () => {
  assert.equal(sendKeyEvents(planChord({ ctrl: true }, keyForChar('v'))), false);
});

test('layout: QWERTY is arranged like the SteamVR keyboard, with a number row on top', () => {
  const [numbers, top, home, lower, bottom] = PAGES.qwerty;
  const ids = (row) => row.map((k) => k.id);
  assert.deepEqual(ids(numbers), ['`', ...'1234567890', '-', '=', 'backspace']);
  assert.deepEqual(ids(top), ['tab', ...'qwertyuiop', '[', ']', '\\']);
  assert.deepEqual(ids(home), ['del', ...'asdfghjkl', ';', "'", 'enter']);
  assert.deepEqual(ids(lower), ['shift', ...'zxcvbnm', ',', '.', '/', 'shift']);
  assert.deepEqual(ids(bottom), ['ctrl', 'meta', 'alt', 'space', 'left', 'up', 'down', 'right']);
  // ↑ / ↓ are keys of their own next to ← / →, and all four repeat while held.
  const arrows = bottom.slice(-4);
  assert.deepEqual(arrows.map((k) => k.label), ['←', '↑', '↓', '→']);
  assert.ok(arrows.every((k) => k.repeat && !k.upAction));
  // Letters are all the same width, and every row adds up to the same total.
  assert.ok(PAGES.qwerty.flat().filter((k) => k.letter).every((k) => k.w === 1));
  const width = (row) => row.reduce((sum, k) => sum + k.w, 0);
  for (const row of PAGES.qwerty) assert.ok(Math.abs(width(row) - width(numbers)) < 1e-9);
});

test('layout: the bottom row is ctrl, meta, alt, a wide space bar and the arrows', () => {
  const bottom = PAGES.qwerty[4];
  assert.deepEqual(bottom.slice(0, 3).map((k) => k.w), [1.5, 1.5, 1.5]);
  assert.equal(bottom.find((k) => k.id === 'space').w, 6.5);
  // Meta acts on press (a tap arms it, a second tap sends it alone), and Del repeats like Backspace.
  assert.equal(bottom.find((k) => k.id === 'meta').long, undefined);
  const del = PAGES.qwerty[2][0];
  assert.equal(del.id, 'del');
  assert.equal(del.repeat, true);
  assert.equal(PAGES.fn, undefined);
});

test('meta: a tap arms it like Ctrl / Alt, and it goes out with the next key', () => {
  const mods = createModifiers();
  mods.toggle('meta');
  assert.equal(mods.meta, true);
  assert.equal(mods.active, true);
  assert.deepEqual(mods.take(), { ctrl: false, alt: false, meta: true });
  assert.equal(mods.active, false);
  assert.deepEqual(planChord({ meta: true }, keyForChar('r')), [
    [MODIFIER_CODES.meta, true], [21, true], [21, false], [MODIFIER_CODES.meta, false],
  ]);
  // The code can be changed (and bad values are ignored) in case Steam uses another one.
  const before = MODIFIER_CODES.meta;
  assert.equal(before, 102);
  assert.equal(setMetaCode(227), 227);
  assert.equal(MODIFIER_CODES.meta, 227);
  assert.equal(setMetaCode(0), 227);
  assert.equal(setMetaCode(before), before);
});

test('layout: symbol keys carry the character they type with shift', () => {
  const alt = Object.fromEntries(PAGES.qwerty.flat().filter((k) => k.alt).map((k) => [k.ch, k.alt]));
  assert.deepEqual(alt, {
    '`': '~', 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')',
    '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?',
  });
  // Every pair is one physical key on a US layout, so Ctrl/Alt chords still work with shift.
  for (const [ch, shifted] of Object.entries(alt)) {
    assert.equal(keyForChar(shifted).code, keyForChar(ch).code, ch);
    assert.equal(keyForChar(shifted).shift, true, ch);
  }
});

test('layout: letter keys show the flick guide; action keys (arrows included) do not', () => {
  const keys = PAGES.qwerty.flat();
  const byId = (id) => keys.find((k) => k.id === id);
  assert.ok(hasFlickGuide(byId('q')));
  for (const id of ['del', 'tab', 'ctrl', 'space', 'enter', 'backspace', 'left', 'up', 'down', 'right']) assert.equal(hasFlickGuide(byId(id)), false, id);
});
