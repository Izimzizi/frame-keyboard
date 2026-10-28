// DOM layer: our keyboard, drawn inside the stock VR keyboard popup's document.
//
// Input notes (measured on the device, 2026-09-26): the VR laser arrives as touch events
// (touchstart -> touchmove ~90 Hz -> touchend, coordinates in changedTouches[0]). With the default
// touch-action the browser pans and fires pointercancel, so everything here is touch-action:none
// and we listen to touch events. Mouse pointer events are a fallback for desktop debugging.
// With both controllers on the keyboard there is only one DOM touch, and a press with the laser
// SteamVR does not focus has no movement at all; so touchstart/touchend mark press and release, and
// the pressing laser (its press marker) gives the end point at release (cursor-tracker.js), when
// the popup offers SteamClient.OpenVR.VROverlay.RegisterForCursorMovement.
//
// Layout: a one-row strip with the close button, Esc and F1 to F12, the click sound toggle and
// "Steam" on top, and the QWERTY keys under it, using the full width.
import { createCursorTracker } from './cursor-tracker.js';
import { createInputRecorder } from './input-recorder.js';
import { createIcon, hasIcon } from './icons.js';
import { detectPlatform, metaIconFor } from './platform.js';
import { PAGES } from './layout.js';
import { OVERLAY_CSS } from './styles.js';
import { createStockGuard } from './stock-guard.js';

const HOST_ID = 'fjk-host';
const REPEAT_DELAY_MS = 450;
const REPEAT_INTERVAL_MS = 70;
/** Movement (CSS px) above which a press on the strip is no longer a tap. */
const BAR_TAP_SLOP = 12;
/** After touchend, wait this long for the pressing laser's release event (it can come just after). */
const RELEASE_WAIT_MS = 25;
/** Ignore mouse presses this soon after a touch, in case the platform also emits mouse events. */
const MOUSE_AFTER_TOUCH_MS = 600;

/**
 * Create an element in the given document with a class and optional text.
 * @param {Document} doc - Owner document (the popup's, not SharedJSContext's)
 * @param {string} tag - Tag name
 * @param {string} className - Class name(s)
 * @param {string} [text] - Text content
 * @returns {HTMLElement} The element
 * @example
 * el(doc, 'div', 'fjk-key', 'a')
 */
