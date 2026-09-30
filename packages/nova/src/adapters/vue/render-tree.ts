import { defineComponent, h } from 'vue';
import { renderNodeKey, type RenderNode } from '@layout';
import { RenderNodeView } from './render-node';

export type RenderTreeProps = {
  nodes: RenderNode[];
};

// A fragment of keyed node views — list identity is core's renderNodeKey.
export const RenderTree = defineComponent(
  (props: RenderTreeProps) => () => props.nodes.map((node, i) => h(RenderNodeView, { node, key: renderNodeKey(node, i) })),
  { name: 'NovaRenderTree', props: ['nodes'] },
);
