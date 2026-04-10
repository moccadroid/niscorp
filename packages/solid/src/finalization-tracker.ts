import type { ParserEvent } from './types';

// ═══════════════════════════════════════════════════════════
// Finalization tracker — determines when paths become final
// ═══════════════════════════════════════════════════════════

export type FinalizationTracker = {
  process: (events: ParserEvent[]) => void;
  isFinal: (path: string) => boolean;
  isRootFinal: () => boolean;
};

export const createFinalizationTracker = (): FinalizationTracker => {
  const finalized = new Set<string>();
  let isRootFinal = false;

  // Keys seen per object/array path, in insertion order
  const keysPerContainer = new Map<string, string[]>();

  const finalizePath = (path: string): void => {
    if (finalized.has(path)) return;
    finalized.add(path);
  };

  // When a new key appears, all earlier sibling keys are final
  const finalizePreviousSiblings = (containerPath: string, newKey: string): void => {
    const keys = keysPerContainer.get(containerPath);
    if (!keys) return;
    for (const key of keys) {
      if (key === newKey) break;
      const siblingPath = containerPath === '' ? key : `${containerPath}.${key}`;
      finalizePath(siblingPath);
      finalizeDescendants(siblingPath);
    }
  };

  const finalizeDescendants = (path: string): void => {
    const prefix = path + '.';
    for (const [containerPath, keys] of keysPerContainer) {
      if (containerPath === path || containerPath.startsWith(prefix)) {
        for (const key of keys) {
          const childPath = containerPath === '' ? key : `${containerPath}.${key}`;
          finalizePath(childPath);
        }
      }
    }
  };

  const process = (events: ParserEvent[]): void => {
    for (const event of events) {
      switch (event.type) {
        case 'enterObject':
        case 'enterArray': {
          if (!keysPerContainer.has(event.path)) {
            keysPerContainer.set(event.path, []);
          }
          break;
        }

        case 'enterKey': {
          const keys = keysPerContainer.get(event.path);
          if (keys && !keys.includes(event.key)) {
            finalizePreviousSiblings(event.path, event.key);
            keys.push(event.key);
          }
          break;
        }

        case 'enterIndex': {
          const keys = keysPerContainer.get(event.path);
          const indexStr = String(event.index);
          if (keys && !keys.includes(indexStr)) {
            finalizePreviousSiblings(event.path, indexStr);
            keys.push(indexStr);
          }
          break;
        }

        case 'leaveObject':
        case 'leaveArray': {
          // Container closed — all children are final
          const keys = keysPerContainer.get(event.path);
          if (keys) {
            for (const key of keys) {
              const childPath = event.path === '' ? key : `${event.path}.${key}`;
              finalizePath(childPath);
              finalizeDescendants(childPath);
            }
          }
          if (event.path === '') {
            isRootFinal = true;
          }
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
  };
};
