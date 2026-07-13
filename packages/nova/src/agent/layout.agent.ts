// ═══════════════════════════════════════════════════════════
// @niscorp/nova/agent — Nova layout agent
// ═══════════════════════════════════════════════════════════
//
// Given an intent, a component palette, and a data example, produces a Nova
// LayoutNode — a tree of components, conditionals, loops and bindings that
// renders the data as a UI.
//
// Same pattern as @niscorp/prism/agent and @niscorp/vex/agent: one exported
// `const`, the canonical schema as the payload (cortex validates the whole
// recursive tree and feeds failures back in-loop), and the variable inputs
// (intent, palette, dataShape) passed at call time. Cortex is an optional
// peer dep — the rest of @niscorp/nova does not need it.
//
//   import { layoutAgent, paletteFromRegistry } from '@niscorp/nova/agent';
//
//   const result = await layoutAgent.run({
//     intent: 'a table of company and value',
//     palette: paletteFromRegistry(registry, { include: ['Table'] }),
//     dataShape: [{ company: '', value: 0 }],
//   }, { llm }).result;
//   if (result.ok) render(result.output.data, rows);
//
// The LayoutNode schema is NOT embedded in this prompt — cortex injects
// it (output.doc 'auto') because the recursive tree can't ride the
// respond tool's params. Node types, binding syntax and directives all
// live in the schema's .describe() calls; fixes go there, not here.

import { defineAgent, type AgentDefinition } from '@niscorp/cortex';

import { LayoutNodeSchema } from '../layout/schemas';
import type { LayoutNode } from '../layout/schemas';

// The agent's payload IS the LayoutNode; the model's one-line why
// rides the envelope's `reasoning` field.
export type LayoutAgentOutput = LayoutNode;

const INSTRUCTIONS = `You are the Nova layout agent. Given an intent, a component palette, and a data example, produce a Nova LayoutNode that renders the data as a UI.

Your input:
  - intent: what UI to produce.
  - palette: the ONLY components you may use. Each is { name, description, propsSchema }. Every "component" field in your output MUST be one of these names, and its props MUST fit that component's propsSchema. Set ONLY props that appear in the schema — there is no other styling; components render in their own default style.
  - dataShape: a JSON example of the data the layout binds against. The data is the binding ROOT — reference it with "$": an array → a Table's "rows": "$" or a loop { "for": "$", "as": "row", "do": … } binding "{{$row.field}}"; an object → "$.field"; a scalar → "$".
  - styleGuide (optional): house style rules — follow them.
  - base (optional): an existing layout to work from. If given, keep its structure and component choices, adapting the bindings to this intent + data — use it to match a prior layout or to revise it.

Your envelope's \`data\` is the LayoutNode; \`reasoning\` is a one-sentence explanation. The layout MUST validate against the OUTPUT SCHEMA below.

Worked example (illustrative — read the schema + palette for the real details):
INPUT  { "intent": "list each name on its own line", "palette": [{"name":"Stack","description":"Vertical container for children."},{"name":"Text","description":"Renders text; children is the string."}], "dataShape": [{ "name": "" }] }
data   { "component": "Stack", "children": { "for": "$", "as": "row", "do": { "component": "Text", "children": "{{$row.name}}" } } }`;

export const layoutAgent: AgentDefinition<LayoutNode> = defineAgent<LayoutNode>({
  id: 'nova.layout',
  description: 'Generates a Nova LayoutNode from an intent, a component palette, and a data example.',
  instructions: INSTRUCTIONS,
  output: { schema: LayoutNodeSchema },
});
