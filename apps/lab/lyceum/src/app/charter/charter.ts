import type { Charter } from '@niscorp/charter';

const MEMBERS_READ = ['members.read'];
const DECK_READS = ['deck.read', 'slides.read', 'talks.read'];
const LOOK = ['renderers.read'];
const QUERYING = ['queries.read', 'queries.write.insert'];
// Not edited, not taken back: a question is judged once, as it was sent.
const QUESTIONING = ['questions.write.insert', 'questions.read'];
const CONVERSING = ['assistant_turns.read', 'assistant_turns.write.insert', 'assistant_turns.write.update'];

const RESETTING = ['members.write.delete', 'questions.write.delete', 'queries.write.delete', 'presses.write.delete', 'assistant_turns.write.delete', 'timers.write.delete', 'refused_names.read', 'refused_names.write.delete'];

export const CHARTER: Charter = {
  // The one write is the row that makes them a member: their own, and the
  // engine stamps whose.
  public: { functions: ['door.enter', 'door.names'], actions: ['door.*'], data: ['members.write.insert', ...LOOK] },

  member: { actions: ['member.*', 'query.*', 'ext.member.*'], data: [...MEMBERS_READ, ...QUERYING, ...QUESTIONING, ...CONVERSING, ...LOOK] },

  speaker: { functions: ['assistant.intro', 'assistant.turn', 'button.pick', 'integrations.approve', 'integrations.install', 'integrations.remove', 'integrations.state', 'query.ask', 'room.search', 'room.stream', 'stream.write', 'talk.reset', 'talk.switch', 'timers.delete', 'timers.save'], scoping: 'room', actions: ['speaker.*', 'tools.*', 'assistant.*', 'query.*', 'ext.speaker.*'], data: [...MEMBERS_READ, ...DECK_READS, ...LOOK, ...QUERYING, 'renderers.write.update', 'grants.read', 'grants.write.insert', 'grants.write.delete', 'slide_notes.read', 'slide_tools.read', 'deck.write.update', 'timers.read', 'timers.write.insert', 'questions.read', 'question_verdicts.read', ...CONVERSING, ...RESETTING] },
  // The stage reads the moderator's verdicts at the `stage` reach, only those
  // that say fit to show, and no question itself: nothing unjudged or unfit
  // can reach the projector.
  stage: { functions: ['assistant.mirror', 'integrations.state', 'room.address', 'room.census', 'room.checks', 'room.compile', 'room.generation', 'room.grammar', 'room.automations', 'room.stream', 'room.timer', 'room.upgrade', 'speaker.mirror'], scoping: 'stage', actions: ['stage.*', 'slide.*', 'ext.stage.*'], data: [...MEMBERS_READ, ...DECK_READS, 'queries.read', 'timers.read', 'question_verdicts.read', 'presses.read', ...LOOK] },

  xray: { functions: ['xray.document', 'xray.set'], actions: ['xray.*'] },

  assistant: { functions: ['assistant.intro', 'assistant.turn', 'timers.save'], actions: ['assistant.*'] },

  asker: { functions: ['query.ask'], actions: ['ask.*'] },
  // Automations on a phone run as whoever saved them (server/timing.ts).
  automator: { functions: ['timers.save'], actions: ['automations.*'], data: ['timers.read', 'timers.write.insert'] },
  watcher: { functions: ['room.stream'], actions: ['stream.*'] },

  button: { actions: ['button.*'], data: ['presses.write.insert'] },

  kit: { actions: ['kit.*'] },

  lectern: { functions: ['lectern.request'], actions: ['lectern.*'], data: [...LOOK] },

  moderator: { scoping: 'room', data: ['members.read', 'refused_names.write.insert', 'questions.read', 'question_verdicts.read', 'question_verdicts.write.insert'] },

  // A saved timer runs as `clock`: whatever a model wrote into a timer, this
  // is all it can reach. It reads slides to find which talk a slide is in.
  clock: { data: ['deck.write.update', 'slides.read'] },

  // Roles nobody wears, each granted exactly its job.
  identity: { data: ['members.read', 'grants.read'] },
  gatekeeper: { data: ['login_links.write.insert', 'login_links.write.delete', 'grants.write.insert'] },
  scheduler: { scoping: 'room', data: ['timers.read', 'slides.read', 'deck.read'] },
};

const GIVEN = ['xray', 'assistant', 'asker', 'automator', 'watcher', 'button'];
const combinations = (roles: readonly string[]): string[][] => roles.reduce<string[][]>((sets, role) => [...sets, ...sets.map((set) => [...set, role])], [[]]);

export const WEARABLE: readonly (readonly string[])[] = [
  ['public'],
  // A member, with any of what can be given.
  ...combinations(GIVEN).map((given) => ['member', ...given]),
  ['speaker'],
  ['stage'],
  ['kit'],
  ['lectern'],
  ['moderator'],
  ['clock'],
];
