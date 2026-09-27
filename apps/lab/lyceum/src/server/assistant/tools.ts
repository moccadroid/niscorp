import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { defineTool } from '@niscorp/cortex';
import type { ToolDefinition } from '@niscorp/cortex';
import type { FunctionSession } from '@niscorp/moss';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { QUERY_SHAPES } from '@lyceum/app/vex/query.shapes';
import { routeQuery } from './vex-query';
import type { Querier } from '../querying';
import { slidesDeck } from '@lyceum/app/vex/deck.entries';
import { armable, dueOf, localNow, slideIdsOf } from '../timing';
import type { TimerWriter } from '../timing';
import { vexOver } from '../vex-over';
import type { ToolName } from './declarations';

// THE ASSISTANT'S TOOLS — the host's closed set, and the only code in it. Each
// is offered only when a declaration the person's grants select names it
// (declarations.ts). What CHANGES something waits for a press: `open` and
// `automate` leave a proposal on the screen. A query changes nothing, so
// `query` opens the vex query and its result at once, over the screen.
//
//   open      one of this person's actions, pre-filled, as a button
//   query     a vex query — intent and shape — run as the person, recorded;
//             it opens over their screen (`query.result`)
//   automate  tide's reflex agent, handed the grounding as facts; it can refuse
//
// A tool's RESULT is what the model reports from, so it says what happened in
// facts — never how the screen works.

export type Proposal =
  | { open: { action: string; label: string; input: Record<string, unknown> } }
  | { timer: { timerId: string; reflex: unknown; json: string; intent: string; dueAt: string | null; dueLocal: string } };

// An action a tool opened over the screen — the turn's `opened` rows: the
// assistant's turn trigger reconciles them onto the overlay, and the turn keeps
// them, so the conversation can open them again.
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

// Not the person's to be offered — which actions exist for them at all is the
// charter's: the assistant itself; what only a tool opens (query.result); what
// only another action opens, with an id nobody types (questions.edit, from the
// list); and a tab's surface, whose form is offered on its own (questions.desk).
const NOT_OFFERED: ReadonlySet<string> = new Set(['assistant.thread', 'query.result', 'questions.edit', 'questions.desk']);

// How an action is DRAWN — as a tab on the phone, as the card's strip — is the
// phone's business, not something a person asks for. These input keys are the
// phone's; everything else an action declares (rule 14) can be pre-filled.
const PRESENTATION_KEYS: ReadonlySet<string> = new Set(['tab', 'tabInk', 'strip']);

const inputProperties = (actionId: string): Record<string, unknown> => {
  const schema: unknown = ACTIONS[actionId]?.input;
  const properties = typeof schema === 'object' && schema !== null && 'properties' in schema ? schema.properties : undefined;
  return typeof properties === 'object' && properties !== null ? Object.fromEntries(Object.entries(properties)) : {};
};

// What an action can be pre-filled with: its declared input, less the phone's.
export const prefillOf = (actionId: string): { key: string; means: string }[] =>
  Object.entries(inputProperties(actionId))
    .filter(([key]) => !PRESENTATION_KEYS.has(key))
    .map(([key, property]) => ({ key, means: typeof property === 'object' && property !== null && 'description' in property && typeof property.description === 'string' ? property.description : '' }));

// What `open` may offer this person: the actions the charter gave them (what
// exists for them at all) that declare an `input` — an action's public,
// openable contract (rule 14); one without it is part of a screen, not
// something to open — less the assistant itself and what only a tool opens.
export const offerableActions = (held: readonly string[]): string[] =>
  held.filter((id) => ACTIONS[id]?.input !== undefined && !NOT_OFFERED.has(id));

// Every pre-fill key in the catalog — the assistant action's open trigger
// carries exactly these (a navigation step resolves its input key by key).
export const OPENABLE_KEYS: readonly string[] = [...new Set(offerableActions(Object.keys(ACTIONS)).flatMap((id) => prefillOf(id).map((entry) => entry.key)))].sort();

