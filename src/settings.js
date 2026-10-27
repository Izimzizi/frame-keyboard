// User settings, kept in SharedJSContext's localStorage. Every access is guarded so a broken
// storage never stops the keyboard.

const STORAGE_KEY = 'fjk.settings';

/**
 * @typedef {object} Settings
 * @property {boolean} enabled - Our overlay is active (false = stock Steam keyboard)
 * @property {boolean} autoCapitalize - Capitalize the first letter after . ! ? and a space, or a new line (off by default)
 * @property {number} metaCode - Key code sent for the Meta key (102 by default)
 * @property {boolean} sound - Play a short click when a key is pressed
 * @property {boolean} debugRecorders - Log diagnostics (raw input, key gestures, Steam keyboard calls; never text). Takes effect on the next injection.
 */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  autoCapitalize: false,
  metaCode: 102,
  sound: true,
  debugRecorders: false,
});

/**
 * Merge stored values over the defaults, keeping only known keys with the right type.
 * @param {unknown} stored - Parsed stored value
 * @returns {Settings} Settings
 * @example
 * normalizeSettings({ sound: false }).sound // false
 */
export const normalizeSettings = (stored) => {
  const result = { ...DEFAULT_SETTINGS };
  if (stored && typeof stored === 'object') {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (typeof stored[key] === typeof value) result[key] = stored[key];
    }
  }
  return result;
};

/**
 * Load settings from localStorage.
 * @returns {Settings} Settings (defaults when nothing is stored)
 * @example
 * loadSettings().sound // true
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
