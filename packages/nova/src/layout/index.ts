// ═══════════════════════════════════════════════════════════
// @niscorp/nova — Layout System
// ═══════════════════════════════════════════════════════════

// Schemas
export {
  LayoutNodeSchema,
  LayoutPrimitiveSchema,
  ComponentNodeSchema,
  ConditionalNodeSchema,
  LoopNodeSchema,
  LayoutRefNodeSchema,
} from './schemas';

export type {
  LayoutNode,
  LayoutPrimitive,
  ComponentNode,
  ConditionalNode,
  LoopNode,
  LayoutRefNode,
} from './schemas';

// Types
export type {
  RenderNode,
  RenderComponentNode,
  RenderTextNode,
  RenderFragmentNode,
  RenderErrorNode,
  ModelBindingDescriptor,
  RenderOnError,
  ComponentRegistry,
  ComponentEntry,
  ComponentMeta,
  RegistrationInput,
  EventMeta,
  LayoutStore,
  RenderContext,
  DataStoreView,
} from './types';

// Guards
export {
  isComponentNode,
  isConditionalNode,
  isLoopNode,
  isLayoutRefNode,
  isLayoutNode,
  isLayoutPrimitive,
} from './guards';

// Renderer
export { renderLayout, renderLayoutFromStore, render } from './renderer';
export type { RenderOptions } from './renderer';

// Store
export { createLayoutStore } from './store';

// Registry
export { createComponentRegistry } from './registry';
