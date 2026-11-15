// A card on a screen: one of the app's actions, opened with an input its schema takes.
export type Card = { action: string; input: Record<string, unknown> };

// A screen in the dock: its cards, one under another. The first is the one the app opens on.
export type Screen = { id: string; label: string; cards: Card[] };

const card = (action: string): Card => ({ action, input: {} });

const COUNTER: Card = { action: 'guide.counter', input: { title: 'Press me', count: 0 } };

const quiz = (question: string, options: string[], answer: number, explanation: string): Card => ({
  action: 'guide.quiz',
  input: { title: 'Quick check', question, options, answer, explanation },
});

export const SCREENS: readonly [Screen, ...Screen[]] = [
  {
    id: 'start',
    label: 'Start',
    cards: [
      card('guide.welcome'),
      COUNTER,
      quiz('You press a link on this screen. What changes the view?', ['The model', 'The app, straight away', 'Your browser, on its own'], 1, 'Links act at once. Only what you ask — typed, or a thing to ask pressed — goes to the model.'),
      { action: 'guide.checklist', input: { title: 'Your tour', todo: ['Press the counter', 'Answer the quick check', 'Follow a link to a lesson', 'Ask something in the line below', 'Ask for a counter that starts at 100'] } },
      card('guide.nisc'),
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    cards: [
      card('guide.actions'),
      COUNTER,
      quiz('Where does the look of a card live?', ['In its layout', 'In the model’s answer', 'In the kit’s stylesheet'], 2, 'A layout only names components; the kit in src/ui/ draws them, and its stylesheet holds the look.'),
      card('guide.layouts'),
      { action: 'guide.checklist', input: { title: 'Try it', todo: ['Press + until the counter says 5', 'Press Reset', 'Ask for a counter that starts at 100', 'Ask what a layout is'] } },
    ],
  },
  {
    id: 'asking',
    label: 'Asking',
    cards: [
      card('guide.answers'),
      card('guide.ask'),
      quiz('What does the model answer with?', ['A sentence, and cards filled in', 'React code', 'A new screen layout'], 0, 'It answers with a sentence and up to three of the app’s cards, each opened with an input, and the app checks them before they are shown.'),
    ],
  },
  {
    id: 'rules',
    label: 'Rules',
    cards: [
      card('guide.charter'),
      card('guide.shell'),
      card('guide.data'),
      card('guide.packages'),
      quiz('Where is it decided what you may do?', ['In the browser', 'On the server, by the charter', 'In each card'], 1, 'Your browser only draws; the charter decides, on the server, what a role may reach.'),
    ],
  },
  {
    id: 'yours',
    label: 'Make it yours',
    cards: [
      card('guide.yours'),
      { action: 'guide.checklist', input: { title: 'Your first feature', todo: ['Add a table in src/db/schema.ts', 'Add a read in src/app/vex/', 'Add an action that shows it', 'Grant it in the charter', 'Run npm run check'] } },
    ],
  },
];
