import { CanvasSlotPropsSchema, type CanvasSlotProps } from '../../primitive-props';
import { RenderTree, useCanvasRenderTree } from '@react';
import type { NovaComponent, NovaComponentProps } from '@react';

export { CanvasSlotPropsSchema, type CanvasSlotProps };

export const CanvasSlot: NovaComponent<CanvasSlotProps> = ({
  canvasId,
}: NovaComponentProps & CanvasSlotProps) => {
  const tree = useCanvasRenderTree(canvasId);
  if (canvasId === undefined || canvasId === '') return null;
  return <RenderTree nodes={tree} />;
};

CanvasSlot.meta = {
  description: 'Renders a canvas by id, recursing into its actionLayout.',
  propsSchema: CanvasSlotPropsSchema,
};
