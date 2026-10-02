import type { Charter } from '@niscorp/charter';

// Written once and never edited during the talk. Every change the speaker
// makes on stage is a ROW — a line in `grants` — and the identity seam turns
// rows into these roles.

const MEMBERS_READ = ['members.read'];
const DECK_READS = ['deck.read', 'slides.read'];
// Which renderer draws each surface: every screen reads its own row, the
// door's too (server/renderers.ts).
const LOOK = ['renderers.read'];
// Queries from words: the ones run before (the router reads them, as the
// caller) and the caller's own record of running one.
const QUERYING = ['queries.read', 'queries.write.insert'];
// The room's Q&A: questions for the speaker — sent and read by their sender,
// their own only (vex/behaviors.ts). Not edited, not taken back: a question is
// judged once, as it was sent (server/moderation.ts).
const QUESTIONING = ['questions.write.insert', 'questions.read'];
// The assistant's conversation: each person's own turns (behaviors.ts).
const CONVERSING = ['assistant_turns.read', 'assistant_turns.write.insert', 'assistant_turns.write.update'];

// The talk, put back to how it starts (vex/reset.entries.ts): what the speaker
// may delete is what a reset can delete — who joined and what they left
// behind, the speaker's own timers, the names refused.
const RESETTING = ['members.write.delete', 'questions.write.delete', 'queries.write.delete', 'presses.write.delete', 'assistant_turns.write.delete', 'timers.write.delete', 'refused_names.read', 'refused_names.write.delete'];

export const CHARTER: Charter = {
  // Anonymous: the door and nothing else — and, once stepping in has made
  // them somebody, the one write that makes them a member: their own row
  // (the engine stamps whose; vex/behaviors.ts).
  public: { actions: ['door.*'], data: ['members.write.insert', ...LOOK] },

  // Everybody who joined: their phone. Everybody may query the records from
  // words; what the result can reach is still theirs. And send the speaker a
  // question — through the QA Company, once it is installed.
  // The assistant is a role of its own, below: given during the talk.
  // …and any integration's screens for members (`ext.member.*`): an
  // integration can only land inside this fence, and only once installed and
  // approved (the controller's Integrations tool) — the QA Company's Q&A among them.
  member: { actions: ['member.*', 'query.*', 'ext.member.*'], data: [...MEMBERS_READ, ...QUERYING, ...QUESTIONING, ...CONVERSING, ...LOOK] },

  // The speaker's controller and the projector: two principals, two devices.
  // The speaker moves the deck, as themselves; the controller's tools change
  // with the slide. The stage shows the deck —
  // every slide is an action only the stage is granted.
  // The speaker reaches every question in the room (`room`, vex/behaviors.ts)
  // — a member reaches their own. Every other table reads at its default.
  // …and any integration's screen for the speaker (`ext.speaker.*`): The QA Company's
  // list of every question, on the controller once installed and approved.
  speaker: { scoping: 'room', actions: ['speaker.*', 'tools.*', 'assistant.*', 'ext.speaker.*'], data: [...MEMBERS_READ, ...DECK_READS, ...LOOK, 'renderers.write.update', 'grants.read', 'grants.write.insert', 'grants.write.delete', 'slide_notes.read', 'slide_tools.read', 'deck.write.update', 'timers.read', 'timers.write.insert', 'questions.read', 'question_verdicts.read', ...CONVERSING, ...RESETTING] },
  // The stage also reads the moderator's verdicts at the `stage` reach —
  // only those that say fit to show, whatever it asks for (vex/behaviors.ts) —
  // for an integration's screen on the projector (`ext.stage.*`): The QA Company's, on
  // the last slide. It reads no question itself: nothing unjudged or unfit can
  // reach the projector, by the engine, not by which query an action calls.
  stage: { scoping: 'stage', actions: ['stage.*', 'slide.*', 'ext.stage.*'], data: [...MEMBERS_READ, ...DECK_READS, 'queries.read', 'timers.read', 'question_verdicts.read', 'presses.read', ...LOOK] },

  // Given on stage, taken back the same way: a grant row per member
  // (vex/grant.entries.ts). The X-ray reads the shell a person already has,
  // and no table.
  xray: { actions: ['xray.*'] },

  // The assistant, on a phone: given during the talk, the same way. (What it
  // may read and write is the member's already — it acts as them.)
  assistant: { actions: ['assistant.*'] },

  // The button: an action three people are given, and the one write it makes.
  // Nobody else has either — not the action on their screen, not the write in
  // the engine.
  button: { actions: ['button.*'], data: ['presses.write.insert'] },

  // The kit's kitchen sink: every piece of the look on one screen (dev).
  kit: { actions: ['kit.*'] },

  // The speaker's sign-in desk: what a device opening /speaker is given — a
  // line for an address, and a link mailed if it is the speaker's — drawn by
  // the phones' renderer. Nothing else exists for it: the mail goes
  // out server-side.
  lectern: { actions: ['lectern.*'], data: [...LOOK] },

  // The moderator: a principal that is not a person. It judges what people
  // write that the room could see (server/moderation.ts) — every question,
  // at `room` reach — and keeps the typed names it refused. It reads who has
  // which name, so the door offers names nobody has.
  moderator: { scoping: 'room', data: ['members.read', 'refused_names.write.insert', 'questions.read', 'question_verdicts.read', 'question_verdicts.write.insert'] },

  // The talk's clock: a principal that is not a person, which a saved timer
  // runs as (server/timing.ts). It can put a slide on screen and nothing else —
  // whatever a model wrote into a timer, this is all it can reach. (`notify`
  // writes nothing: it shows a message in a live shell, server-side.)
  clock: { data: ['deck.write.update'] },

  // ── machinery: roles nobody wears, each granted exactly its job ──
  // Reads who somebody is, for the identity seam.
  identity: { data: ['members.read', 'grants.read'] },
  // Issues a one-time sign-in link and redeems it: writes it, uses it up —
  // and gives a device at /speaker its sign-in desk (a `lectern` grant).
  gatekeeper: { data: ['login_links.write.insert', 'login_links.write.delete', 'grants.write.insert'] },
  // Reads the saved timers at boot, to load them into tide — and the deck, to
  // hold each to a slide that still exists.
  scheduler: { data: ['timers.read', 'slides.read'] },
};

// The role combinations a principal can resolve to — declared, because roles
// come from rows and there is no static assignment map to derive them from.
export const WEARABLE: readonly (readonly string[])[] = [
  ['public'],
  ['member'],
  ['member', 'xray'],
  ['member', 'assistant'],
  ['member', 'button'],
  ['member', 'xray', 'assistant'],
  ['member', 'xray', 'button'],
  ['member', 'assistant', 'button'],
  ['member', 'xray', 'assistant', 'button'],
  ['speaker'],
  ['stage'],
  ['kit'],
  ['lectern'],
  ['moderator'],
  ['clock'],
];
