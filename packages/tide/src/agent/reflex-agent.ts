// ═══════════════════════════════════════════════════════════
// @niscorp/tide/agent — the reflex agent
// ═══════════════════════════════════════════════════════════
//
// Given what somebody wants automated — "every Monday at nine, send the
// digest" — and what the host offers (its effects; which triggers and fields
// a draft may use), the reflex agent answers with ONE of three things: a
// reflex DRAFT, a QUESTION back when the request can be read more than one
// way, or a REFUSAL when no offered effect does it. It does not schedule
// anything, and it does not wait: a question ends the run like any answer.
//
// The host shows the person what came back — with the agent's reasoning, so
// they can see how they were read. When they answer it, or correct a draft
// they have not saved ("no, I meant…"), the host runs the agent again over the
// CONVERSATION — each request, the agent's answer as it gave it, the latest
// words — as the turns of a chat (`reflexConversation`), which is what these
// models read natively. A draft is a document to be read and saved; the host
// anchors it when it is saved (`anchorDraft` — a timer becomes a clock then)
// and loads it, and from then on it runs with no model at all. That is the
// point: the model writes the automation once, instead of being asked, on
// every tick, whether there is anything to do.
//
// The same pattern as @niscorp/prism/agent and @niscorp/vex/agent: the
// package's own schema is the output, cortex validates it in the loop and
// feeds failures back. Cortex is an optional peer — the rest of @niscorp/tide
// does not need it.
//
//   const agent = createReflexAgent({ effects: [
//     { name: 'digest.send', description: 'Send the weekly digest to the team.', input: z.object({}) },
//   ], triggers: ['clock', 'timer'] });
//   const result = await agent.run({ intent, now, tz }, { llm }).result;
//   if (result.ok && isDraft(result.output.data)) {
//     // …shown to the person; when they save it:
//     await tide.load([{ ...anchorDraft(result.output.data, { at: Date.now(), tz }), as: owner }], { at: Date.now() });
//   }
//
// A factory, not a constant, because what is offered is the host's: the
// draft's shape is built from the triggers and fields the host names
// (`draftSchemaOf`), and a draft naming an effect the host does not offer — or
// an input that effect's own schema refuses — is sent back to the model to
// correct, in the same run. What each part of an answer IS lives in the
// schemas' .describe() calls, which ride the wire with them. The instructions
// carry what steers the answer as a whole: what to put first in `reasoning`
// (the whole request, as the conversation now has it); how people say times
// (a time of day that could be morning or evening is asked about; nothing
// repeats unless the person says so; no time that has passed); how a reply
// joins the request before it; asking about everything undecided at once; and
// never putting one effect in the place of another. No worked example: the
// only correct one would use the host's own effects, which tide does not know.

import { z } from 'zod';
import type { ZodType } from 'zod';
import { defineAgent, type AgentDefinition, type Message } from '@niscorp/cortex';
import { draftSchemaOf, type DraftChoice, type ReflexDraft } from '../schemas';

// An effect the host offers: its registered name, a description — one to
// three sentences on what it does and what it is for, which is what the model
// decides by — and the schema its input must satisfy.
export type OfferedEffect = { name: string; description: string; input: ZodType };

export const ReflexAgentInputSchema = z.object({
  intent: z.string().describe("The person's words — a request, or, later in the conversation, their reply to your question."),
  now: z
    .string()
    .describe('The current local date and time, "YYYY-MM-DDTHH:MM", in `tz` — what a date or a time of day in the request is read against.'),
  tz: z.string().describe('The IANA timezone the person is in. Every clock the reflex names uses it.'),
});

export type ReflexAgentInput = z.infer<typeof ReflexAgentInputSchema>;

export const ReflexQuestionSchema = z
  .object({ question: z.string().min(1).describe("One short question in the person's language, naming what it chooses between.") })
  .strict()
  .describe('Ask instead of writing a draft when the request can be read as different automations and nothing in its words or the conversation so far decides which.');

export const ReflexRefusalSchema = z
  .object({ refused: z.string().min(1).describe('Why none of the offered effects does it, in words for the person who asked.') })
  .strict()
  .describe('Refuse instead of writing a draft when none of the offered effects does what was asked. Only for that: a request that is unclear is a question, not a refusal.');

export type ReflexQuestion = z.infer<typeof ReflexQuestionSchema>;
export type ReflexRefusal = z.infer<typeof ReflexRefusalSchema>;
export type ReflexAnswer = ReflexDraft | ReflexQuestion | ReflexRefusal;

// The agent's answer for what the caller offers: a draft of THAT shape
// (`draftSchemaOf`), a question, or a refusal.
export const answerSchemaOf = (choice: DraftChoice = {}): z.ZodType<ReflexAnswer> =>
  z.union([
    draftSchemaOf(choice).describe('Write the draft when the request — with the conversation so far — says what should happen and what sets it off.'),
    ReflexQuestionSchema,
    ReflexRefusalSchema,
  ]);

