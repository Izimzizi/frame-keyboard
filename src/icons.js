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
  // Meta key: the Windows logo (four panes, filled by CSS) and the SteamOS mark: a half ring and a
  // gradient disc. Entries that are [path, fill] are filled instead of stroked.
  'meta-windows': ['M3 3h8v8H3z', 'M13 3h8v8h-8z', 'M3 13h8v8H3z', 'M13 13h8v8h-8z'],
  'meta-steam': [
    ['M8.8 .97A11.6 11.6 0 0 1 8.8 23.03V19.53A7.6 7.6 0 0 0 8.8 4.47z', 'currentColor'],
    ['M14.1 12a6.3 6.3 0 1 1-12.6 0 6.3 6.3 0 0 1 12.6 0z', 'url(#fjk-steam-gradient)'],
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
  if (id === 'meta-steam') {
    const defs = doc.createElementNS(SVG_NS, 'defs');
    const gradient = doc.createElementNS(SVG_NS, 'linearGradient');
    gradient.setAttribute('id', 'fjk-steam-gradient');
    gradient.setAttribute('x1', '0');
    gradient.setAttribute('y1', '0');
    gradient.setAttribute('x2', '1');
    gradient.setAttribute('y2', '1');
    for (const [offset, color] of [['0', '#a35bf0'], ['1', '#1a9fff']]) {
      const stop = doc.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      gradient.append(stop);
    }
    defs.append(gradient);
    svg.append(defs);
  }
  for (const entry of ICON_PATHS[id]) {
    const [d, fill] = Array.isArray(entry) ? entry : [entry, null];
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    if (fill) {
      path.setAttribute('fill', fill);
      path.setAttribute('stroke', 'none');
    }
    svg.append(path);
  }
  return svg;
};
