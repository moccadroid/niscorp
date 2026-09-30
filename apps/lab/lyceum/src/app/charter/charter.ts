import type { Charter } from '@niscorp/charter';

// Written once and never edited during the talk. Every change the speaker
// makes on stage is a ROW — a line in `grants` — and the identity seam turns
// rows into these roles.

const ROOM_READS = ['members.read'];
const DECK_READS = ['deck.read', 'slides.read'];
// Which renderer draws each surface: every screen reads its own row, the
// door's too (app/actions/look/).
const LOOK = ['renderers.read'];
// Queries from words: the ones run before (the router reads them, as the
// caller) and the caller's own record of running one.
const QUERYING = ['queries.read', 'queries.write.insert'];
// The room's Q&A: questions for the speaker — sent, read, edited and deleted by
// their sender, their own only (vex/behaviors.ts).
const QUESTIONING = ['questions.write.insert', 'questions.read', 'questions.write.update', 'questions.write.delete'];
// The assistant's conversation: each person's own turns (behaviors.ts).
const CONVERSING = ['assistant_turns.read', 'assistant_turns.write.insert', 'assistant_turns.write.update'];

export const CHARTER: Charter = {
  // Anonymous: the door and nothing else — and, once stepping in has made
  // them somebody, the one write that makes them a member: their own row
  // (the engine stamps whose; vex/behaviors.ts).
  public: { actions: ['door.*', 'look.phones'], data: ['members.write.insert', ...LOOK] },

  // Everybody who joined: the ID card. Everybody may query the records from words — the one tool every
  // clearance shares; what the result can reach is still theirs. And send the
  // speaker a question (Q&A).
  // …and an assistant: the same one everybody has, built for each person from
  // what these grants select (app/assistant/assistants.ts).
  member: { actions: ['member.*', 'query.*', 'questions.*', 'assistant.*', 'look.phones'], data: [...ROOM_READS, ...QUERYING, ...QUESTIONING, ...CONVERSING, ...LOOK] },

  // The speaker's controller and the projector: two principals, two devices.
  // The speaker moves the deck, as themselves; the controller's tools change
  // with the slide. The stage shows the deck —
  // every slide is an action only the stage is granted.
  // The speaker reaches every question in the room (`room`, vex/behaviors.ts)
  // — a member reaches their own. Every other table reads at its default.
  speaker: { scoping: 'room', actions: ['speaker.*', 'tools.*', 'assistant.*', 'look.controller'], data: [...ROOM_READS, ...DECK_READS, ...LOOK, 'renderers.write.update', 'grants.read', 'grants.write.insert', 'grants.write.delete', 'slide_notes.read', 'slide_tools.read', 'deck.write.update', 'timers.read', 'timers.write.insert', 'questions.read', ...CONVERSING] },
  stage: { actions: ['stage.*', 'slide.*', 'look.stage'], data: [...ROOM_READS, ...DECK_READS, 'queries.read', 'timers.read', ...LOOK] },

  // Given on stage, taken back the same way: a grant row per member
  // (vex/grant.entries.ts). The X-ray is somebody's own screen as data; it
  // reads the shell they already have, and no table.
  xray: { actions: ['xray.*'] },

  // The kit's kitchen sink: every piece of the look on one screen (dev).
  kit: { actions: ['kit.*'] },

  // The speaker's sign-in desk: what a device opening /speaker is given — a
  // line for an address, and a link mailed if it is the speaker's — drawn by
  // the phones' renderer. Nothing else exists for it: the mail goes
  // out server-side.
  lectern: { actions: ['lectern.*', 'look.phones'], data: [...LOOK] },

  // The Ministry's registry: a principal that is not a person, which issues
  // ID cards — it writes the card fields as the model writes them.
  registry: { data: ['members.read', 'members.write.update'] },

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
  ['speaker'],
  ['stage'],
  ['kit'],
  ['lectern'],
  ['registry'],
  ['clock'],
];
