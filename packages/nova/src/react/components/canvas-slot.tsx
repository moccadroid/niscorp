import { z } from 'zod';
import { RenderTree, useCanvasRenderTree } from '@react';
import type { NovaComponent, NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// CanvasSlot — structural component that renders a canvas's
// actionLayout inside a shell's canvasLayout. Used as a leaf in
// the shell-tier layout tree.
// ═══════════════════════════════════════════════════════════

export const CanvasSlotPropsSchema = z
  .object({
    canvasId: z
      .string()
      .optional()
      .describe('Id of the canvas to render. Usually bound from a loop, e.g. "$.c.id".'),
  })
  .strict()
  .describe('Renders a canvas by id, recursing into its actionLayout. Resolves to nothing when canvasId is missing.');

export type CanvasSlotProps = z.infer<typeof CanvasSlotPropsSchema>;

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
