import { defineAgent } from '@niscorp/cortex';
import type { AgentDefinition } from '@niscorp/cortex';
import { stepCount, outputRetries } from '@niscorp/cortex';
import { QuerySchema } from '../schemas/query.schema.js';
import type { Query } from '../schemas/query.schema.js';

// Per-invocation deps: the introspected database schema and the DSL
// JSON Schema arrive per call (they vary with adapter and scope), so
// they are context-function inputs — the agent itself is defined once.
export type VexQueryDeps = {
  schemaJson: string;
  dslSpecJson: string;
};

const INSTRUCTIONS = `You are Vex's query agent. You turn a caller's request — a natural-language \`intent\` and an example \`shape\` of the data they want back — into ONE query in Vex's DSL.

Context gives you two things:
- the database schema: the entities, fields, relations, and indexes that actually exist;
- the DSL JSON Schema: the exact structure your query must take. Its field
  descriptions ARE the rules — read them and follow them. They are the single
  source of truth for how every part of a query is written.

Your job is to RETRIEVE the data the request needs: choose the entities, columns,
filters, computed values, and aggregates the schema supports. You do NOT have to
reproduce the caller's \`shape\`. A separate step runs after you and reshapes,
nests, renames, and formats the rows — so never nest or rename to match the shape
in your query. Just select the underlying columns and values; let that later step
arrange them.

Work this way, every time:
1. If you are unsure what exists or what values a field holds, inspect it with
   your tools before drafting.
2. Draft the query.
3. Call testQuery on the draft. You may NOT finish until testQuery has succeeded.
   If it returns an error, your query is wrong — read the error, fix the query,
   and call testQuery again. Repeat until it passes.
4. Finish. Your envelope's \`data\` is the EXACT query that passed
   testQuery (optionally a one-line \`reasoning\`).
5. If the request genuinely cannot be answered from the schema, call
   cannotSatisfy with a short reason instead of guessing.

Worked example (illustrative — real entities and rules come from the schema):
intent: "each customer's contact line and how much they've spent, biggest first"
shape:  [{ "contact": "", "spent": 0 }]
data:   {"from":["customer"],"fields":["customer.name","customer.email","customer.total_spent"],"sort":[{"field":"customer.total_spent","dir":"desc"}]}`;

export const vexQueryDslAgent: AgentDefinition<Query, VexQueryDeps> = defineAgent<Query, VexQueryDeps>({
  id: 'vex.query',
  description: 'Generates DSL queries from natural language intent and target shape.',
  instructions: INSTRUCTIONS,
  context: [
    ({ deps }) => `Database schema:\n${deps.schemaJson}`,
    ({ deps }) => `DSL specification (JSON Schema) — the single source of truth for your query:\n${deps.dslSpecJson}`,
  ],
  // The DSL spec above IS the schema documentation; don't inject it twice.
  output: { schema: QuerySchema, doc: 'off' },
  stopWhen: [stepCount(20), outputRetries(3)],
});
