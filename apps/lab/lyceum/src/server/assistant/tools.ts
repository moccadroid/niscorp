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
import { proposable, slideIdsOf, whenWords } from '../timing';
import type { TimerRequest, TimerWriter, Written } from '../timing';
import { vexOver } from '../vex-over';
import type { ToolName } from './declarations';

// THE ASSISTANT'S TOOLS — the host's closed set, and the only code in it. Each
// is offered only when a declaration the person's grants select names it
// (declarations.ts). Opening something changes nothing — an action opened
// pre-filled still waits for its own press ("File the change") — so `open`
// and `query` open over the screen at once, and the conversation keeps what
// they opened. What would CHANGE something by itself waits for a press: an
// automation is shown to read, and runs only once saved.
//
//   open      one of this person's actions, pre-filled, over their screen
//   query     a vex query — intent and shape — run as the person, recorded;
//             it opens over their screen (`query.result`)
//   automate  tide's reflex agent, handed the grounding as facts; it can refuse
//
// A tool's RESULT is what the model reports from, so it says what happened in
// facts — never how the screen works.

// A timer proposal is a DRAFT: nothing about when it fires is fixed until it
// is saved (`timers.save` anchors it then). `when` says it in words;
// `reasoning` is how the writer read the request — shown, so the person can
// see it and correct it.
export type Proposal = { timer: { timerId: string; draft: unknown; json: string; intent: string; when: string; reasoning: string } };

// An action a tool opened over the screen — the turn's `opened` rows: the
// assistant's turn trigger reconciles them onto the overlay, and the turn keeps
// them, so the conversation can open them again (by `label`, in `ink`).
export type Opened = { action: string; label: string; ink: 'live' | 'paper'; input: Record<string, unknown> };

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
  // This automation so far, from the recorded turns — handed to `automate`.
  earlier: TimerRequest['earlier'];
  // What the automation writer answered this turn, with its reasoning — kept on
  // the turn, so a reply or a correction goes back to it with both.
  wrote: Written[];
};

// Not the person's to be offered — which actions exist for them at all is the
// charter's: the assistant itself; what only a tool opens (query.result); what
// only an automation's `notify` opens (speaker.notification); and what only the
// X-ray opens, on an action somebody tapped (xray.document).
const NOT_OFFERED: ReadonlySet<string> = new Set(['assistant.thread', 'query.result', 'speaker.notification', 'xray.document']);

const inputProperties = (actionId: string): Record<string, unknown> => {
  const schema: unknown = ACTIONS[actionId]?.input;
  const properties = typeof schema === 'object' && schema !== null && 'properties' in schema ? schema.properties : undefined;
  return typeof properties === 'object' && properties !== null ? Object.fromEntries(Object.entries(properties)) : {};
};

// What an action can be pre-filled with: its declared input (rule 14).
export const prefillOf = (actionId: string): { key: string; description: string }[] =>
  Object.entries(inputProperties(actionId)).map(([key, property]) => ({ key, description: typeof property === 'object' && property !== null && 'description' in property && typeof property.description === 'string' ? property.description : '' }));

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
          "Open one of this person's actions (THEIR ACTIONS) over their screen, pre-filled with values for its pre-fill keys. Opening changes nothing: what the action does, they still do themselves in it.",
        input: z.object({
          action: z.enum([firstAction, ...moreActions]).describe('Which of their actions.'),
          label: z.string().describe('What it is, in a few words, e.g. "Change your name to Ada" — its title over their screen, and its line in the conversation.'),
          input: z.record(z.string(), z.string()).optional().describe("Values for the action's pre-fill keys, as listed under THEIR ACTIONS."),
        }),
        execute: (asked) => {
          const definition = ACTIONS[asked.action];
          if (definition === undefined) return { refused: `"${asked.action}" is not one of their actions.` };
          const keys = prefillOf(asked.action).map((entry) => entry.key);
          const unknownKeys = Object.keys(asked.input ?? {}).filter((key) => !keys.includes(key));
          if (unknownKeys.length > 0) return { refused: `"${asked.action}" cannot be pre-filled with ${unknownKeys.join(', ')}; its pre-fill keys: ${keys.join(', ') || 'none'}.` };
          // Every pre-fill key filled — the action's own default where the
          // model gave none — so reopening it from the conversation never hands
          // an action `undefined`.
          const input = Object.fromEntries(OPENABLE_KEYS.map((key) => [key, asked.input?.[key] ?? definition.data?.[key] ?? '']));
          deps.opened.push({ action: asked.action, label: asked.label, ink: 'paper', input: { ...input, sheetTitle: asked.label } });
          // Its state, in words a reply cannot turn into "done": nothing is.
          return { opened: { action: asked.action, label: asked.label, prefilled: asked.input ?? {}, status: 'open on their screen — NOTHING has changed; whatever the action does, they do in it themselves' } };
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
          "Query the records with vex — the people in the audience — for what you were not already given. You give the intent; vex picks the shape, replays a stored query that fits or writes a new one, under this person's own permissions. The query and its result open on their screen; you get the rows back.",
        input: z.object({ intent: z.string().describe('What to find, in plain words, e.g. "the people who joined in the last ten minutes".') }),
        execute: async ({ intent }) => {
          try {
            const routed = await routeQuery(deps.session, deps.querier, intent);
            const rows = await vexOver(deps.session.wire)(routed.fingerprint);
            const shape = QUERY_SHAPES.find((entry) => entry.kind === routed.kind)?.shape ?? null;
            deps.opened.push({ action: 'query.result', label: `Query · ${intent}`, ink: 'live', input: { intent, shape: JSON.stringify(shape), routed, sheetTitle: 'Query' } });
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
          // The slides a timer may name: the deck's rows, read as this person.
          const slideIds = slideIdsOf(await vexOver(deps.session.wire)(slidesDeck.fingerprint));
          const written = await deps.writer.write({ intent: request, now: Date.now(), tz: deps.tz, facts: deps.facts, slideIds, earlier: deps.earlier });
          const { answer, reasoning } = written;
          const read = reasoning ?? '';
          if ('refused' in answer) {
            deps.wrote.push(written);
            return { refused: answer.refused, reasoning: read };
          }
          if ('question' in answer) {
            deps.wrote.push(written);
            // Nothing is written and nothing waits: the question is the answer.
            return { asked: answer.question, reasoning: read, status: 'NOTHING was written. Put this question to the person, in these words, and nothing else about the automation.' };
          }
          const draft = proposable(answer, slideIds);
          deps.wrote.push({ answer: draft, reasoning });
          const when = whenWords(draft);
          deps.proposals.push({
            timer: {
              timerId: `${draft.id}-${randomBytes(3).toString('hex')}`,
              draft,
              json: JSON.stringify(draft, null, 2),
              intent: draft.intent,
              when,
              reasoning: read,
            },
          });
          // Its state, in words a reply cannot turn into "saved": it is not — but
          // it IS written and in front of them. (Cut to "NOT saved and NOT running"
          // alone, it was reported as a failure: "I cannot set a timer".)
          return { written: { intent: draft.intent, when, reasoning: read, status: 'NOT saved and NOT running — it waits on their screen until they read it and save it' } };
        },
      }),
    );
  }

  return tools;
};
