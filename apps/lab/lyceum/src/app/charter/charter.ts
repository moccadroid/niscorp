import type { Charter } from '@niscorp/charter';

// Written once and never edited during the talk. Every grant the speaker makes
// on stage is an ASSIGNMENT — a row in `grants`, or a person's `house_id` — and
// the identity seam turns rows into these roles (PLAN.md, "the charter is
// written once").
//
// A house role is named by its house_id; the sorting gives a person the role
// by writing that id onto their row.

const ROOM_READS = ['members.read', 'houses.read'];
const DECK_READS = ['deck.read', 'slides.read'];

export const CHARTER: Charter = {
  // Anonymous: the door and nothing else — and, once stepping in has made
  // them somebody, the one write that makes them a member: their own row
  // (the engine stamps whose; vex/behaviors.ts).
  public: { actions: ['door.*'], data: ['members.write.insert'] },

  // Everybody in the room, sorted or not. Never worn alone — the roles below
  // extend it.
  member: { actions: ['member.*'], data: ROOM_READS },

  unsorted: { extends: ['member'] },
  ravens: { extends: ['member'], actions: ['house.*'] },
  owls: { extends: ['member'], actions: ['house.*'] },
  foxes: { extends: ['member'], actions: ['house.*'] },
  stags: { extends: ['member'], actions: ['house.*'] },

  // The speaker's controller and the projector: two principals, two devices.
  // The speaker moves the deck; the stage shows it — every slide is an action
  // only the stage is granted.
  // The speaker sorts the room, as themselves.
  speaker: { actions: ['speaker.*'], data: [...ROOM_READS, ...DECK_READS, 'deck.write.update', 'members.write.update'] },
  stage: { actions: ['stage.*', 'slide.*'], data: [...ROOM_READS, ...DECK_READS] },

  // The kit's kitchen sink: every piece of the look on one screen (dev).
  kit: { actions: ['kit.*'] },

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
  ['unsorted'],
  ['ravens'],
  ['owls'],
  ['foxes'],
  ['stags'],
  ['speaker'],
  ['stage'],
  ['kit'],
];
