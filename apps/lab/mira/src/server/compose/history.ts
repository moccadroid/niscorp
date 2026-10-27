import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import { LayoutNodeSchema } from '@niscorp/nova';
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
const RowsSchema = z.array(
  z.object({
    question: z.string(),
    title: z.string(),
    response: z.string().nullable(),
    plan: z.object({ canvases: z.partialRecord(AreaIdSchema, z.array(CanvasSchema)), arrangement: z.string(), layout: LayoutNodeSchema }),
  }),
);

export type Kept = { past: () => Promise<Plan[]>; keep: (plan: Plan) => Promise<void> };

// A person's answers, read and written as them through vex. What they did on an answer since is not kept.
export const keptAs = (wire: FunctionSession['wire']): Kept => {
  const post = async (fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
    const response = await wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint, context }) });
    if (!response.ok) throw new Error(`${fingerprint} answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response.json();
  };
  return {
    past: async () =>
      RowsSchema.parse(await post(answersRecent.fingerprint, {}))
        .reverse()
        .map(({ question, title, response, plan }) => ({ question, label: title, response: response ?? '', ...plan })),
    keep: async ({ question, label, response, canvases, arrangement, layout }) => {
      await post(answerKeep.fingerprint, { question, title: label, response: response ?? '', plan: { canvases, arrangement, layout } });
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
