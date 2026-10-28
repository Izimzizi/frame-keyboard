import { test } from 'node:test';
import assert from 'node:assert/strict';

// Drive the real entry point with just enough of Steam's objects. Nothing here opens a browser or
// sends input: the keyboard manager is a stub and output is captured by the debug API.
const intervals = new Set();
const saved = new Map();
Object.assign(globalThis, {
  setInterval: (fn) => { intervals.add(fn); return fn; },
  clearInterval: (fn) => intervals.delete(fn),
  localStorage: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
  g_PopupManager: { GetPopupForVROverlayKey: () => null },
  SteamUIStore: { WindowStore: { SteamUIWindows: [{ VirtualKeyboardManager: { HandleVirtualKeyDown() {} } }] } },
});
await import('../src/main.js');
await new Promise(setImmediate);
const api = globalThis.__fjk;
const metaSends = () => api.debug.state().output.filter((op) => op.keys?.[0]?.[0] === 102).length;

test('the keyboard installs and exposes the injector-visible API', () => {
  assert.equal(api.state, 'running');
  assert.equal(api.version, 'dev');
  assert.equal(api.debug.capture(true), true);
  assert.deepEqual(Object.keys(api).sort(), ['debug', 'enabled', 'platform', 'setEnabled', 'settings', 'state', 'uninstall', 'version']);
});

test('keys reach the target the moment they are tapped', () => {
  const english = api.debug.english('Helo');
  assert.equal(english.output.slice(-4).map((op) => op.text).join('|'), 'H|e|l|o');
  const bang = api.debug.tapChar('1', true);
  assert.equal(bang.output.at(-1).text, '!');
  assert.equal(bang.shift, 'off');
  assert.equal(api.debug.tapChar('1').output.at(-1).text, '1');
  assert.deepEqual(api.debug.key('space').output.at(-1), { text: ' ' });
  assert.deepEqual(api.debug.key('enter').output.at(-1), { key: 'Enter' });
  assert.deepEqual(api.debug.key('backspace').output.at(-1), { key: 'Backspace' });
  assert.deepEqual(api.debug.key('up').output.at(-1), { key: 'ArrowUp' });
});

test('meta: the first tap arms it, the second sends it alone however late it comes', async () => {
  const realNow = Date.now;
  try {
    const before = metaSends();
    api.debug.key('meta');
    assert.equal(metaSends(), before);
    assert.equal(api.debug.state().modifiers.meta, true);
    // Ten minutes later: there is no timer, so the second tap still opens the Windows menu.
    Date.now = () => realNow() + 600_000;
    api.debug.key('meta');
    assert.equal(metaSends(), before + 1);
    assert.equal(api.debug.state().modifiers.meta, false);
  } finally {
    Date.now = realNow;
  }
});

test('meta: an armed meta goes out with the next key', () => {
  api.debug.key('meta');
  const out = api.debug.tapChar('r').output.at(-1);
  assert.deepEqual(out.keys[0], [102, true]);
  assert.deepEqual(out.keys.at(-1), [102, false]);
  assert.equal(api.debug.state().modifiers.meta, false);
});

test('shift then enter goes out as Shift+Enter, then plain enter again', () => {
  api.debug.key('shift');
  const out = api.debug.key('enter').output.at(-1);
  assert.deepEqual(out.keys[0], [101, true]);
  assert.equal(out.keys.at(-1)[1], false);
  assert.equal(api.debug.state().shift, 'off');
  assert.deepEqual(api.debug.key('enter').output.at(-1), { key: 'Enter' });
});

test('uninstall removes the handle and the timer', () => {
  assert.equal(intervals.size, 1);
  api.uninstall();
  assert.equal(api.state, 'uninstalled');
  assert.equal(globalThis.__fjk, undefined);
  assert.equal(intervals.size, 0);
});
