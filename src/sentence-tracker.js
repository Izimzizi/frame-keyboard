// Follows the text sent to the target so the keyboard can tell when a sentence has just ended
// (for auto-capitalization). Pure logic, no DOM and no Steam objects.
//
// Only text we typed ourselves is known; anything we cannot follow (arrows, deleting past what we
// know) makes the tracker forget.

/** How much of the text before the cursor the tracker remembers. */
const KNOWN_MAX = 64;

/**
 * Create a sentence tracker.
 * @returns {{
 *   observe: (ops: ({text: string}|{key: string})[]) => void,
 *   reset: () => void,
 *   readonly sentenceStart: boolean,
 * }} The tracker
 * @example
 * const t = createSentenceTracker();
 * t.observe([{ text: 'Hi. ' }]);
 * t.sentenceStart // true
 */
export const createSentenceTracker = () => {
  /** Text we know sits right before the cursor (null = unknown), newest last. */
  let known = null;

  /**
   * Follow operations sent to the target.
   * @param {({text: string}|{key: string})[]} ops - Output operations
   * @returns {void}
   * @example
   * observe([{ key: 'Backspace' }])
   */
  const observe = (ops) => {
    for (const op of ops) {
      if ('text' in op) known = `${known ?? ''}${op.text}`.slice(-KNOWN_MAX);
      else if (op.key === 'Backspace') known = known ? Array.from(known).slice(0, -1).join('') : null;
      else if (op.key === 'Enter') known = '\n';
      else known = null;
    }
  };

  /**
   * Forget everything (keyboard opened, cursor moved elsewhere).
   * @returns {void}
   * @example
   * reset()
   */
  const reset = () => {
    known = null;
  };

  return {
    observe,
    reset,
    get sentenceStart() {
      return known !== null && /(?:[.!?]\s+|\n\s*)$/.test(known);
    },
  };
};
