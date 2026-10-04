import type { ActionDefinition, ActionFragment } from '../action';
import type { LayoutNode } from '../layout';
import type { CanvasConfig } from '../shell';

// ═══════════════════════════════════════════════════════════
// An example of nova — a small app, what is done to it, and what
// it must then say
// ═══════════════════════════════════════════════════════════
//
// Examples are DATA, and they ship with the package. Whoever shows them — a
// documentation site, a coding agent reading node_modules — mounts the example
// in a shell of its own and draws it with its own components, so what is shown
// cannot fall behind what the installed version does.
// test/examples/examples.test.ts runs every one and holds it to its `expected`.
//
// AN EXAMPLE IS ONE ACTION (`action`: mounted alone on one canvas; an example of
// the layout grammar is an action with no triggers) OR A SMALL SHELL (`shell`:
// several actions on several canvases). Beside either, what it needs from its
// host: fragments, stored layouts, and what its endpoints are answered.
//
// EVERY ID IS THE EXAMPLE'S OWN. In a `shell` example each action, canvas and
// fragment id starts with the example's id and a dot, and so does every stored
// layout, every `fn:` name and every URL (`/examples/<id>/…`) of any example.
// A host can therefore hold all the examples in one shell.
//
// THE COMPONENTS an example names are the plain ones every kit has under some
// name — `Stack`, `Text`, `Button`, `Input` — and nova's own two slots. No prop
// on them is about looks. A kit draws them as it draws its own.

export type NovaExampleGroup = 'layouts' | 'actions' | 'endpoints' | 'composition' | 'shells';

// One thing a reader does: a press on the component with that `ref`, or
// (`ui:model`) what is typed into it. In a shell, `canvas` says on which canvas;
// the press goes to the action on top of it. Without it, the first canvas.
export type NovaExamplePress = {
  ref: string;
  type?: 'ui:click' | 'ui:model';
  payload?: unknown;
  canvas?: string;
};

// A small shell, as data: what `createShell` is given.
export type NovaExampleShell = {
  canvases: readonly CanvasConfig[];
  actions: Readonly<Record<string, ActionDefinition>>;
  // How the canvases are arranged. Without it they stand one after another.
  canvasLayout?: LayoutNode;
};

export type NovaExample = {
  // Stable, kebab-case, unique — the last part of an address. In an `action`
  // example it is the action's own id.
  id: string;
  group: NovaExampleGroup;
  title: string;
  // One to three sentences, in terms of what it does. Names in code stand between backticks.
  description: string;
  action?: ActionDefinition;
  shell?: NovaExampleShell;
  // Partial actions a `with: [...]` names.
  fragments?: Readonly<Record<string, ActionFragment>>;
  // Layouts a `{ ref }` names.
  layouts?: Readonly<Record<string, LayoutNode>>;
  // What each `fn:` endpoint is answered, by its name.
  replies?: Readonly<Record<string, unknown>>;
  // What each URL is answered, by its method and address: `'GET /examples/<id>/…'`.
  fetches?: Readonly<Record<string, { status: number; body: unknown }>>;
  // What is done to it, in order. Empty where the example is only drawn.
  presses: readonly NovaExamplePress[];
  // What must come out: every piece of text the screen then holds, in reading
  // order; the data of the one action (an `action` example); and which actions
  // stand on each canvas, bottom to top (a `shell` example).
  expected: { says: readonly string[]; data?: Record<string, unknown>; stacks?: Record<string, readonly string[]> };
};
