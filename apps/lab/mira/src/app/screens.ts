// A screen is prepared answers shown together, in an arrangement of its own, opened from the menu in the bar without
// asking anything. The first is the one the app opens on, and falls back on when nothing answers a message.
export type Screen = { id: string; label: string; arrangement: string; answers: string[] };

export const SCREENS: readonly Screen[] = [
  { id: 'overview', label: 'Overview', arrangement: 'hero', answers: ['app.about', 'greetings.count', 'greetings.per-language', 'greetings.table', 'greetings.add'] },
  { id: 'greetings', label: 'Greetings', arrangement: 'pair', answers: ['greetings.table', 'greetings.add'] },
  { id: 'languages', label: 'Languages', arrangement: 'pair', answers: ['greetings.per-language', 'greetings.count'] },
];
