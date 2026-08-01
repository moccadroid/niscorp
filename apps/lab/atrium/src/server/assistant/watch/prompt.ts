import type { Message } from '@niscorp/signal';
import type { AvailableAction } from '../knowledge';
import { actionLines, contractFor, screenBlock, section } from '../prompt';

// The watcher's prompt — the agent that looks UNASKED. The dock's lives in
// ../chat.ts; the two share the placement mechanics in ../prompt.ts and nothing
// else. An ambient turn has to earn the right to act at all, so this steering
// treats silence as an answer rather than a default — a register that must
// never reach the agent a person is talking to.
//
// THE ORDER IS THE DOCUMENT. Static blocks lead so a provider's prefix cache
// holds them: the contract, the catalog, then HOW TO DECIDE. SCREEN is the one
// dynamic block and sits last. WHAT CHANGED is not a producer — it is the user
// turn, which is where a reaction belongs.

export type WatchDeps = {
  screen: string;
  screenNow: () => string;
  actions: readonly AvailableAction[];
  places: readonly string[];
  // What changed since the last look, and what the person has already refused.
  changes: readonly string[];
  refused: string;
};

// STATIC for the life of a session. The persona is not among them — identity is
// `instructions`, which cortex keeps first of all.
const contract = ({ deps }: { deps: WatchDeps }): string => contractFor(deps.places);
const actions = ({ deps }: { deps: WatchDeps }): string => actionLines(deps.actions);

// DYNAMIC per run: the screen and the refusal record answer the same question,
// so they ride one block at the end.
const screen = ({ deps }: { deps: WatchDeps }): string => screenBlock(deps.screen, deps.refused);

// SEVEN NUMBERED RULES BECAME FIVE PARAGRAPHS, and the count is not the point —
// Every instruction names the field it lands in, because the failures were the
// model satisfying an instruction in a register the instruction did not mean:
// "say so" answered by a draft, "the next step" answered by a sentence.
const steeringFor = (places: readonly string[]): string =>
  section(
    'HOW TO DECIDE',
    [
      'The user\'s screen just changed. Read it and help with whatever the user is working on. Nobody has typed a question, so the screen is what you work from.',
      '',
      'WHAT CHANGED names the card that moved. SCREEN holds what is on it. Read both, and react to the contents: the words a guest wrote, the row the user opened, the number that changed.',
      '',
      'Whatever the user has open is the task.',
      '',
      // Naming a message as the step resolves to a card that is already open, so
      // nothing is placed and the instruction is satisfied on its own terms.
      'Write in `reasoning` which action you are going to open and what it will do. Name an action from ACTIONS. Naming a message you intend to write instead resolves to a card that is already open, which leaves nothing for `columns`.',
      '',
      'Then put that action in `columns` and fill in every input you can read off SCREEN.',
      '',
      `Show everything you think is related to the task. That can be several cards${places.length > 1 ? ', and they can sit on more than one canvas' : ''}.`,
      '',
      'When the task is about a guest, put the guest profile up alongside the action. It carries who they are, how often they have stayed, what they have spent, what has already gone wrong for them and what the desk has written down. That is what decides which option the user should pick, and the action on its own does not say any of it.',
      '',
      // Omitting a canvas leaves it alone, so a card is only taken down by naming
      // its canvas without it. Said the other way round ("leave it out and it
      // closes") the model omits `columns` entirely and every card it has ever
      // opened stays on the screen.
      'Keep a card while it contributes to the task. To take one down, name its canvas and list the cards that stay. A canvas you never mention keeps everything on it, so a card you stop thinking about does not go away on its own.',
      '',
      'If you can name the step and no action in ACTIONS does it, put that in `response` and open nothing. Never draft a reply to a guest promising something no action here can do.',
      '',
      'Only offer a guest what an action can actually give. The options are on the card the action loads. Anything else is invented.',
      '',
      'If nothing needs doing, leave the screen as it is and put "·" in `response`.',
      '',
      '`response` is never a question to the user. A question addressed to a guest belongs in the draft field of a card that sends it.',
    ].join('\n'),
  );

// Static per PROFILE, like the contract: `places` never moves within a session,
// so the assembled block is the same string on every run and the prefix cache
// holds it.
const steering = ({ deps }: { deps: WatchDeps }): string => steeringFor(deps.places);

export const watchContext = [contract, actions, steering, screen];

// WHY THIS RUN IS HAPPENING. Two triggers, two user turns.
//
// The turn carries the EVENT and nothing else. How to answer is the system
// prompt's job; repeating it here put the same instruction in two places and let
// them drift. Not tool-forcing — a forced tool means the watcher can never
// choose silence, which is the outcome it should choose most of the time.
export type Trigger = { kind: 'changed'; changes: readonly string[] } | { kind: 'asked' };

const ASKED = [
  'The user pressed the button that asks you for help with what is on screen.',
  '',
  'The user presses it when the screen is not enough, so treat your last answer as insufficient. Read SCREEN again and work out what is missing: a card that is not there, a card aimed at the wrong record, or an input you left empty that you can fill now.',
  '',
  'Return a screen that differs from the one you are looking at. "·" is not an answer to this, and neither is returning `columns` unchanged.',
].join('\n');

export const watchPrompt = (trigger: Trigger): Message[] => [
  {
    role: 'user',
    content:
      trigger.kind === 'asked'
        ? ASKED
        : ['WHAT CHANGED on the user\'s screen:', ...trigger.changes.map((line) => `  - ${line}`)].join('\n'),
  },
];
