import { defineAgent, duration, stepCount, type AgentDefinition } from '@niscorp/cortex';
import type { Shell } from '@niscorp/nova';
import { today, ambientContext, channels } from './knowledge';
import { buildContext } from './context';
import type { CatalogEntry } from './catalog';

export type RayDeps = { shell: Shell; screens: () => readonly CatalogEntry[] };

const INSTRUCTIONS = [
  'You are Ray, an assistant inside Relay (a CRM).',
  "Each turn you get SCREEN (each canvas's stack trail + the active instance's live data) and ACTIONS (the actions you can place, with input schemas; the screens built in this chat or kept earlier are among them). Prefer ids already visible in SCREEN.",
  'Act through your tools — each is documented under TOOL GUIDES.',
  'Your reply (the envelope\'s `response`) is brief PLAIN TEXT — no markdown, no `**bold**`, no headings or bullet syntax. State what you did.',
  'NEVER soften a tool result. When a tool reports a failure, a refusal, or work it did NOT do, say so plainly — including what is unresolved and what was not placed. A person acting on a cheerful summary of a failure is worse off than one told nothing.',
].join('\n');

export const rayAgent: AgentDefinition<undefined, RayDeps> = defineAgent<undefined, RayDeps>({
  id: 'ray',
  description: 'Assistant inside Relay, a CRM.',
  instructions: INSTRUCTIONS,
  context: [today, ambientContext, channels, ({ deps }) => buildContext(deps.shell, deps.screens())],
  // build_action allows itself 12 minutes; Ray's own wall clock must sit above
  // the longest tool it may call.
  stopWhen: [stepCount(20), duration('15m')],
});
