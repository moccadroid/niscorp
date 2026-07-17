import { defineAgent, duration, outputRetries, stepCount, type AgentDefinition } from '@niscorp/cortex';
import { ActionDefinitionSchema, type ActionDefinition } from '@niscorp/nova';
import { styleGuide, today, ambientContext, channels, transformDsl } from '../knowledge';
import type { RayContext } from '../engine';
import { runAction } from './harness';
import { componentPalette, actionCatalog, layoutComposition } from './producers';

// ═══════════════════════════════════════════════════════════
// The action architect — one free agent on a complete knowledge base.
//
// No phases, no nudges, no tool masking. The knowledge is TOTAL, and every
// piece is a named PRODUCER derived from its source of truth: the
// ActionDefinition schema (cortex injects it from the Zod source), the
// transform DSL (prism's schema, via knowledge), the Vex contract (vex's own
// guide, riding the query tool), the component palette and the LIVE action
// catalog (producers.ts), and the app's ambient facts (knowledge.ts). The
// agent works however it wants inside hard BOUNDS (stopWhen) and against
// TRUTH-CHECKS (the query tool proves data, the run_action tool and the
// output validator mount the candidate for real). Paths break the moment
// reality deviates; bounds and truth-checks don't.
// ═══════════════════════════════════════════════════════════

export type ActionAgentOutput = ActionDefinition;

// Identity + what must be TRUE at the end. How to get there is the agent's
// business. Built from plain lines so `$.path` / `{{ }}` / `@event` tokens
// can't collide with a template literal.
const INSTRUCTIONS = [
  'You are the action architect. From one intent you design ONE complete, interactive Nova action (a screen): its data, endpoints, layout, and triggers.',
  '',
  'Everything you need is provided: the OUTPUT SCHEMA (the ActionDefinition contract — bindings, triggers, steps, endpoints are all documented there), the TRANSFORM DSL for endpoint request/response configs, the COMPONENTS palette, the ACTIONS catalog (the only legal push targets, each with its input contract), the HOUSE STYLE, and a TOOL GUIDE for each tool.',
  '',
  'Work however you like. What must be TRUE when you finish:',
  '  - Every dataset the screen shows was PROVEN with `query` against REAL fields (see `discover`) — never invent an endpoint or guess at data.',
  '  - Every interactive layout node carries a `ref`; every `ref` has a trigger wired; every input `model` key exists in `data` with a default.',
  '  - A request value that must follow screen state (a search text, a picked filter, a sort) is a transform binding over the data — never a frozen literal.',
  '  - A `push` targets a catalog id, seeding only keys from that action\'s input contract.',
  '  - The screen loads its data on mount and clears its loading flags.',
  'You can check any candidate with `run_action` — it mounts the definition for real and returns what loaded and what broke. The same check judges your final answer.',
].join('\n');

export const makeArchitectAgent = (ray: RayContext): AgentDefinition<ActionDefinition> => defineAgent<ActionDefinition>({
  id: 'action.architect',
  description: 'Designs a complete Nova ActionDefinition from an intent.',
  instructions: INSTRUCTIONS,
  // Producers, all of them: live app data (components, catalog), app
  // knowledge (transform DSL, house style, today, ambient context,
  // channels). Each is a named function producing a string — nothing rides
  // deps, nothing is unpacked from an env.
  context: [componentPalette, layoutComposition, actionCatalog, transformDsl, styleGuide, today, ambientContext, channels],
  output: {
    schema: ActionDefinitionSchema,
    // The one gate: the HARNESS. It audits the wiring statically, mounts the
    // candidate in a throwaway shell, and reports what each endpoint loaded —
    // every failure comes back as a correction while context is warm. No
    // bespoke checks here; the harness is the single validation authority.
    validate: async (output) => {
      const check = await runAction(ray, output.data);
      if (!check.ok) return { retry: `verification failed: ${check.issues.join('; ')}` };
      return { ok: true };
    },
  },
  // outputRetries 5: measured — runs converge with a NEW mistake fixed
  // per round; 3 cut them off mid-convergence (2026-07-13 trace).
  stopWhen: [stepCount(20), outputRetries(5), duration('6m')],
});
