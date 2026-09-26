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
  // Anonymous: the door and nothing else.
  public: ['door.*'],

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
  // only the stage holds.
  speaker: { actions: ['speaker.*'], data: [...ROOM_READS, ...DECK_READS, 'deck.write.update'] },
  stage: { actions: ['stage.*', 'slide.*'], data: [...ROOM_READS, ...DECK_READS] },

  // ── machinery: roles nobody wears, each holding exactly its job ──
  // Reads who somebody is, for the identity seam.
  identity: { data: ['members.read', 'grants.read'] },
  // Lets a person in: writes their member row, nothing else.
  doorkeeper: { data: ['members.write.insert'] },
  // Redeems a one-time sign-in link: uses it up, and that is all.
  gatekeeper: { data: ['login_links.write.delete'] },
  // Places people in houses.
  hat: { data: ['members.read', 'members.write.update', 'houses.read'] },
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
];
