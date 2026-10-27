// Which system the keyboard is running on, so the Meta key can show the right logo: the Windows
// logo on a Windows PC (SteamVR), the Steam logo on SteamOS / Linux (Steam Frame).

/** @typedef {'windows'|'mac'|'linux'} PlatformName */

/**
 * Detect the operating system from a navigator-like object.
 * @param {{platform?: string, userAgent?: string, userAgentData?: {platform?: string}}|null|undefined} [nav] - Navigator (defaults to the global one)
 * @returns {PlatformName} The system; anything that is not Windows or macOS counts as Linux (SteamOS)
 * @example
 * detectPlatform({ platform: 'Win32' }) // 'windows'
 * detectPlatform({ platform: 'Linux aarch64' }) // 'linux'
 */
export const detectPlatform = (nav = globalThis.navigator) => {
  const text = `${nav?.userAgentData?.platform ?? ''} ${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`;
  if (/\bMac(intosh| ?OS)|\bDarwin\b/i.test(text)) return 'mac';
  if (/\bWin(dows|32|64)\b/i.test(text)) return 'windows';
  return 'linux';
};

/**
 * The icon id of the Meta key for a system.
 * @param {PlatformName} platform - Detected system
 * @returns {'meta-windows'|'meta-steam'} Icon id (see icons.js)
 * @example
 * metaIconFor('windows') // 'meta-windows'
 */
export const metaIconFor = (platform) => (platform === 'windows' ? 'meta-windows' : 'meta-steam');
