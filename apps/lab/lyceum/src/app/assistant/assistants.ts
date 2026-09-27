// THE ASSISTANT, AS DATA. One assistant on every device; what it knows about a
// person and what it can do for them is assembled from these declarations —
// what a grant says about the person (`context`), what to read as them
// (`grounding`), which host tools they get (`tools`), and the action it
// `applies` to.
//
// A declaration applies to whoever HOLDS its action. So the charter builds each
// person's assistant: `records: { actions: ['records.*'] }` is why a Records
// member's assistant knows the register, and `speaker: { actions:
// ['speaker.*', …] }` is why only the controller's can automate. Grounding
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
    id: 'records',
    title: 'Records',
    context: 'They are in Records: their Register shows everybody in the room.',
    grounding: [],
    tools: [],
    applies: { screen: 'records.register' },
  },
  {
    id: 'forms',
    title: 'Forms',
    context: 'They are in Forms: they may change their own record, with forms.rename.',
    grounding: [],
    tools: [],
    applies: { screen: 'forms.rename' },
  },
  {
    id: 'inquiries',
    title: 'Inquiries',
    context: "They are in Inquiries: their desk runs the department's stored queries.",
    grounding: [],
    tools: [],
    applies: { screen: 'inquiries.desk' },
  },
  {
    id: 'archive',
    title: 'Archive',
    context: 'They are in Archive: their log shows who arrived when, and where they went.',
    grounding: [],
    tools: [],
    applies: { screen: 'archive.log' },
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
