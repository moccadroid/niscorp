// ═══════════════════════════════════════════════════════════
// @niscorp/nova/agent — Nova layout agent
// ═══════════════════════════════════════════════════════════
//
// Given an intent, a component palette, and a data example, produces a Nova
// LayoutNode — a tree of components, conditionals, loops and bindings that
// renders the data as a UI.
//
// Same pattern as @niscorp/prism/agent and @niscorp/vex/agent: one exported
// `const`, the full canonical schema as the output (so Cortex validates the whole
// recursive tree and auto-retries on malformed output), and the variable inputs
// (intent, palette, dataShape) passed at call time. Cortex is an optional peer
// dep — the rest of @niscorp/nova does not need it.
//
//   import { runAgentStandalone } from '@niscorp/cortex';
//   import { layoutAgent, paletteFromRegistry } from '@niscorp/nova/agent';
//
//   const result = await runAgentStandalone(layoutAgent, {
//     intent: 'a table of company and value',
//     palette: paletteFromRegistry(registry, { include: ['Table'] }),
//     dataShape: [{ company: '', value: 0 }],
//   }, { llm });
//   if (result.ok) render(result.data.layout, rows);

import { z } from 'zod';
import { defineAgent, type AgentDefinition } from '@niscorp/cortex';

import { LayoutNodeSchema } from '../layout/schemas';

// The agent returns a LayoutNode wrapped in a tiny envelope so the model can also
// explain its choice. `layout` is `LayoutNodeSchema` DIRECTLY — Cortex validates
// the entire recursive tree and triggers retry-with-feedback on malformed output.
export const LayoutAgentOutputSchema = z.object({
  layout: LayoutNodeSchema.describe(
    'The layout tree — a Nova LayoutNode. See the schema for node types (component, conditional, loop, layoutRef), binding syntax ({{ }} templates, $.path references) and directives.',
  ),
  reasoning: z.string().optional().describe('One-sentence explanation of the layout choices.'),
});

export type LayoutAgentOutput = z.infer<typeof LayoutAgentOutputSchema>;

// Minimal prompt: role, the input contract, one worked example, and the LayoutNode
// JSON Schema (the single source of truth). Every node type / binding rule lives in
// the schema's `.describe()` calls — fixes go there, not in prose here.
const buildSystemPrompt = (): string => {
  const layoutSchema = JSON.stringify(z.toJSONSchema(LayoutNodeSchema, { target: 'draft-7' }));
  return `You are the Nova layout agent. Given an intent, a component palette, and a data example, produce a Nova LayoutNode that renders the data as a UI.

Your input:
  - intent: what UI to produce.
  - palette: the ONLY components you may use. Each is { name, description, propsSchema }. Every "component" field in your output MUST be one of these names, and its props MUST fit that component's propsSchema. Set ONLY props that appear in the schema — there is no other styling; components render in their own default style.
  - dataShape: a JSON example of the data the layout binds against. The data is the binding ROOT — reference it with "$": an array → a Table's "rows": "$" or a loop { "for": "$", "as": "row", "do": … } binding "{{$row.field}}"; an object → "$.field"; a scalar → "$".
  - styleGuide (optional): house style rules — follow them.
  - base (optional): an existing layout to work from. If given, keep its structure and component choices, adapting the bindings to this intent + data — use it to match a prior layout or to revise it.

Output exactly one JSON object: { "layout": <LayoutNode>, "reasoning": <one sentence> }. No markdown fences, no prose outside the JSON. The layout MUST validate against the schema below.

Worked example (illustrative — read the schema + palette for the real details):
INPUT  { "intent": "list each name on its own line", "palette": [{"name":"Stack","description":"Vertical container for children."},{"name":"Text","description":"Renders text; children is the string."}], "dataShape": [{ "name": "" }] }
OUTPUT { "layout": { "component": "Stack", "children": { "for": "$", "as": "row", "do": { "component": "Text", "children": "{{$row.name}}" } } }, "reasoning": "A Stack containing a Text per row." }

═══ Nova LayoutNode JSON Schema (the single source of truth) ═══
${layoutSchema}`;
};

const SYSTEM_PROMPT = buildSystemPrompt();

export const layoutAgent: AgentDefinition<LayoutAgentOutput> = defineAgent<LayoutAgentOutput>({
  id: 'nova.layout',
  name: 'Nova Layout Agent',
  description: 'Generates a Nova LayoutNode from an intent, a component palette, and a data example.',
  instructions: SYSTEM_PROMPT,
  outputMode: 'structured',
  outputSchema: LayoutAgentOutputSchema,
});
