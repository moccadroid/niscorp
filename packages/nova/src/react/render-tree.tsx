import { Fragment, type FC } from 'react';
import type { RenderNode } from '@layout';
import { RenderNodeView } from './render-node';

const nodeKey = (node: RenderNode, index: number): string => {
  // Loop identity (stamped from LoopNode.key/index) wins over ref: a shared
  // `ref` across looped rows is an event-target id, not a React key.
  if (node.key !== undefined) return `k:${node.key}`;
  if (node.type === 'component') {
    if (node.ref !== undefined) return `c:${node.ref}`;
    return `c:${node.name}:${index}`;
  }
  if (node.type === 'text') return `t:${index}`;
  if (node.type === 'fragment') return `f:${index}`;
  return `e:${node.code}:${index}`;
};

export type RenderTreeProps = {
  nodes: RenderNode[];
};

export const RenderTree: FC<RenderTreeProps> = ({ nodes }) => (
  <Fragment>
    {nodes.map((node, i) => (
      <RenderNodeView key={nodeKey(node, i)} node={node} />
    ))}
  </Fragment>
);
