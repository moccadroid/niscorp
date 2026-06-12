import type { ZodType } from 'zod';
import type { ComponentRegistry, LayoutNode, Shell } from '@niscorp/nova';
import type { FieldContext } from '@compile/types';

// A document is either a Zod schema (the editor compiles it into a form) or a
// layout the plugin builds from the document's value. The latter is for freeform
// documents that have no schema — the nova plugin's `data` (the key→value map its
// layout binds to): the plugin returns a Nova layout with one control per key,
// each bound to `$.<key>`. Either way the editor seeds the value and tracks it.
export type DocumentLayout = (value: unknown) => LayoutNode;
export type Document = ZodType | DocumentLayout;

// A plugin: the core descriptor. Its `documents` become form canvases (when its
// artifact is opened); its widget matchers drive the compiler. `mount` hands it
// the editor — and through it the live shell — so it can contribute canvases,
// register actions, set the canvasLayout, load other plugins, or listen. The
// render components (preview, widgets, views) live in the renderer's registry,
// keyed by role; they are not part of the core descriptor.
export type LoomPlugin = {
  name: string;
  documents: Record<string, Document>;
  widgets?: WidgetBinding[];
  mount?: (editor: LoomEditor) => void;
};

export type WidgetBinding = { role: string; match: (field: FieldContext) => boolean };

// What to edit: a plugin by name, optionally with existing document values.
export type LoomArtifact = { type: string; documents?: Record<string, unknown> };

export type LoomEvent = 'change' | 'open';

export type LoomEditor = {
  /** The live Nova shell. Built empty at creation; plugins mount onto it. */
  readonly shell: Shell;
  /** Register a plugin (a capability). Calls its `mount` against the live shell. */
  loadPlugin: (plugin: LoomPlugin) => void;
  /** Open an artifact — compiles its plugin's documents into form canvases. */
  open: (artifact: LoomArtifact) => void;
  /** The plugin whose artifact is currently open. */
  readonly plugin: LoomPlugin | undefined;
  /** The live document values, keyed by document name. */
  readonly documents: Record<string, unknown>;
  /** Validation problems per document: `{ [document]: errorTree }`. */
  readonly validations: Record<string, unknown>;
  on: (event: LoomEvent, handler: () => void) => () => void;
  dispose: () => void;
};

export type LoomEditorConfig = {
  /** The component registry (the renderer's kit). The shell renders through it. */
  registry: ComponentRegistry;
};
