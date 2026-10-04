import { ACTION_EXAMPLES } from './actions';
import { COMPOSITION_EXAMPLES } from './composition';
import { ENDPOINT_EXAMPLES } from './endpoints';
import { I18N_EXAMPLES } from './i18n';
import { LAYOUT_EXAMPLES } from './layouts';
import { SHELL_EXAMPLES } from './shells';
import { STRUCTURE_EXAMPLES } from './structure';
import type { NovaExample } from './example.types';

// Every example of nova. Whoever shows them orders them by group
// (NOVA_EXAMPLE_GROUPS), and within a group as they stand here. See
// example.types.ts for what one is and who reads them.
export const NOVA_EXAMPLES: readonly NovaExample[] = [...LAYOUT_EXAMPLES, ...ACTION_EXAMPLES, ...STRUCTURE_EXAMPLES, ...ENDPOINT_EXAMPLES, ...COMPOSITION_EXAMPLES, ...SHELL_EXAMPLES, ...I18N_EXAMPLES];

export { NOVA_EXAMPLE_GROUPS } from './groups';
export type { NovaExampleGroupInfo } from './groups';
export type { NovaExample, NovaExampleGroup, NovaExamplePress, NovaExampleShell } from './example.types';
