import { defineAgent, duration, outputRetries, stepCount, type AgentDefinition } from '@niscorp/cortex';
import { ActionDefinitionSchema, type ActionDefinition } from '@niscorp/nova';
import { styleGuide, today, ambientContext, channels } from '../knowledge';
import type { RayContext } from '../engine';
import { runAction } from './harness';
import type { QueryProof } from './tools';
import { componentPalette, actionCatalog, layoutComposition } from './producers';
import { workedExample } from './worked-example';

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
  '  - LAYOUT bindings are STRING paths or moustache — rows: "$.deals", loading: "$.loading", children: "{{$.deals.length}} deals". Prism nodes ({"$ref"}, {"$case"}, {"$join"}, …) belong ONLY inside endpoint request/response; in layout props they do not resolve and the component renders empty over loaded data.',
  '  - A request value that must follow screen state (a search text, a picked filter, a sort) is a transform binding over the data — never a frozen literal.',
  '  - Select/option VALUES must be plain strings (the DOM coerces them; an object value reaches your trigger as an EMPTY string and the screen dies silently). Structured per-option data rides the endpoint request instead: key a $case on the string value, or look the value up in a data map.',
  '  - A `ui:model` trigger that calls an endpoint must FIRST `set` the bound key from `@event.payload`, then `call` — the model write and the trigger race, and a call that skips the set reads the PREVIOUS value (the screen lags one choice behind). Example: [{ "set": "month", "value": "@event.payload" }, { "call": "loadDeals" }].',
  '  - A `push` targets a catalog id, seeding only keys from that action\'s input contract.',
  '  - The screen loads its data on mount and clears its loading flags.',
  'You can check any candidate with `run_action` — it mounts the definition for real and returns what loaded and what broke. The same check judges your final answer.',
  '',
  'Your FINAL ANSWER is the envelope {"data": <the ActionDefinition>} — the whole definition under the single key "data", never the definition fields at the top level.',
].join('\n');

export const makeArchitectAgent = (
  ray: RayContext,
  // The build's proofs (the query tool fills this map as the run proves data).
  // The gate hands them to the harness so the FINAL answer is held to them:
  // load counts diffed against what was proven, and every `fp_…` the
  // definition embeds must have come from a query this run actually made.
  proofs?: ReadonlyMap<string, QueryProof>,
): AgentDefinition<ActionDefinition> => defineAgent<ActionDefinition>({
  id: 'action.architect',
  description: 'Designs a complete Nova ActionDefinition from an intent.',
  instructions: INSTRUCTIONS,
  // Producers: live app data (components, catalog) and app knowledge (house
  // style, today, ambient context, channels). Each is a named function
  // producing a string — nothing rides deps, nothing is unpacked from an env.
  //
  // The transform DSL is DELIBERATELY absent. Vex returns the exact shape a
  // query proves, so a screen never reshapes — and the two request-binding
  // idioms a screen does need ({"$ref": "$.search"} for state-following
  // context, $join for %patterns%) ride the query tool's guide with examples.
  // The full schema was ~7,800 tokens per step of attractive nuisance:
  // measured runs reached for $dateAdd (timezone-shifted, drops boundary
  // rows), $case over fingerprints, $map/$localeMoney response reshapes of
  // work the query already does, and $ref inside layout props — every one a
  // failure class, none a capability a screen required. Same decision the
  // `map` tool already made ("NOT handed to the architect"), now applied to
  // the knowledge too.
  context: [workedExample, componentPalette, layoutComposition, actionCatalog, styleGuide, today, ambientContext, channels],
  output: {
    schema: ActionDefinitionSchema,
    // The one gate: the HARNESS. It audits the wiring statically, mounts the
    // candidate in a throwaway shell, and reports what each endpoint loaded —
    // every failure comes back as a correction while context is warm. No
    // bespoke checks here; the harness is the single validation authority.
    validate: async (output) => {
      const check = await runAction(ray, output.data, undefined, proofs);
      if (!check.ok) return { retry: `verification failed: ${check.issues.join('; ')}` };
      return { ok: true };
    },
  },
  // outputRetries 5: measured — runs converge with a NEW mistake fixed
  // per round; 3 cut them off mid-convergence (2026-07-13 trace).
  stopWhen: [stepCount(20), outputRetries(5), duration('6m')],
});
