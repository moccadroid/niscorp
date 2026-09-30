// NAMES TO CHOOSE FROM AT THE DOOR — an adjective and an animal, 50 × 50 =
// 2,500 of them. Plainly nobody's real name, and nothing in either list can
// make one that embarrasses its wearer, so a name picked from here needs no
// moderation. Each is taken once (members.name is unique); the door offers
// ones nobody has.

export const ADJECTIVES: readonly string[] = [
  'Quiet', 'Brave', 'Lucky', 'Swift', 'Gentle', 'Clever', 'Curious', 'Patient', 'Bright', 'Calm',
  'Bold', 'Merry', 'Nimble', 'Steady', 'Sunny', 'Witty', 'Honest', 'Humble', 'Jolly', 'Keen',
  'Lively', 'Loyal', 'Mellow', 'Modest', 'Noble', 'Plucky', 'Polite', 'Proud', 'Quick', 'Rapid',
  'Sharp', 'Shy', 'Silent', 'Sleepy', 'Smart', 'Snappy', 'Spry', 'Sturdy', 'Tidy', 'Tiny',
  'Upbeat', 'Vivid', 'Warm', 'Wise', 'Zesty', 'Cosy', 'Daring', 'Eager', 'Fancy', 'Hardy',
];

export const ANIMALS: readonly string[] = [
  'Otter', 'Heron', 'Badger', 'Lynx', 'Fox', 'Owl', 'Hare', 'Wren', 'Seal', 'Moose',
  'Beaver', 'Bison', 'Crane', 'Dolphin', 'Eagle', 'Falcon', 'Gecko', 'Hedgehog', 'Ibis', 'Jaguar',
  'Koala', 'Lemur', 'Magpie', 'Newt', 'Ocelot', 'Panda', 'Puffin', 'Quail', 'Raven', 'Robin',
  'Salmon', 'Sparrow', 'Squirrel', 'Stork', 'Swan', 'Tapir', 'Tiger', 'Toucan', 'Turtle', 'Walrus',
  'Weasel', 'Whale', 'Wombat', 'Yak', 'Zebra', 'Alpaca', 'Bee', 'Crab', 'Deer', 'Finch',
];

export const ALL_NAMES: readonly string[] = ADJECTIVES.flatMap((adjective) => ANIMALS.map((animal) => `${adjective} ${animal}`));

// `count` names nobody has, in random order.
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
