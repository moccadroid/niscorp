import type { Shell } from './types';

export type ChainCount = {
  hold: (chain: Promise<unknown>) => void;
  inFlight: () => number;
};

export const createChainCount = (): ChainCount => {
  let count = 0;
  const release = (): void => {
    count -= 1;
  };
  return {
    hold: (chain) => {
      count += 1;
      chain.then(release, release);
    },
    inFlight: () => count,
  };
};

// Beside the shell rather than on it: `Shell` is a public type, and a member
// added to it is a member every hand-built `Shell` would have to grow.
const chainCounts = new WeakMap<Shell, ChainCount>();

export const rememberChainCount = (shell: Shell, count: ChainCount): void => {
  chainCounts.set(shell, count);
};

export const chainsInFlight = (shell: Shell): number => chainCounts.get(shell)?.inFlight() ?? 0;
