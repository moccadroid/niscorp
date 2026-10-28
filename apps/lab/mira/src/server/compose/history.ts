import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { Upgrader } from '@niscorp/strata';
import { CARDS_ON_A_SCREEN, SCREENS } from '../../app/screens';
import { answerClose, answerDrawn, answerKeep, answersRecent, answersSaid } from '../../app/vex/answers.entries';
import { ANSWER_INKS } from './plan';
import type { Card, Plan, ShownPlan } from './plan';

export type History = {
  current: () => ShownPlan;
  all: () => ShownPlan[];
  add: (plan: Plan) => ShownPlan;
  next: (plan: Plan) => ShownPlan;
  nextInk: () => string;
  indexOf: (test: (plan: Plan) => boolean) => number;
  go: (position: number) => ShownPlan;
  back: () => ShownPlan;
  forward: () => ShownPlan;
  keep: (cards: Card[], drawn: unknown[][]) => void;
  close: (position: number) => Plan | undefined;
  restore: (past: readonly Plan[]) => void;
};

const RowSchema = z.object({
  id: z.string(),
  question: z.string(),
  title: z.string(),
  response: z.string().nullable(),
  grammar: z.record(z.string(), z.number()).nullable(),
  plan: z.unknown(),
  drawn: z.unknown(),
});

// A plan as it is kept. A card kept without a key — one from before cards had keys — is given one as it is read.
const KeptPlanSchema = z.object({
  columns: z.number().int().min(1).max(3),
  ink: z.string().optional(),
  cards: z
    .array(
      z.object({
        key: z.string().optional(),
        action: z.string(),
        input: z.record(z.string(), z.unknown()),
        span: z.number().int().min(1).max(3).optional(),
        ink: z.string().optional(),
        mark: z.enum(['changed', 'new']).optional(),
      }),
    )
    .min(1)
    .max(CARDS_ON_A_SCREEN),
});

const DrawnSchema = z.array(z.array(z.unknown()));

// A message the person sent and what was said back: the answer it put up, by its id, or the answer or the screen it was
// asked on when it put up none of its own.
export type Exchange = { id: string; question: string; title: string; reply: string; askedOn?: string; screen?: string };

const SaidSchema = z.object({ id: z.string(), question: z.string(), title: z.string(), response: z.string().nullable(), asked_on: z.string().nullable(), screen: z.string().nullable() });

export type Kept = { past: () => Promise<Plan[]>; said: () => Promise<Exchange[]>; keep: (plan: Plan & { id: string }) => Promise<void>; keepSaid: (exchange: Exchange) => Promise<void>; drawn: (id: string, drawn: NonNullable<Plan['drawn']>) => Promise<void>; close: (id: string) => Promise<void> };

const inkOfAnswer = (answersBefore: number): string => ANSWER_INKS[answersBefore % ANSWER_INKS.length] ?? ANSWER_INKS[0];
const KNOWN_INKS = new Set<string>([...ANSWER_INKS, ...SCREENS.map((screen) => screen.ink)]);

