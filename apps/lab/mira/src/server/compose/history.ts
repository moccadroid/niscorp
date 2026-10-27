import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import { LayoutNodeSchema } from '@niscorp/nova';
import type { Upgrader } from '@niscorp/strata';
import { answerKeep, answersRecent } from '../../app/vex/answers.entries';
import { AreaIdSchema } from './layout';
import type { Plan, ShownPlan } from './plan';

export type History = {
  current: () => ShownPlan;
  add: (plan: Plan) => ShownPlan;
  next: (plan: Plan) => ShownPlan;
  indexOf: (test: (plan: Plan) => boolean) => number;
  go: (position: number) => ShownPlan;
  back: () => ShownPlan;
  forward: () => ShownPlan;
  keep: (canvases: Plan['canvases']) => void;
  restore: (past: readonly Plan[]) => void;
};

const CanvasSchema = z.object({ action: z.string(), input: z.record(z.string(), z.unknown()), intent: z.string() });
const RowSchema = z.object({
  question: z.string(),
  title: z.string(),
  response: z.string().nullable(),
  grammar: z.record(z.string(), z.number()).nullable(),
  plan: z.object({ canvases: z.partialRecord(AreaIdSchema, z.array(CanvasSchema)), arrangement: z.string(), layout: z.unknown() }),
});

export type Kept = { past: () => Promise<Plan[]>; keep: (plan: Plan) => Promise<void> };

// A person's answers, read and written as them through vex. What they did on an answer since is not kept. A screen's
// layout is a nova document, kept with the grammars it was written at and upgraded where it is read (rule 19). An
// answer that no longer reads is left out, and the rest stay.
export const keptAs = (wire: FunctionSession['wire'], grammar: Upgrader): Kept => {
  const post = async (fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
    const response = await wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context }) });
    if (!response.ok) throw new Error(`${fingerprint} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response.json();
  };
  const planOfRow = (row: unknown): Plan[] => {
    try {
      const { question, title, response, grammar: stamp, plan } = RowSchema.parse(row);
      const layout = LayoutNodeSchema.parse(grammar.upgrade(plan.layout, { kind: 'nisc.nova/layout', stamp }).document);
      return [{ question, label: title, response: response ?? '', canvases: plan.canvases, arrangement: plan.arrangement, layout }];
    } catch (error) {
      console.error(`[answers] an answer that no longer reads is left out of the stack: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
      return [];
    }
  };
  return {
    past: async () => {
      const rows = await post(answersRecent.fingerprint, {});
      return (Array.isArray(rows) ? rows : []).reverse().flatMap(planOfRow);
    },
    keep: async ({ question, label, response, canvases, arrangement, layout }) => {
      await post(answerKeep.fingerprint, { question, title: label, response: response ?? '', plan: { canvases, arrangement, layout }, grammar: grammar.stamp });
    },
  };
};

const NOTHING: ShownPlan = { question: '', label: '', position: 0, total: 0, stack: [], canvases: {}, arrangement: '', layout: { component: 'Grid' } };

const stackOf = (plans: readonly Plan[]): ShownPlan['stack'] => plans.map((plan, offset) => ({ position: offset + 1, label: plan.label }));

export const createHistory = (first: Plan | undefined): History => {
  const plans: Plan[] = first === undefined ? [] : [first];
  let at = plans.length - 1;
  const shown = (index: number): ShownPlan => {
    const plan = plans[index];
    return plan === undefined ? NOTHING : { ...plan, position: index + 1, total: plans.length, stack: stackOf(plans) };
  };
  const showAt = (index: number): ShownPlan => {
    at = index;
    return shown(at);
  };
  return {
    current: () => shown(at),
    add: (plan) => {
      plans.push(plan);
      return showAt(plans.length - 1);
    },
    next: (plan) => ({ ...plan, position: plans.length + 1, total: plans.length + 1, stack: stackOf([...plans, plan]) }),
    indexOf: (test) => plans.findIndex(test),
    go: (position) => showAt(position >= 1 && position <= plans.length ? position - 1 : at),
    back: () => showAt(Math.max(0, at - 1)),
    forward: () => showAt(Math.min(plans.length - 1, at + 1)),
    keep: (canvases) => {
      const plan = plans[at];
      if (plan !== undefined) plans[at] = { ...plan, canvases };
    },
    restore: (past) => {
      plans.push(...past);
      at = plans.length - 1;
    },
  };
};
