import type { ActionDefinition, ActionFragment } from '../action';
import type { PhraseKeys, Phrasebook } from '../i18n';
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
// host: fragments, stored layouts, a phrase book, and what its endpoints are
// answered.
//
// EVERY ID IS THE EXAMPLE'S OWN. In a `shell` example each action, canvas and
// fragment id starts with the example's id and a dot, and so does every stored
// layout, every `fn:` name and every URL (`/examples/<id>/…`) of any example.
// A host can therefore hold all the examples in one shell.
//
// THE COMPONENTS an example names are the plain ones every kit has under some
// name — `Stack`, `Text`, `Button`, `Input` — and nova's own two slots. No prop
// on them is about looks, and what they show is their children (an `Input`,
// its `placeholder`). A kit draws them as it draws its own. An example that
// cannot simply be mounted beside a host's own screens says `stage: false`: its
// point is in props a plain kit does not draw, or it needs the whole shell to
// wear its book. A host then shows what it comes to as text, and such an
// example may name any component.

export type NovaExampleGroup = 'layouts' | 'actions' | 'endpoints' | 'composition' | 'shells' | 'i18n';

// One thing that is done. A press on the component with that `ref`, or
// (`ui:model`) what is typed into it; in a shell, `canvas` says on which canvas
// (the press goes to the action on top of it; without it, the first canvas).
// Or the host changes the language: it gives the shell a book, or (`null`)
// takes the book away.
export type NovaExamplePress = { ref: string; type?: 'ui:click' | 'ui:model'; payload?: unknown; canvas?: string } | { phrases: Phrasebook | null };

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
  // The book the shell starts with, and which keys carry prose.
  phrases?: Phrasebook;
  phraseKeys?: PhraseKeys;
  // False where it cannot simply be mounted beside a host's own screens (see above).
  stage?: false;
  // What is done to it, in order. Empty where the example is only drawn.
  presses: readonly NovaExamplePress[];
  // What must come out. `says`: every piece of text the screen then holds, in
  // reading order — its text, and what stands in its props at a prose key (a
  // placeholder, a label). `data`: what the one action holds (an `action`
  // example). `stacks`: which actions stand on each canvas, bottom to top (a
  // `shell` example). `asked`: what was sent to each URL it called.
  expected: {
    says: readonly string[];
    data?: Record<string, unknown>;
    stacks?: Record<string, readonly string[]>;
    asked?: readonly { method: string; url: string; headers?: Record<string, string>; body?: unknown }[];
  };
};
