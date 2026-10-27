// Key layouts of every page. Pure data. Each row is a list of keys; `w` is the key's width weight
// inside its row (rows are laid out as flex rows filling the panel width).
//
// kana (from the design doc):          qwerty (arranged like a PC keyboard):
//  ↶    あ    か    さ    ⌫            esc q w e r t y u i o p ⌫    (flick up: 1 2 3 4 5 6 7 8 9 0)
//  ←    た    な    は    →            tab  a s d f g h j k l  ⏎    (flick up: @ # $ % & - + ( ))
//  ☺記  ま    や    ら    空白           ⇧  z x c v b n m , .  ⇧   (flick up: * " ' : ; ! ? ! ?)
//  あA  ゛゜小 わ   、。?! ⏎            ctrl alt 123  space  あA ← ↑ ↓ →
import { KANA_KEYS } from './kana-table.js';

/**
 * @typedef {object} KeyDef
 * @property {'kana'|'char'|'action'|'spacer'} type - Kana keys flick; char keys type a character (flick up = `up`); action keys fire once (or repeat)
 * @property {string} id - Kana key id, action id, or the character for char keys
 * @property {string} label - Text shown on the key
 * @property {number} w - Width weight within the row
 * @property {string} [ch] - Character typed by a char key
 * @property {string} [up] - Character typed by flicking a char key up
 * @property {boolean} [letter] - Char key affected by shift
 * @property {boolean} [symbol] - Char key on a symbol page (styled smaller)
 * @property {boolean} [repeat] - Auto-repeat while held
 * @property {string} [long] - Action fired by a long press instead of the tap action
 * @property {string} [upAction] - Action fired by flicking an action key up (its hint is `up`)
 * @property {boolean} [side] - Styled as a function key
 * @property {string} [alt] - Character typed instead while shift is on (shown small on the key)
 * @property {number} [rowH] - On the first key of a row: the row's height relative to a normal row
 */

/**
 * Build a kana key definition.
 * @param {string} id - Kana key id
 * @param {number} [w=1.35] - Width weight
 * @returns {KeyDef} Key definition
 * @example
 * kana('ka') // {type:"kana", id:"ka", label:"か", w:1.35}
 */
const kana = (id, w = 1.35) => ({ type: 'kana', id, label: KANA_KEYS[id].label, w });

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
 * char('q', { up: '1', letter: true })
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

/**
 * Whether a key shows the flick guide while pressed: kana and character keys, and action keys with
 * an up-flick (none at the moment; the ui supports `upAction`).
 * @param {KeyDef} def - Key definition
 * @returns {boolean} True when the guide is shown
 * @example
 * hasFlickGuide(PAGES.qwerty[0][1]) // true (q)
 */
export const hasFlickGuide = (def) => def.type === 'kana' || def.type === 'char' || !!def.upAction;

/** Japanese punctuation and brackets (☺記 page 1), 32 keys. */
export const SYMBOLS_1 = Object.freeze(Array.from('、。，．・：；？！ー〜…「」『』（）【】［］〈〉《》＜＞“”／＼'));
/** Symbols (☺記 page 2), 32 keys. */
export const SYMBOLS_2 = Object.freeze(Array.from('＠＃％＆＊＋－＝￥＄｜＿※〒♪☆★○●◎△▲□■◇◆♡→←↑↓×'));

/**
 * Build a symbol page: 4 rows of 8 symbols with page keys on the left and editing keys on the right.
 * @param {ReadonlyArray<string>} symbols - 32 symbols
 * @returns {KeyDef[][]} Rows
 * @example
 * symbolPage(SYMBOLS_1).length // 4
 */
const symbolPage = (symbols) => {
  const left = [
    action('back', 'あいう', { w: 1.3 }),
    action('sym1', '記号1', { w: 1.3 }),
    action('sym2', '記号2', { w: 1.3 }),
    action('mode', 'あA', { w: 1.3, long: 'stock' }),
  ];
  const right = [
    action('undo', '↶', { w: 1.3 }),
    action('backspace', '⌫', { w: 1.3, repeat: true }),
    action('space', '空白', { w: 1.3 }),
    action('enter', '⏎', { w: 1.3 }),
  ];
  return [0, 1, 2, 3].map((r) => [left[r], ...chars(symbols.slice(r * 8, r * 8 + 8), { symbol: true }), right[r]]);
};

/** @type {Readonly<Record<import('./keyboard-state.js').PageId, ReadonlyArray<ReadonlyArray<KeyDef>>>>} */
export const PAGES = Object.freeze({
  kana: [
    [action('undo', '↶'), kana('a'), kana('ka'), kana('sa'), action('backspace', '⌫', { repeat: true })],
    [action('left', '←', { repeat: true }), kana('ta'), kana('na'), kana('ha'), action('right', '→', { repeat: true })],
    [action('symbols', '☺記'), kana('ma'), kana('ya'), kana('ra'), action('space', '空白')],
    [action('mode', 'あA', { long: 'stock' }), action('modify', '゛゜小', { w: 1.35, side: false }), kana('wa'), kana('punct'), action('enter', '⏎')],
  ],
  qwerty: [numberRow(), ...mainRows()],
  sym1: symbolPage(SYMBOLS_1),
  sym2: symbolPage(SYMBOLS_2),
});
