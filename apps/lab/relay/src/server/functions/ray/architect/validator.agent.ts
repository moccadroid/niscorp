import { z } from 'zod';
import { defineAgent, duration, outputRetries, schemaDoc, stepCount, type AgentDefinition } from '@niscorp/cortex';
import { ActionDefinitionSchema } from '@niscorp/nova';
import { styleGuide, today, ambientContext, channels } from '../knowledge';
import { componentPalette, actionCatalog } from './producers';
import { workedExample } from './worked-example';

// ═══════════════════════════════════════════════════════════
// The action validator — a pure READER. Given the user's intent, the built
// ActionDefinition, and the harness report, it judges the layer no
// deterministic check can: does the screen DO what the intent says?
// Triggers are declarative, so behavior is readable — `ref: "row" → push:
// { action: "task.form" }` answers "what does clicking a row do" without a
// click. No tools, no loop: one pass over big input, one small structured
// verdict. Its `fix` lines are written FOR the architect — they become the
// change request of a repair run (see run.ts).
//
// Its knowledge is the same producers the architect designs with — the
// palette (to read component props like a Table's clickKey correctly), the
// LIVE catalog (to judge push targets), the definition schema, and the app's
// ambient facts. A reader needs everything the writer had.
// ═══════════════════════════════════════════════════════════

export const FindingSchema = z.object({
  severity: z
    .enum(['blocker', 'wart'])
    .describe('blocker: the intent is violated or an interaction misbehaves. wart: quality/style — worth fixing, not worth blocking.'),
  claim: z.string().describe("The intent's requirement, in its words."),
  observed: z.string().describe('What the definition actually wires (cite the ref/trigger/endpoint).'),
  fix: z.string().describe('One line telling the builder what to change — written as a change request.'),
});

export const VerdictSchema = z.object({
  verdict: z.enum(['pass', 'fail']).describe('fail only when at least one finding is a blocker.'),
  findings: z.array(FindingSchema).describe('Empty when the screen honestly does what the intent says.'),
});

export type ValidatorVerdict = z.infer<typeof VerdictSchema>;

const INSTRUCTIONS = [
  'You are the action validator. You receive { intent, action, report }: what the user asked for, the built Nova ActionDefinition, and the harness report (mount issues, what each endpoint loaded, and `queries` — each data fingerprint’s PROVEN query in plain English). Judge whether the screen DOES what the intent says.',
  '',
  'THE QUERY DOES THE DATA WORK. Ordering, limits, filters, grouping and computed fields declared in a fingerprint’s entry in report.queries are REAL — the data layer enforces them on every replay. Their absence from the definition is CORRECT, never a finding. Flag a data claim only when the proven query’s own words contradict the intent.',
  '',
  'Read the definition — behavior is declarative:',
  '  - Every interaction the intent claims must be wired: find its layout node (ref/model), its trigger, and check the trigger DOES the claimed thing (the right endpoint re-called, the right action pushed with the right input keys, the right state set). Component props matter — a Table row click carries row[clickKey ?? rowKey]; check the RIGHT field rides the payload.',
  '  - Push targets: check against ACTIONS — the intent saying "opens the task form" wired to the tasks LIST is a blocker.',
  '  - Data flow: a typed input that should filter must reach the request (a binding in the endpoint request context); the report shows what actually loaded.',
  '  - Style and conventions (HOUSE STYLE, channels) are warts unless the intent explicitly asked for them.',
  '',
  'Report ONLY real findings — pair each with the intent\'s own words (`claim`), the wiring you observed (`observed`), and a one-line change request (`fix`). An honest empty findings list is a pass; invented nitpicks poison the repair loop.',
].join('\n');

export const validatorAgent: AgentDefinition<ValidatorVerdict> = defineAgent<ValidatorVerdict>({
  id: 'action.validator',
  description: 'Judges whether a built ActionDefinition does what the intent says.',
  instructions: INSTRUCTIONS,
  // The same producers the architect designed with, plus the definition
  // language itself — a reader needs everything the writer had.
  context: [
    workedExample,
    actionCatalog,
    componentPalette,
    () => `THE DEFINITION LANGUAGE you are reading:\n${schemaDoc(ActionDefinitionSchema)}`,
    styleGuide,
    today,
    ambientContext,
    channels,
  ],
  output: { schema: VerdictSchema },
  stopWhen: [stepCount(4), outputRetries(2), duration('2m')],
});
