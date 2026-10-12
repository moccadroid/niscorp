import type { ActionDefinition, ActionFragment } from '../action';
import type { PhraseKeys, Phrasebook } from '../i18n';
import type { LayoutNode } from '../layout';
import type { CanvasConfig } from '../shell';

export type NovaExampleGroup = 'layouts' | 'actions' | 'endpoints' | 'composition' | 'shells' | 'i18n';

export type NovaExamplePress = { ref: string; type?: 'ui:click' | 'ui:model'; payload?: unknown; canvas?: string } | { phrases: Phrasebook | null };

export type NovaExampleShell = {
  canvases: readonly CanvasConfig[];
  actions: Readonly<Record<string, ActionDefinition>>;
  canvasLayout?: LayoutNode;
};

export type NovaExample = {
  id: string;
  group: NovaExampleGroup;
  title: string;
  description: string;
  action?: ActionDefinition;
  shell?: NovaExampleShell;
  fragments?: Readonly<Record<string, ActionFragment>>;
  layouts?: Readonly<Record<string, LayoutNode>>;
  replies?: Readonly<Record<string, unknown>>;
  // Keyed by method and address: `'GET /examples/<id>/…'`.
  fetches?: Readonly<Record<string, { status: number; body: unknown }>>;
  phrases?: Phrasebook;
  phraseKeys?: PhraseKeys;
  stage?: false;
  presses: readonly NovaExamplePress[];
  // `says`: every text the screen then holds, in reading order, with what stands
  // in props at a prose key. `stacks`: the actions on each canvas, bottom to top.
  expected: {
    says: readonly string[];
    data?: Record<string, unknown>;
    stacks?: Record<string, readonly string[]>;
    asked?: readonly { method: string; url: string; headers?: Record<string, string>; body?: unknown }[];
  };
};
