// What an area holds: an action opened with its input, and why it is there, in words — what the model and Jev read
// when the next message arrives.
export type Canvas = { action: string; input: Record<string, unknown>; intent: string };

// A screen is canvases shown together, in an arrangement of its own, opened from the dock or a card's link without
// asking anything. The first is the one the app opens on.
export type Screen = { id: string; label: string; description: string; arrangement: string; canvases: Canvas[] };

const card = (action: string, intent: string): Canvas => ({ action, input: {}, intent });

const COUNTER: Canvas = { action: 'guide.counter', input: { title: 'Press me', count: 0 }, intent: 'a counter to press' };

const quiz = (question: string, options: string[], answer: number, explanation: string): Canvas => ({
  action: 'guide.quiz',
  input: { title: 'Quick check', question, options, answer, explanation },
  intent: `a quick check: ${question}`,
});

const TRY_ASKING: Canvas = {
  action: 'answer.text',
  input: {
    title: 'Ask for a screen',
    text: 'What you type goes to the model, and it answers with a screen of this app’s cards, filled in for you. Links and buttons never wait for it.',
    examples: ['A checklist for adding a table', 'Quiz me on the shell', 'Put the counter beside the steps', 'Only the steps, please'],
  },
  intent: 'things to ask the model',
};

export const SCREENS: readonly Screen[] = [
  {
    id: 'start',
    label: 'Start',
    description: 'The welcome, a counter to press, a quick check, the tour as a checklist, and what nisc is.',
    arrangement: 'hero',
    canvases: [
      card('guide.welcome', 'what this app is, and where to start'),
      COUNTER,
      quiz('You press a link on this screen. What changes the view?', ['The model', 'The app, straight away', 'Your browser, on its own'], 1, 'Links and buttons act at once. Only what you type below goes to the model.'),
      {
        action: 'guide.checklist',
        input: { title: 'Your tour', todo: ['Press the counter', 'Answer the quick check', 'Follow a link to a lesson', 'Ask for a screen in the line below', 'Ask the model to change a card'] },
        intent: 'the tour, as a checklist',
      },
      card('guide.nisc', 'what nisc is'),
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    description: 'Lesson 1: what an action is, the counter that is one, a quick check, how a card is drawn, and things to try.',
    arrangement: 'hero',
    canvases: [
      card('guide.actions', 'what an action is'),
      COUNTER,
      quiz('Where does the look of a card live?', ['In its layout', 'In the model’s answer', 'In the kit’s stylesheet'], 2, 'A layout only names components; the kit in src/ui/ draws them, and its stylesheet holds the look.'),
      card('guide.layouts', 'how a card is drawn'),
      {
        action: 'guide.checklist',
        input: { title: 'Try it', todo: ['Press + until the counter says 5', 'Press Start over', 'Ask for a counter that starts at 100', 'Ask for the layouts card first'] },
        intent: 'things to try in this lesson',
      },
    ],
  },
  {
    id: 'asking',
    label: 'Asking',
    description: 'Lesson 2: how a message becomes a screen, things to ask the model, and a quick check.',
    arrangement: 'hero',
    canvases: [
      card('guide.answers', 'how a message becomes a screen'),
      TRY_ASKING,
      quiz('What does the model write when you ask for a screen?', ['Which cards go where, filled in', 'React code', 'A chat reply'], 0, 'It answers with actions and their inputs, area by area, and the app checks them before they are shown.'),
    ],
  },
  {
    id: 'rules',
    label: 'Rules',
    description: 'Lesson 3: the charter, the shell on the server, reads and writes, and a quick check.',
    arrangement: 'grid',
    canvases: [
      card('guide.charter', 'what the charter decides'),
      card('guide.shell', 'what the shell and moss are'),
      card('guide.data', 'how reads and writes work'),
      quiz('Where is it decided what you may do?', ['In the browser', 'On the server, by the charter', 'In each card'], 1, 'Your browser only draws; the charter decides, on the server, what a role may reach.'),
    ],
  },
  {
    id: 'yours',
    label: 'Make it yours',
    description: 'What to delete to start your own app, and a checklist for its first feature.',
    arrangement: 'pair',
    canvases: [
      card('guide.yours', 'how to make the app yours'),
      {
        action: 'guide.checklist',
        input: { title: 'Your first feature', todo: ['Add a table in src/db/schema.ts', 'Add a read in src/app/vex/', 'Add an action that shows it', 'Grant it in the charter', 'Run npm run check'] },
        intent: 'a checklist for the first feature',
      },
    ],
  },
];
