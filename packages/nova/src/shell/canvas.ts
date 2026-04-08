import type { ActionInstance } from '../action';

export type Canvas = {
  readonly id: string;
  readonly stack: ActionInstance[];
  peek: () => ActionInstance | undefined;
  pushInstance: (inst: ActionInstance) => void;
  popInstance: () => ActionInstance | undefined;
  replaceTop: (inst: ActionInstance) => ActionInstance | undefined;
  clearStack: () => ActionInstance[];
};

export const createCanvas = (id: string): Canvas => {
  const stack: ActionInstance[] = [];

  const peek = (): ActionInstance | undefined => {
    if (stack.length === 0) return undefined;
    return stack[stack.length - 1];
  };

  const pushInstance = (inst: ActionInstance): void => {
    stack.push(inst);
  };

  const popInstance = (): ActionInstance | undefined => {
    return stack.pop();
  };

  const replaceTop = (inst: ActionInstance): ActionInstance | undefined => {
    const prev = stack.pop();
    stack.push(inst);
    return prev;
  };

  const clearStack = (): ActionInstance[] => {
    const removed = stack.slice();
    stack.length = 0;
    return removed;
  };

  return { id, stack, peek, pushInstance, popInstance, replaceTop, clearStack };
};
