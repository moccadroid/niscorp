import type { Plan, Unnumbered } from './plan';

const NOTHING: Plan = { question: '', position: 0, total: 0, answers: [], canvases: {} };

export const createHistory = () => {
  const plans: Unnumbered[] = [];
  let at = -1;
  const numbered = (index: number): Plan => {
    const plan = plans[index];
    return plan === undefined ? NOTHING : { ...plan, position: index + 1, total: plans.length };
  };
  return {
    current: (): Plan => numbered(at),
    showing: (): number => at,
    add: (plan: Unnumbered): Plan => {
      plans.push(plan);
      at = plans.length - 1;
      return numbered(at);
    },
    replace: (index: number, plan: Unnumbered): Plan => {
      plans[index] = plan;
      return numbered(index);
    },
    back: (): Plan => numbered((at = at > 0 ? at - 1 : at)),
    forward: (): Plan => numbered((at = at < plans.length - 1 ? at + 1 : at)),
  };
};
