import type { Shell } from './types';

// ═══════════════════════════════════════════════════════════
// CHAINS IN FLIGHT — the work a shell has started and nobody awaits.
//
// A trigger's steps run detached: the event that fired them has returned by the
// time the first `call` answers. So does an `emit`'s deferred publish, and so do
// the hooks a navigation starts on the instances it covers, reveals or removes.
// An instance's `status` says only whether its FIRST mount is done, so none of
// this was visible to anything outside — a check that pressed a button had no
// way to learn that the answer was in, and slept.
//
// Each of those is counted here from the moment it starts until it ends,
// however it ends. One hands off to the next before it ends itself (a publish
// fires its listeners' triggers synchronously; a step that navigates leaves an
// instance `initializing`), so the count and the mounts together never read
// "nothing" in the middle of a chain.
//
// NOT counted: an endpoint the shell is following (`onChange`). A followed read
// stays open for as long as its action lives, and its next body arrives when
// somebody else writes — that is not work this shell started.
// ═══════════════════════════════════════════════════════════

export type ChainCount = {
  // Count `chain` until it settles.
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
// added to it is a member every hand-built `Shell` would have to grow. One
// that was not made by `createShell` has no count, and reads as no chains.
const chainCounts = new WeakMap<Shell, ChainCount>();

export const rememberChainCount = (shell: Shell, count: ChainCount): void => {
  chainCounts.set(shell, count);
};

export const chainsInFlight = (shell: Shell): number => chainCounts.get(shell)?.inFlight() ?? 0;
