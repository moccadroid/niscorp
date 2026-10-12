export type Chord = { key: string; mod: boolean; alt: boolean; shift: boolean };

export type KeyPress = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };

export const chordsOf = (value: string): Chord[] =>
  value
    .split(',')
    .map((chord) => chord.trim().toLowerCase())
    .filter((chord) => chord !== '')
    .map((chord) => {
      const parts = chord.split('+');
      // The key is what is left after the modifiers, and "+" itself may be it.
      const key = parts.at(-1) === '' ? '+' : (parts.at(-1) ?? '');
      const held = new Set(parts.slice(0, -1));
      return { key, mod: held.has('mod') || held.has('ctrl') || held.has('cmd'), alt: held.has('alt'), shift: held.has('shift') };
    });

export const isCharacter = (chord: Chord): boolean => !chord.mod && !chord.alt && chord.key.length === 1;

export const matches = (chord: Chord, press: KeyPress): boolean =>
  press.key.toLowerCase() === chord.key && (press.ctrlKey || press.metaKey) === chord.mod && press.altKey === chord.alt && (chord.shift ? press.shiftKey : true);

export const fires = (chords: readonly Chord[], press: KeyPress, isTyping: boolean): boolean => chords.some((chord) => matches(chord, press) && !(isTyping && isCharacter(chord)));