const el = (doc, tag, className, text) => {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Find the closest ancestor matching a selector. The popup is another window (realm), so
 * `instanceof Element` would be false; duck-type instead.
 * @param {EventTarget|null} target - Event target
 * @param {string} selector - CSS selector
 * @returns {HTMLElement|null} The element, or null
 * @example
 * closest(event.target, '.fjk-key')
 */
const closest = (target, selector) => (typeof target?.closest === 'function' ? target.closest(selector) : null);

/**
 * @typedef {import('./layout.js').KeyDef} KeyDef
 */

/**
 * @typedef {object} OverlayHandlers
 * @property {(def: KeyDef) => void} onChar - A character key was pressed
 * @property {(actionId: string) => void} onAction - An action key fired (also "close", "stock" and the strip's "esc" / "f1" to "f12")
 * @property {() => void} onEnable - The re-enable button was pressed
 * @property {(record: object) => void} [onGesture] - A key gesture ended (numbers only; debug log)
 * @property {(window: {press: number, entries: any[]}) => void} [onRecord] - Raw input around a press (temporary recorder)
 * @property {(def: KeyDef|null) => void} [onKeyDown] - A key (or a strip button, null) was pressed (for the click sound)
 * @property {() => void} onSoundTap - The click sound button was tapped
 */

/**
 * @typedef {object} RenderState
 * @property {'off'|'once'|'lock'} shift - Shift state
 * @property {{ctrl: boolean, alt: boolean, meta: boolean}} [modifiers] - Armed one-shot Ctrl / Alt / Meta
 * @property {boolean} [sound] - Whether the click sound is on
 */

/**
 * @typedef {object} Overlay
 * @property {HTMLElement} host - Shadow host element in the popup document
 * @property {(enabled: boolean) => void} setEnabled - Show our keyboard, or only the re-enable button
 * @property {(bounds: {top: number, bottom: number}) => void} setBounds - Move the overlay's top and bottom edges (CSS px from each edge)
 * @property {(state: RenderState) => void} render - Update the key labels and button states
 * @property {() => void} cancelGesture - Abort any press in progress
 * @property {() => object} measure - Rects of the overlay's parts (debug)
 * @property {() => object} gestures - Recent key gestures and laser cursors (debug; numbers only)
 * @property {() => void} destroy - Remove everything from the popup
 */

/**
 * Mount our keyboard into the stock keyboard popup document, above Steam's keyboard.
 * @param {Document} doc - The popup's document
 * @param {OverlayHandlers} handlers - Callbacks
 * @returns {Overlay} The mounted overlay
 * @example
 * const overlay = mountOverlay(popupWindow.document, handlers);
 * overlay.render({ shift: 'off' });
 */
export const mountOverlay = (doc, handlers) => {
  // The Meta key shows the Windows logo on Windows and the Steam logo on SteamOS (see platform.js).
  const metaIcon = metaIconFor(detectPlatform(doc.defaultView?.navigator ?? globalThis.navigator));
  doc.getElementById(HOST_ID)?.remove();

  const host = doc.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = OVERLAY_CSS;

  const root = el(doc, 'div', 'fjk-root');
  const closeEl = el(doc, 'div', 'fjk-close');
  closeEl.title = 'Close keyboard';
  closeEl.append(createIcon(doc, 'close'));
  const soundEl = el(doc, 'div', 'fjk-sound');
  soundEl.append(createIcon(doc, 'sound'));
  soundEl.title = 'Key click sound';
  const stockEl = el(doc, 'div', 'fjk-stock', 'Steam');
  stockEl.append(createIcon(doc, 'keyboard'));
  stockEl.title = 'Switch to the stock Steam keyboard';
  // Esc and F1 to F12: small keys in the strip (they go out as key presses, with any armed modifier).
  const fKeysEl = el(doc, 'div', 'fjk-fkeys');
  for (const [action, label] of [['esc', 'esc'], ...Array.from({ length: 12 }, (_, i) => [`f${i + 1}`, `F${i + 1}`])]) {
    const button = el(doc, 'div', 'fjk-fkey', label);
    button.dataset.action = action;
    fKeysEl.append(button);
  }
  const stripEl = el(doc, 'div', 'fjk-strip');
  stripEl.append(closeEl, fKeysEl, soundEl, stockEl);
  const pagesEl = el(doc, 'div', 'fjk-pages');
  root.append(stripEl, pagesEl);
  const reenable = el(doc, 'div', 'fjk-reenable');
  reenable.title = 'frame-keyboard';
  reenable.append(createIcon(doc, 'keyboard'));

  shadow.append(style, root, reenable);

  /** @type {WeakMap<Element, KeyDef>} */
  const keyDefs = new WeakMap();

  /**
   * Build the QWERTY page's DOM.
   * @returns {{el: HTMLElement, keys: {el: HTMLElement, def: KeyDef, main: HTMLElement, hint: HTMLElement|null}[]}} The page
   * @example
   * buildPage()
   */
  const buildPage = () => {
    const pageEl = el(doc, 'div', 'fjk-page');
    const keys = [];
    for (const row of PAGES.qwerty) {
      const rowEl = el(doc, 'div', 'fjk-row');
      if (row[0]?.rowH) rowEl.style.flexGrow = String(row[0].rowH);
      for (const def of row) {
        const classes = ['fjk-key', `fjk-${def.type}`];
        if (def.side) classes.push('fjk-side');
        const keyEl = el(doc, 'div', classes.join(' '));
        keyEl.style.flexGrow = String(def.w);
        keyEl.dataset.fjkId = def.id;
        const iconId = def.id === 'meta' ? metaIcon : def.id;
        const icon = def.type === 'action' && hasIcon(iconId);
        const main = el(doc, 'span', 'fjk-label', icon ? undefined : def.label);
        if (icon) main.append(createIcon(doc, iconId));
        keyEl.append(main);
        // The character typed with shift, small in the corner (it swaps with the main label then).
        const hint = def.alt ? el(doc, 'span', 'fjk-up', def.alt) : null;
        if (hint) keyEl.append(hint);
        keyDefs.set(keyEl, def);
        keys.push({ el: keyEl, def, main, hint });
        rowEl.append(keyEl);
      }
      pageEl.append(rowEl);
    }
    pagesEl.append(pageEl);
    return { el: pageEl, keys };
  };
  const page = buildPage();

  /**
   * @typedef {object} Gesture
   * @property {'touch'|'mouse'} source - Input kind
   * @property {number} id - Touch identifier or pointer id
   * @property {'key'|'bar'} kind - A key press, or a press on a strip button
   * @property {number} x0 - Start X
   * @property {number} y0 - Start Y
   * @property {HTMLElement|null} keyEl - Pressed key element
   * @property {KeyDef|null} def - Pressed key definition
   * @property {HTMLElement|null} barTarget - Strip button pressed
   * @property {number|undefined} timer - Auto-repeat timer
   * @property {boolean} [instant] - The key already acted on press
   * @property {number|null} [presser] - Index of the pressing laser, when known
   * @property {{x: number, y: number}|null} [cursorBase] - The pressing laser's first report after the press
   * @property {{x: number, y: number}|null} [cursorPoint] - Current point from the pressing laser's stream
   * @property {string} [endSource] - Where the end point came from: release, stream or touch
   * @property {boolean} [released] - touchend seen; waiting for the laser's release event
   * @property {object[]} [startCursors] - All cursors at the press (gesture log)
   */
  /** @type {Gesture|null} */
  let gesture = null;
  let lastTouchTime = 0;
  /** @type {(() => void)|null} A released press waiting for its laser's release event. */
  let pendingFinish = null;

  const popupWindow = doc.defaultView;
  const dpr = popupWindow?.devicePixelRatio || 1;
  // Cursor positions are expected in the popup's CSS px (like touch clientX/Y); if they turn out to
  // be device pixels, the scale that fits the first press is learned (1, dpr or 1/dpr).
  const tracker = createCursorTracker({ scales: dpr === 1 ? [1] : [1, dpr, 1 / dpr] });
  /** Recent key gestures, numbers only (debug). */
  let gestureLog = [];

  /** What a laser can hover: the keys and the strip's buttons. */
  const HOVER_SELECTOR = '.fjk-key, .fjk-close, .fjk-fkey, .fjk-sound, .fjk-stock';
  /** A laser that has not reported for this long (ms) no longer hovers anything (SteamVR streams only the focused laser). */
  const HOVER_STALE_MS = 250;
  /** @type {Map<number, HTMLElement>} The element each laser (cursor index) is over. */
  const hovered = new Map();
  /** @type {Map<number, number>} When each laser last reported (performance.now()). */
  const hoverSeen = new Map();

  /**
   * Highlight the element a laser is over (each laser has its own; two lasers can share one).
   * @param {number} index - Cursor index
   * @param {HTMLElement|null} target - Element under the laser, or null when it is over nothing
   * @returns {void}
   * @example
   * setHover(0, keyEl)
   */
  const setHover = (index, target) => {
    const previous = hovered.get(index) ?? null;
    if (previous === target) return;
    if (target) hovered.set(index, target);
    else hovered.delete(index);
    if (previous && ![...hovered.values()].includes(previous)) previous.classList.remove('fjk-hover');
    target?.classList.add('fjk-hover');
  };

  /**
   * Remove every hover highlight.
   * @returns {void}
   * @example
   * clearHover()
   */
  const clearHover = () => {
    for (const node of new Set(hovered.values())) node.classList.remove('fjk-hover');
    hovered.clear();
    hoverSeen.clear();
  };

  /**
   * A laser cursor moved (SteamVR reports each controller's cursor separately).
   * @param {number} index - Cursor index
   * @param {boolean} active - Whether it is on the popup
   * @param {number} x - X
   * @param {number} y - Y
   * @returns {void}
   * @example
   * onCursor(1, true, 400, 120)
   */
  const onCursor = (index, active, x, y) => {
    tracker.update(index, !!active, Number(x), Number(y));
    try {
      if (!active || root.hidden) {
        setHover(index, null);
      } else {
        const t = performance.now();
        hoverSeen.set(index, t);
        // SteamVR streams only the laser it focuses; when focus moves to the other hand the first
        // laser goes silent, so drop its highlight instead of leaving it on the last key it touched.
        for (const other of [...hovered.keys()]) {
          if (other !== index && t - (hoverSeen.get(other) ?? 0) > HOVER_STALE_MS) setHover(other, null);
        }
        const scale = tracker.scale ?? 1;
        setHover(index, closest(shadow.elementFromPoint(Number(x) * scale, Number(y) * scale), HOVER_SELECTOR));
      }
    } catch {
      clearHover(); // Hover is only a hint; never let it break pressing.
    }
    const g = gesture;
    // After touchend the stream is laser movement after the release: it no longer moves the press.
    if (!active || !g || g.presser !== index || g.released) return;
    // The first report after the press is where the laser was at touchstart.
    g.cursorBase ??= { x: Number(x), y: Number(y) };
    g.cursorPoint = { x: g.x0 + (Number(x) - g.cursorBase.x), y: g.y0 + (Number(y) - g.cursorBase.y) };
    moveGesture(g.cursorPoint.x, g.cursorPoint.y);
  };
  // Temporary passive recorder of raw input around presses (numbers only; see input-recorder.js).
  const recorder = handlers.onRecord ? createInputRecorder({ onWindow: handlers.onRecord }) : null;
  const recordTypes = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel'];
  /**
   * Feed a DOM event to the recorder.
   * @param {Event} e - Touch or pointer event
   * @returns {void}
   * @example
   * recordEvent(event)
   */
  const recordEvent = (e) => (e.type.startsWith('touch') ? recorder.touch(e) : recorder.pointer(e));
  if (recorder) for (const type of recordTypes) doc.addEventListener(type, recordEvent, { capture: true, passive: true });

  let cursorHandle = null;
  try {
    cursorHandle = popupWindow?.SteamClient?.OpenVR?.VROverlay?.RegisterForCursorMovement?.((...args) => {
      recorder?.cursor(...args);
      onCursor(...args);
    }) ?? null;
  } catch {
    cursorHandle = null; // Touch events alone then.
  }

  /**
   * End the current gesture without firing anything.
   * @returns {void}
   * @example
   * cancelGesture()
   */
  const cancelGesture = () => {
    if (!gesture) return;
    clearTimeout(gesture.timer);
    clearInterval(gesture.timer);
    gesture.keyEl?.classList.remove('fjk-pressed');
    gesture.barTarget?.classList.remove('fjk-pressed');
    gesture = null;
  };

  /**
   * Start a press on a key or on a strip button.
   * @param {EventTarget|null} target - Event target (inside the shadow root)
   * @param {number} x - Client X
   * @param {number} y - Client Y
   * @param {'touch'|'mouse'} source - Input kind
   * @param {number} id - Touch identifier or pointer id
   * @returns {boolean} Whether something was pressed
   * @example
   * startGesture(event.target, 10, 20, 'touch', 0)
   */
  const startGesture = (target, x, y, source, id) => {
    let presser = null;
    let startCursors;
    if (source === 'touch' && cursorHandle) {
      presser = tracker.pressingIndex() ?? tracker.pick(x, y)?.index ?? null;
      startCursors = tracker.snapshot();
    }
    const base = {
      source, id, x0: x, y0: y, timer: undefined,
      presser, cursorBase: null, cursorPoint: null, startCursors,
    };
    if (closest(target, '.fjk-strip')) {
      cancelGesture();
      const barTarget = closest(target, '.fjk-close') ?? closest(target, '.fjk-fkey') ?? closest(target, '.fjk-sound') ?? closest(target, '.fjk-stock');
      gesture = { ...base, kind: 'bar', keyEl: null, def: null, barTarget };
      barTarget?.classList.add('fjk-pressed');
      if (barTarget) handlers.onKeyDown?.(null);
      return true;
    }
    const keyEl = closest(target, '.fjk-key');
    const def = keyEl ? keyDefs.get(keyEl) : undefined;
    if (!keyEl || !def) return false;
    cancelGesture();
    gesture = { ...base, kind: 'key', keyEl, def, barTarget: null };
    keyEl.classList.add('fjk-pressed');
    const g = gesture;
    handlers.onKeyDown?.(def);
    // Every key acts on press, not on release, so fast typing is never held up waiting for a
    // release (and never loses a key to an overlapping press).
    g.instant = true;
    if (def.type === 'char') {
      handlers.onChar(def);
    } else {
      handlers.onAction(def.id);
    }
    if (def.repeat) {
      g.timer = setTimeout(() => {
        g.timer = setInterval(() => handlers.onAction(def.id), REPEAT_INTERVAL_MS);
      }, REPEAT_DELAY_MS);
    }
    return true;
  };

  /**
   * Track movement of the current press (a press on a strip button stops being a tap when it moves).
   * @param {number} x - Client X
   * @param {number} y - Client Y
   * @returns {void}
   * @example
   * moveGesture(40, 20)
   */
  const moveGesture = (x, y) => {
    if (gesture?.kind !== 'bar') return;
    if (Math.hypot(x - gesture.x0, y - gesture.y0) >= BAR_TAP_SLOP) gesture.barTarget?.classList.remove('fjk-pressed');
  };

  /**
   * Finish the current press and fire its strip button.
   * @param {number} x - Client X
   * @param {number} y - Client Y
   * @returns {void}
   * @example
   * endGesture(40, 20)
   */
  const endGesture = (x, y) => {
    if (!gesture) return;
    const { kind, def, x0, y0, barTarget, source, presser, endSource, startCursors } = gesture;
    cancelGesture();
    if (kind === 'key') {
      const record = {
        source,
        presser: presser ?? null,
        end: endSource ?? source,
        start: [Math.round(x0), Math.round(y0)],
        endPoint: [Math.round(x), Math.round(y)],
        cursors: startCursors ?? null,
        key: def.type, // "char" or "action": no text
      };
      gestureLog = [...gestureLog, record].slice(-30);
      handlers.onGesture?.(record);
      return;
    }
    if (!barTarget || Math.hypot(x - x0, y - y0) >= BAR_TAP_SLOP) return;
    if (barTarget.classList.contains('fjk-close')) handlers.onAction('close');
    else if (barTarget.classList.contains('fjk-stock')) handlers.onAction('stock');
    else if (barTarget.classList.contains('fjk-sound')) handlers.onSoundTap();
    else handlers.onAction(barTarget.dataset.action);
  };

  /**
   * Find our touch in a TouchList.
   * @param {TouchList} list - changedTouches
   * @returns {Touch|undefined} The touch of the current gesture
   * @example
   * findTouch(event.changedTouches)
   */
  const findTouch = (list) => Array.from(list).find((t) => gesture && t.identifier === gesture.id);

  /**
   * Start a press from a touch (VR laser trigger pulled).
   * @param {TouchEvent} e - The touchstart event
   * @returns {void}
   * @example
   * root.addEventListener('touchstart', onTouchStart)
   */
  const onTouchStart = (e) => {
    e.preventDefault(); // No emulated mouse events, no scrolling.
    e.stopPropagation();
    lastTouchTime = Date.now();
    pendingFinish?.();
    // A key that already acted on press may be replaced by a new press (fast typing, two lasers);
    // the strip still takes one press at a time.
    if (gesture?.instant) cancelGesture();
    if (gesture) return; // One press at a time; a second laser is ignored.
    const touch = e.changedTouches[0];
    if (touch) startGesture(e.target, touch.clientX, touch.clientY, 'touch', touch.identifier);
  };
  /**
   * Track a touch press.
   * @param {TouchEvent} e - The touchmove event
   * @returns {void}
   * @example
   * root.addEventListener('touchmove', onTouchMove)
   */
  const onTouchMove = (e) => {
    e.preventDefault();
    if (gesture?.source !== 'touch' || gesture.cursorPoint) return;
    const touch = findTouch(e.changedTouches);
    if (touch) moveGesture(touch.clientX, touch.clientY);
  };
  /**
   * Finish a touch press.
   * @param {TouchEvent} e - The touchend event
   * @returns {void}
   * @example
   * root.addEventListener('touchend', onTouchEnd)
   */
  const onTouchEnd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    lastTouchTime = Date.now();
    if (gesture?.source !== 'touch') return;
    const touch = findTouch(e.changedTouches);
    if (!touch) return;
    const g = gesture;
    const tEnd = performance.now();
    const touchEnd = { x: touch.clientX, y: touch.clientY };
    g.released = true;
    /**
     * Finish the press: the pressing laser's release point, else its streamed point, else the touch.
     * @returns {void}
     * @example
     * finish()
     */
    const finish = () => {
      pendingFinish = null;
      if (gesture !== g) return;
      const release = g.presser === null ? null : tracker.releasePoint(g.presser, tEnd);
      g.endSource = release ? 'release' : g.cursorPoint ? 'stream' : 'touch';
      const p = release ?? g.cursorPoint ?? touchEnd;
      endGesture(p.x, p.y);
    };
    if (g.presser === null) {
      finish();
      return;
    }
    pendingFinish = finish;
    setTimeout(() => pendingFinish === finish && finish(), RELEASE_WAIT_MS);
  };
  /**
   * Abort a touch press.
   * @param {TouchEvent} e - The touchcancel event
   * @returns {void}
   * @example
   * root.addEventListener('touchcancel', onTouchCancel)
   */
  const onTouchCancel = (e) => {
    if (gesture?.source === 'touch' && findTouch(e.changedTouches)) cancelGesture();
  };
  /**
   * Start a press from a mouse (desktop debugging fallback).
   * @param {PointerEvent} e - The pointerdown event
   * @returns {void}
   * @example
   * root.addEventListener('pointerdown', onPointerDown)
   */
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (gesture?.instant) cancelGesture();
    if (gesture) return;
    if (Date.now() - lastTouchTime < MOUSE_AFTER_TOUCH_MS) return;
    if (startGesture(e.target, e.clientX, e.clientY, 'mouse', e.pointerId)) {
      e.preventDefault();
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        // Capture is optional.
      }
    }
  };
  /**
   * Track a mouse press.
   * @param {PointerEvent} e - The pointermove event
   * @returns {void}
   * @example
   * root.addEventListener('pointermove', onPointerMove)
   */
  const onPointerMove = (e) => {
    if (gesture?.source === 'mouse' && e.pointerId === gesture.id) moveGesture(e.clientX, e.clientY);
  };
  /**
   * Finish a mouse press.
   * @param {PointerEvent} e - The pointerup event
   * @returns {void}
   * @example
   * root.addEventListener('pointerup', onPointerUp)
   */
  const onPointerUp = (e) => {
    if (gesture?.source === 'mouse' && e.pointerId === gesture.id) endGesture(e.clientX, e.clientY);
  };
  /**
   * Abort a mouse press.
   * @param {PointerEvent} e - The pointercancel event
   * @returns {void}
   * @example
   * root.addEventListener('pointercancel', onPointerCancel)
   */
  const onPointerCancel = (e) => {
    if (gesture?.source === 'mouse' && e.pointerId === gesture.id) cancelGesture();
  };

  /**
   * Cancel an event's default action.
   * @param {Event} e - Event
   * @returns {void}
   * @example
   * el.addEventListener('contextmenu', preventDefault)
   */
  const preventDefault = (e) => e.preventDefault();

  const active = { passive: false };
  root.addEventListener('touchstart', onTouchStart, active);
  root.addEventListener('touchmove', onTouchMove, active);
  root.addEventListener('touchend', onTouchEnd, active);
  root.addEventListener('touchcancel', onTouchCancel);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerCancel);
  root.addEventListener('contextmenu', preventDefault);

  /**
   * Handle a press on the re-enable button (touch or mouse).
   * @param {Event} e - touchend or pointerup event
   * @returns {void}
   * @example
   * onReenable(event)
   */
  const onReenable = (e) => {
    if (e.type === 'pointerup' && (/** @type {PointerEvent} */ (e).pointerType !== 'mouse' || Date.now() - lastTouchTime < MOUSE_AFTER_TOUCH_MS)) return;
    if (e.type === 'touchend') lastTouchTime = Date.now();
    e.preventDefault();
    e.stopPropagation();
    handlers.onEnable();
  };
  reenable.addEventListener('touchstart', preventDefault, active);
  reenable.addEventListener('touchend', onReenable, active);
  reenable.addEventListener('pointerup', onReenable);

  /**
   * Update a key's label text (only when it changed).
   * @param {{main: HTMLElement}} key - Rendered key
   * @param {string} text - New label
   * @returns {void}
   * @example
   * setLabel(key, 'A')
   */
  const setLabel = (key, text) => {
    if (key.main.textContent !== text) key.main.textContent = text;
  };

  /**
   * Update every state-dependent label and button.
   * @param {RenderState} state - What to show
   * @returns {void}
   * @example
   * render({ shift: 'off' })
   */
  const render = (state) => {
    const { shift } = state;
    soundEl.classList.toggle('fjk-sound-off', state.sound === false);
    for (const key of page.keys) {
      const { def, el: keyEl } = key;
      switch (def.id) {
        case 'ctrl':
        case 'alt':
        case 'meta':
          keyEl.classList.toggle('fjk-on', !!state.modifiers?.[def.id]);
          break;
        case 'shift':
          keyEl.classList.toggle('fjk-on', shift !== 'off');
          keyEl.classList.toggle('fjk-lock', shift === 'lock');
          break;
        default:
          if (def.letter) setLabel(key, shift === 'off' ? def.ch : def.ch.toUpperCase());
          else if (def.alt) {
            const shifted = shift !== 'off';
            setLabel(key, shifted ? def.alt : def.ch);
            if (key.hint) key.hint.textContent = shifted ? def.ch : def.alt;
          }
      }
    }
  };

  let enabled = true;
  let bounds = { top: 0, bottom: 0 };

  /**
   * Apply host geometry: full overlay when enabled, only the small button when disabled.
   * @returns {void}
   * @example
   * applyHostStyle()
   */
  const applyHostStyle = () => {
    const base = 'position:fixed;z-index:2147483647;display:block;margin:0;padding:0;border:0;touch-action:none;';
    host.style.cssText = enabled
      ? `${base}left:0;right:0;top:${bounds.top}px;bottom:${bounds.bottom}px;`
      : `${base}right:0;top:0;width:48px;height:30px;`;
    root.hidden = !enabled;
    reenable.hidden = enabled;
    stockGuard.setActive(enabled);
  };

  // Controller buttons and a grown stock panel must not reach or show the stock keyboard under ours.
  const stockGuard = createStockGuard(doc);
  applyHostStyle();
  (doc.body ?? doc.documentElement).append(host);

  /**
   * Show our keyboard (true) or only the small re-enable button (false).
   * @param {boolean} value - Enabled state
   * @returns {void}
   * @example
   * setEnabled(false)
   */
  const setEnabled = (value) => {
    enabled = !!value;
    cancelGesture();
    clearHover();
    applyHostStyle();
  };

  /**
   * Fit the overlay to the stock key panel: below the buffered-mode text line and above the empty
   * strip at the bottom of the popup, where SteamVR draws the keyboard's move bar.
   * @param {{top: number, bottom: number}} value - Distances from the popup's top and bottom edges in CSS px
   * @returns {void}
   * @example
   * setBounds({ top: 40, bottom: 41 })
   */
  const setBounds = (value) => {
    if (value.top === bounds.top && value.bottom === bounds.bottom) return;
    bounds = { top: value.top, bottom: value.bottom };
    applyHostStyle();
  };

  /**
   * Remove the overlay from the popup.
   * @returns {void}
   * @example
   * destroy()
   */
  const destroy = () => {
    cancelGesture();
    try {
      cursorHandle?.unregister?.();
      cursorHandle?.Unregister?.();
    } catch {
      // Already gone with the popup.
    }
    cursorHandle = null;
    clearHover();
    if (recorder) for (const type of recordTypes) doc.removeEventListener(type, recordEvent, { capture: true });
    stockGuard.destroy();
    host.remove();
  };

  /**
   * Rects of the overlay's parts in popup CSS px (debug).
   * @returns {object} Measurements
   * @example
   * measure().pad // {x: 4, y: 29, w: 846, h: 207}
   */
  const measure = () => {
    /**
     * Rect of an element, rounded to 0.01 px.
     * @param {Element} node - Element
     * @returns {{x: number, y: number, w: number, h: number}} Rect
     * @example
     * rect(root)
     */
    const rect = (node) => {
      const b = node.getBoundingClientRect();
      const r2 = (v) => Math.round(v * 100) / 100;
      return { x: r2(b.left), y: r2(b.top), w: r2(b.width), h: r2(b.height) };
    };
    const rows = [...page.el.children];
    return {
      root: rect(root),
      strip: rect(stripEl),
      pad: rect(pagesEl),
      rows: rows.map((row) => rect(row).h),
      firstRowKeys: rows[0] ? [...rows[0].children].map((k) => rect(k).w) : [],
    };
  };

  /**
   * Recent key gestures and the cursor state (debug; numbers only).
   * @returns {{registered: boolean, scale: number|null, dpr: number, cursors: object[], gestures: object[], stockGuard: {active: boolean, swallowed: number}}} Info
   * @example
   * gestures().gestures.at(-1).end
   */
  const gestures = () => ({
    registered: !!cursorHandle, scale: tracker.scale, dpr, cursors: tracker.snapshot(), gestures: [...gestureLog],
    stockGuard: stockGuard.stats(),
  });

  return { host, setEnabled, setBounds, render, cancelGesture, measure, gestures, destroy };
};
