// Styles for the overlay. They live inside a shadow root, so they cannot leak into Steam's
// keyboard and Steam's styles cannot reach us. Class names are fjk- prefixed anyway.
//
// Look: a dark theme like common smartphone keyboards. High contrast and large glyphs,
// because the panel is small (854 x 239 CSS px) and read through a VR headset.
//
// Geometry of the 854 x 239 key panel (minimal mode):
//   padding 3 px top/bottom, 4 px left/right -> content 846 x 233
//   strip: 26 px (close, Esc and F1 to F12, click sound, Steam) + 3 px gap
//   key rows: a short number row and four rows, full width, with 3 px gaps

export const OVERLAY_CSS = `
:host { all: initial; }
* { box-sizing: border-box; touch-action: none; user-select: none; -webkit-user-select: none; }
[hidden] { display: none !important; }
.fjk-root {
  --bg: #1b1c1f; --key: #3b3e43; --key-edge: #54585f; --side: #2a2c30; --side-edge: #43464c;
  --text: #f1f3f4; --dim: #9aa0a6; --pressed: #5f6368; --accent: #8ab4f8; --accent-text: #0b1b33;
  position: absolute; inset: 0; display: flex; flex-direction: column; gap: 3px; padding: 3px 4px;
  background: var(--bg); color: var(--text);
  font-family: "Motiva Sans", sans-serif;
  touch-action: none; overflow: hidden;
}
.fjk-stock {
  flex: 0 0 auto; margin-left: auto; padding: 2px 10px; border-radius: 11px;
  font-size: 13px; color: var(--dim); border: 1px solid var(--side-edge);
}
.fjk-stock .fjk-icon { width: 15px; height: 15px; margin-left: 5px; }
.fjk-stock.fjk-pressed { background: var(--pressed); color: var(--text); }

/* Strip above the keys: close | Esc and F1 to F12 | click sound, Steam. Small, to leave the room to the keys. */
.fjk-strip {
  flex: 0 0 26px; height: 26px; min-height: 0; display: flex; align-items: stretch; gap: 6px;
  border-bottom: 1px solid #33363b;
}
.fjk-close {
  flex: 0 0 40px; width: 40px; height: 22px; align-self: center; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; border: 1px solid var(--side-edge); color: #c7ccd3; background: var(--side);
}
.fjk-close .fjk-icon { width: 18px; height: 18px; }
.fjk-close.fjk-pressed { background: var(--pressed); color: var(--text); }
.fjk-strip .fjk-stock {
  flex: 0 0 auto; margin-left: 0; height: 22px; align-self: center; display: flex; align-items: center;
  padding: 0 10px; border-radius: 6px; background: var(--side); color: #c7ccd3; font-size: 12px;
}
.fjk-sound {
  flex: 0 0 34px; width: 34px; height: 22px; align-self: center; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; border: 1px solid var(--side-edge); background: var(--side); color: #c7ccd3; font-size: 14px; cursor: pointer;
}
.fjk-sound.fjk-pressed { background: var(--pressed); color: var(--text); }
.fjk-sound .fjk-icon { width: 16px; height: 16px; }
.fjk-sound.fjk-sound-off { color: #6b7078; }
.fjk-sound.fjk-sound-off .fjk-icon-sound path:nth-child(n+2) { display: none; }
/* Esc and F1 to F12 share the strip's width. */
.fjk-fkeys { flex: 1 1 0; min-width: 0; display: flex; gap: 3px; align-self: center; margin: 0 6px; }
.fjk-fkey {
  flex: 1 1 0; min-width: 0; height: 22px; display: flex; align-items: center; justify-content: center;
  border-radius: 5px; border: 1px solid var(--side-edge); background: var(--side); color: #c7ccd3;
  font-size: 11px; cursor: pointer; overflow: hidden;
}
.fjk-fkey.fjk-pressed { background: var(--pressed); color: var(--text); }

/* Keys. */
.fjk-pages { flex: 1 1 auto; display: flex; min-height: 0; min-width: 0; }
.fjk-page { flex: 1 1 auto; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.fjk-row { flex: 1 1 0; display: flex; gap: 3px; min-height: 0; }
.fjk-key {
  position: relative; flex: 1 1 0; min-width: 0; display: flex; align-items: center; justify-content: center;
  border-radius: 8px; background: var(--key); border: 1px solid var(--key-edge);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.45);
  font-size: 32px; line-height: 1; cursor: pointer; color: var(--text);
  transition: background-color 60ms linear;
}
.fjk-key.fjk-side { background: var(--side); border-color: var(--side-edge); font-size: 22px; color: #dde1e5; }
.fjk-key.fjk-pressed { background: var(--pressed); box-shadow: none; transform: translateY(1px); }
.fjk-key.fjk-on { border-color: var(--accent); color: var(--accent); }
.fjk-key.fjk-lock { background: #394457; }
/* An armed one-shot Ctrl / Alt / Meta is filled, so it is hard to miss before the next key. */
.fjk-key.fjk-on[data-fjk-id="ctrl"], .fjk-key.fjk-on[data-fjk-id="alt"], .fjk-key.fjk-on[data-fjk-id="meta"] { background: #394457; }
.fjk-char { font-size: 28px; }
.fjk-key[data-fjk-id="space"] { font-size: 18px; color: var(--dim); }
.fjk-icon {
  width: 26px; height: 26px; display: block; fill: none; stroke: currentColor;
  stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;
}
.fjk-icon-meta-windows path, .fjk-icon-meta-steam path { fill: currentColor; stroke: none; }
/* Caps lock: the Shift arrow is filled. */
.fjk-key.fjk-lock .fjk-icon-shift path { fill: currentColor; }
.fjk-up { position: absolute; top: 2px; right: 5px; font-size: 12px; line-height: 1; color: var(--dim); }
.fjk-row:first-child .fjk-key { font-size: 20px; }
.fjk-row:first-child .fjk-up { top: 1px; right: 4px; font-size: 11px; }

.fjk-reenable {
  position: absolute; right: 2px; top: 2px; width: 44px; height: 26px; border-radius: 13px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(138, 180, 248, 0.9); color: #0b1b33; cursor: pointer; touch-action: none;
}
.fjk-reenable .fjk-icon { width: 22px; height: 22px; }
`;
