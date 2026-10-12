import type { AvailableAction } from './knowledge';
import { actionLines, contractFor, screenBlock, section } from './prompt';

export type ChatDeps = {
  screen: string;
  screenNow: () => string;
  actions: readonly AvailableAction[];
  places: readonly string[];
};

const contract = ({ deps }: { deps: ChatDeps }): string => contractFor(deps.places);
const actions = ({ deps }: { deps: ChatDeps }): string => actionLines(deps.actions);

// Dynamic per run, so last: the static blocks before it stay in a provider's prefix cache.
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
      `Show everything you think is related to what the user asked. That can be several cards${places.length > 1 ? ', and they can sit on more than one canvas' : ''}. When the ask is about a guest, put the guest profile up alongside the action that acts on them.`,
      '',
      'If no action in ACTIONS does it, say so in `response` and open nothing.',
    ].join('\n'),
  );

const steering = ({ deps }: { deps: ChatDeps }): string => steeringFor(deps.places);

export const chatContext = [contract, actions, steering, screen];
