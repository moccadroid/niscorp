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

export const CHARTER: Charter = {
  // Anonymous: the door and nothing else — and, once stepping in has made
  // them somebody, the one write that makes them a member: their own row
  // (the engine stamps whose; vex/behaviors.ts).
  public: { actions: ['door.*'], data: ['members.write.insert'] },

  // Everybody in the room, assigned or not: the ID card. Never worn alone —
  // the roles below extend it.
  member: { actions: ['member.*'], data: ROOM_READS },

  unassigned: { extends: ['member'] },
  // Every department gets its badge; each gets one clearance of its own.
  records: { extends: ['member'], actions: ['department.*', 'records.*'] },
  forms: { extends: ['member'], actions: ['department.*', 'forms.*'], data: ['members.write.update'] },
  inquiries: { extends: ['member'], actions: ['department.*', 'inquiries.*'] },
  archive: { extends: ['member'], actions: ['department.*', 'archive.*'] },

  // The speaker's controller and the projector: two principals, two devices.
  // The speaker moves the deck and assigns the room, as themselves; the
  // controller's tools change with the slide. The stage shows the deck —
  // every slide is an action only the stage is granted.
  speaker: { actions: ['speaker.*', 'tools.*'], data: [...ROOM_READS, ...DECK_READS, 'slide_notes.read', 'deck.write.update', 'members.write.update'] },
  stage: { actions: ['stage.*', 'slide.*'], data: [...ROOM_READS, ...DECK_READS] },

  // The kit's kitchen sink: every piece of the look on one screen (dev).
  kit: { actions: ['kit.*'] },

  // The Ministry's registry: a principal that is not a person, which issues
  // ID cards — it writes the card fields as the model writes them.
  registry: { data: ['members.read', 'members.write.update'] },

  // ── machinery: roles nobody wears, each granted exactly its job ──
  // Reads who somebody is, for the identity seam.
  identity: { data: ['members.read', 'grants.read'] },
  // Redeems a one-time sign-in link: uses it up, and that is all.
  gatekeeper: { data: ['login_links.write.delete'] },
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
];
