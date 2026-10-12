import { z } from 'zod';
import type { ZodType } from 'zod';
import { defineAgent, type AgentDefinition, type Message } from '@niscorp/cortex';
import { draftSchemaOf, type DraftChoice, type ReflexDraft } from '../schemas';

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

export const answerSchemaOf = (choice: DraftChoice = {}): z.ZodType<ReflexAnswer> =>
  z.union([
    draftSchemaOf(choice).describe('Write the draft when the request — with the conversation so far — says what should happen and what sets it off.'),
    ReflexQuestionSchema,
    ReflexRefusalSchema,
  ]);

export const ReflexAnswerSchema = answerSchemaOf();

export const isDraft = (answer: ReflexAnswer): answer is ReflexDraft => 'effect' in answer;

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

// Converted by the schema's own zod: a caller's schema may come from another copy.
const describeEffects = (effects: readonly OfferedEffect[]): string =>
  `OFFERED EFFECTS — a draft names exactly one, by \`name\`; choose by its \`description\`:\n${JSON.stringify(
    effects.map((effect) => ({ name: effect.name, description: effect.description, input: effect.input['~standard'].jsonSchema.output({ target: 'draft-07' }) })),
  )}`;

export const effectProblem = (effects: readonly OfferedEffect[], reflex: Pick<ReflexDraft, 'effect'>): string | undefined => {
  const effect = effects.find((candidate) => candidate.name === reflex.effect.name);
  if (effect === undefined) return `The effect "${reflex.effect.name}" is not offered. Name one of: ${effects.map((candidate) => candidate.name).join(', ')}.`;
  const parsed = effect.input.safeParse(reflex.effect.input);
  if (parsed.success) return undefined;
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ');
  return `The input for "${effect.name}" does not fit its schema — ${issues}.`;
};

export const createReflexAgent = (config: { effects: readonly OfferedEffect[] } & DraftChoice): AgentDefinition<ReflexAnswer> =>
  defineAgent<ReflexAnswer>({
    id: 'tide.reflex',
    description: 'Answers what somebody wants automated with one tide reflex draft, a question back, or a refusal.',
    instructions: INSTRUCTIONS,
    context: [() => describeEffects(config.effects)],
    output: {
      schema: answerSchemaOf(config),
      validate: (envelope) => {
        if (!isDraft(envelope.data)) return { ok: true };
        const problem = effectProblem(config.effects, envelope.data);
        return problem === undefined ? { ok: true } : { retry: problem };
      },
    },
  });
