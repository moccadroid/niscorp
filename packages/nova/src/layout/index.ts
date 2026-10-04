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

// The head: the document's <head> as a node, and the elements it holds — none
// of them drawn on the screen
export { HEAD_NAME, HEAD_TITLE_NAME, HEAD_META_NAME, HEAD_LINK_NAME, HEAD_SCRIPT_NAME, HEAD_NAMES, headKeyOf } from './head';
export type { HeadElement } from './head';
export { HEAD_META, HeadPropsSchema, HeadTitlePropsSchema, HeadMetaPropsSchema, HeadLinkPropsSchema, HeadScriptPropsSchema } from './head.schema';
export type { HeadMetaProps, HeadLinkProps, HeadScriptProps } from './head.schema';
