import { z } from 'zod';
import { defineTool, runAgentStandalone, type ToolDefinition } from '@niscorp/cortex';
import type { Shell } from '@niscorp/nova';
import { evaluate } from '@niscorp/prism';
import type { QueryRequest } from '@niscorp/vex';
import { layoutAgent, paletteFromRegistry } from '@niscorp/nova/agent';
import { getVexRuntime, CURRENT_USER_ID, CURRENT_DATE } from '@relay/vex/runtime';
import { listContactsPrism } from '@relay/nova/domains/contact';
import { listCompaniesPrism } from '@relay/nova/domains/company';
import { listDealsPrism } from '@relay/nova/domains/deal';
import { CATALOG_IDS, VIZ_COMPONENTS, VIZ_OMIT_PROPS, LAYOUT_STYLE } from './catalog';
import { getKey, createGroqClient } from '../llm/groq';

// Per-turn scratch, passed in by run.ts: `query` stashes its result so `visualize`
// can render it without the rows round-tripping through the model, and `visualize`
// stashes the layout for run.ts to attach to the message. No globals, no store.
export type Turn = {
  lastResult?: { result: unknown; shape: unknown; intent: string };
  pendingView?: { layout: unknown; data: unknown };
};

// ── find_records: resolve a name → id, by reusing the EXISTING list shapes.
// Same read path the screens use (scoped, validated, cached) — just with a search
// term and a small projection to { id, label }.
type Lookup = { prism: unknown; sortBy: string; idKey: string; labelKey: string };
const LOOKUPS: Record<string, Lookup> = {
  deal: { prism: listDealsPrism, sortBy: 'deals.created_at', idKey: 'deal_id', labelKey: 'title' },
  contact: { prism: listContactsPrism, sortBy: 'contacts.last_name', idKey: 'contact_id', labelKey: 'name' },
  company: { prism: listCompaniesPrism, sortBy: 'companies.name', idKey: 'company_id', labelKey: 'name' },
};

