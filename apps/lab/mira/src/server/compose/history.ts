import type { Plan, Unnumbered } from './plan';

const NOTHING: Plan = { question: '', label: '', position: 0, total: 0, stack: [], answers: [], canvases: {} };

export const createHistory = (first: Unnumbered | undefined) => {
  const plans: Unnumbered[] = first === undefined ? [] : [first];
  let at = plans.length - 1;
  const numbered = (index: number): Plan => {
    const plan = plans[index];
    return plan === undefined ? NOTHING : { ...plan, position: index + 1, total: plans.length, stack: plans.map((one, i) => ({ position: i + 1, label: one.label })) };
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
    drop: (index: number): void => {
      plans.splice(index, 1);
      if (at >= index) at = Math.max(0, at - 1);
    },
    indexOf: (test: (plan: Unnumbered) => boolean): number => plans.findIndex(test),
    go: (position: number): Plan => numbered((at = position >= 1 && position <= plans.length ? position - 1 : at)),
    back: (): Plan => numbered((at = at > 0 ? at - 1 : at)),
    forward: (): Plan => numbered((at = at < plans.length - 1 ? at + 1 : at)),
  };
};
