import { z } from 'zod';
import { defineTool, type ToolDefinition } from '@niscorp/cortex';
import type { Shell } from '@niscorp/nova';
import { evaluate } from '@niscorp/prism';
import { vexGuide } from '@niscorp/vex';
import type { QueryRequest } from '@niscorp/vex';
import { layoutAgent, paletteFromRegistry } from '@niscorp/nova/agent';
import { buildRegistry } from '@relay/ui';
import type { RayContext } from './seams';
import { todayStr } from '@relay/lib/date';
import { listContactsPrism } from '@relay/app/actions/domains/contact';
import { listCompaniesPrism } from '@relay/app/actions/domains/company';
import { listDealsPrism } from '@relay/app/actions/domains/deal';
import { catalogIds, VIZ_COMPONENTS, VIZ_OMIT_PROPS } from './catalog';
import { styleGuide } from './knowledge';
import { llmFor } from '@relay/server/llm';
import type { ScreenTools } from './screens';

export type Turn = {
  lastResult?: { result: unknown; shape: unknown; intent: string };
  pendingView?: { layout: unknown; data: unknown };
};

// A reply the session's wire has unwrapped is the rows; one another wire hands over whole is { result }.
const unwrapped = (body: unknown): unknown => (body !== null && typeof body === 'object' && !Array.isArray(body) && 'result' in body ? (body as Record<string, unknown>)['result'] : body);
const rowsOf = (body: unknown): Record<string, unknown>[] => {
  const result = unwrapped(body);
  return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
};

type Lookup = { prism: unknown; sortBy: string; idKey: string; labelKey: string };
const LOOKUPS: Record<string, Lookup> = {
  deal: { prism: listDealsPrism, sortBy: 'deals.created_at', idKey: 'deal_id', labelKey: 'title' },
  contact: {
    prism: listContactsPrism,
    sortBy: 'contacts.last_name',
    idKey: 'contact_id',
    labelKey: 'name',
  },
  company: {
    prism: listCompaniesPrism,
    sortBy: 'companies.name',
    idKey: 'company_id',
    labelKey: 'name',
  },
};

