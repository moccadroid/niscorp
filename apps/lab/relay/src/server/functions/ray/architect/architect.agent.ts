import { defineAgent, duration, outputRetries, stepCount, type AgentDefinition } from '@niscorp/cortex';
import { ActionDefinitionSchema, type ActionDefinition } from '@niscorp/nova';
import { styleGuide, today, ambientContext, channels } from '../knowledge';
import type { RayContext } from '../engine';
import { runAction } from './harness';
import type { QueryProof } from './tools';
import { componentPalette, actionCatalog, layoutComposition } from './producers';
import { workedExample } from './worked-example';

export type ActionAgentOutput = ActionDefinition;

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
  proofs?: ReadonlyMap<string, QueryProof>,
): AgentDefinition<ActionDefinition> => defineAgent<ActionDefinition>({
  id: 'action.architect',
  description: 'Designs a complete Nova ActionDefinition from an intent.',
  instructions: INSTRUCTIONS,
  // The transform DSL is deliberately absent: Vex returns the exact shape a query
  // proves, the two request-binding idioms a screen needs ride the query tool's
  // guide, and with the full schema in context runs reach for transforms that fail.
  context: [workedExample, componentPalette, layoutComposition, actionCatalog, styleGuide, today, ambientContext, channels],
  output: {
    schema: ActionDefinitionSchema,
    validate: async (output) => {
      const check = await runAction(ray, output.data, undefined, proofs);
      if (!check.ok) return { retry: `verification failed: ${check.issues.join('; ')}` };
      return { ok: true };
    },
  },
  // outputRetries 5: runs converge with a new mistake fixed per round, and 3
  // cuts them off mid-convergence.
  stopWhen: [stepCount(20), outputRetries(5), duration('6m')],
});
