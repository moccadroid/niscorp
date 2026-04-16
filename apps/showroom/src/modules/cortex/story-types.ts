import type { Story as BaseStory } from '@showroom/modules/types';

// Cortex adds no extras beyond the chrome Story base. Each demo
// module exports whatever its kind-level orchestrator (in
// cortex/atoms/) needs (agent, tools, prompt, rules, …) and
// those ride along on the story via the `...demo` spread.

export type CortexKind = 'standalone' | 'tool-use' | 'plan-mode' | 'rules' | 'confirmation';

export type CortexStory = BaseStory & { kind: CortexKind };
