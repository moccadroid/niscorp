import { ACTION_EXAMPLES } from './actions';
import { LAYOUT_EXAMPLES } from './layouts';
import type { NovaExample } from './example.types';

// Every example of nova, in reading order: the layout grammar, then actions at
// work. See example.types.ts for what one is and who reads them.
export const NOVA_EXAMPLES: readonly NovaExample[] = [...LAYOUT_EXAMPLES, ...ACTION_EXAMPLES];

export { NOVA_EXAMPLE_GROUPS } from './groups';
export type { NovaExampleGroupInfo } from './groups';
export type { NovaExample, NovaExampleGroup, NovaExamplePress } from './example.types';
