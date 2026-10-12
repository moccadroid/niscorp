import type { Charter } from '@niscorp/charter';

const MEMBERS_READ = ['members.read'];
const DECK_READS = ['deck.read', 'slides.read'];
const LOOK = ['renderers.read'];
const QUERYING = ['queries.read', 'queries.write.insert'];
// Not edited, not taken back: a question is judged once, as it was sent.
const QUESTIONING = ['questions.write.insert', 'questions.read'];
const CONVERSING = ['assistant_turns.read', 'assistant_turns.write.insert', 'assistant_turns.write.update'];

const RESETTING = ['members.write.delete', 'questions.write.delete', 'queries.write.delete', 'presses.write.delete', 'assistant_turns.write.delete', 'timers.write.delete', 'refused_names.read', 'refused_names.write.delete'];

export const CHARTER: Charter = {
  // The one write is the row that makes them a member: their own, and the
  // engine stamps whose.
  public: { actions: ['door.*'], data: ['members.write.insert', ...LOOK] },

  member: { actions: ['member.*', 'query.*', 'ext.member.*'], data: [...MEMBERS_READ, ...QUERYING, ...QUESTIONING, ...CONVERSING, ...LOOK] },

  speaker: { scoping: 'room', actions: ['speaker.*', 'tools.*', 'assistant.*', 'ext.speaker.*'], data: [...MEMBERS_READ, ...DECK_READS, ...LOOK, 'renderers.write.update', 'grants.read', 'grants.write.insert', 'grants.write.delete', 'slide_notes.read', 'slide_tools.read', 'deck.write.update', 'timers.read', 'timers.write.insert', 'questions.read', 'question_verdicts.read', ...CONVERSING, ...RESETTING] },
  // The stage reads the moderator's verdicts at the `stage` reach, only those
  // that say fit to show, and no question itself: nothing unjudged or unfit
  // can reach the projector.
  stage: { scoping: 'stage', actions: ['stage.*', 'slide.*', 'ext.stage.*'], data: [...MEMBERS_READ, ...DECK_READS, 'queries.read', 'timers.read', 'question_verdicts.read', 'presses.read', ...LOOK] },

  xray: { actions: ['xray.*'] },

  assistant: { actions: ['assistant.*'] },

  button: { actions: ['button.*'], data: ['presses.write.insert'] },

  kit: { actions: ['kit.*'] },

  lectern: { actions: ['lectern.*'], data: [...LOOK] },

  moderator: { scoping: 'room', data: ['members.read', 'refused_names.write.insert', 'questions.read', 'question_verdicts.read', 'question_verdicts.write.insert'] },

  // A saved timer runs as `clock`: whatever a model wrote into a timer, this
  // is all it can reach.
  clock: { data: ['deck.write.update'] },

  // Roles nobody wears, each granted exactly its job.
  identity: { data: ['members.read', 'grants.read'] },
  gatekeeper: { data: ['login_links.write.insert', 'login_links.write.delete', 'grants.write.insert'] },
  scheduler: { data: ['timers.read', 'slides.read'] },
};

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
