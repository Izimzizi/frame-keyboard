// Entry point, evaluated in Steam's SharedJSContext by the injector.
// Idempotent: a previous instance (window.__fjk) is torn down before the new one installs.
// Fail safe: if Steam's objects are missing we log [fjk] warnings and leave the stock keyboard alone.
import { computeBounds } from './bounds.js';
import { createSentenceTracker } from './sentence-tracker.js';
import { installApiRecorder } from './api-recorder.js';
import { CLIPBOARD_CHORDS, MODIFIER_CODES, createModifiers, keyForChar, keyForName, planChord, setMetaCode } from './key-chords.js';
import { detectPlatform } from './platform.js';
import { log, warn } from './log.js';
import { loadSettings, saveSettings } from './settings.js';
import { createShift } from './shift.js';
import {
  createOutput,
  findVRStatusStore,
  getKeyboardPopupWindow,
  getWebpackRequire,
  missingPrerequisites,
  getKeyboardManagers,
  isOurCall,
  releaseHeldKeys,
} from './steam.js';
import { PAGES } from './layout.js';
import { createClickSound } from './click-sound.js';
import { mountOverlay } from './ui.js';

/* global __FJK_VERSION__ */
const VERSION = typeof __FJK_VERSION__ === 'string' ? __FJK_VERSION__ : 'dev';
/** Popup and open/close check. */
const TICK_MS = 150;
const PREREQ_POLL_MS = 1000;
const PREREQ_TIMEOUT_MS = 180_000;

/**
 * Find where our overlay should sit: over the stock key panel (class "Layout_<name>"), or the popup
 * minus SteamVR's move-bar strip when the panel's rect is odd. See bounds.js.
 * @param {Document} doc - The popup document
 * @returns {{top: number, bottom: number}} Distances from the popup's top and bottom edges in CSS px
 * @example
 * overlayBounds(popup.document) // { top: 0, bottom: 41 } in minimal mode
 */
const overlayBounds = (doc) => {
  const viewportHeight = doc.defaultView?.innerHeight ?? 0;
  try {
    const panel = doc.querySelector('[class*="Layout_"]')?.getBoundingClientRect() ?? null;
    return computeBounds({ viewportHeight, panel });
  } catch {
    return computeBounds({ viewportHeight, panel: null });
  }
};

/**
 * Install the keyboard and expose window.__fjk.
 * @returns {object} The public handle (also window.__fjk)
 * @example
 * install()
 */
