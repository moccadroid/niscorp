import { defineAgent } from '@niscorp/cortex';
import type { AgentDefinition } from '@niscorp/cortex';
import { stepCount, outputRetries, repeatedCalls } from '@niscorp/cortex';
import { QuerySchema } from '../schemas/query.schema.js';
import type { Query } from '../schemas/query.schema.js';
import type { ScopeBinding } from '../types.js';

// Per-invocation deps: the introspected database schema and the DSL
// JSON Schema arrive per call (they vary with adapter and scope), so
// they are context-function inputs — the agent itself is defined once.
export type VexQueryDeps = {
  schemaJson: string;
  dslSpecJson: string;
  // Who the caller is, in the schema's terms (describeCaller). Absent — a run
  // built without it — reads as a caller nothing identifies.
  caller?: string;
};

// WHO THE CALLER IS, for the agent: the columns their scope keys are bound to
// (GenerationCaller.bindings) — the keys and the columns, never a value. With
// none, the agent is told plainly that nothing here identifies them, so a
// question about "me" is refused for the right reason rather than guessed at.
export const describeCaller = (bindings: readonly ScopeBinding[]): string =>
  bindings.length === 0
    ? 'The caller: no column in this schema is bound to anything that identifies the caller, so a request about "me", "my" or "mine" cannot be answered.'
    : [
        'The caller — the person or service this query is for — is identified by server-side scope values bound to these columns:',
        ...bindings.map((b) => `- ${b.entity}.${b.field} is the caller's { "$scope": "${b.key}" }`),
        'Such a column holds that value on the caller\'s own rows. To mean the caller or what is theirs ("me", "my", "mine", "our"), filter the column with { "$scope": "<key>" } — the server binds the caller\'s own value; you never see or write it.',
      ].join('\n');

const INSTRUCTIONS = `You are Vex's query agent. You turn a caller's request — a natural-language \`intent\` and an example \`shape\` of the data they want back — into ONE query in Vex's DSL.

Context gives you two things:
- the database schema: the entities, fields, relations, and indexes that actually exist;
- the DSL JSON Schema: the exact structure your query must take. Its field
  descriptions ARE the rules — read them and follow them. They are the single
  source of truth for how every part of a query is written.

Your job is to RETRIEVE the data the request needs: choose the entities, columns,
filters, computed values, and aggregates the schema supports. A separate step runs
after you and reshapes, nests, combines and formats the rows, so you never nest.
But when a key of the shape is exactly ONE column or ONE aggregate, alias it to
that key (\`{ "field": …, "as": "<key>" }\`, or name the aggregate after the key):
when every row already has exactly the shape's keys, that later step is skipped.
A key that needs combining or formatting (a full name from two columns, a date
written out) you leave to it — select the underlying columns under their own names.

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
data:   {"from":["customer"],"fields":["customer.name","customer.email",{"field":"customer.total_spent","as":"spent"}],"sort":[{"field":"customer.total_spent","dir":"desc"}]}
(\`spent\` is one column, so it is aliased; \`contact\` combines two, so they are selected as they are.)`;

export const vexQueryDslAgent: AgentDefinition<Query, VexQueryDeps> = defineAgent<Query, VexQueryDeps>({
  id: 'vex.query',
  description: 'Generates DSL queries from natural language intent and target shape.',
  instructions: INSTRUCTIONS,
  context: [
    ({ deps }) => `Database schema:\n${deps.schemaJson}`,
    ({ deps }) => deps.caller ?? describeCaller([]),
    // Named OUTPUT SCHEMA because that is what the finish protocol refers to:
    // the query this agent returns is the envelope's `data`.
    ({ deps }) => `OUTPUT SCHEMA — the DSL specification (JSON Schema), the single source of truth for your query:\n${deps.dslSpecJson}`,
  ],
  // The DSL spec above IS the schema documentation; don't inject it twice.
  output: { schema: QuerySchema, doc: 'off' },
  // Three identical testQuery calls with the same error in a row is a model
  // not reading the error; a fourth would cost a full prompt and change nothing.
  stopWhen: [stepCount(20), outputRetries(3), repeatedCalls(2)],
});
