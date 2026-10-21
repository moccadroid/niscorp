import type { Plan, ShownPlan } from './plan';

export type History = {
  current: () => ShownPlan;
  add: (plan: Plan) => ShownPlan;
  next: (plan: Plan) => ShownPlan;
  indexOf: (test: (plan: Plan) => boolean) => number;
  go: (position: number) => ShownPlan;
  back: () => ShownPlan;
  forward: () => ShownPlan;
  // What the person did on the answer shown stays with it, as a browser keeps a page's form when it is left.
  keep: (canvases: Plan['canvases']) => void;
};

const NOTHING: ShownPlan = { question: '', label: '', position: 0, total: 0, stack: [], canvases: {}, arrangement: '', layout: { component: 'Grid' } };

export const createHistory = (first: Plan | undefined): History => {
  const plans: Plan[] = first === undefined ? [] : [first];
  let at = plans.length - 1;
  const shown = (index: number): ShownPlan => {
    const plan = plans[index];
    return plan === undefined ? NOTHING : { ...plan, position: index + 1, total: plans.length, stack: plans.map((one, offset) => ({ position: offset + 1, label: one.label })) };
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
    next: (plan) => ({ ...plan, position: plans.length + 1, total: plans.length + 1, stack: [...plans.map((one, offset) => ({ position: offset + 1, label: one.label })), { position: plans.length + 1, label: plan.label }] }),
    indexOf: (test) => plans.findIndex(test),
    go: (position) => showAt(position >= 1 && position <= plans.length ? position - 1 : at),
    back: () => showAt(Math.max(0, at - 1)),
    forward: () => showAt(Math.min(plans.length - 1, at + 1)),
    keep: (canvases) => {
      const plan = plans[at];
      if (plan !== undefined) plans[at] = { ...plan, canvases };
    },
  };
};
