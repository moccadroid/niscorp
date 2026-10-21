import type { Plan, ShownPlan } from './plan';

export type History = {
  current: () => ShownPlan;
  showing: () => number;
  add: (plan: Plan) => ShownPlan;
  replace: (index: number, plan: Plan) => ShownPlan;
  drop: (index: number) => void;
  indexOf: (test: (plan: Plan) => boolean) => number;
  go: (position: number) => ShownPlan;
  back: () => ShownPlan;
  forward: () => ShownPlan;
};

const NOTHING: ShownPlan = { question: '', label: '', position: 0, total: 0, stack: [], canvases: {}, arrangement: '', layout: { component: 'Answers' } };

export const createHistory = (first: Plan | undefined): History => {
  const plans: Plan[] = first === undefined ? [] : [first];
  let at = plans.length - 1;
  const shown = (index: number): ShownPlan => {
    const plan = plans[index];
    return plan === undefined ? NOTHING : { ...plan, position: index + 1, total: plans.length, stack: plans.map((one, i) => ({ position: i + 1, label: one.label })) };
  };
  const showAt = (index: number): ShownPlan => {
    at = index;
    return shown(at);
  };
  return {
    current: () => shown(at),
    showing: () => at,
    add: (plan) => {
      plans.push(plan);
      return showAt(plans.length - 1);
    },
    replace: (index, plan) => {
      plans[index] = plan;
      return shown(index);
    },
    drop: (index) => {
      plans.splice(index, 1);
      if (at >= index) at = Math.max(0, at - 1);
    },
    indexOf: (test) => plans.findIndex(test),
    go: (position) => showAt(position >= 1 && position <= plans.length ? position - 1 : at),
    back: () => showAt(Math.max(0, at - 1)),
    forward: () => showAt(Math.min(plans.length - 1, at + 1)),
  };
};
