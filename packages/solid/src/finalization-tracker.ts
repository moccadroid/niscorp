import type { ParserEvent } from './types';

export type FinalizationTracker = {
  process: (events: ParserEvent[]) => void;
  isFinal: (path: string) => boolean;
  isRootFinal: () => boolean;
  getContainerKeys: (path: string) => readonly string[] | undefined;
  getChildIndex: (path: string, key: string) => number | undefined;
};

// `settled` counts the leading keys already marked final.
type Container = { keys: string[]; indexOf: Map<string, number>; settled: number };

export const createFinalizationTracker = (): FinalizationTracker => {
  const finalized = new Set<string>();
  let isRootFinal = false;
  // Counted, not read from the path: under a key "" a container has the root's path.
  let openContainers = 0;

  const containers = new Map<string, Container>();

  const childPathOf = (containerPath: string, key: string): string =>
    containerPath === '' ? key : `${containerPath}.${key}`;

  const settle = (containerPath: string): void => {
    const container = containers.get(containerPath);
    if (!container) return;
    const { keys } = container;
    for (let index = container.settled; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined) continue;
      finalized.add(childPathOf(containerPath, key));
    }
    container.settled = keys.length;
  };

  const enterChild = (containerPath: string, key: string): void => {
    const container = containers.get(containerPath);
    if (!container) return;
    if (container.indexOf.has(key)) return;
    settle(containerPath);
    container.indexOf.set(key, container.keys.length);
    container.keys.push(key);
  };

  const process = (events: ParserEvent[]): void => {
    for (const event of events) {
      switch (event.type) {
        case 'enterObject':
        case 'enterArray': {
          openContainers += 1;
          if (!containers.has(event.path)) {
            containers.set(event.path, { keys: [], indexOf: new Map(), settled: 0 });
          }
          break;
        }

        case 'enterKey':
          enterChild(event.path, event.key);
          break;

        case 'enterIndex':
          enterChild(event.path, String(event.index));
          break;

        case 'leaveObject':
        case 'leaveArray': {
          settle(event.path);
          openContainers -= 1;
          if (openContainers === 0) isRootFinal = true;
          break;
        }

        case 'valueComplete':
          break;
      }
    }
  };

  return {
    process,
    isFinal: (path) => finalized.has(path) || isRootFinal,
    isRootFinal: () => isRootFinal,
    getContainerKeys: (path) => containers.get(path)?.keys,
    getChildIndex: (path, key) => containers.get(path)?.indexOf.get(key),
  };
};
