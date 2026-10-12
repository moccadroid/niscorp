import { ADJECTIVES, ANIMALS } from '@lyceum/db/names';

// A name offered from these lists is not moderated: nothing in either list may
// make one that embarrasses its wearer.
export const ALL_NAMES: readonly string[] = ADJECTIVES.flatMap((adjective) => ANIMALS.map((animal) => `${adjective} ${animal}`));

export const freshNames = (taken: ReadonlySet<string>, count: number): string[] => {
  const free = ALL_NAMES.filter((name) => !taken.has(name));
  for (let i = free.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const here = free[i];
    const there = free[j];
    if (here !== undefined && there !== undefined) {
      free[i] = there;
      free[j] = here;
    }
  }
  return free.slice(0, count);
};
