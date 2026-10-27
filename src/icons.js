// Line icons for action keys. Font glyphs such as ↶ and ⌫ render tiny in the headset's fonts even
// at a large font-size, so these keys draw their own SVG, sized by CSS (.fjk-icon).
// Drawn for this project (24x24 grid, stroked with currentColor); not taken from an icon set.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Stroke paths per action id. */
const ICON_PATHS = Object.freeze({
  backspace: ['M21 5H9l-7 7 7 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z', 'M12 9l6 6', 'M18 9l-6 6'],
  // Hide the keyboard: a keyboard with a chevron pointing down (like Android's "hide keyboard").
  close: ['M3 3h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M6 7h1', 'M10 7h1', 'M14 7h1', 'M18 7h1', 'M8 10.5h8', 'M8 17.5l4 3.5 4-3.5'],
  // Meta key: the Windows logo (four panes, filled by CSS) and a simple Steam-style mark (a ring and a
  // small circle joined by a rod inside a circle), drawn for this project.
  'meta-windows': ['M3 3h8v8H3z', 'M13 3h8v8h-8z', 'M3 13h8v8H3z', 'M13 13h8v8h-8z'],
  'meta-steam': [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    'M18.2 9.5a3.2 3.2 0 1 0-6.4 0 3.2 3.2 0 0 0 6.4 0z',
    'M10 15.5a2 2 0 1 0-4 0 2 2 0 0 0 4 0z',
    'M9.7 14.2l2.6-2.6',
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
