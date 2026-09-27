// THE ASSISTANT, AS DATA. One assistant on every device; what it knows and what
// it can do for a person is assembled from these declarations — the shape of
// moss's bundle `assistants` (instructions, grounding reads, named tools,
// starters, and the action it `applies` to).
//
// A declaration applies to whoever HOLDS its action. So the charter builds each
// person's assistant: `records: { actions: ['records.*'] }` is why a Records
// member's assistant knows the register, and `speaker: { actions:
// ['speaker.*', …] }` is why only the controller's can automate. Grounding
// reads run as the person, under their policy. Tools are the host's closed set
// (server/assistant/tools.ts): `open`, `ask`, `automate`.

export type AssistantDeclaration = {
  id: string;
  title: string;
  intro: string;
  instructions: string;
  grounding: { as: string; fingerprint: string; context: Record<string, unknown>; upfront: boolean }[];
  tools: string[];
  starters: string[];
  applies: { screen: string };
};

export const ASSISTANTS: readonly AssistantDeclaration[] = [
  {
    id: 'room',
    title: 'Your assistant',
    intro: 'Ask about the room, or where to find something on your phone.',
    instructions:
      'You are the assistant on a phone in the room. Answer questions about the people in the room and the departments by asking the records. When the person wants to do something their phone offers, propose the action with `open` so they can press it — never claim you did it yourself.',
    grounding: [{ as: 'This person\'s ID card', fingerprint: 'members/me', context: {}, upfront: true }],
    tools: ['ask', 'open'],
    starters: ['What\'s my name?', 'Who arrived first?', 'How many of us are here?'],
    applies: { screen: 'member.card' },
  },
  {
    id: 'records',
    title: 'Records',
    intro: '',
    instructions: 'This person is in Records: they may read the register — everybody in the room. Their Register tab shows it.',
    grounding: [],
    tools: [],
    starters: ['Who is in Forms?'],
    applies: { screen: 'records.register' },
  },
  {
    id: 'forms',
    title: 'Forms',
    intro: '',
    instructions: 'This person is in Forms: they may change their own record. To change their name, propose `forms.rename` with the new name as `draft`.',
    grounding: [],
    tools: [],
    starters: ['Change my name to Ada Lovelace'],
    applies: { screen: 'forms.rename' },
  },
  {
    id: 'inquiries',
    title: 'Inquiries',
    intro: '',
    instructions: 'This person is in Inquiries: they may put the stored questions of the Inquiries desk to the records.',
    grounding: [],
    tools: [],
    starters: [],
    applies: { screen: 'inquiries.desk' },
  },
  {
    id: 'archive',
    title: 'Archive',
    intro: '',
    instructions: 'This person is in Archive: they may see the history — who arrived when, and where they went.',
    grounding: [],
    tools: [],
    starters: [],
    applies: { screen: 'archive.log' },
  },
  {
    id: 'controller',
    title: 'The controller\'s assistant',
    intro: 'Ask for an automation — it comes back as a document to read before you save it.',
    instructions:
      'You assist the speaker running the talk from the controller. When the speaker wants something to happen at a time or after a while, hand the request to `automate` in the speaker\'s own words; it writes the automation and you never write it yourself. The deck below is the talk\'s slides in order.',
    grounding: [{ as: 'The deck', fingerprint: 'slides/deck', context: {}, upfront: true }],
    tools: ['automate', 'open'],
    starters: ['End the talk in 30 minutes'],
    applies: { screen: 'speaker.console' },
  },
];
