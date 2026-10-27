import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, metaIconFor } from '../src/platform.js';
import { hasIcon } from '../src/icons.js';

test('platform: Windows, SteamOS / Linux and macOS are told apart', () => {
  assert.equal(detectPlatform({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'windows');
  assert.equal(detectPlatform({ userAgentData: { platform: 'Windows' } }), 'windows');
  assert.equal(detectPlatform({ platform: 'Linux aarch64', userAgent: 'Mozilla/5.0 (X11; Linux aarch64)' }), 'linux');
  assert.equal(detectPlatform({ platform: 'Linux x86_64' }), 'linux');
  // "Darwin" contains "win": macOS must not be mistaken for Windows.
  assert.equal(detectPlatform({ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Darwin' }), 'mac');
  assert.equal(detectPlatform(null), 'linux');
  assert.equal(detectPlatform({}), 'linux');
});

test('platform: the Meta key shows the Windows logo on Windows and the Steam logo elsewhere', () => {
  assert.equal(metaIconFor('windows'), 'meta-windows');
  assert.equal(metaIconFor('linux'), 'meta-steam');
  assert.equal(metaIconFor('mac'), 'meta-steam');
  assert.ok(hasIcon('meta-windows') && hasIcon('meta-steam'));
});
