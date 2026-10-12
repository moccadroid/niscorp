// A declaration applies to everyone who has its action. `context` is a fact
// about the person, never an instruction: how the assistant behaves is written
// once, for everybody.
export type AssistantDeclaration = {
  id: string;
  title: string;
  context: string;
  grounding: { as: string; fingerprint: string; context: Record<string, unknown>; upfront: boolean }[];
  tools: string[];
  applies: { screen: string };
};

export const ASSISTANTS: readonly AssistantDeclaration[] = [
  {
    id: 'room',
    title: 'Your assistant',
    context: 'They are in the audience, on their phone.',
    grounding: [{ as: 'The name they chose', fingerprint: 'members/me', context: {}, upfront: true }],
    tools: ['query', 'open'],
    applies: { screen: 'member.phone' },
  },
  {
    id: 'controller',
    title: 'The controller\'s assistant',
    context: "They are the speaker, on the controller that runs the talk. An automation can put one of the deck's slides on screen at a time.",
    grounding: [{ as: 'The deck, in order', fingerprint: 'slides/deck', context: {}, upfront: true }],
    tools: ['automate', 'open'],
    applies: { screen: 'speaker.console' },
  },
];