const install = () => {
  const settings = loadSettings();
  setMetaCode(settings.metaCode);
  const platform = detectPlatform();
  const shift = createShift();
  /** One-shot Ctrl / Alt / Meta (key-chords.js). */
  const modifiers = createModifiers();
  const output = createOutput(() => {
    const status = statusStore?.VRKeyboardStatus;
    return { buffered: !!status?.bIsOpen && !status.bMinimal, vrStatus: status };
  });
  /** @type {object[]|null} Debug capture: when set, output goes here instead of Steam. */
  let captured = null;
  /** Follows the text sent to the target (for auto-capitalization after ". "). */
  const tracker = createSentenceTracker();

  /**
   * Deliver operations to the target (or to the debug capture).
   * @param {object[]} ops - Operations: {text}, {key} or {keys}
   * @returns {boolean} False when nothing could be sent
   * @example
   * send([{ text: 'a' }])
   */
  const send = (ops) => {
    tracker.observe(ops);
    if (captured) {
      captured.push(...ops);
      return true;
    }
    return output(ops);
  };

  /**
   * Whether the next letter should be capitalized automatically (sentence start, shift off).
   * @returns {boolean} True when auto-capitalization applies
   * @example
   * autoCapital()
   */
  const autoCapital = () => settings.autoCapitalize && shift.state === 'off' && tracker.sentenceStart;

  /** @type {ReturnType<typeof mountOverlay>|null} */
  let overlay = null;
  /** @type {Document|null} */
  let overlayDoc = null;
  /** @type {{VRKeyboardStatus: {bIsOpen: boolean, bMinimal: boolean}}|null} */
  let statusStore = null;
  let wasOpen = false;
  let tickTimer;
  /**
   * Diagnostics (settings.debugRecorders, off by default; read once per injection): raw input around
   * each press, key gestures, calls into Steam's keyboard API and VR keyboard state changes, all
   * without text. Only then are any Steam functions wrapped (api-recorder.js).
   */
  const diagnostics = settings.debugRecorders === true;
  /** @type {ReturnType<typeof installApiRecorder>|null} */
  let apiRecorder = null;
  /** Last logged VR keyboard state (diagnostics). */
  let lastVrState = '';
  let prereqTimer;
  let renderQueued = false;

  /**
   * Redraw the overlay (coalesced to once per microtask).
   * @returns {void}
   * @example
   * scheduleRender()
   */
  const scheduleRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      try {
        overlay?.render({
          shift: autoCapital() && !modifiers.active ? 'once' : shift.state,
          modifiers: { ctrl: modifiers.ctrl, alt: modifiers.alt, meta: modifiers.meta },
          sound: settings.sound,
        });
      } catch (error) {
        warn('render failed', error);
      }
    });
  };

  const clicker = createClickSound(() => overlayDoc?.defaultView);

  /**
   * Turn our overlay on (our keyboard) or off (stock Steam keyboard with a small re-enable button).
   * @param {boolean} value - Enabled state
   * @returns {void}
   * @example
   * setEnabled(false)
   */
  const setEnabled = (value) => {
    settings.enabled = !!value;
    saveSettings(settings);
    if (!settings.enabled) modifiers.clear();
    overlay?.setEnabled(settings.enabled);
    scheduleRender();
    log(settings.enabled ? 'overlay enabled' : 'overlay disabled (stock keyboard)');
  };

  /**
   * The close button: close the keyboard with the key the stock keyboard uses: VKDone when the
   * popup asks for a Done key, otherwise VKClose (VirtualKeyboardManager.HandleVirtualKeyDown
   * hides the keyboard for both).
   * @returns {void}
   * @example
   * closeKeyboard()
   */
  const closeKeyboard = () => {
    send([{ key: statusStore?.VRKeyboardStatus?.bShowDoneKey ? 'VKDone' : 'VKClose' }]);
  };

  /**
   * Send one key chord (see key-chords.js).
   * @param {{ctrl?: boolean, alt?: boolean, meta?: boolean, shift?: boolean}} held - Modifiers to hold
   * @param {{code: number, shift: boolean}} key - The key
   * @returns {void}
   * @example
   * sendChord({ ctrl: true }, keyForChar('c'))
   */
  const sendChord = (held, key) => {
    send([{ keys: planChord(held, key) }]);
  };

  /**
   * Take the modifiers for the next chord: the armed Ctrl / Alt / Meta (disarmed now) and a lit Shift
   * (a one-shot Shift is used up, a locked one stays).
   * @returns {{ctrl: boolean, alt: boolean, meta: boolean, shift: boolean}} Modifiers to hold
   * @example
   * takeHeld()
   */
  const takeHeld = () => {
    const held = { ...modifiers.take(), shift: shift.state !== 'off' };
    if (shift.state === 'once') shift.reset();
    return held;
  };

  /** Action keys that go out as a key (with the armed Ctrl / Alt / Meta) instead of their usual meaning. */
  const CHORD_ACTIONS = Object.freeze({
    backspace: 'Backspace', enter: 'Enter', space: 'Space', left: 'ArrowLeft', right: 'ArrowRight',
    up: 'ArrowUp', down: 'ArrowDown',
  });
  /** Arrow actions. */
  const ARROWS = Object.freeze(['left', 'right', 'up', 'down']);
  /** Keys that always go out as key presses, with any lit Ctrl / Alt / Shift. */
  const FN_KEYS = Object.freeze({
    f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5', f6: 'F6', f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10',
    f11: 'F11', f12: 'F12', del: 'Delete',
  });

  /**
   * Esc, Ctrl, Alt, Meta, the clipboard buttons, and other keys while Ctrl / Alt / Meta is armed.
   * @param {string} id - Action id
   * @returns {boolean} True when handled here
   * @example
   * handleChordAction('copy')
   */
  const handleChordAction = (id) => {
    if (Object.hasOwn(FN_KEYS, id)) {
      sendChord(takeHeld(), keyForName(FN_KEYS[id]));
      return true;
    }
    switch (id) {
      case 'ctrl':
      case 'alt':
        modifiers.toggle(id);
        return true;
      case 'meta':
        // One tap arms Meta for the next key; a second tap sends Meta alone (the Start menu on
        // Windows), with no time limit between the two taps.
        if (modifiers.meta) send([{ keys: [[MODIFIER_CODES.meta, true], [MODIFIER_CODES.meta, false]] }]);
        modifiers.toggle('meta');
        return true;
      case 'esc':
        sendChord(takeHeld(), keyForName('Escape'));
        return true;
      case 'tab':
        sendChord(takeHeld(), keyForName('Tab'));
        return true;
      case 'cut':
      case 'copy':
      case 'paste':
        modifiers.clear();
        sendChord({ ctrl: true }, keyForChar(CLIPBOARD_CHORDS[id]));
        return true;
      default: {
        if (!Object.hasOwn(CHORD_ACTIONS, id)) return false;
        // A one-shot Shift alone makes the arrows select (Shift+←), as on a PC; not with Caps (a
        // locked Shift), which doesn't select on a PC.
        const shiftArrow = ARROWS.includes(id) && shift.state === 'once';
        // Shift+Enter is sent as that chord (a new line in a chat box or text area) instead of the
        // stock Enter, which submits.
        const shiftEnter = id === 'enter' && shift.state !== 'off';
        if (!modifiers.active && !shiftArrow && !shiftEnter) return false;
        sendChord(takeHeld(), keyForName(CHORD_ACTIONS[id]));
        return true;
      }
    }
  };

  /** Keys sent as they are when no modifier is armed. */
  const PLAIN_KEYS = Object.freeze({
    backspace: 'Backspace', enter: 'Enter', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
  });

  /**
   * Handle an action key.
   * @param {string} id - Action id from the layout
   * @returns {void}
   * @example
   * handleAction('backspace')
   */
  const handleAction = (id) => {
    if (handleChordAction(id)) {
      scheduleRender();
      return;
    }
    if (Object.hasOwn(PLAIN_KEYS, id)) send([{ key: PLAIN_KEYS[id] }]);
    else if (id === 'space') send([{ text: ' ' }]);
    else if (id === 'shift') shift.tap();
    else if (id === 'close') closeKeyboard();
    else if (id === 'stock') setEnabled(false);
    else warn('unknown action', id);
    scheduleRender();
  };

  /**
   * Handle a character key. Every key goes to the target the moment it is tapped (like the stock
   * SteamVR keyboard); there is no word buffer.
   * @param {import('./layout.js').KeyDef} def - Key definition
   * @returns {void}
   * @example
   * handleChar(def)
   */
  const handleChar = (def) => {
    if (modifiers.active) {
      // With Ctrl / Alt / Meta armed the key goes out as a chord, past auto-capitalization.
      // Shift (tap or lock) is part of the chord too.
      const key = keyForChar(def.ch);
      if (key) {
        sendChord(takeHeld(), key);
        scheduleRender();
        return;
      }
      // No key types this character (e.g. €): disarm and type it as usual.
      modifiers.clear();
      log('ctrl/alt/meta: this character has no key; typed as text');
    }
    const shifted = shift.state !== 'off';
    if (def.letter) {
      const ch = shift.apply(def.ch);
      send([{ text: !shifted && autoCapital() ? ch.toUpperCase() : ch }]);
    } else {
      // Symbol keys type their shifted character while shift is on (a one-shot shift is used up).
      if (shifted) shift.apply(def.ch);
      send([{ text: shifted && def.alt ? def.alt : def.ch }]);
    }
    scheduleRender();
  };

  /**
   * Periodic check: keep the overlay mounted in the current popup and follow open/close.
   * @returns {void}
   * @example
   * tick()
   */
  const tick = () => {
    try {
      apiRecorder?.refresh();
      const win = getKeyboardPopupWindow();
      const doc = win?.document ?? null;
      if (overlay && (doc !== overlayDoc || !overlay.host.isConnected)) {
        overlay.destroy();
        overlay = null;
        overlayDoc = null;
        log('keyboard popup changed; overlay removed');
      }
      if (!overlay && doc?.body) {
        overlay = mountOverlay(doc, {
          getSettings: () => settings,
          onChar: handleChar,
          onAction: handleAction,
          onEnable: () => setEnabled(true),
          onRecord: diagnostics ? (w) => log(`rec ${JSON.stringify(w)}`) : undefined,
          onGesture: diagnostics ? (record) => log(`gesture ${JSON.stringify(record)}`) : undefined,
          onKeyDown: () => { if (settings.sound) clicker.play(); },
          onSoundTap: () => {
            settings.sound = !settings.sound;
            saveSettings(settings);
            if (settings.sound) clicker.play();
            scheduleRender();
          },
        });
        overlayDoc = doc;
        overlay.setEnabled(settings.enabled);
        scheduleRender();
        log(`overlay mounted in keyboard popup (${win.innerWidth}x${win.innerHeight}, enabled=${settings.enabled})`);
      }
      const status = statusStore?.VRKeyboardStatus;
      const open = status ? !!status.bIsOpen : !!doc;
      if (diagnostics) {
        // Every change of the VR keyboard's state, whoever's keyboard is shown.
        const vrState = status ? `open=${!!status.bIsOpen} mode=${status.bMinimal ? 'minimal' : 'buffered'} target=${status.sOverlayKey || '-'} app=${status.unAppID} dispatch=${!!status.bDispatchEventsToSteamVR}` : 'no status';
        const state = `${vrState} popup=${doc ? 'yes' : 'no'} ours=${settings.enabled ? 'on' : 'off'}`;
        if (state !== lastVrState) log(`vr keyboard: ${state}`);
        lastVrState = state;
      }
      if (open && !wasOpen) {
        tracker.reset();
        overlay?.cancelGesture();
        log(`keyboard opened${status ? ` (${status.bMinimal ? 'minimal' : 'buffered'} mode)` : ''}`);
      } else if (!open && wasOpen) {
        modifiers.clear();
        overlay?.cancelGesture();
        log('keyboard closed');
      }
      wasOpen = open;
      if (overlay && doc) overlay.setBounds(overlayBounds(doc));
    } catch (error) {
      warn('tick failed', error);
    }
  };

  /**
   * State that decides where a HandleVirtualKeyDown call goes, for the debug recorder (no text).
   * @param {string} label - Recorded method
   * @param {any} target - The object called (a VirtualKeyboardManager for VKM methods)
   * @param {unknown[]} args - Call arguments
   * @returns {object|undefined} Extra log fields
   * @example
   * apiCallState('VKM0.HandleVirtualKeyDown', manager, ['Enter', false])
   */
  const apiCallState = (label, target, args) => {
    if (!label.endsWith('.HandleVirtualKeyDown')) return undefined;
    const status = statusStore?.VRKeyboardStatus;
    const state = {
      override: typeof target?.m_fnVROnTextEnteredOverride === 'function',
      mode: status ? (status.bIsOpen ? (status.bMinimal ? 'minimal' : 'buffered') : 'closed') : '?',
      fjk: settings.enabled && !!overlay,
    };
    if (args[0] !== 'Enter') return state;
    const onEnter = target?.m_ActiveElementProps?.onEnterKeyPress;
    return {
      ...state,
      onEnter: onEnter === undefined ? 'none' : typeof onEnter,
      dismissOnEnter: !!target?.m_bDismissOnEnter,
      target: status?.sOverlayKey || null,
      dispatchVR: status ? !!status.bDispatchEventsToSteamVR : null,
    };
  };

  /**
   * Start once Steam's objects exist.
   * @returns {void}
   * @example
   * start()
   */
  const start = () => {
    statusStore = findVRStatusStore(getWebpackRequire());
    if (!statusStore) warn('VRKeyboardStatus store not found; open/close tracking disabled');
    api.state = 'running';
    if (diagnostics) {
      try {
        apiRecorder = installApiRecorder({
          getManagers: getKeyboardManagers,
          isOurs: isOurCall,
          onCall: (entry) => log(`vk ${JSON.stringify(entry)}`),
          extra: apiCallState,
        });
        log(`debug recorders on (${apiRecorder.count} Steam methods wrapped)`);
      } catch (error) {
        warn('api recorder failed', error);
      }
    }
    tickTimer = setInterval(tick, TICK_MS);
    tick();
    log(`installed ${VERSION}`);
  };

  /**
   * Remove everything this instance added.
   * @returns {void}
   * @example
   * window.__fjk.uninstall()
   */
  const uninstall = () => {
    clearInterval(tickTimer);
    clearInterval(prereqTimer);
    apiRecorder?.uninstall();
    apiRecorder = null;
    modifiers.clear();
    releaseHeldKeys(); // nothing should be held, but never leave a key pressed in the OS
    overlay?.destroy();
    overlay = null;
    if (globalThis.__fjk === api) delete globalThis.__fjk;
    api.state = 'uninstalled';
    log(`uninstalled ${VERSION}`);
  };

  // Test hooks for driving the keyboard without a headset. Call debug.capture(true) first so
  // output is collected in debug.state().output instead of being typed into whatever has focus.
  const debug = {
    /**
     * Turn the diagnostic recorders on or off (saved; takes effect on the next injection).
     * @param {boolean} on - Recorders on/off
     * @returns {boolean} The saved setting
     * @example
     * __fjk.debug.recorders(true)
     */
    recorders: (on) => {
      settings.debugRecorders = !!on;
      saveSettings(settings);
      return settings.debugRecorders;
    },
    /**
     * Collect output instead of sending it to Steam.
     * @param {boolean} on - Capture on/off
     * @returns {boolean} The capture state
     * @example
     * __fjk.debug.capture(true)
     */
    capture: (on) => {
      captured = on ? [] : null;
      return !!captured;
    },
    /**
     * Press an action key by id (space, enter, backspace, left, right, shift, meta, ...).
     * @param {string} id - Action id
     * @returns {object} Current state
     * @example
     * __fjk.debug.key('space')
     */
    key: (id) => {
      handleAction(id);
      return debug.state();
    },
    /**
     * Tap one key of the QWERTY page by its character (optionally with shift pressed first).
     * @param {string} ch - The key's unshifted character
     * @param {boolean} [withShift=false] - Tap shift first
     * @returns {object} Current state
     * @example
     * __fjk.debug.tapChar('1', true) // types "!"
     */
    tapChar: (ch, withShift = false) => {
      if (withShift) shift.tap();
      const def = PAGES.qwerty.flat().find((k) => k.type === 'char' && k.ch === ch);
      if (!def) throw new RangeError(`no key for ${ch}`);
      handleChar(def);
      return debug.state();
    },
    /**
     * Type English text through the QWERTY keys (an upper-case letter in the input presses shift first).
     * @param {string} text - Text
     * @returns {object} Current state
     * @example
     * __fjk.debug.english('Hello')
     */
    english: (text) => {
      for (const c of Array.from(text)) {
        const letter = /^[a-z]$/i.test(c);
        if (letter && c !== c.toLowerCase() && !autoCapital() && shift.state === 'off') shift.tap();
        handleChar({ type: 'char', id: c, ch: letter ? c.toLowerCase() : c, label: c, w: 1, letter });
      }
      return debug.state();
    },
    /**
     * Send one raw key code (press and release), to find the code a key needs on this system.
     * @param {number} code - Key code
     * @returns {void}
     * @example
     * __fjk.debug.rawKey(227)
     */
    rawKey: (code) => {
      send([{ keys: [[code, true], [code, false]] }]);
    },
    /**
     * Change (and save) the code the Meta key sends.
     * @param {number} code - Key code from 1 to 255
     * @returns {number} The code now in use
     * @example
     * __fjk.debug.setMetaCode(227)
     */
    setMetaCode: (code) => {
      settings.metaCode = setMetaCode(code);
      saveSettings(settings);
      return settings.metaCode;
    },
    /**
     * Measure the overlay geometry. It is shown, measured and restored within one task, so nothing
     * visible changes (works while the overlay is disabled, too).
     * @returns {object|null} Rects in popup CSS px, or null when no overlay is mounted
     * @example
     * __fjk.debug.measure().pad
     */
    measure: () => {
      if (!overlay) return null;
      overlay.setEnabled(true);
      overlay.render({ shift: shift.state });
      const result = overlay.measure();
      overlay.setEnabled(settings.enabled);
      return result;
    },
    /**
     * Laser cursors and recent key gestures (numbers only).
     * @returns {object|null} Info, or null when no overlay is mounted
     * @example
     * __fjk.debug.gestures().gestures.at(-1)
     */
    gestures: () => overlay?.gestures() ?? null,
    /**
     * Current state for inspection.
     * @returns {object} State
     * @example
     * __fjk.debug.state()
     */
    state: () => ({
      shift: shift.state,
      modifiers: { ctrl: modifiers.ctrl, alt: modifiers.alt, meta: modifiers.meta },
      sentenceStart: tracker.sentenceStart,
      autoCapital: autoCapital(),
      output: captured ? [...captured] : null,
    }),
  };

  const api = {
    version: VERSION,
    platform,
    state: 'waiting',
    get enabled() {
      return settings.enabled;
    },
    setEnabled,
    settings,
    uninstall,
    debug,
  };
  globalThis.__fjk = api;

  const startedAt = Date.now();
  /**
   * Wait for Steam's objects; give up (and stay inert) after a timeout.
   * @returns {boolean} Whether waiting is over
   * @example
   * checkPrerequisites()
   */
  const checkPrerequisites = () => {
    const missing = missingPrerequisites();
    if (missing.length === 0) {
      start();
      return true;
    }
    if (Date.now() - startedAt > PREREQ_TIMEOUT_MS) {
      api.state = 'failed';
      warn(`giving up, stock keyboard left untouched; missing: ${missing.join(', ')}`);
      return true;
    }
    return false;
  };
  if (!checkPrerequisites()) {
    log(`waiting for Steam UI (${missingPrerequisites().join(', ')})`);
    prereqTimer = setInterval(() => {
      if (checkPrerequisites()) clearInterval(prereqTimer);
    }, PREREQ_POLL_MS);
  }
  return api;
};

/**
 * Tear down a previous instance (re-injection during development), then install.
 * @returns {void}
 * @example
 * main()
 */
const main = () => {
  const previous = globalThis.__fjk;
  if (previous && typeof previous.uninstall === 'function') {
    try {
      previous.uninstall();
    } catch (error) {
      warn('previous instance failed to uninstall', error);
    }
  }
  delete globalThis.__fjk;
  try {
    install();
  } catch (error) {
    warn('install failed; stock keyboard left untouched', error);
    // Leave an inert handle so the injector does not re-inject in a loop.
    globalThis.__fjk = { version: VERSION, state: 'failed', enabled: false, uninstall: inertUninstall };
  }
};

/**
 * Uninstall for the inert handle left after a failed install.
 * @returns {void}
 * @example
 * inertUninstall()
 */
const inertUninstall = () => {
  delete globalThis.__fjk;
};

main();
