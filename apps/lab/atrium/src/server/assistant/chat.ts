import type { AvailableAction } from './knowledge';
import { actionLines, contractFor, screenBlock, section } from './prompt';

// The dock's prompt — the agent a person TYPES at. The watcher's lives in
// ./watch/prompt.ts; the two share the placement mechanics in prompt.ts and
// nothing else, so a rule written for an ambient glance can never steer an
// answer somebody asked for.
//
// THE ORDER IS THE DOCUMENT. Producer order IS placement — cortex assembles
// them in order. Static blocks lead so a provider's prefix cache holds them:
// the contract, the catalog, then HOW TO DECIDE. SCREEN is the one dynamic
// block and sits last, so the cache breaks at the end rather than the middle.
// The user turn closes it.

export type ChatDeps = {
  screen: string;
  screenNow: () => string;
  actions: readonly AvailableAction[];
  places: readonly string[];
};

// STATIC for the life of a session. The persona is not among them — identity is
// `instructions`, which cortex keeps first of all.
const contract = ({ deps }: { deps: ChatDeps }): string => contractFor(deps.places);
const actions = ({ deps }: { deps: ChatDeps }): string => actionLines(deps.actions);

// DYNAMIC per run, so it sits at the end. No refusal record: a card the person
// closed mid-conversation is not a veto on the answer they are now asking for.
const screen = ({ deps }: { deps: ChatDeps }): string => screenBlock(deps.screen, '');

const steeringFor = (places: readonly string[]): string =>
  section(
    'HOW TO DECIDE',
    [
      'The user has asked you something. Answer it in `response`, and return what the answer needs in `columns`.',
      '',
      'If the user wants a figure, read it off SCREEN and put the figure in `response`. Open a card only if the user asked to see one.',
      '',
      'If the user wants something done, choose the action that does it, put it in `columns`, and fill in every input you can read off SCREEN.',
      '',
      // The one sentence that depends on how much screen this audience holds: a
      // guest has the sheet alone, and "several canvases" said to them steers
      // at columns their screen does not have.
      `Show everything you think is related to what the user asked. That can be several cards${places.length > 1 ? ', and they can sit on more than one canvas' : ''}. When the ask is about a guest, put the guest profile up alongside the action that acts on them.`,
      '',
      'If no action in ACTIONS does it, say so in `response` and open nothing.',
    ].join('\n'),
  );

// Static per AUDIENCE: `places` never moves within a session, so the assembled
// block is the same string on every run and the prefix cache holds it.
const steering = ({ deps }: { deps: ChatDeps }): string => steeringFor(deps.places);

export const chatContext = [contract, actions, steering, screen];
