import type { z } from 'zod';
import type { DataStore } from '../shared/data-store';
import type { NovaError } from '../shared/errors';
import type { PhraseKeys, Phrasebook } from '../i18n/phrases';
import type { LayoutNode } from './schemas';

export type ModelBindingDescriptor = {
  path: string;
  ref: string;
};

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

export type LayoutStore = {
  get: (id: string) => LayoutNode | undefined;
  set: (id: string, layout: LayoutNode) => void;
  delete: (id: string) => void;
  list: () => string[];
  resolveReferences: (layout: LayoutNode) => LayoutNode;
};

export type DataStoreView = Pick<DataStore, 'get'>;

export type RenderOnError = (error: NovaError) => void;

export type RenderContext = {
  store: LayoutStore;
  registry: ComponentRegistry;
  dataStore?: DataStoreView;
  strict?: boolean;
  onError?: RenderOnError;
  phrases?: Phrasebook;
  phraseKeys?: PhraseKeys;
  onPhraseMiss?: (phrase: string, where: string) => void;
};
