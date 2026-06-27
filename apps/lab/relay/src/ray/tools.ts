import { z } from 'zod';
import { defineTool, type ToolDefinition } from '@niscorp/cortex';
import type { Shell } from '@niscorp/nova';
import { evaluate } from '@niscorp/prism';
import type { QueryRequest } from '@niscorp/vex';
import { getVexRuntime, CURRENT_USER_ID, CURRENT_DATE } from '@relay/vex/runtime';
import { contactsReads } from '@relay/nova/domains/contact';
import { companiesReads } from '@relay/nova/domains/company';
import { dealsReads } from '@relay/nova/domains/deal';
import { CATALOG_IDS } from './catalog';

// ── find_records: resolve a name → id, by reusing the EXISTING list shapes.
// Same read path the screens use (scoped, validated, cached) — just with a search
// term and a small projection to { id, label }.
type Lookup = { prism: unknown; sortBy: string; idKey: string; labelKey: string };
const LOOKUPS: Record<string, Lookup> = {
  deal: { prism: dealsReads['deals.list'], sortBy: 'deals.created_at', idKey: 'deal_id', labelKey: 'title' },
  contact: { prism: contactsReads['contacts.list'], sortBy: 'contacts.last_name', idKey: 'contact_id', labelKey: 'name' },
  company: { prism: companiesReads['companies.list'], sortBy: 'companies.name', idKey: 'company_id', labelKey: 'name' },
};

export const makeTools = (shell: Shell): ToolDefinition[] => {
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

  return [stackTool, queryTool];
};
