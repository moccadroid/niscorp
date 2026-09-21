// A HOTKEY IS A CHORD, because somebody is always typing. The line holds focus
// for the whole life of the page, so a bare printable key — the backtick this
// started as — is a character in the sentence, never a command: it typed "`" into
// the line and opened nothing. A chord with a modifier is nobody's character, so
// it fires wherever focus is, and the key it rides on is swallowed whole.
//
// Pure, and apart from the component that listens (controls.tsx `Hotkey`), so
// the rule can be asserted without a browser.
//
// `value` is one chord or several, comma-separated: "mod+., mod+`". `mod` is Ctrl
// or ⌘, whichever the machine has.

export type Chord = { key: string; mod: boolean; alt: boolean; shift: boolean };

export type KeyPress = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };

export const chordsOf = (value: string): Chord[] =>
  value
    .split(',')
    .map((chord) => chord.trim().toLowerCase())
    .filter((chord) => chord !== '')
    .map((chord) => {
      const parts = chord.split('+');
      // The key is what is left after the modifiers — and "+" itself may be it.
      const key = parts.at(-1) === '' ? '+' : (parts.at(-1) ?? '');
      const held = new Set(parts.slice(0, -1));
      return { key, mod: held.has('mod') || held.has('ctrl') || held.has('cmd'), alt: held.has('alt'), shift: held.has('shift') };
    });

// Would typing this chord put a character in a field? Anything without Ctrl/⌘/Alt would.
export const isCharacter = (chord: Chord): boolean => !chord.mod && !chord.alt && chord.key.length === 1;

export const matches = (chord: Chord, press: KeyPress): boolean =>
  press.key.toLowerCase() === chord.key && (press.ctrlKey || press.metaKey) === chord.mod && press.altKey === chord.alt && (chord.shift ? press.shiftKey : true);

// Does this key press fire the hotkey? A chord that is somebody's character never
// does while they are typing — and one that is not always does.
export const fires = (chords: readonly Chord[], press: KeyPress, isTyping: boolean): boolean => chords.some((chord) => matches(chord, press) && !(isTyping && isCharacter(chord)));
