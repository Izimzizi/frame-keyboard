// Key layout of the keyboard. Pure data. Each row is a list of keys; `w` is the key's width weight
// inside its row (rows are laid out as flex rows filling the panel width).
//
//  ` 1 2 3 4 5 6 7 8 9 0 - =  ⌫
//  tab q w e r t y u i o p [ ] \
//  del a s d f g h j k l ; '  ⏎
//  ⇧ z x c v b n m , . /  ⇧
//  ctrl meta alt   space   ← ↑ ↓ →

/**
 * @typedef {object} KeyDef
 * @property {'char'|'action'|'spacer'} type - Char keys type a character; action keys fire once (or repeat)
 * @property {string} id - Action id, or the character for char keys
 * @property {string} label - Text shown on the key
 * @property {number} w - Width weight within the row
 * @property {string} [ch] - Character typed by a char key
 * @property {boolean} [letter] - Char key affected by shift
 * @property {boolean} [repeat] - Auto-repeat while held
 * @property {boolean} [side] - Styled as a function key
 * @property {string} [alt] - Character typed instead while shift is on (shown small on the key)
 * @property {number} [rowH] - On the first key of a row: the row's height relative to a normal row
 */

/**
 * Build an action key definition.
 * @param {string} id - Action id
 * @param {string} label - Key label
 * @param {Partial<KeyDef>} [extra] - Extra properties
 * @returns {KeyDef} Key definition
 * @example
 * action('enter', '⏎', { w: 1.75 })
 */
const action = (id, label, extra = {}) => ({ type: 'action', id, label, w: 1, side: true, ...extra });

/**
 * Build a character key definition.
 * @param {string} ch - Character typed on tap
 * @param {Partial<KeyDef>} [extra] - Extra properties (up, w, label)
 * @returns {KeyDef} Key definition
 * @example
 * char('q', { letter: true })
 */
const char = (ch, extra = {}) => ({ type: 'char', id: ch, ch, label: ch, w: 1, ...extra });

/**
 * Build a row of plain character keys.
 * @param {ReadonlyArray<string>|string} list - Characters
 * @param {Partial<KeyDef>} [extra] - Extra properties for every key
 * @returns {KeyDef[]} Keys
 * @example
 * chars('123')
 */
const chars = (list, extra = {}) => Array.from(list).map((ch) => char(ch, extra));

/*
 * PC-style QWERTY (like the SteamVR keyboard): a short number row on top, then four rows that add
 * up to ROW_WIDTH key widths each. Symbol keys show what they type with shift pressed (`alt`).
 */
const ROW_WIDTH = 15;
/** Height of the number row relative to the other rows. */
const NUMBER_ROW_H = 1;

/**
 * Build character keys with the symbol they type while shift is on.
 * @param {string} row - Unshifted characters
 * @param {string} alts - Shifted characters, one per key
 * @returns {KeyDef[]} Keys
 * @example
 * symbolKeys('12', '!@')
 */
const symbolKeys = (row, alts) => Array.from(row).map((ch, i) => char(ch, { alt: alts[i] }));

/**
 * Build a row of letter keys.
 * @param {string} row - Letters of the row
 * @returns {KeyDef[]} Keys
 * @example
 * letters('qw')
 */
const letters = (row) => Array.from(row).map((ch) => char(ch, { letter: true }));

/**
 * The number row of the QWERTY page, with the shifted symbols on the keys.
 * @returns {KeyDef[]} Row
 * @example
 * numberRow()
 */
const numberRow = () => [
  { ...symbolKeys('`', '~')[0], rowH: NUMBER_ROW_H },
  ...symbolKeys('1234567890', '!@#$%^&*()'),
  ...symbolKeys('-=', '_+'),
  action('backspace', '⌫', { w: 2, repeat: true }),
];

/**
 * The four rows under the number row.
 * @returns {KeyDef[][]} Rows
 * @example
 * mainRows().length // 4
 */
const mainRows = () => [
  [
    action('tab', 'tab', { w: 1.5 }),
    ...letters('qwertyuiop'),
    ...symbolKeys('[]', '{}'),
    char('\\', { alt: '|', w: 1.5 }),
  ],
  [
    action('del', 'del', { w: 1.75, repeat: true }),
    ...letters('asdfghjkl'),
    ...symbolKeys(';\'', ':"'),
    action('enter', '⏎', { w: 2.25 }),
  ],
  [
    action('shift', '⇧', { w: 2.25 }),
    ...letters('zxcvbnm'),
    ...symbolKeys(',./', '<>?'),
    action('shift', '⇧', { w: 2.75 }),
  ],
  [
    action('ctrl', 'ctrl', { w: 1.5 }),
    action('meta', 'meta', { w: 1.5 }),
    action('alt', 'alt', { w: 1.5 }),
    action('space', 'space', { w: 6.5 }),
    action('left', '←', { repeat: true }),
    action('up', '↑', { repeat: true }),
    action('down', '↓', { repeat: true }),
    action('right', '→', { repeat: true }),
  ],
];

/** @type {Readonly<Record<'qwerty', ReadonlyArray<ReadonlyArray<KeyDef>>>>} */
export const PAGES = Object.freeze({
  qwerty: [numberRow(), ...mainRows()],
});
