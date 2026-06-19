import type { z } from 'zod';
import type { DataStore } from '../shared/data-store';
import type { NovaError } from '../shared/errors';
import type { LayoutNode } from './schemas';

// ═══════════════════════════════════════════════════════════
// Render output (framework-agnostic)
// ═══════════════════════════════════════════════════════════

export type ModelBindingDescriptor = {
  path: string;
  ref: string;
};

// `key` is the React-identity key, distinct from `ref` (the event-target id).
// The renderer stamps it on loop items from `LoopNode.key` (or the index), so a
// shared `ref` across looped rows no longer collides as a React key.
export type RenderComponentNode = {
  type: 'component';
  name: string;
  props: Record<string, unknown>;
  children: RenderNode[];
  ref?: string;
  key?: string;
  model?: ModelBindingDescriptor;
};

export type RenderTextNode = {
  type: 'text';
  value: string;
  key?: string;
};

export type RenderFragmentNode = {
  type: 'fragment';
  children: RenderNode[];
  key?: string;
};

export type RenderErrorNode = {
  type: 'error';
  code: string;
  message: string;
  nodeRef?: string;
  key?: string;
};

export type RenderNode =
  | RenderComponentNode
  | RenderTextNode
  | RenderFragmentNode
  | RenderErrorNode;

// ═══════════════════════════════════════════════════════════
// Component registry
// ═══════════════════════════════════════════════════════════

export type EventMeta = {
  description?: string;
  payloadType?: string;
};

export type ComponentMeta = {
  description?: string;
  propsSchema?: z.ZodTypeAny;
  events?: Record<string, EventMeta>;
};

export type ComponentEntry<TComponent = unknown> = {
  component: TComponent;
  meta: ComponentMeta;
};

// A registration input is either a bare component or a
// `{ component, meta }` pair. Components may also carry a static
// `.meta` property, which `registerAll` picks up automatically;
// explicit meta on the entry always wins.
export type RegistrationInput<TComponent = unknown> =
  | TComponent
  | { component: TComponent; meta?: ComponentMeta };

export interface ComponentRegistry<TComponent = unknown> {
  register(name: string, component: TComponent, meta?: ComponentMeta): void;
  registerAll(entries: Record<string, RegistrationInput<TComponent>>): void;
  get(name: string): ComponentEntry<TComponent> | undefined;
  list(): string[];
  has(name: string): boolean;
}

// ═══════════════════════════════════════════════════════════
// Layout store
// ═══════════════════════════════════════════════════════════

export type LayoutStore = {
  get: (id: string) => LayoutNode | undefined;
  set: (id: string, layout: LayoutNode) => void;
  delete: (id: string) => void;
  list: () => string[];
  resolveReferences: (layout: LayoutNode) => LayoutNode;
};

// ═══════════════════════════════════════════════════════════
// Renderer context
// ═══════════════════════════════════════════════════════════

// A render context accepts either a raw data object (legacy/tests) or
// a data store view — the renderer reads the current snapshot on each call.
export type DataStoreView = Pick<DataStore, 'get'>;

export type RenderOnError = (error: NovaError) => void;

export type RenderContext = {
  store: LayoutStore;
  registry: ComponentRegistry;
  dataStore?: DataStoreView;
  strict?: boolean;
  onError?: RenderOnError;
};
