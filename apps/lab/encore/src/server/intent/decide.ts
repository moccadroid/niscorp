import type { Question } from '@niscorp/signal';
import type { Decider } from '@encore/server/decider/decider';
import { connectionsOpened } from '@encore/server/keep-warm';
import type { Answer, Decided } from './intent.types';

const UNCALIBRATED_YES = 0.8;
const UNCALIBRATED_PICK = 0.6;

export type DecideState = { line: string; heard: Record<string, string | number>; superseded?: string[] };

export const decideQuestions = async (decider: Decider, state: DecideState, questions: Record<string, Question>): Promise<Decided> => {
  const requestBytes = Buffer.byteLength(JSON.stringify({ state, questions }));
  await decider.ready();
  const started = performance.now();
  const opened = connectionsOpened();
  const result = await decider.signal.decide({ state, questions });
  const durationMs = performance.now() - started;
  const reusedConnection = connectionsOpened() === opened;
  decider.used();

  const answers: Record<string, Answer> = {};
  if (result.calibrated) {
    for (const [name, decision] of Object.entries(result.decisions)) {
      if ('noul' in decision) answers[name] = { kind: 'noul', p: decision.noul };
      else if ('choice' in decision) answers[name] = { kind: 'choice', choice: decision.choice, p: decision.probabilities[decision.choice] ?? 0, confidence: decision.confidence, probabilities: decision.probabilities };
      else answers[name] = { kind: 'score', level: decision.level, confidence: decision.confidence };
    }
  } else {
    for (const [name, decision] of Object.entries(result.decisions)) {
      if ('answer' in decision) answers[name] = { kind: 'noul', p: decision.answer ? UNCALIBRATED_YES : 0 };
      else if ('choice' in decision) answers[name] = { kind: 'choice', choice: decision.choice, p: UNCALIBRATED_PICK, confidence: UNCALIBRATED_PICK };
      else answers[name] = { kind: 'score', level: decision.level, confidence: UNCALIBRATED_PICK };
    }
  }

  return { answers, calibrated: result.calibrated, model: result.meta.model, requestBytes, questionCount: Object.keys(questions).length, durationMs, reusedConnection };
};
