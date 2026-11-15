import { useContext, useMemo } from 'react';
import { CanvasSlotPropsSchema, type CanvasSlotProps } from '../../primitive-props';
import { RenderNodeView, RenderTree, useCanvasRenderTree } from '@react';
import type { NovaComponent, NovaComponentProps } from '@react';
import { NovaOpenCanvasesContext } from '../context';

export { CanvasSlotPropsSchema, type CanvasSlotProps };

export const CanvasSlot: NovaComponent<CanvasSlotProps> = ({
  canvasId,
}: NovaComponentProps & CanvasSlotProps) => {
  const tree = useCanvasRenderTree(canvasId);
  const open = useContext(NovaOpenCanvasesContext);
  const inside = useMemo(() => new Set([...open, canvasId ?? '']), [open, canvasId]);
  if (canvasId === undefined || canvasId === '') return null;
  if (open.has(canvasId)) return <RenderNodeView node={{ type: 'error', code: 'RENDER_ERROR', message: `canvas "${canvasId}" is placed inside itself` }} />;
  return (
    <NovaOpenCanvasesContext.Provider value={inside}>
      <RenderTree nodes={tree} />
    </NovaOpenCanvasesContext.Provider>
  );
};

CanvasSlot.meta = {
  description: 'Renders a canvas by id, recursing into its actionLayout.',
  propsSchema: CanvasSlotPropsSchema,
};
