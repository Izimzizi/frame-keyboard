// User settings, kept in SharedJSContext's localStorage. Every access is guarded so a broken
// storage never stops the keyboard.
import { DEFAULT_FLICK_THRESHOLD } from './flick.js';
import { toMode } from './keyboard-state.js';

const STORAGE_KEY = 'fjk.settings';
/**
 * Version of the stored settings. 2 (0.9.2): autoCapitalize is off by default; values saved by
 * older versions are dropped, since they always held the old default (true).
 */
const SETTINGS_VERSION = 2;

/**
 * @typedef {object} Settings
 * @property {boolean} enabled - Our overlay is active (false = stock Steam keyboard)
 * @property {number} flickThreshold - Flick distance threshold in CSS px
 * @property {boolean} toggleInput - Repeated taps cycle a key's characters
 * @property {number} toggleTimeoutMs - Max gap between taps for toggle input
 * @property {'kana'|'qwerty'} mode - Last used mode (restored on the next start)
 * @property {boolean} conversion - Use anthy kana-kanji conversion (false = type hiragana directly)
 * @property {number} liveDelayMs - Quiet time before live candidates are computed while typing
 * @property {boolean} predictions - Also show anthy's predictions (learned history) while typing
 * @property {boolean} suggestions - Show English word suggestions on the QWERTY keyboard
 * @property {boolean} autoCapitalize - Capitalize the first letter after . ! ? and a space, or a new line (off by default)
 * @property {number} metaCode - Key code sent for the Meta key (102 by default)
 * @property {boolean} sound - Play a short click when a key is pressed
 * @property {boolean} debugRecorders - Log diagnostics (raw input, key gestures, Steam keyboard calls; never text). Takes effect on the next injection.
 * @property {boolean} updateCheck - Let the injector check GitHub for a new version at start and hourly
 *   (frame-update.sh's own cache limits the actual GitHub call to once a day). The indicator's forced
 *   check (tap) always runs, regardless of this setting; see update.js and README.md.
 * @property {number} version - Version of the stored settings (SETTINGS_VERSION)
 */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  flickThreshold: DEFAULT_FLICK_THRESHOLD,
  toggleInput: false,
  toggleTimeoutMs: 800,
  mode: 'qwerty',
  conversion: true,
  liveDelayMs: 150,
  predictions: true,
  suggestions: false,
  autoCapitalize: false,
  metaCode: 102,
  sound: true,
  debugRecorders: false,
  updateCheck: false,
  version: SETTINGS_VERSION,
});

/**
 * Merge stored values over the defaults, keeping only known keys with the right type.
 * @param {unknown} stored - Parsed stored value
 * @returns {Settings} Settings
 * @example
 * normalizeSettings({ toggleInput: true }).toggleInput // true
 */
export const normalizeSettings = (stored) => {
  const result = { ...DEFAULT_SETTINGS };
  if (stored && typeof stored === 'object') {
    const old = stored.version !== SETTINGS_VERSION;
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (old && key === 'autoCapitalize') continue;
      if (typeof stored[key] === typeof value) result[key] = stored[key];
    }
  }
  result.version = SETTINGS_VERSION;
  result.mode = toMode(result.mode);
  // English-only build: always QWERTY, and never check GitHub for updates.
  result.mode = 'qwerty';
  result.updateCheck = false;
  return result;
};

/**
 * Load settings from localStorage.
 * @returns {Settings} Settings (defaults when nothing is stored)
 * @example
 * loadSettings().flickThreshold // 24
 */
export const loadSettings = () => {
  try {
    return normalizeSettings(JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

/**
 * Save settings to localStorage.
 * @param {Settings} settings - Settings to save
 * @returns {void}
 * @example
 * saveSettings({ ...loadSettings(), enabled: false })
 */
export const saveSettings = (settings) => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage is optional.
  }
};
