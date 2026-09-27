import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { defineTool } from '@niscorp/cortex';
import type { ToolDefinition } from '@niscorp/cortex';
import type { FunctionSession } from '@niscorp/moss';
import { ACTIONS } from '@lyceum/app/action-catalog';
import { routeQuestion } from '../functions/ask.functions';
import type { Asker } from '../asking';
import { armable, dueOf, localNow } from '../timing';
import type { TimerWriter } from '../timing';
import { vexOver } from '../vex-over';
import type { ToolName } from './declarations';

// THE ASSISTANT'S TOOLS — the host's closed set, and the only code in it. Each
// is offered only when a declaration the person's grants select names it
// (declarations.ts). None acts: each leaves a PROPOSAL the person presses —
// an action to open, an answer to read, an automation to read and save.
//
//   open      an action this person holds, pre-filled from its declared input
//   ask       the ask's own path (routeQuestion) — as the person, recorded
//   automate  tide's reflex agent, handed the grounding as facts; it can refuse

export type Proposal =
  | { open: { action: string; label: string; input: Record<string, unknown> } }
  | { answer: { kind: string; how: string; rows: unknown } }
  | { timer: { timerId: string; reflex: unknown; json: string; intent: string; dueAt: string | null; dueLocal: string } };

export type ToolDeps = {
  session: FunctionSession;
  asker: Asker;
  writer: TimerWriter;
  tz: string;
  // What the assistant was grounded on this turn — handed to `automate` as facts.
  facts: string;
  // Where proposals collect, for the reply.
  proposals: Proposal[];
};

// The keys an action declares as openable (rule 14), from its `input` JSON
// Schema — what `open` may pre-fill, and nothing else.
const openableKeys = (actionId: string): string[] => {
  const schema: unknown = ACTIONS[actionId]?.input;
  const properties = typeof schema === 'object' && schema !== null && 'properties' in schema ? schema.properties : undefined;
  return typeof properties === 'object' && properties !== null ? Object.keys(properties) : [];
};

// Every openable key in the catalog — the assistant action's open trigger
// carries exactly these (a navigation step resolves its input key by key).
export const OPENABLE_KEYS: readonly string[] = [...new Set(Object.keys(ACTIONS).flatMap(openableKeys))].sort();

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
          if (definition === undefined || !deps.session.actions.includes(asked.action)) return { refused: `"${asked.action}" is not something this person holds.` };
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

  if (offered.has('ask')) {
    tools.push(
      defineTool({
        id: 'ask',
        name: 'ask',
        description: 'Put a question to the records — the people in the room, the departments, what was asked — in plain words. Answered under this person\'s own policy.',
        input: z.object({ question: z.string().describe('The question, in plain words.') }),
        execute: async ({ question }) => {
          try {
            const routed = await routeQuestion(deps.session, deps.asker, question);
            const result = await vexOver(deps.session.wire)(routed.fingerprint);
            deps.proposals.push({ answer: { kind: routed.kind, how: routed.how, rows: result } });
            return { answered: result };
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
          const written = await deps.writer.write(request, now, deps.tz, deps.facts);
          if ('refused' in written) return { refused: written.refused };
          const reflex = armable(written.reflex);
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
