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

export type Proposal = { timer: { timerId: string; draft: unknown; json: string; intent: string; when: string; reasoning: string } };

export type Opened = { action: string; label: string; ink: 'live' | 'paper'; input: Record<string, unknown> };

export type ToolDeps = {
  session: FunctionSession;
  querier: Querier;
  writer: TimerWriter;
  tz: string;
  facts: string;
  proposals: Proposal[];
  opened: Opened[];
  earlier: TimerRequest['earlier'];
  wrote: Written[];
};

const NOT_OFFERED: ReadonlySet<string> = new Set(['assistant.thread', 'query.result', 'speaker.notification', 'xray.document']);

const inputProperties = (actionId: string): Record<string, unknown> => {
  const schema: unknown = ACTIONS[actionId]?.input;
  const properties = typeof schema === 'object' && schema !== null && 'properties' in schema ? schema.properties : undefined;
  return typeof properties === 'object' && properties !== null ? Object.fromEntries(Object.entries(properties)) : {};
};

export const prefillOf = (actionId: string): { key: string; description: string }[] =>
  Object.entries(inputProperties(actionId)).map(([key, property]) => ({ key, description: typeof property === 'object' && property !== null && 'description' in property && typeof property.description === 'string' ? property.description : '' }));

export const offerableActions = (held: readonly string[]): string[] =>
  held.filter((id) => ACTIONS[id]?.input !== undefined && !NOT_OFFERED.has(id));

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
          // Every pre-fill key is filled, with the action's default where the model
          // gave none, so reopening from the conversation never hands it `undefined`.
          const input = Object.fromEntries(OPENABLE_KEYS.map((key) => [key, asked.input?.[key] ?? definition.data?.[key] ?? '']));
          deps.opened.push({ action: asked.action, label: asked.label, ink: 'paper', input: { ...input, sheetTitle: asked.label } });
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
          // The status also says it is written and in front of them: cut to "NOT
          // saved and NOT running" alone, the model reports it as a failure.
          return { written: { intent: draft.intent, when, reasoning: read, status: 'NOT saved and NOT running — it waits on their screen until they read it and save it' } };
        },
      }),
    );
  }

  return tools;
};
