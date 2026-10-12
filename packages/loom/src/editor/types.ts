import type { ZodType } from 'zod';
import type { ComponentRegistry, LayoutNode, Shell } from '@niscorp/nova';
import type { FieldContext } from '@compile/types';

export type DocumentLayout = (value: unknown) => LayoutNode;
export type Document = ZodType | DocumentLayout;

export type LoomPlugin = {
  name: string;
  documents: Record<string, Document>;
  widgets?: WidgetBinding[];
  mount?: (editor: LoomEditor) => void;
};

export type WidgetBinding = { role: string; match: (field: FieldContext) => boolean };

export type LoomArtifact = { type: string; documents?: Record<string, unknown> };

export type LoomEvent = 'change' | 'open';

export type LoomEditor = {
  readonly shell: Shell;
  loadPlugin: (plugin: LoomPlugin) => void;
  open: (artifact: LoomArtifact) => void;
  readonly plugin: LoomPlugin | undefined;
  readonly documents: Record<string, unknown>;
  /**
   * Not the verdict on a document: written after an edit, so empty at open, and
   * a problem with no path is not in it. For the verdict, parse with the schema.
   */
  readonly validations: Record<string, unknown>;
  on: (event: LoomEvent, handler: () => void) => () => void;
  dispose: () => void;
};

export type LoomEditorConfig = {
  registry: ComponentRegistry;
};
