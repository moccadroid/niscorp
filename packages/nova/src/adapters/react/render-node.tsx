import { Fragment, createElement, useContext, type FC } from 'react';
import { NOVA_MODEL_PROP, NOVA_REF_PROP, type RenderNode } from '@layout';
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
    return <Fragment>{node.value}</Fragment>;
  }
  if (node.type === 'fragment') {
    return <RenderTree nodes={node.children} />;
  }
  if (node.type === 'error') {
    return <ErrorMarker code={node.code} message={node.message} />;
  }

  // node.type === 'component'
  const entry = ctx.registry.get(node.name);
  if (entry === undefined) {
    return <ErrorMarker code="COMPONENT_NOT_FOUND" message={node.name} />;
  }

  const Component = entry.component;
  const props: Record<string, unknown> = { ...node.props };
  if (node.model !== undefined) {
    props[NOVA_MODEL_PROP] = { ref: node.model.ref, path: node.model.path };
  }
  if (node.ref !== undefined) {
    props[NOVA_REF_PROP] = node.ref;
  }
  return createElement(
    Component,
    props,
    node.children.length === 0 ? undefined : <RenderTree nodes={node.children} />,
  );
};
