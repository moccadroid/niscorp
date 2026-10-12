import { z, type ZodType } from 'zod';
import { SignalError, ErrorCode } from '../errors';
import { decisionQuestionDescription } from '../transport/protocol';
import type { Questions, Question, CalibratedDecision, UncalibratedDecision } from '../types';

export type CalibratedDecisions<Qs extends Questions> = { [N in keyof Qs]: CalibratedDecision<Qs[N]> };
export type UncalibratedDecisions<Qs extends Questions> = { [N in keyof Qs]: UncalibratedDecision<Qs[N]> };

const probability = z.number().min(0).max(1);

const enumOf = (name: string, options: readonly string[]) => {
  const [first, ...rest] = options;
  if (first === undefined) {
    throw new SignalError(`Question "${name}" offers nothing to answer with`, ErrorCode.VALIDATION_FAILED, { question: name });
  }
  return z.enum([first, ...rest]);
};

const levelKeysOf = (question: { criteria: readonly string[] }): string[] =>
  question.criteria.map((_, level) => String(level));

const mostProbable = (probabilities: readonly number[]): number =>
  probabilities.reduce((best, value, level) => (value > (probabilities[best] ?? 0) ? level : best), 0);

const calibratedGate = (name: string, question: Question): ZodType => {
  if (question.type === 'choice') {
    const option = enumOf(name, Object.keys(question.criteria));
    return z.object({ choice: option, probabilities: z.record(option, probability), confidence: probability });
  }
  if (question.type === 'score') {
    const keys = levelKeysOf(question);
    const level = enumOf(name, keys);
    return z
      .object({
        score: z.number().min(0).max(keys.length - 1),
        probabilities: z.record(level, probability),
        confidence: probability,
      })
      .transform((answer) => {
        const probabilities = keys.map((key) => answer.probabilities[key] ?? 0);
        return { level: mostProbable(probabilities), score: answer.score, probabilities, confidence: answer.confidence };
      });
  }
  return z.object({ noul: probability }).transform((answer) => ({ answer: answer.noul >= 0.5, noul: answer.noul }));
};

const uncalibratedField = (name: string, question: Question): ZodType => {
  const description = decisionQuestionDescription(question);
  if (question.type === 'choice') return enumOf(name, Object.keys(question.criteria)).describe(description);
  if (question.type === 'score') return z.number().int().min(0).max(question.criteria.length - 1).describe(description);
  return z.boolean().describe(description);
};

const uncalibratedDecision = (question: Question, value: unknown): Record<string, unknown> => {
  if (question.type === 'choice') return { choice: value };
  if (question.type === 'score') return { level: value };
  return { answer: value };
};

const assertAsked = (questions: Questions): void => {
  if (Object.keys(questions).length === 0) {
    throw new SignalError('decide() needs at least one question', ErrorCode.VALIDATION_FAILED);
  }
};

// Each entry was written by its question's own gate, so covering the names covers the type.
const answersEvery = <Out extends object>(questions: Questions, decisions: object): decisions is Out =>
  Object.keys(questions).every((name) => name in decisions);

const rejected = (issues: readonly string[], raw: unknown): SignalError =>
  new SignalError(`Decision rejected: ${issues.join('; ')}`, ErrorCode.VALIDATION_FAILED, { issues, raw });

const issuesOf = (name: string, error: z.ZodError): string[] =>
  error.issues.map((issue) => `${[name, ...issue.path].join('.')}: ${issue.message}`);

// Builds each gate for its throw: a question that cannot be gated fails before the network.
export const assertQuestions = (questions: Questions): void => {
  assertAsked(questions);
  for (const [name, question] of Object.entries(questions)) calibratedGate(name, question);
};

export const acceptCalibrated = <Qs extends Questions>(
  questions: Qs,
  answers: unknown,
  raw: unknown,
): CalibratedDecisions<Qs> => {
  const arrived = z.record(z.string(), z.unknown()).safeParse(answers);
  if (!arrived.success) throw rejected(['the provider returned no answers'], raw);

  const decisions: Record<string, unknown> = {};
  const issues: string[] = [];
  for (const [name, question] of Object.entries(questions)) {
    if (!(name in arrived.data)) {
      issues.push(`${name}: not answered`);
      continue;
    }
    const gated = calibratedGate(name, question).safeParse(arrived.data[name]);
    if (gated.success) decisions[name] = gated.data;
    else issues.push(...issuesOf(name, gated.error));
  }
  if (issues.length > 0 || !answersEvery<CalibratedDecisions<Qs>>(questions, decisions)) throw rejected(issues, raw);
  return decisions;
};

export const uncalibratedSchemaOf = (questions: Questions): ZodType<Record<string, unknown>> =>
  z.strictObject(
    Object.fromEntries(Object.entries(questions).map(([name, question]) => [name, uncalibratedField(name, question)])),
  );

export const acceptUncalibrated = <Qs extends Questions>(
  questions: Qs,
  value: unknown,
  raw: unknown,
): UncalibratedDecisions<Qs> => {
  const gated = uncalibratedSchemaOf(questions).safeParse(value);
  if (!gated.success) throw rejected(issuesOf('decisions', gated.error), raw);

  const decisions: Record<string, unknown> = {};
  for (const [name, question] of Object.entries(questions)) decisions[name] = uncalibratedDecision(question, gated.data[name]);
  if (!answersEvery<UncalibratedDecisions<Qs>>(questions, decisions)) throw rejected(['a question went unanswered'], raw);
  return decisions;
};
