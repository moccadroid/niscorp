import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { defineTool } from '@niscorp/cortex';
import type { ToolDefinition } from '@niscorp/cortex';
import type { FunctionSession } from '@niscorp/moss';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { routeQuery } from '../functions/query.functions';
import type { Querier } from '../querying';
import { slidesDeck } from '@lyceum/app/vex/deck.entries';
import { armable, dueOf, localNow, slideIdsOf } from '../timing';
import type { TimerWriter } from '../timing';
import { vexOver } from '../vex-over';
import type { ToolName } from './declarations';

// THE ASSISTANT'S TOOLS — the host's closed set, and the only code in it. Each
// is offered only when a declaration the person's grants select names it
// (declarations.ts). Nothing that CHANGES anything happens without a press:
// `open` and `automate` leave a PROPOSAL — an action to press, an automation to
// read and save. A query changes nothing, so `query` shows its result at once,
// over the screen.
//
//   open      an action this person holds, pre-filled from its declared input
//   query     a vex query from words (routeQuery), as the person, recorded;
//             its result opens over their screen (`query.result`)
//   automate  tide's reflex agent, handed the grounding as facts; it can refuse

export type Proposal =
  | { open: { action: string; label: string; input: Record<string, unknown> } }
  | { timer: { timerId: string; reflex: unknown; json: string; intent: string; dueAt: string | null; dueLocal: string } };

// An action a tool opened over the screen — the reply's `opened` rows, which
// the assistant's turn trigger reconciles onto the overlay.
export type Opened = { action: string; input: Record<string, unknown> };

export type ToolDeps = {
  session: FunctionSession;
  querier: Querier;
  writer: TimerWriter;
  tz: string;
  // What the assistant was grounded on this turn — handed to `automate` as facts.
  facts: string;
  // Where proposals collect, for the reply.
  proposals: Proposal[];
  // What was opened over the screen this turn.
  opened: Opened[];
};

// Actions only a tool opens — `open` does not offer them, and their input is
// the tool's, not a person's to pre-fill.
export const OPENED_BY_TOOLS: ReadonlySet<string> = new Set(['query.result']);

// Actions a tool DOES — offered through `open` only to somebody without that
// tool. The query desk is what `query` does; offered both ways, the model
// picked the button about as often as the tool, and the person got a button
// that opened a desk to type the same words into again.
const DONE_BY_TOOLS: Readonly<Record<string, ToolName>> = { 'query.desk': 'query' };

// What `open` may offer this person: an action they hold, with an input
// contract, that no tool opens and no tool they have does.
export const offerableActions = (held: readonly string[], offered: ReadonlySet<ToolName>): string[] =>
  held.filter((id) => {
    const doneBy = DONE_BY_TOOLS[id];
    return ACTIONS[id]?.input !== undefined && !OPENED_BY_TOOLS.has(id) && (doneBy === undefined || !offered.has(doneBy));
  });

// The keys an action declares as openable (rule 14), from its `input` JSON
// Schema — what `open` may pre-fill, and nothing else.
const openableKeys = (actionId: string): string[] => {
  const schema: unknown = ACTIONS[actionId]?.input;
  const properties = typeof schema === 'object' && schema !== null && 'properties' in schema ? schema.properties : undefined;
  return typeof properties === 'object' && properties !== null ? Object.keys(properties) : [];
};

// Every openable key in the catalog — the assistant action's open trigger
// carries exactly these (a navigation step resolves its input key by key).
export const OPENABLE_KEYS: readonly string[] = [...new Set(Object.keys(ACTIONS).filter((id) => !OPENED_BY_TOOLS.has(id)).flatMap(openableKeys))].sort();

export const hostTools = (deps: ToolDeps, offered: ReadonlySet<ToolName>): ToolDefinition[] => {
  const tools: ToolDefinition[] = [];

  if (offered.has('open')) {
    tools.push(
      defineTool({
        id: 'open',
        name: 'open',
        description: 'Propose an action this person holds, as a button they press — optionally pre-filled with values for the keys it declares as input. It opens nothing itself.',
        input: z.object({
          action: z.string().describe('The action id, from the ACTIONS YOU CAN OFFER.'),
          label: z.string().describe('The button\'s words, e.g. "Change your name to Ada".'),
          input: z.record(z.string(), z.string()).optional().describe('Values for the action\'s declared input keys.'),
        }),
        execute: (asked) => {
          const definition = ACTIONS[asked.action];
          if (definition === undefined || !offerableActions(deps.session.actions, offered).includes(asked.action)) return { refused: `"${asked.action}" is not something this person holds.` };
          const keys = openableKeys(asked.action);
          const unknownKeys = Object.keys(asked.input ?? {}).filter((key) => !keys.includes(key));
          if (unknownKeys.length > 0) return { refused: `"${asked.action}" takes no input ${unknownKeys.join(', ')}; it takes: ${keys.join(', ') || 'nothing'}.` };
          // Every openable key filled — the action's own default where the
          // model gave none — so the trigger never hands an action `undefined`.
          const input = Object.fromEntries(OPENABLE_KEYS.map((key) => [key, asked.input?.[key] ?? definition.data?.[key] ?? '']));
          deps.proposals.push({ open: { action: asked.action, label: asked.label, input } });
          return { proposed: `A button "${asked.label}" is shown; the person presses it.` };
        },
      }),
    );
  }

  if (offered.has('query')) {
    tools.push(
      defineTool({
        id: 'query',
        name: 'query',
        description: "Run a vex query against the records from a request in plain words — the people in the room, the departments, earlier queries — under this person's own policy. The result opens over their screen; you get its rows.",
        input: z.object({ request: z.string().describe('What to query for, in plain words.') }),
        execute: async ({ request }) => {
          try {
            const routed = await routeQuery(deps.session, deps.querier, request);
            const rows = await vexOver(deps.session.wire)(routed.fingerprint);
            deps.opened.push({ action: 'query.result', input: { routed, sheetTitle: `Vex query · ${request}` } });
            return { rows };
          } catch (error) {
            return { refused: error instanceof Error ? error.message : String(error) };
          }
        },
      }),
    );
  }

  if (offered.has('automate')) {
    tools.push(
      defineTool({
        id: 'automate',
        name: 'automate',
        description: 'Hand a request for something to happen at a time, or after a while, to the automation writer — in the person\'s own words. It returns a document for them to read and save, or a refusal.',
        input: z.object({ request: z.string().describe('What should happen, and when, in the person\'s words.') }),
        execute: async ({ request }) => {
          const now = Date.now();
          // The slides a timer may name: the deck's rows, read as this person.
          const slideIds = slideIdsOf(await vexOver(deps.session.wire)(slidesDeck.fingerprint));
          const written = await deps.writer.write({ intent: request, now, tz: deps.tz, facts: deps.facts, slideIds });
          if ('refused' in written) return { refused: written.refused };
          const reflex = armable(written.reflex, slideIds);
          const due = dueOf(reflex, now);
          deps.proposals.push({
            timer: {
              timerId: `${reflex.id}-${randomBytes(3).toString('hex')}`,
              reflex,
              json: JSON.stringify(reflex, null, 2),
              intent: reflex.intent,
              dueAt: due === undefined ? null : new Date(due).toISOString(),
              dueLocal: due === undefined ? '' : localNow(due, deps.tz).slice(11),
            },
          });
          return { proposed: `An automation is shown to read and save: ${reflex.intent}` };
        },
      }),
    );
  }

  return tools;
};