export const makeTools = (shell: Shell, turn: Turn): ToolDefinition[] => {
  // A canvas is a stack; `stack` is the four stack operations. push/replace place
  // an `action` from the ACTIONS catalog; pop/clear take none. On the `modal`
  // canvas a placed form brings its own form chrome, everything else a plain card.
  const stackTool = defineTool({
    id: 'ray.stack',
    name: 'stack',
    riskLevel: 'low',
    description:
      "Operate a canvas's stack. push: add `action` on top (default). pop: remove the top, or with `to` (an instance id from the trail) pop down to it. replace: swap the top for `action` (mainly modals). clear: empty the stack.",
    input: z.object({
      canvas: z.string().describe('any canvas id shown in SCREEN (e.g. main, aside, modal, sidebar, topbar)'),
      op: z.enum(['push', 'pop', 'replace', 'clear']),
      action: z.string().optional().describe('an action id from ACTIONS — required for push/replace'),
      input: z.record(z.string(), z.unknown()).optional().describe("the action's input, per its schema"),
      to: z.string().optional().describe('for pop: an instance id from the trail to pop down to'),
    }),
    execute: ({ canvas, op, action, input, to }) => {
      try {
        // Any real canvas is fair game — but not a made-up one (which would spawn
        // an invisible phantom). SCREEN lists exactly the canvases that exist.
        if (shell.getState().canvases[canvas] === undefined) return `Unknown canvas "${canvas}". Use one shown in SCREEN.`;
        if (op === 'pop') {
          if (to !== undefined && to !== '') shell.popTo(canvas, to);
          else shell.pop(canvas);
          return `pop ${canvas}${to ? ` to ${to}` : ''}.`;
        }
        if (op === 'clear') {
          shell.clear(canvas);
          return `clear ${canvas}.`;
        }
        // push / replace place an action.
        if (action === undefined || action === '') return `${op} needs an \`action\`.`;
        if (!CATALOG_IDS.has(action)) return `Unknown action "${action}". Use one from ACTIONS.`;
        const data = (input ?? {}) as Record<string, unknown>;
        const fragments = canvas === 'modal' ? (action.endsWith('.form') ? ['modal'] : ['panel']) : undefined;
        if (op === 'push') shell.push(canvas, action, data, fragments);
        else shell.replace(canvas, action, data, fragments);
        return `${op} "${action}" on ${canvas}.`;
      } catch (e) {
        return `stack ${op} failed: ${(e as Error).message}`;
      }
    },
  });

  const queryTool = defineTool({
    id: 'ray.query',
    name: 'find_records',
    riskLevel: 'low',
    description: 'Look up records by a search term. Returns up to 5 { id, label }. Use this to resolve a name to an id.',
    input: z.object({
      entity: z.enum(['deal', 'contact', 'company']),
      match: z.string().describe('a name or fragment to search for'),
    }),
    execute: async ({ entity, match }) => {
      const cfg = LOOKUPS[entity];
      if (cfg === undefined) return [];
      const request = evaluate(cfg.prism, {
        search: match,
        sortBy: cfg.sortBy,
        sortDir: 'asc',
        ownerId: '',
        userId: CURRENT_USER_ID,
        today: CURRENT_DATE,
      }) as QueryRequest;
      const rt = await getVexRuntime();
      const res = await rt.engine.execute(request, { cache: 'use' });
      const rows = (res.result ?? []) as Record<string, unknown>[];
      return rows.slice(0, 5).map((r) => ({ id: r[cfg.idKey], label: r[cfg.labelKey] }));
    },
  });

  // ── query: read ANY data through Vex. A near-pure wrapper over
  // engine.execute — describe the rows as `shape` + `intent` (+ `context`
  // for values that vary). On a novel shape the engine runs Vex's query +
  // mapping agents; the querying notes teaches the rest.
  const dataTool = defineTool({
    id: 'ray.data',
    name: 'query',
    riskLevel: 'low',
    description:
      'Read data from the CRM. Describe the rows you want as `shape` + `intent` (+ `context` for values that vary call-to-call). See the querying notes.',
    input: z.object({
      intent: z
        .string()
        .describe('Plain English with ALL the detail: which records, filters, thresholds, sorting, grouping, derived fields.'),
      shape: z
        .unknown()
        .describe("A JSON example of the rows you want, structure only: list → [{ field: '' }]; one record → { field: '' }; a number → { total: 0 }."),
      context: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Values that change between calls (a search term, an id, a threshold). Name them in the intent; keeps the cached query reusable.'),
      cache: z
        .enum(['use', 'refresh', 'bypass'])
        .optional()
        .describe("Default 'use'. 'refresh' rebuilds the query and overwrites the cache; 'bypass' runs once, ignoring the cache."),
    }),
    execute: async ({ intent, shape, context, cache }) => {
      try {
        const rt = await getVexRuntime();
        // Return exactly what Vex returns: { result, meta }. `result` IS the
        // shape (array | object | scalar) — no remapping, no imposed `rows`.
        const res = await rt.engine.execute(
          { intent, shape, context: (context ?? {}) as Record<string, unknown> },
          { scope: { userId: CURRENT_USER_ID }, cache: cache ?? 'use' },
        );
        // Stash for `visualize` (so the rows don't round-trip through the model).
        turn.lastResult = { result: res.result, shape, intent };
        return res;
      } catch (e) {
        return `query failed: ${(e as Error).message}`;
      }
    },
  });

  // ── visualize: render the last query result in the chat as a Nova layout.
  // Delegates to Nova's layout agent with the kit palette + a small data sample;
  // stashes the generated { layout, data } for run.ts to attach to the message.
  const visualizeTool = defineTool({
    id: 'ray.view',
    name: 'visualize',
    riskLevel: 'low',
    description:
      'Render the LAST query result in the chat as a layout. Describe how to show it (a table, a single KPI, a card per row). Run a query first. The reply includes the layout it produced — pass that back as `base` next time to match or revise it.',
    input: z.object({
      intent: z.string().describe('How to display the data — e.g. "a table of company and value", "a single total KPI".'),
      base: z.unknown().optional().describe('An existing layout to match or revise — the `layout` from an earlier visualize reply.'),
    }),
    execute: async ({ intent, base }) => {
      const key = getKey();
      if (key === undefined) return 'No Groq key set — add one with 🔑 before visualizing.';
      const last = turn.lastResult;
      if (last === undefined) return 'Nothing to visualize yet — run a query first.';
      const palette = paletteFromRegistry(shell.registry, { include: VIZ_COMPONENTS, omitProps: VIZ_OMIT_PROPS });
      const sample = Array.isArray(last.result) ? last.result.slice(0, 2) : last.result;
      const res = await runAgentStandalone(
        layoutAgent,
        { intent, palette, dataShape: sample, styleGuide: LAYOUT_STYLE, ...(base !== undefined ? { base } : {}) },
        { llm: createGroqClient(key), manifold: { defaultBudget: { maxDurationMs: 3 * 60_000 } } },
      );
      if (!res.ok) return `visualize failed: ${res.error.message}`;
      turn.pendingView = { layout: res.data.layout, data: last.result };
      const n = Array.isArray(last.result) ? last.result.length : 1;
      // The layout goes back to the model (into its history) so Ray sees what it
      // rendered and can pass it as `base` to revise/match next time. In the trace,
      // the INPUT is what visualize operated on — the intent + the data it rendered
      // (+ base when revising) — and the OUTPUT is the layout it produced.
      return {
        forInput: { intent, ...(base != null ? { base } : {}), data: last.result },
        forModel: { rendered: n, layout: res.data.layout },
        forTrace: { layout: res.data.layout },
      };
    },
  });

  return [stackTool, queryTool, dataTool, visualizeTool];
};
