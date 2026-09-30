import { z } from 'zod';
import { mintSession } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';
import { memberRegister, nameRefuse } from '@lyceum/app/vex/member.entries';
import { questionJudge, questionsToJudge, verdictsAll } from '@lyceum/app/vex/question.entries';
import { createDecider } from './decider';
import { freshNames } from './names';
import { vexOver, wireAs } from './vex-over';

// IS THIS FIT TO SHOW? Everything a person in the room writes that the room
// could see — the name they type at the door, a question for the speaker —
// is asked of the one decider (./decider.ts), one yes/no question, the same
// every time. What is not fit is kept, for reference, and never shown.
//
// `score` is the decider's probability of yes; yes is 0.5 and above. The fake,
// for the checks, refuses a few words and passes everything else.

export type Verdict = { appropriate: boolean; score: number };
export type Moderator = { kind: 'live' | 'fake'; judge: (text: string) => Promise<Verdict> };

const QUESTION = {
  appropriate: {
    type: 'noul',
    instructions:
      'Somebody in the audience of a tech meetup wrote this: a name for themselves, or a question for the speaker. Is it fine to show on the projector in front of about a hundred people?',
    criteria: {
      true: 'Fine to show: silly, blunt, critical or off-topic is fine.',
      false: 'Not fine: an insult, a slur, sexual content, an attack on a person, or anything meant to embarrass somebody.',
    },
  },
} as const;

const liveModerator = (env: Record<string, string | undefined>): Moderator => {
  const decider = createDecider(env);
  return {
    kind: 'live',
    judge: async (text) => {
      const result = await decider.decide({ state: { written: text }, questions: QUESTION });
      const decision: unknown = result.decisions.appropriate;
      const noul = typeof decision === 'object' && decision !== null && 'noul' in decision && typeof decision.noul === 'number' ? decision.noul : undefined;
      const answer = typeof decision === 'object' && decision !== null && 'answer' in decision && decision.answer === true;
      return { appropriate: noul === undefined ? answer : noul >= 0.5, score: noul ?? (answer ? 1 : 0) };
    },
  };
};

// The checks' moderator: these words are not fit, nothing else is caught.
const REFUSED = /\b(idiot|stupid|damn)\b/i;
const fakeModerator = (): Moderator => ({
  kind: 'fake',
  judge: async (text) => (REFUSED.test(text) ? { appropriate: false, score: 0 } : { appropriate: true, score: 1 }),
});

export const createModerator = (env: Record<string, string | undefined>): Moderator => {
  const chosen = env['LYCEUM_MODERATION'];
  const hasKey = (env['TYPESAFE_API_KEY'] ?? '') !== '' || (env['GROQ_API_KEY'] ?? '') !== '';
  if (chosen === 'fake' || (chosen !== 'live' && !hasKey)) return fakeModerator();
  if (!hasKey) throw new Error('lyceum: LYCEUM_MODERATION=live needs TYPESAFE_API_KEY or GROQ_API_KEY in apps/lab/lyceum/.env.');
  return liveModerator(env);
};

// ── the moderator at work ──
//
// A principal that is not a person (`moderator`, charter.ts), reading and
// writing through the same governed door as everybody else: who has which
// name, the questions and the verdicts, the refused names. Every call mints
// its own short session.
const MODERATOR_TTL_MS = 5 * 60 * 1000;
const NamesSchema = z.array(z.object({ name: z.string() }));
const QuestionsSchema = z.array(z.object({ question_id: z.string(), text: z.string() }));
const VerdictsSchema = z.array(z.object({ question_id: z.string() }));

export type Moderation = {
  // Names nobody has, for the door.
  offer: (count: number) => Promise<string[]>;
  // Whether a name is taken.
  taken: (name: string) => Promise<boolean>;
  // A name somebody typed: judged, and kept if it is refused.
  judgeName: (text: string) => Promise<Verdict>;
  // Judge every question nobody has judged yet. Runs one pass at a time; asked
  // while one runs, it runs once more after.
  judgeQuestions: () => void;
};

export const startModeration = (server: () => MossServer, pool: PgPool, moderator: Moderator): Moderation => {
  const vex = async (): Promise<ReturnType<typeof vexOver>> => vexOver(wireAs(server(), await mintSession(pool, 'moderator', MODERATOR_TTL_MS)));
  const names = async (): Promise<Set<string>> => new Set(NamesSchema.parse(await (await vex())(memberRegister.fingerprint)).map((row) => row.name));

  let running = false;
  let again = false;
  const pass = async (): Promise<void> => {
    const ask = await vex();
    const judged = new Set(VerdictsSchema.parse(await ask(verdictsAll.fingerprint)).map((row) => row.question_id));
    for (const question of QuestionsSchema.parse(await ask(questionsToJudge.fingerprint))) {
      if (judged.has(question.question_id)) continue;
      const verdict = await moderator.judge(question.text);
      await ask(questionJudge.fingerprint, { questionId: question.question_id, text: question.text, appropriate: verdict.appropriate, score: verdict.score });
    }
  };
  const judgeQuestions = (): void => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    void (async () => {
      do {
        again = false;
        await pass().catch((error: unknown) => console.error('[lyceum] moderating questions failed:', error));
      } while (again);
      running = false;
    })();
  };

  return {
    offer: async (count) => freshNames(await names(), count),
    taken: async (name) => (await names()).has(name),
    judgeName: async (text) => {
      const verdict = await moderator.judge(text);
      if (!verdict.appropriate) await (await vex())(nameRefuse.fingerprint, { text, score: verdict.score });
      return verdict;
    },
    judgeQuestions,
  };
};
