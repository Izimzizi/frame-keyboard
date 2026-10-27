// Key click feedback: a very short synthesized tick (no audio files), played with Web Audio.
import { log, warn } from './log.js';

/**
 * Create the click player. The audio context is made on the first click, because browsers only
 * start audio after a user action, and it is made in the keyboard window when there is one.
 * @param {() => (Window|undefined|null)} [getWindow] - The window to play in (falls back to the global scope)
 * @returns {{play: () => void}} The player
 * @example
 * const clicker = createClickSound(() => popupWindow);
 * clicker.play();
 */
export const createClickSound = (getWindow) => {
  /** @type {AudioContext|null} */
  let audio = null;
  /** @type {Window|null|undefined} The window the context was made in. */
  let audioWindow = null;
  let failed = false;

  /**
   * Get the audio context, creating it on first use. The keyboard popup can be closed and recreated
   * by Steam; a context made in an old popup is dead, so a new one is made for the current window.
   * @returns {AudioContext|null} The context, or null when audio is unavailable
   * @example
   * ensure()
   */
  const ensure = () => {
    const win = getWindow?.();
    if (audio && audioWindow === win && audio.state !== 'closed') return audio;
    if (failed && audioWindow === win) return null;
    const Context = win?.AudioContext ?? win?.webkitAudioContext ?? globalThis.AudioContext;
    audio = null;
    audioWindow = win;
    failed = false;
    if (!Context) {
      failed = true;
      return null;
    }
    try {
      audio = new Context();
      log(`click sound: audio context ready (${audio.state})`);
    } catch (error) {
      failed = true;
      warn('click sound: no audio context', error);
    }
    return audio;
  };

  /**
   * Play one click: a 25 ms sine that drops in pitch and fades out.
   * @returns {void}
   * @example
   * play()
   */
  const play = () => {
    try {
      const ctx = ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume?.();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1900, now);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.025);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Sound is optional; never let it break typing.
    }
  };

  return { play };
};
