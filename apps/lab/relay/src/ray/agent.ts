import {
  defineAgent,
  systemProducer,
  toolsProducer,
  historyProducer,
  observationsProducer,
  inputProducer,
  type ContextProducer,
} from '@niscorp/cortex';
import { CURRENT_DATE } from '../vex/runtime';

// Ray — the Relay assistant. A plain text agent with three tools. It is given the
// live SCREEN + ACTIONS each turn and acts through those. Kept deliberately terse
// and schema-driven: the catalog + input schemas carry the meaning, so the prompt
// doesn't editorialize (which is what leaks wrong assumptions).
const TOOLS = ['ray.stack', 'ray.query', 'ray.data', 'ray.view'];

const INSTRUCTIONS = [
  'You are Ray, an assistant inside Relay (a CRM).',
  "Each turn you get SCREEN (each canvas's stack trail + the active instance's live data) and ACTIONS (the actions you can place, with input schemas).",
  'Each canvas is a stack. Use `stack` to push (default), pop, replace, or clear it; use `find_records` to turn a name into an id, and `query` to read any data (see the querying notes below). Prefer ids already in SCREEN.',
  'After a `query`, you can `visualize` its result in the chat — describe how to show it (a table, a KPI, a card per row).',
  'Reply briefly in PLAIN TEXT — no markdown, no `**bold**`, no headings or bullet syntax. State what you did.',
].join('\n');

// Today's date, so Ray can resolve date-relative requests ("overdue", "due this
// week", "closing next month") into actual dates to pass as context. Anchored to
// the seed's reference date (the demo data clusters there), not the wall clock —
// a real deployment would inject now().
const todayProducer = (): ContextProducer => ({
  id: 'relay.today',
  priority: 95,
  build: () => [{ role: 'system', source: 'relay.today', content: `Today's date is ${CURRENT_DATE}.` }],
});

// How to query through Vex (the `query` tool): you DESCRIBE the data — shape +
// intent + context — and Vex's agents build and cache the query. Pinned so Ray
// reads it before acting.
const QUERYING = `Querying data

You never write a database query. You DESCRIBE the data you want and AI agents do the rest: one figures out how to fetch it from the real schema, another reshapes the raw rows into the structure you asked for. You describe; they build.

Your request has three fields:

- shape — a JSON EXAMPLE of the rows you want back, structure only, with placeholder values. A list → [{ company: '', value: 0 }]; one record → { name: '', email: '' }; a single number → { total: 0 }. The shape says WHICH FIELDS come back — nothing about which rows or how they're computed.

- intent — plain English carrying ALL the detail: which records, every filter and threshold, sorting, grouping, how a field is derived. This is where the meaning lives; the agents read it to build the query. Be specific and complete — the shape is dumb, the intent is smart.

- context — the values that CHANGE from one call to the next (a search term, an id, a cutoff date, a threshold). Pass them here and name them in the intent (e.g. "…above the given minValue…").

Why context exists — everything is cached, by shape. The first time a shape is requested, the agents generate the query and STORE it against that shape; every later request for the same shape reuses it instantly and identically — no agents, same result structure, deterministic. The catch: if you bake a varying value straight into the intent — "deals over 5000" — that 5000 is frozen into the cached query, so the next call wanting 10000 still gets 5000. Keep the CONSTANT parts of the request in the intent; put anything that VARIES in context, and the cached query fills it in fresh each call.

When something goes wrong, Vex tells you what — an unsatisfiable request, a missing context value, an ambiguous field. Read the message, adjust your shape / intent / context, and try again.

Cache control (for testing): use (default — reuse cache, generate on a miss) · refresh (rebuild the query and overwrite the cache) · bypass (run once, ignore the cache entirely).`;

const queryingProducer = (): ContextProducer => ({
  id: 'relay.vex.querying',
  priority: 95,
  build: () => [{ role: 'system', source: 'relay.vex.querying', content: QUERYING }],
});

// Explicit context = Cortex's default text-mode producer set with `today` + the
// querying notes slotted in right after the system prompt, so Ray knows the date
// and how Vex querying works (shape/intent/context + caching) before it acts.
export const rayAgent = defineAgent<string>({
  id: 'ray',
  name: 'Ray',
  description: 'Assistant inside Relay, a CRM.',
  instructions: INSTRUCTIONS,
  outputMode: 'text',
  tools: TOOLS,
  context: {
    producers: [
      systemProducer(INSTRUCTIONS),
      todayProducer(),
      queryingProducer(),
      toolsProducer({ allowedIds: TOOLS }),
      historyProducer(),
      observationsProducer(),
      inputProducer(),
    ],
  },
});
