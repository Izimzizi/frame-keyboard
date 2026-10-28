// Line icons for action keys. Font glyphs such as ↶ and ⌫ render tiny in the headset's fonts even
// at a large font-size, so these keys draw their own SVG, sized by CSS (.fjk-icon).
// Drawn for this project (24x24 grid, stroked with currentColor); not taken from an icon set.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Stroke paths per action id. */
const ICON_PATHS = Object.freeze({
  backspace: ['M21 5H9l-7 7 7 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z', 'M12 9l6 6', 'M18 9l-6 6'],
  // Hide the keyboard: a keyboard with a chevron pointing down (like Android's "hide keyboard").
  close: ['M3 3h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M6 7h1', 'M10 7h1', 'M14 7h1', 'M18 7h1', 'M8 10.5h8', 'M8 17.5l4 3.5 4-3.5'],
  // A keyboard, for the small button that brings this keyboard back.
  keyboard: ['M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M6 10h.01', 'M10 10h.01', 'M14 10h.01', 'M18 10h.01', 'M7 14.5h10'],
  // Click sound button: a speaker with two sound waves (the waves are hidden while it is off).
  sound: ['M4 9v6h4l5 4V5L8 9z', 'M16 9a4 4 0 0 1 0 6', 'M18.5 6.5a8 8 0 0 1 0 11'],
  // Arrows, Shift (outlined; filled by CSS while Caps is locked) and Enter. Drawn instead of typed as
  // font glyphs, because ⇧ ⏎ ← → render stretched or squashed in some systems' fonts.
  left: ['M19 12H5', 'M11 6l-6 6 6 6'],
  right: ['M5 12h14', 'M13 6l6 6-6 6'],
  up: ['M12 19V5', 'M6 11l6-6 6 6'],
  down: ['M12 5v14', 'M6 13l6 6 6-6'],
  shift: ['M12 3 3.5 12H8v8h8v-8h4.5z'],
  enter: ['M20 5v7a2 2 0 0 1-2 2H5', 'M9 10l-4 4 4 4'],
  // Meta key: the Windows logo (four panes) and the SteamOS mark: a half ring and a disc inside it.
  // Both are filled with the key's colour by CSS.
  'meta-windows': ['M3 3h8v8H3z', 'M13 3h8v8h-8z', 'M3 13h8v8H3z', 'M13 13h8v8h-8z'],
  'meta-steam': [
    'M9.25 .5A11.5 11.5 0 0 1 9.25 23.5V19.5A7.5 7.5 0 0 0 9.25 4.5z',
    'M15.25 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0z',
  ],
});

/**
 * Whether an action key has an SVG icon.
 * @param {string} id - Action id
 * @returns {boolean} True when createIcon() can draw it
 * @example
 * hasIcon('backspace') // true
 */
export const hasIcon = (id) => Object.hasOwn(ICON_PATHS, id);

/**
 * Create the SVG icon for an action key in the given document.
 * @param {Document} doc - Owner document (the popup's)
 * @param {string} id - Action id with an icon
 * @returns {SVGSVGElement} The icon element
 * @example
 * keyEl.append(createIcon(doc, 'backspace'))
 */
export const createIcon = (doc, id) => {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `fjk-icon fjk-icon-${id}`);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICON_PATHS[id]) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
};
