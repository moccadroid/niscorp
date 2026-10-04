// ═══════════════════════════════════════════════════════════
// @niscorp/prism/examples — every operator, with its answer
// ═══════════════════════════════════════════════════════════

import type { PrismExample } from './example.types';
import { COMPOSITION } from './composition';
import { OPERATORS } from './operators';
import { REAL_WORLD } from './real-world';
import { SUGAR } from './sugar';

export type { PrismExample, PrismExampleGroup } from './example.types';
export { PRISM_EXAMPLE_GROUPS } from './groups';
export type { PrismExampleGroupInfo } from './groups';

// Every example: each operator alone, the shorthands, operators working
// together, then whole configs. PRISM_EXAMPLE_GROUPS says which groups they
// come in, and in what order those are read.
export const PRISM_EXAMPLES: readonly PrismExample[] = [
  ...OPERATORS,
  ...SUGAR,
  ...COMPOSITION,
  ...REAL_WORLD,
];
