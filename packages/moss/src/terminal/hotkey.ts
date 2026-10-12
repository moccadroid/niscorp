export type HotkeyDisposer = () => void;

export const onHotkey = (spec: string, handler: () => void): HotkeyDisposer => {
  const parts = spec.toLowerCase().split('+');
  const key = parts[parts.length - 1] ?? '';
  const mods = new Set(parts.slice(0, -1));
  // event.key, not event.code: the character the key produces, wherever the layout puts it.
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
