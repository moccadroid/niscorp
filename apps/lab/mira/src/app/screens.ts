// A screen holds at most this many cards.
export const CARDS_ON_A_SCREEN = 6;

export type ScreenCard = { action: string; input: Record<string, unknown>; span?: number };
export type Screen = { id: string; label: string; description: string; columns: number; ink: string; cards: ScreenCard[] };

// A person is shown the screens whose every action they hold.
export const SCREENS: readonly [Screen, ...Screen[]] = [
  {
    id: 'start',
    label: 'Start',
    description: 'Start: what Mira is, and things to ask.',
    columns: 2,
    ink: 'screen-1',
    cards: [
      { action: 'answer.text', input: { title: 'Mira', text: 'Ask for what you want to see. The answer is a screen of cards, and every screen stays in the deck.', tone: 'hero' } },
      { action: 'ask.suggestions', input: { title: 'Try asking', suggestions: ['What can you do?', 'Plan a long weekend in November'] } },
    ],
  },
  { id: 'people', label: 'People', description: 'People: everyone who can sign in, and inviting someone.', columns: 1, ink: 'screen-2', cards: [{ action: 'people.list', input: {} }] },
  {
    id: 'conversation',
    label: 'Conversation',
    description: 'Conversation: everything your person asked and what you answered.',
    columns: 1,
    ink: 'screen-3',
    cards: [{ action: 'ask.conversation', input: {} }],
  },
];