export const hostTools = (deps: ToolDeps, offered: ReadonlySet<ToolName>): ToolDefinition[] => {
  const tools: ToolDefinition[] = [];

  const [firstAction, ...moreActions] = offerableActions(deps.session.actions);
  if (offered.has('open') && firstAction !== undefined) {
    tools.push(
      defineTool({
        id: 'open',
        name: 'open',
        description:
          "Offer one of this person's actions (THEIR ACTIONS) as a button on their screen, pre-filled with values for its pre-fill keys. Nothing happens until they press it and use the action.",
        input: z.object({
          action: z.enum([firstAction, ...moreActions]).describe('Which of their actions.'),
          label: z.string().describe('The button\'s words, saying what it does, e.g. "Change your name to Ada".'),
          input: z.record(z.string(), z.string()).optional().describe("Values for the action's pre-fill keys, as listed under THEIR ACTIONS."),
        }),
        execute: (asked) => {
          const definition = ACTIONS[asked.action];
          if (definition === undefined) return { refused: `"${asked.action}" is not one of their actions.` };
          const keys = prefillOf(asked.action).map((entry) => entry.key);
          const unknownKeys = Object.keys(asked.input ?? {}).filter((key) => !keys.includes(key));
          if (unknownKeys.length > 0) return { refused: `"${asked.action}" cannot be pre-filled with ${unknownKeys.join(', ')}; its pre-fill keys: ${keys.join(', ') || 'none'}.` };
          // Every pre-fill key filled — the action's own default where the
          // model gave none — so the trigger never hands an action `undefined`.
          const input = Object.fromEntries(OPENABLE_KEYS.map((key) => [key, asked.input?.[key] ?? definition.data?.[key] ?? '']));
          deps.proposals.push({ open: { action: asked.action, label: asked.label, input } });
          return { offered: { action: asked.action, label: asked.label, prefilled: asked.input ?? {} } };
        },
      }),
    );
  }

  if (offered.has('query')) {
    tools.push(
      defineTool({
        id: 'query',
        name: 'query',
        description:
          "Query the records with vex — the people in the room, the departments — for what you were not already given. You give the intent; vex picks the shape, replays a stored query that fits or writes a new one, under this person's own clearance. The query and its result open on their screen; you get the rows back.",
        input: z.object({ intent: z.string().describe('What to find, in plain words, e.g. "the people in the Archive department".') }),
        execute: async ({ intent }) => {
          try {
            const routed = await routeQuery(deps.session, deps.querier, intent);
            const rows = await vexOver(deps.session.wire)(routed.fingerprint);
            const shape = QUERY_SHAPES.find((entry) => entry.kind === routed.kind)?.shape ?? null;
            deps.opened.push({ action: 'query.result', input: { intent, shape: JSON.stringify(shape), routed, sheetTitle: 'Vex query' } });
            return { query: { intent, shape: routed.kind, fingerprint: routed.fingerprint, how: routed.how }, rows };
          } catch (error) {
            return { failed: error instanceof Error ? error.message : String(error) };
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
        description:
          "Hand a request for something to happen at a time, or after a while, to the automation writer, in the person's own words. It writes an automation and puts it on their screen to read; it runs only once they save it. It can refuse what no automation can do.",
        input: z.object({ request: z.string().describe("What should happen, and when, in the person's words.") }),
        execute: async ({ request }) => {
          const now = Date.now();
          // The slides a timer may name: the deck's rows, read as this person.
          const slideIds = slideIdsOf(await vexOver(deps.session.wire)(slidesDeck.fingerprint));
          const written = await deps.writer.write({ intent: request, now, tz: deps.tz, facts: deps.facts, slideIds });
          if ('refused' in written) return { refused: written.refused };
          const reflex = armable(written.reflex, slideIds);
          const due = dueOf(reflex, now);
          const dueLocal = due === undefined ? '' : localNow(due, deps.tz).slice(11);
          deps.proposals.push({
            timer: {
              timerId: `${reflex.id}-${randomBytes(3).toString('hex')}`,
              reflex,
              json: JSON.stringify(reflex, null, 2),
              intent: reflex.intent,
              dueAt: due === undefined ? null : new Date(due).toISOString(),
              dueLocal,
            },
          });
          // Its state, in words a reply cannot turn into "saved": it is not.
          return { written: { intent: reflex.intent, wouldFire: dueLocal, status: 'NOT saved and NOT running — it waits on their screen until they read it and save it' } };
        },
      }),
    );
  }

  return tools;
};
