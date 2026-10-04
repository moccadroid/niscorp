import type { ActionDefinition } from '../action';

// ═══════════════════════════════════════════════════════════
// An example of nova — an action, what is done to it, and what
// it must then say
// ═══════════════════════════════════════════════════════════
//
// Examples are DATA, and they ship with the package. An action is the smallest
// thing nova runs, so every example is one: an example of the layout grammar is
// an action with no triggers. Whoever shows them — a documentation site, a
// coding agent reading node_modules — mounts the action in a shell of its own
// and draws it with its own components, so what is shown cannot fall behind
// what the installed version does. test/examples/examples.test.ts runs every
// one and holds it to its `expected`.
//
// THE COMPONENTS an example names are the plain ones every kit has under some
// name: `Stack`, `Text`, `Button`, `Input`. No prop on them is about looks. A
// kit draws them as it draws its own.

export type NovaExampleGroup = 'layouts' | 'actions';

// One thing a reader does to the action: a press on the component with that
// `ref`, or (`ui:model`) what is typed into it.
export type NovaExamplePress = {
  ref: string;
  type?: 'ui:click' | 'ui:model';
  payload?: unknown;
};

export type NovaExample = {
  // Stable, kebab-case, unique — the last part of an address. The action's own id.
  id: string;
  group: NovaExampleGroup;
  title: string;
  // One to three sentences, in terms of what it does. Names in code stand between backticks.
  description: string;
  action: ActionDefinition;
  // What is done to it, in order. Empty where the example is only drawn.
  presses: readonly NovaExamplePress[];
  // What must come out: the action's data afterwards, and every piece of text
  // the screen then holds, in reading order.
  expected: { data: Record<string, unknown>; says: readonly string[] };
};
