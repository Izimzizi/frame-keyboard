// Key click feedback: a very short synthesized tick (no audio files), played with Web Audio.

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
  let failed = false;

  /**
   * Get the audio context, creating it on first use.
   * @returns {AudioContext|null} The context, or null when audio is unavailable
   * @example
   * ensure()
   */
  const ensure = () => {
    if (audio || failed) return audio;
    const win = getWindow?.();
    const Context = win?.AudioContext ?? win?.webkitAudioContext ?? globalThis.AudioContext;
    if (!Context) {
      failed = true;
      return null;
    }
    try {
      audio = new Context();
    } catch {
      failed = true;
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
