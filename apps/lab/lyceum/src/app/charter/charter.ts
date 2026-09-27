import type { Charter } from '@niscorp/charter';

// Written once and never edited during the talk. Every change the speaker
// makes on stage is a ROW — a person's `department_id`, or a line in `grants` —
// and the identity seam turns rows into these roles.
//
// A department role is named by its department_id; assigning a person writes
// that id onto their row. The four departments differ in CLEARANCE: what their
// role is granted, and so what exists on their phone.

const ROOM_READS = ['members.read', 'departments.read'];
const DECK_READS = ['deck.read', 'slides.read'];
// The room's look: every screen reads it, the door's too (app/actions/room/).
const LOOK = ['room.read'];
// The ask: what was asked before (the router reads it as the asker) and the
// asker's own record of asking.
const ASKING = ['asks.read', 'asks.write.insert'];
// The assistant's conversation: each person's own turns (behaviors.ts).
const CONVERSING = ['assistant_turns.read', 'assistant_turns.write.insert', 'assistant_turns.write.update'];

export const CHARTER: Charter = {
  // Anonymous: the door and nothing else — and, once stepping in has made
  // them somebody, the one write that makes them a member: their own row
  // (the engine stamps whose; vex/behaviors.ts).
  public: { actions: ['door.*', 'room.*'], data: ['members.write.insert', ...LOOK] },

  // Everybody in the room, assigned or not: the ID card. Never worn alone —
  // the roles below extend it.
  // Everybody may put a question to the records (the ask) — the one tool
  // every clearance shares; what the answer can reach is still theirs.
  // …and an assistant: the same one everybody has, built for each person from
  // what these grants select (app/assistant/assistants.ts).
  member: { actions: ['member.*', 'ask.*', 'assistant.*', 'room.*'], data: [...ROOM_READS, ...ASKING, ...CONVERSING, ...LOOK] },

  unassigned: { extends: ['member'] },
  // Every department gets its badge; each gets one clearance of its own.
  records: { extends: ['member'], actions: ['records.*'] },
  // Forms may change a member's record — their OWN: the role reaches at the
  // `personal` profile (vex/behaviors.ts), which pins every update it makes on
  // `members` to the caller's row. Reach is the role's and is not inherited,
  // so the speaker's assignment and the registry's cards still reach the room.
  forms: { extends: ['member'], actions: ['forms.*'], data: ['members.write.update'], scoping: 'personal' },
  inquiries: { extends: ['member'], actions: ['inquiries.*'] },
  archive: { extends: ['member'], actions: ['archive.*'] },

  // The speaker's controller and the projector: two principals, two devices.
  // The speaker moves the deck and assigns the room, as themselves; the
  // controller's tools change with the slide. The stage shows the deck —
  // every slide is an action only the stage is granted.
  speaker: { actions: ['speaker.*', 'tools.*', 'assistant.*', 'room.*'], data: [...ROOM_READS, ...DECK_READS, ...LOOK, 'room.write.update', 'slide_notes.read', 'slide_tools.read', 'deck.write.update', 'members.write.update', 'timers.read', 'timers.write.insert', ...CONVERSING] },
  stage: { actions: ['stage.*', 'slide.*', 'room.*'], data: [...ROOM_READS, ...DECK_READS, 'asks.read', ...LOOK] },

  // The kit's kitchen sink: every piece of the look on one screen (dev).
  kit: { actions: ['kit.*'] },

  // The Ministry's registry: a principal that is not a person, which issues
  // ID cards — it writes the card fields as the model writes them.
  registry: { data: ['members.read', 'members.write.update'] },

  // The talk's clock: a principal that is not a person, which a saved timer
  // runs as (server/timing.ts). It can put a slide on screen and nothing else —
  // whatever a model wrote into a timer, this is all it can reach.
  clock: { data: ['deck.write.update'] },

  // ── machinery: roles nobody wears, each granted exactly its job ──
  // Reads who somebody is, for the identity seam.
  identity: { data: ['members.read', 'grants.read'] },
  // Issues a one-time sign-in link and redeems it: writes it, uses it up.
  gatekeeper: { data: ['login_links.write.insert', 'login_links.write.delete'] },
  // Reads the saved timers at boot, to load them into tide.
  scheduler: { data: ['timers.read'] },
};

// The role combinations a principal can resolve to — declared, because roles
// come from rows and there is no static assignment map to derive them from.
export const WEARABLE: readonly (readonly string[])[] = [
  ['public'],
  ['unassigned'],
  ['records'],
  ['forms'],
  ['inquiries'],
  ['archive'],
  ['speaker'],
  ['stage'],
  ['kit'],
  ['registry'],
  ['clock'],
];
