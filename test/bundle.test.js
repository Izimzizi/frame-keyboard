import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import { build } from 'esbuild';

// Exercise the same entry point and injector-visible API in both forms. The VM supplies only
// Steam's keyboard manager and the two CDP bindings; it never opens a real browser or sends input.
const exercise = async (code) => {
  const intervals = new Set();
  const requests = [];
  const updates = [];
  const saved = new Map();
  const scope = createContext({
    console: { log() {}, warn() {} },
    performance, queueMicrotask, clearTimeout,
    setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref(); return timer; },
    setInterval: (fn) => { intervals.add(fn); return fn; },
    clearInterval: (fn) => intervals.delete(fn),
    localStorage: { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    g_PopupManager: { GetPopupForVROverlayKey: () => null },
    SteamUIStore: { WindowStore: { SteamUIWindows: [{ VirtualKeyboardManager: { HandleVirtualKeyDown() {} } }] } },
  });
  scope.fjkUpdateBridge = (json) => updates.push(JSON.parse(json));
  scope.fjkAnthy = (json) => {
    const request = JSON.parse(json);
    requests.push(request);
    queueMicrotask(() => scope.__fjkAnthyReply({
      id: request.id, ok: true, predictions: [],
      segments: [{ reading: request.reading, candidates: ['漢字', '感じ'] }],
    }));
  };
  runInContext(code, scope);
  await new Promise(setImmediate);
  const api = scope.__fjk;
  assert.equal(api.state, 'running');
  assert.equal(api.version, 'test');
  assert.equal(api.debug.capture(true), true);
  const keys = Object.keys(api).sort();
  const debugKeys = Object.keys(api.debug).sort();
  await api.debug.type('かんじ');
  await api.debug.key('space');
  await api.debug.select(0);
  const kana = api.debug.state().output;
  assert.ok(kana.some((op) => op.text === '漢字'));
  assert.ok(requests.some((r) => r.op === 'commit'));
  api.debug.page('qwerty');
  const english = await api.debug.english('Helo');
  // Instant typing: nothing is buffered, each key reaches the target as it is tapped.
  assert.equal(english.composing, '');
  assert.equal(english.output.slice(-4).map((op) => op.text).join('|'), 'H|e|l|o');
  // Symbol keys type their shifted character while shift is on; a one-shot shift is then used up.
  const bang = await api.debug.tapChar('1', true);
  assert.equal(bang.output.at(-1).text, '!');
  assert.equal(bang.shift, 'off');
  assert.equal((await api.debug.tapChar('1')).output.at(-1).text, '1');
  // Meta: one tap only arms it; a second tap right after sends Meta (code 102) by itself.
  const metaSends = () => api.debug.state().output.filter((op) => op.keys?.[0]?.[0] === 102).length;
  const before = metaSends();
  await api.debug.key('meta');
  assert.equal(metaSends(), before);
  await api.debug.key('meta');
  assert.equal(metaSends(), before + 1);
  api.updater.tapIndicator();
  assert.equal(updates.at(-1).action, 'check');
  api.updater.receive({ source: 'check', forced: true, answer: { status: 'up-to-date' } });
  api.settings.flickThreshold = 31;
  api.setEnabled(false);
  assert.equal(JSON.parse(saved.get('fjk.settings')).flickThreshold, 31);
  runInContext(code, scope);
  assert.equal(api.state, 'uninstalled');
  assert.notEqual(scope.__fjk, api);
  assert.equal(scope.__fjk.settings.flickThreshold, 31);
  assert.equal(intervals.size, 1);
  scope.__fjk.uninstall();
  await Promise.resolve();
  assert.equal(scope.__fjk, undefined);
  assert.equal(intervals.size, 0);
  return JSON.parse(JSON.stringify({ keys, debugKeys, kana, english, updates }));
};

test('minified bundle preserves the injector API, kana conversion, instant English typing and reinjection', async () => {
  const options = {
    entryPoints: ['src/main.js'], bundle: true, format: 'iife', target: 'chrome126',
    write: false, charset: 'utf8', legalComments: 'inline',
    define: { __FJK_VERSION__: JSON.stringify('test') },
  };
  const readable = (await build(options)).outputFiles[0].text;
  const minified = (await build({ ...options, minify: true })).outputFiles[0].text;
  const dictionary = await readFile(new URL('../src/data/words-en.js', import.meta.url), 'utf8');
  const notice = dictionary.match(/^\/\*![\s\S]*?\*\//)[0];
  assert.ok(minified.includes(notice), 'the complete dictionary copyright notice is retained');
  assert.deepEqual(await exercise(minified), await exercise(readable));
});
