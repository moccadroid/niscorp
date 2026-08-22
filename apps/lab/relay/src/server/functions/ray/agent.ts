import { defineAgent, duration, stepCount, type AgentDefinition } from '@niscorp/cortex';
import type { Shell } from '@niscorp/nova';
import { today, ambientContext, channels } from './knowledge';
import { buildContext } from './context';

// Ray — the Relay assistant. A chat agent (envelope with a required
// `response`, no data payload) whose tools arrive per-run from tools.ts.
// The instructions carry IDENTITY and protocol only: every tool teaches
// itself through its own `guide` (assembled into the TOOL GUIDES section),
// the app's ambient facts are the shared knowledge producers every relay
// agent composes, and the live SCREEN + ACTIONS arrive per turn through
// deps. Nothing here describes a tool or another library.

export type RayDeps = { shell: Shell };

const INSTRUCTIONS = [
  'You are Ray, an assistant inside Relay (a CRM).',
  "Each turn you get SCREEN (each canvas's stack trail + the active instance's live data) and ACTIONS (the actions you can place, with input schemas). Prefer ids already visible in SCREEN.",
  'Act through your tools — each is documented under TOOL GUIDES.',
  'Your reply (the envelope\'s `response`) is brief PLAIN TEXT — no markdown, no `**bold**`, no headings or bullet syntax. State what you did.',
  'NEVER soften a tool result. When a tool reports a failure, a refusal, or work it did NOT do, say so plainly — including what is unresolved and what was not placed. A person acting on a cheerful summary of a failure is worse off than one told nothing.',
].join('\n');

export const rayAgent: AgentDefinition<undefined, RayDeps> = defineAgent<undefined, RayDeps>({
  id: 'ray',
  description: 'Assistant inside Relay, a CRM.',
  instructions: INSTRUCTIONS,
  context: [today, ambientContext, channels, ({ deps }) => buildContext(deps.shell)],
  // A Ray turn can host a full build pipeline (architect + review + one
  // repair — the build_action tool allows itself 12 minutes), so Ray's own
  // wall clock must sit ABOVE the longest tool it may call.
  stopWhen: [stepCount(20), duration('15m')],
});
