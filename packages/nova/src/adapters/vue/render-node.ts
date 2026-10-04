import { Fragment, createTextVNode, defineComponent, h, inject, type VNode } from 'vue';
import { NOVA_MODEL_PROP, NOVA_REF_PROP, renderNodeKey, type RenderNode } from '@layout';
import { isHeadNode } from '@shell';
import { NovaRenderKey, type NovaRenderContextValue } from './context';
import { ErrorMarker } from './error-marker';
import { HeadMark } from './head';
import { RenderTree } from './render-tree';
import { isNovaComponent } from './types';

export type RenderNodeViewProps = {
  node: RenderNode;
};

// A node's children as the component's default slot: one keyed RenderNodeView
// per child (not one RenderTree wrapper), so a component can address them
// individually — a Grid wraps each in a weighted cell.
const childViews = (children: RenderNode[]): VNode[] =>
  children.map((child, i) => h(RenderNodeView, { node: child, key: renderNodeKey(child, i) }));

const renderNode = (ctx: NovaRenderContextValue, node: RenderNode): VNode => {
  if (node.type === 'text') return createTextVNode(node.value);
  if (node.type === 'fragment') return h(RenderTree, { nodes: node.children });
  if (node.type === 'error') return h(ErrorMarker, { code: node.code, message: node.message });

  // a head is something the screen says, not something it shows
  if (isHeadNode(node)) return h(HeadMark);

  // node.type === 'component' — an unknown name never throws
  const registered = ctx.registry.get(node.name)?.component;
  const component = isNovaComponent(registered) ? registered : ctx.fallback;
  if (component === undefined) return h(ErrorMarker, { code: 'COMPONENT_NOT_FOUND', message: node.name });
  const props: Record<string, unknown> = { ...node.props };
  if (node.model !== undefined) props[NOVA_MODEL_PROP] = { ref: node.model.ref, path: node.model.path };
  if (node.ref !== undefined) props[NOVA_REF_PROP] = node.ref;
  const { children } = node;
  if (children.length === 0) return h(component, props);
  if (!children.some(isHeadNode)) return h(component, props, { default: () => childViews(children) });
  // A head among them is not handed to the component — a kit that gives every
  // child a cell would give it an empty one. It stands beside the component.
  const shown = children.filter((child) => !isHeadNode(child));
  return h(Fragment, [
    shown.length === 0 ? h(component, props) : h(component, props, { default: () => childViews(shown) }),
    ...children.filter(isHeadNode).map((_head, i) => h(HeadMark, { key: `head:${i}` })),
  ]);
};

export const RenderNodeView = defineComponent(
  (props: RenderNodeViewProps) => {
    const ctx = inject(NovaRenderKey, undefined);
    if (ctx === undefined) throw new Error('RenderNodeView must be used inside <NovaRenderProvider>');
    return () => renderNode(ctx, props.node);
  },
  { name: 'NovaRenderNode', props: ['node'] },
);
