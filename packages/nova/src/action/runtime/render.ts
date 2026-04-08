import { renderLayoutFromStore } from '@layout/renderer';
import type { LayoutNode } from '@layout/schemas';
import type {
  ComponentRegistry,
  DataStoreView,
  LayoutStore,
  RenderNode,
  RenderOnError,
} from '@layout/types';
import { isArray, isObject } from '@shared/common';
import type { ActionDefinition } from '../schemas';

export type RenderRuntimeContext = {
  store: LayoutStore;
  registry: ComponentRegistry;
  strict?: boolean;
  onError?: RenderOnError;
};

const isLayoutNode = (value: unknown): value is LayoutNode => {
  if (value === null) return true;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  if (isArray(value)) return true;
  if (isObject(value)) return true;
  return false;
};

export const renderRuntime = (
  definition: ActionDefinition,
  dataStore: DataStoreView,
  ctx: RenderRuntimeContext,
): RenderNode[] => {
  const layout = definition.layout;
  if (layout === undefined) return [];
  if (typeof layout === 'string') {
    const target = ctx.store.get(layout);
    if (target === undefined) return [];
    return renderLayoutFromStore(target, dataStore, ctx);
  }
  if (!isLayoutNode(layout)) return [];
  return renderLayoutFromStore(layout, dataStore, ctx);
};
