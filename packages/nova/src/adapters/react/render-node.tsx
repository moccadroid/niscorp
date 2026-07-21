import { Fragment, createElement, useContext, type FC } from 'react';
import { NOVA_MODEL_PROP, NOVA_REF_PROP, renderNodeKey, type RenderNode } from '@layout';
import { NovaRenderContext } from './context';
import { ErrorMarker } from './error-marker';
import { RenderTree } from './render-tree';

export type RenderNodeViewProps = {
  node: RenderNode;
};

export const RenderNodeView: FC<RenderNodeViewProps> = ({ node }) => {
  const ctx = useContext(NovaRenderContext);
  if (ctx === undefined) {
    throw new Error('RenderNodeView must be used inside <NovaRenderProvider>');
  }

  if (node.type === 'text') {
    // a non-DOM host (ink) must wrap every string — bare text crashes it
    const TextWrap = ctx.textWrapper;
    return TextWrap === undefined ? <Fragment>{node.value}</Fragment> : <TextWrap>{node.value}</TextWrap>;
  }
  if (node.type === 'fragment') {
    return <RenderTree nodes={node.children} />;
  }
  if (node.type === 'error') {
    const Marker = ctx.errorMarker ?? ErrorMarker;
    return <Marker code={node.code} message={node.message} />;
  }

  // node.type === 'component'
  const entry = ctx.registry.get(node.name);
  const Component = entry !== undefined ? entry.component : ctx.fallback;
  if (Component === undefined) {
    return <ErrorMarker code="COMPONENT_NOT_FOUND" message={node.name} />;
  }
  const props: Record<string, unknown> = { ...node.props };
  if (node.model !== undefined) {
    props[NOVA_MODEL_PROP] = { ref: node.model.ref, path: node.model.path };
  }
  if (node.ref !== undefined) {
    props[NOVA_REF_PROP] = node.ref;
  }
  // Children go in as a keyed ARRAY of per-child elements (not one RenderTree
  // wrapper) so a component can address them individually with React.Children —
  // a Grid wraps each in a weighted flex cell. React flattens the array the
  // same way it would the fragment; keys follow core's renderNodeKey.
  return createElement(
    Component,
    props,
    node.children.length === 0
      ? undefined
      : node.children.map((child, i) => <RenderNodeView key={renderNodeKey(child, i)} node={child} />),
  );
};
