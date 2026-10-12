import { Fragment, createElement, useContext, type FC, type ReactElement } from 'react';
import { NOVA_MODEL_PROP, NOVA_REF_PROP, renderNodeKey, type RenderNode } from '@layout';
import { isHeadNode } from '@shell';
import { NovaRenderContext } from './context';
import { ErrorMarker } from './error-marker';
import { HeadMark } from './head';
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

  if (isHeadNode(node)) return <HeadMark />;
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
  // A keyed array of per-child elements, not one RenderTree: a component can
  // then address its children one by one with React.Children (a Grid gives each
  // its own cell).
  const viewOf = (child: RenderNode, i: number): ReactElement => <RenderNodeView key={renderNodeKey(child, i)} node={child} />;
  if (!node.children.some(isHeadNode)) {
    return createElement(Component, props, node.children.length === 0 ? undefined : node.children.map(viewOf));
  }
  // A head among them is not handed to the component: a kit that gives every
  // child a cell would give it an empty one.
  const views = node.children.map((child, i) => ({ head: isHeadNode(child), view: viewOf(child, i) }));
  const shown = views.filter((child) => !child.head).map((child) => child.view);
  return (
    <Fragment>
      {createElement(Component, props, shown.length === 0 ? undefined : shown)}
      {views.filter((child) => child.head).map((child) => child.view)}
    </Fragment>
  );
};
