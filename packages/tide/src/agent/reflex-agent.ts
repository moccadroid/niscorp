// ═══════════════════════════════════════════════════════════
// @niscorp/tide/agent — the reflex agent
// ═══════════════════════════════════════════════════════════
//
// Given what somebody wants automated — "end the talk in thirty minutes",
// "every Monday at nine, send the digest" — and the effects the host offers,
// the reflex agent writes ONE reflex: tide's own artifact, validated by tide's
// own schema. It does not schedule anything. What it returns is a document to
// be read and saved; the host loads it, and from then on it runs with no model
// at all. That is the point: the model writes the automation once, instead of
// being asked, on every tick, whether there is anything to do.
//
// The same pattern as @niscorp/prism/agent and @niscorp/vex/agent: the
// package's own schema is the output, cortex validates it in the loop and
// feeds failures back. Cortex is an optional peer — the rest of @niscorp/tide
// does not need it.
//
//   const agent = createReflexAgent({ effects: [
//     { name: 'deck.goto', does: 'Show a slide on the projector', input: z.object({ slideId: z.string() }) },
//   ] });
//   const result = await agent.run({ intent: 'end the talk in 30 minutes', now: '2026-09-27T19:00', tz: 'Europe/Vienna' }, { llm }).result;
//   if (result.ok) await tide.load([{ ...result.output.data, as: 'clock' }], { at: Date.now() });
//
// A factory, not a constant, because the effects are the host's: the agent is
// told what each does and the JSON Schema of its input, and a reflex naming
// an effect the host does not offer — or an input that effect's own schema
// refuses — is sent back to the model to correct, in the same run. Rules
// about triggers, clocks and policy live in the reflex schema's .describe()
// calls, which cortex injects; fix them there, not here.

import { z } from 'zod';
import type { ZodType } from 'zod';
import { defineAgent, type AgentDefinition } from '@niscorp/cortex';
import { ReflexSchema, type Reflex } from '../schemas';

// An effect the host offers: its registered name, what it does in one plain
// sentence, and the schema its input must satisfy.
export type OfferedEffect = { name: string; does: string; input: ZodType };

export const ReflexAgentInputSchema = z.object({
  intent: z.string().describe('What the person wants automated, in their own words.'),
  now: z
    .string()
    .describe('The current local date and time, "YYYY-MM-DDTHH:MM", in `tz` — what "in thirty minutes", "tonight" and "on Monday" count from.'),
  tz: z.string().describe('The IANA timezone the person is in. Every clock the reflex names uses it.'),
});

export type ReflexAgentInput = z.infer<typeof ReflexAgentInputSchema>;

const INSTRUCTIONS = `You are Tide's reflex agent. Somebody describes an automation; you write ONE reflex that does it — a trigger, exactly one of the offered effects, and its input.

Your envelope's \`data\` is the reflex; \`reasoning\` is one sentence on how you read the request. The reflex must validate against the OUTPUT SCHEMA (every rule is in its field descriptions), name one of the OFFERED EFFECTS, and give it an input its schema accepts.

Work out times from \`now\` and \`tz\` in the input: "in 30 minutes" from now "2026-09-27T19:05" is a one-shot clock at "2026-09-27T19:35". Leave \`as\` out — who the reflex runs as is the host's decision, not yours.

Worked example (illustrative only — the real effects are the offered ones):
INPUT  { "intent": "remind the team at five", "now": "2026-09-27T14:10", "tz": "Europe/Vienna" }
data   { "id": "remind-team-1700", "intent": "Remind the team at five o'clock today.", "on": { "clock": { "at": "2026-09-27T17:00", "tz": "Europe/Vienna" } }, "effect": { "name": "team.remind", "input": { "text": "It is five o'clock." } } }`;

// The offered effects, as the agent reads them: name, what it does, and the
// JSON Schema of its input — converted by the schema's OWN zod, whichever copy
// made it (a caller's schema may come from another).
const describeEffects = (effects: readonly OfferedEffect[]): string =>
  `OFFERED EFFECTS — a reflex names exactly one, by \`name\`:\n${JSON.stringify(
    effects.map((effect) => ({ name: effect.name, does: effect.does, input: effect.input['~standard'].jsonSchema.output({ target: 'draft-07' }) })),
  )}`;

// What is wrong with a reflex's effect, as a correction the model can act on —
// or nothing. The effect is the host's vocabulary, so it is checked against the
// host's own schemas: an effect nobody offered, or an input its schema refuses.
export const effectProblem = (effects: readonly OfferedEffect[], reflex: Pick<Reflex, 'effect'>): string | undefined => {
  const effect = effects.find((candidate) => candidate.name === reflex.effect.name);
  if (effect === undefined) return `The effect "${reflex.effect.name}" is not offered. Name one of: ${effects.map((candidate) => candidate.name).join(', ')}.`;
  const parsed = effect.input.safeParse(reflex.effect.input);
  if (parsed.success) return undefined;
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ');
  return `The input for "${effect.name}" does not fit its schema — ${issues}.`;
};

export const createReflexAgent = (config: { effects: readonly OfferedEffect[] }): AgentDefinition<Reflex> =>
  defineAgent<Reflex>({
    id: 'tide.reflex',
    description: 'Writes one tide reflex — a trigger and an offered effect — from what somebody wants automated.',
    instructions: INSTRUCTIONS,
    context: [() => describeEffects(config.effects)],
    output: {
      schema: ReflexSchema,
      // Corrected in the run, tools and context still warm.
      validate: (envelope) => {
        const problem = effectProblem(config.effects, envelope.data);
        return problem === undefined ? { ok: true } : { retry: problem };
      },
    },
  });