// A person's answers, read and written as them through vex. What they did on an answer since is not kept. An answer's
// plan is kept with the grammars it was written at and upgraded where it is read (rule 19). An answer that no longer
// reads is left out, and the rest stay. A card kept without an ink the app still has takes the ink of its answer's
// turn.
export const keptAs = (wire: FunctionSession['wire'], grammar: Upgrader): Kept => {
  const post = async (fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
    const response = await wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context }) });
    if (!response.ok) throw new Error(`${fingerprint} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response.json();
  };
  const planOfRow = (row: unknown, turn: number): Plan[] => {
    try {
      const { id, question, title, response, grammar: stamp, plan, drawn } = RowSchema.parse(row);
      const kept = KeptPlanSchema.parse(grammar.upgrade(plan, { kind: 'mira.answers/plan', stamp }).document);
      const ink = kept.ink !== undefined && KNOWN_INKS.has(kept.ink) ? kept.ink : inkOfAnswer(turn);
      const cards = kept.cards.map(({ key, action, input, span, ink: own, mark }): Card => ({
        key: key ?? randomUUID(),
        action,
        input,
        span: span ?? 1,
        ink: own !== undefined && KNOWN_INKS.has(own) ? own : ink,
        ...(mark === undefined ? {} : { mark }),
      }));
      const pictured = DrawnSchema.safeParse(drawn);
      return [{ id, question, label: title, response: response ?? '', columns: kept.columns, cards, ink, ...(pictured.success ? { drawn: pictured.data } : {}) }];
    } catch (error) {
      console.error(`[answers] an answer that no longer reads is left out of the stack: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
      return [];
    }
  };
  return {
    past: async () => {
      const rows = await post(answersRecent.fingerprint, {});
      return (Array.isArray(rows) ? rows : []).reverse().flatMap((row, turn) => planOfRow(row, turn));
    },
    said: async () => {
      const rows = await post(answersSaid.fingerprint, {});
      return (Array.isArray(rows) ? rows : []).reverse().flatMap((row) => {
        const read = SaidSchema.safeParse(row);
        if (!read.success) return [];
        const { id, question, title, response, asked_on: askedOn, screen } = read.data;
        return [{ id, question, title, reply: response ?? '', ...(askedOn === null ? {} : { askedOn }), ...(screen === null ? {} : { screen }) }];
      });
    },
    keep: async ({ id, question, label, response, columns, cards, ink }) => {
      await post(answerKeep.fingerprint, { id, question, title: label, response: response ?? '', plan: { columns, cards, ink }, grammar: grammar.stamp, askedOn: null, screen: null });
    },
    drawn: async (id, drawn) => {
      await post(answerDrawn.fingerprint, { id, drawn });
    },
    close: async (id) => {
      await post(answerClose.fingerprint, { id, closedAt: new Date().toISOString() });
    },
    keepSaid: async ({ id, question, title, reply, askedOn, screen }) => {
      await post(answerKeep.fingerprint, { id, question, title, response: reply, plan: null, grammar: grammar.stamp, askedOn: askedOn ?? null, screen: screen ?? null });
    },
  };
};

const NOTHING: Plan = { question: '', label: '', columns: 1, cards: [], ink: ANSWER_INKS[0] };

const stackOf = (plans: readonly Plan[]): ShownPlan['stack'] => plans.map((plan, offset) => ({ position: offset + 1, label: plan.label, ink: plan.ink }));

export const createHistory = (first: Plan | undefined): History => {
  const plans: Plan[] = first === undefined ? [] : [first];
  let at = plans.length - 1;
  const answers = (): number => plans.filter((plan) => plan.screen === undefined).length;
  const nextInk = (): string => inkOfAnswer(answers());
  const shown = (index: number): ShownPlan => {
    const plan = plans[index];
    return { ...(plan ?? NOTHING), position: plan === undefined ? 0 : index + 1, total: plans.length, stack: stackOf(plans), next: nextInk(), later: inkOfAnswer(answers() + 1) };
  };
  const showAt = (index: number): ShownPlan => {
    at = index;
    return shown(at);
  };
  return {
    current: () => shown(at),
    all: () => plans.map((_, index) => shown(index)),
    add: (plan) => {
      plans.push(plan);
      return showAt(plans.length - 1);
    },
    next: (plan) => ({ ...plan, position: plans.length + 1, total: plans.length + 1, stack: stackOf([...plans, plan]), next: inkOfAnswer(answers() + 1), later: inkOfAnswer(answers() + 2) }),
    nextInk,
    indexOf: (test) => plans.findIndex(test),
    go: (position) => showAt(position >= 1 && position <= plans.length ? position - 1 : at),
    back: () => showAt(Math.max(0, at - 1)),
    forward: () => showAt(Math.min(plans.length - 1, at + 1)),
    keep: (cards, drawn) => {
      const plan = plans[at];
      if (plan !== undefined) plans[at] = { ...plan, cards, drawn };
    },
    // The first screen stays; closing the answer shown shows the one before it.
    close: (position) => {
      const index = position - 1;
      if (index < 1 || index >= plans.length) return undefined;
      const [closed] = plans.splice(index, 1);
      if (at >= index) at = Math.max(0, at - 1);
      return closed;
    },
    restore: (past) => {
      plans.push(...past);
      at = plans.length - 1;
    },
  };
};
