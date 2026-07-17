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
  SlotNodeSchema,
} from './schemas';

export type {
  LayoutNode,
  LayoutPrimitive,
  ComponentNode,
  ConditionalNode,
  LoopNode,
  LayoutRefNode,
  SlotNode,
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
  isSlotNode,
  isLayoutNode,
  isLayoutPrimitive,
} from './guards';

// Renderer
export { renderLayout, renderLayoutFromStore, render } from './renderer';
export type { RenderOptions } from './renderer';

// Compose (fragment slot-fill)
export { fillSlots } from './compose';

// Adapter helpers (see ADAPTER.md)
export { renderNodeKey, NOVA_MODEL_PROP, NOVA_REF_PROP } from './adapter';

// Store
export { createLayoutStore } from './store';

// Registry
export { createComponentRegistry } from './registry';
