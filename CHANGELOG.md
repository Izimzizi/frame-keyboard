# Changelog

## 1.0.1 - 2026-11-10

### Fixed
- Selecting several items with Ctrl-click or Shift-click did not work: an armed Ctrl or a lit Shift was only a flag in the keyboard and never reached mouse or touch clicks in other windows.

### Changed
- Ctrl and Shift are now really held down in the OS while armed (Ctrl) or lit (Shift, including Caps), so clicks in other windows become Ctrl-clicks and Shift-clicks. A key on the keyboard still sends its chord (Ctrl+C, Shift+letter) and releases the modifier; tap Ctrl or Shift again to release it.
- Held keys are released when the keyboard closes or the overlay is turned off, and the keys are redrawn unlit.
- Alt and Meta are unchanged.

## 1.0.0

First public release.
