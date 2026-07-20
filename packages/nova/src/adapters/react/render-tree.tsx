import { Fragment, type FC } from 'react';
import { renderNodeKey, type RenderNode } from '@layout';
import { RenderNodeView } from './render-node';

export type RenderTreeProps = {
  nodes: RenderNode[];
};

export const RenderTree: FC<RenderTreeProps> = ({ nodes }) => (
  <Fragment>
    {nodes.map((node, i) => (
      <RenderNodeView key={renderNodeKey(node, i)} node={node} />
    ))}
  </Fragment>
);