// The default answer: a draft with every trigger kind and no extra fields.
export const ReflexAnswerSchema = answerSchemaOf();

export const isDraft = (answer: ReflexAnswer): answer is ReflexDraft => 'effect' in answer;

// THE CONVERSATION SO FAR, as the agent's input: each earlier request and the
// agent's answer to it — a question, a draft the person has not saved, a
// refusal — as it gave it, reasoning first; then the person's latest words.
// The turns of a chat, not a field to be read, because a reply or a
// correction ("no, I meant…") is only understood beside what it answers.
// Pass what this returns to `run` in place of a single input.
export const reflexConversation = (conversation: {
  now: string;
  tz: string;
  earlier: readonly { request: string; answer: ReflexAnswer; reasoning?: string | undefined }[];
  latest: string;
}): Message[] => [
  ...conversation.earlier.flatMap((turn): Message[] => [
    { role: 'user', content: JSON.stringify({ intent: turn.request, now: conversation.now, tz: conversation.tz }) },
    { role: 'assistant', content: JSON.stringify({ ...(turn.reasoning === undefined ? {} : { reasoning: turn.reasoning }), data: turn.answer }) },
  ]),
  { role: 'user', content: JSON.stringify({ intent: conversation.latest, now: conversation.now, tz: conversation.tz }) },
];

const INSTRUCTIONS = `You are Tide's reflex agent. Somebody describes an automation; you answer with ONE of three things, as the OUTPUT SCHEMA describes: a reflex draft that does it (a trigger, exactly one of the offered effects, and its input), a question back, or a refusal.

Your envelope's \`data\` is that answer. In \`reasoning\`, first restate the whole request as the conversation now has it; then decide. The answer must validate against the OUTPUT SCHEMA (its descriptions say what each part is); a draft must name one of the OFFERED EFFECTS and give it an input its schema accepts.

Times: a time of day that could fall in the morning or the evening, with nothing in the conversation saying which, is two different times — ask which. An automation happens once unless the person says it repeats. Never write a time that has already passed.

A reply answers your last question: together with the request before it, it is one request — keep what the request said, and add what the reply decides.

When you ask, ask about everything still undecided in one question, so one reply can settle it.

Effects: when the request names something to be done that no offered effect does — a channel, a device, an action — refuse it; never put a different effect in its place.`;

// The offered effects, as the agent reads them: name, description, and the
// JSON Schema of its input — converted by the schema's OWN zod, whichever copy
// made it (a caller's schema may come from another).
const describeEffects = (effects: readonly OfferedEffect[]): string =>
  `OFFERED EFFECTS — a draft names exactly one, by \`name\`; choose by its \`description\`:\n${JSON.stringify(
    effects.map((effect) => ({ name: effect.name, description: effect.description, input: effect.input['~standard'].jsonSchema.output({ target: 'draft-07' }) })),
  )}`;

// What is wrong with a draft's effect, as a correction the model can act on —
// or nothing. The effect is the host's vocabulary, so it is checked against the
// host's own schemas: an effect nobody offered, or an input its schema refuses.
export const effectProblem = (effects: readonly OfferedEffect[], reflex: Pick<ReflexDraft, 'effect'>): string | undefined => {
  const effect = effects.find((candidate) => candidate.name === reflex.effect.name);
  if (effect === undefined) return `The effect "${reflex.effect.name}" is not offered. Name one of: ${effects.map((candidate) => candidate.name).join(', ')}.`;
  const parsed = effect.input.safeParse(reflex.effect.input);
  if (parsed.success) return undefined;
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ');
  return `The input for "${effect.name}" does not fit its schema — ${issues}.`;
};

// `triggers` / `fields`: what a draft may use here (`draftSchemaOf`) — every
// trigger kind and no extra fields, unless the caller says otherwise. The draft
// may only use what its host can run, as it may only name its host's effects.
export const createReflexAgent = (config: { effects: readonly OfferedEffect[] } & DraftChoice): AgentDefinition<ReflexAnswer> =>
  defineAgent<ReflexAnswer>({
    id: 'tide.reflex',
    description: 'Answers what somebody wants automated with one tide reflex draft, a question back, or a refusal.',
    instructions: INSTRUCTIONS,
    context: [() => describeEffects(config.effects)],
    output: {
      schema: answerSchemaOf(config),
      // Corrected in the run, tools and context still warm. Only a draft
      // names an effect; a question or a refusal has nothing to check here.
      validate: (envelope) => {
        if (!isDraft(envelope.data)) return { ok: true };
        const problem = effectProblem(config.effects, envelope.data);
        return problem === undefined ? { ok: true } : { retry: problem };
      },
    },
  });