export const makeTools = (
  ray: RayContext,
  turn: Turn,
  opts: { dataTools?: boolean; screens?: ScreenTools } = {},
): ToolDefinition[] => {
  const { shell, userId } = ray;
  const stackTool = defineTool({
    id: 'ray.stack',
    name: 'stack',
    riskLevel: 'low',
    description:
      "Operate a canvas's stack. push: add `action` on top (default). pop: remove the top, or with `to` (an instance id from the trail) pop down to it. replace: swap the top for `action` (mainly modals). clear: empty the stack.",
    guide:
      'Every canvas in SCREEN is a stack; opening something means pushing an action from ACTIONS onto one. ' +
      "Pass `input` per the action's input schema. Use this to OPEN existing screens — never to build new ones.",
    input: z.object({
      canvas: z
        .string()
        .describe('any canvas id shown in SCREEN (e.g. main, aside, modal, sidebar, topbar)'),
      op: z.enum(['push', 'pop', 'replace', 'clear']),
      action: z
        .string()
        .optional()
        .describe('an action id from ACTIONS — required for push/replace'),
      input: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("the action's input, per its schema"),
      to: z.string().optional().describe('for pop: an instance id from the trail to pop down to'),
    }),
    execute: ({ canvas, op, action, input, to }) => {
      try {
        if (shell.getState().canvases[canvas] === undefined)
          return `Unknown canvas "${canvas}". Use one shown in SCREEN.`;
        if (op === 'pop') {
          if (to !== undefined && to !== '') shell.popTo(canvas, to);
          else shell.pop(canvas);
          return `pop ${canvas}${to ? ` to ${to}` : ''}.`;
        }
        if (op === 'clear') {
          shell.clear(canvas);
          return `clear ${canvas}.`;
        }
        if (action === undefined || action === '') return `${op} needs an \`action\`.`;
        if (!catalogIds().has(action) && opts.screens?.has(action) !== true) return `Unknown action "${action}". Use one from ACTIONS.`;
        const data = (input ?? {}) as Record<string, unknown>;
        const fragments =
          canvas === 'modal' ? (action.endsWith('.form') ? ['modal'] : ['panel']) : undefined;
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
    description:
      'Look up records by a search term. Returns up to 5 { id, label }. Use this to resolve a name to an id.',
    guide:
      'When the user names a record ("the Globex deal"), resolve the name to an id here before acting — unless the id is already visible in SCREEN.',
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
        userId,
        today: todayStr(),
      }) as QueryRequest;
      const res = await ray.wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
      if (!res.ok) return `find_records failed (${res.status}): ${(await res.text()).slice(0, 300)}`;
      const rows = rowsOf(await res.json());
      return rows.slice(0, 5).map((r) => ({ id: r[cfg.idKey], label: r[cfg.labelKey] }));
    },
  });

  const dataTool = defineTool({
    id: 'ray.data',
    name: 'query',
    riskLevel: 'low',
    description:
      'Read data from the CRM. The body is a Vex request — { intent, shape, context?, fingerprint? } per its guide.',
    guide: () => vexGuide(),
    input: z.object({
      intent: z
        .string()
        .optional()
        .describe(
          'Plain English with ALL the detail (see VEX guide). Required unless replaying a fingerprint.',
        ),
      shape: z
        .unknown()
        .optional()
        .describe(
          'A JSON example of the output, structure only (see VEX guide). Required unless replaying a fingerprint.',
        ),
      context: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Runtime values that vary per call (see VEX guide).'),
      fingerprint: z
        .string()
        .optional()
        .describe(
          'A cache identity from an earlier reply (meta.cache.fingerprint) — see VEX guide.',
        ),
    }),
    execute: async ({ intent, shape, context, fingerprint }) => {
      try {
        const ctx = (context ?? {}) as Record<string, unknown>;
        if (fingerprint !== undefined) {
          const res = await ray.wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context: ctx }) });
          if (!res.ok) return `query failed (${res.status}): ${(await res.text()).slice(0, 300)}`;
          const result = unwrapped(await res.json());
          turn.lastResult = { result, shape, intent: intent ?? '' };
          return { result, meta: { cache: { fingerprint } } };
        }
        if (intent === undefined) return 'query needs an `intent` and a `shape`, or a `fingerprint` to replay.';
        const res = await ray.answerIntent({ intent, shape, context: ctx });
        turn.lastResult = { result: res.result, shape, intent };
        return res;
      } catch (e) {
        return `query failed: ${(e as Error).message}`;
      }
    },
  });

  const visualizeTool = defineTool({
    id: 'ray.view',
    name: 'visualize',
    riskLevel: 'low',
    timeoutMs: 3 * 60_000,
    description:
      'Render the LAST query result in the chat as a layout. Describe how to show it (a table, a single KPI, a card per row).',
    guide:
      'Run a `query` first — visualize renders its result in the chat (a table, a KPI, a card per row; describe the form, a layout specialist builds it). ' +
      'The reply includes the layout produced — pass it back as `base` to match or revise it. For a REUSABLE screen use build_action instead.',
    input: z.object({
      intent: z
        .string()
        .describe(
          'How to display the data — e.g. "a table of company and value", "a single total KPI".',
        ),
      base: z
        .unknown()
        .optional()
        .describe(
          'An existing layout to match or revise — the `layout` from an earlier visualize reply.',
        ),
    }),
    execute: async ({ intent, base }) => {
      const visualiser = llmFor('layout');
      if ('error' in visualiser) return `${visualiser.error} Cannot visualize.`;
      const last = turn.lastResult;
      if (last === undefined) return 'Nothing to visualize yet — run a query first.';
      // The app's own registry: the server shell's carries name-only stubs, and
      // the palette needs the components' meta.
      const palette = paletteFromRegistry(buildRegistry(), {
        include: VIZ_COMPONENTS,
        omitProps: VIZ_OMIT_PROPS,
      });
      const sample = Array.isArray(last.result) ? last.result.slice(0, 2) : last.result;
      const res = await layoutAgent.run(
        {
          intent,
          palette,
          dataShape: sample,
          styleGuide: styleGuide(),
          ...(base !== undefined ? { base } : {}),
        },
        { llm: visualiser.llm },
      ).result;
      if (!res.ok) return `visualize failed: ${res.error.message}`;
      const layout = res.output.data;
      turn.pendingView = { layout, data: last.result };
      const n = Array.isArray(last.result) ? last.result.length : 1;
      return {
        forInput: { intent, ...(base != null ? { base } : {}), data: last.result },
        forModel: { rendered: n, layout },
        forTrace: { layout },
      };
    },
  });

  const screens = opts.screens === undefined ? [] : [opts.screens.build, opts.screens.keep, opts.screens.discard];
  return opts.dataTools === false
    ? [stackTool, queryTool, ...screens]
    : [stackTool, queryTool, dataTool, visualizeTool, ...screens];
};
