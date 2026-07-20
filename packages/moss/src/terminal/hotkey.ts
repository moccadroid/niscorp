// ═══════════════════════════════════════════════════════════════
// The live-swap hotkey — isolated here because it is the one imperative,
// gimmicky corner of the terminal (a render target is not app state, so it
// can't be a nova action; it's client chrome). Keyed on `event.key`, the
// CHARACTER the key produces, so a combo matches the key the user actually
// presses on any layout — `event.code` would bind a physical QWERTY position
// (the key labelled Y sits elsewhere on QWERTZ/AZERTY). Use letter keys, not
// punctuation, so Shift never remaps the character.
// ═══════════════════════════════════════════════════════════════

export type HotkeyDisposer = () => void;

// Attach `handler` to a keydown matching `spec` (e.g. "ctrl+shift+y"); returns
// a disposer. Matches modifiers exactly, so "ctrl+shift+y" never fires on
// "ctrl+shift+alt+y".
export const onHotkey = (spec: string, handler: () => void): HotkeyDisposer => {
  const parts = spec.toLowerCase().split('+');
  const key = parts[parts.length - 1] ?? '';
  const mods = new Set(parts.slice(0, -1));
  const listener = (event: KeyboardEvent): void => {
    if (
      event.key.toLowerCase() === key &&
      event.ctrlKey === mods.has('ctrl') &&
      event.shiftKey === mods.has('shift') &&
      event.altKey === mods.has('alt') &&
      event.metaKey === (mods.has('meta') || mods.has('cmd'))
    ) {
      event.preventDefault();
      handler();
    }
  };
  window.addEventListener('keydown', listener);
  return () => window.removeEventListener('keydown', listener);
};
