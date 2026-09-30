// THE ASSISTANT, AS DATA. One assistant on every device; what it knows about a
// person and what it can do for them is assembled from these declarations —
// what a grant says about the person (`context`), what to read as them
// (`grounding`), which host tools they get (`tools`), and the action it
// `applies` to.
//
// A declaration applies to everyone who has its action. So the charter builds
// each person's assistant: `speaker: { actions: ['speaker.*', …] }` is why only
// the controller's can automate. Grounding
// reads run as the person, under their policy. Tools are the host's closed set
// (server/assistant/tools.ts): `open`, `query`, `automate`.
//
// `context` is a FACT about the person, never an instruction: how the
// assistant behaves is written once, for everybody (server/assistant/
// orchestrator.ts).

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
    grounding: [{ as: 'Their ID card', fingerprint: 'members/me', context: {}, upfront: true }],
    tools: ['query', 'open'],
    applies: { screen: 'member.card' },
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
