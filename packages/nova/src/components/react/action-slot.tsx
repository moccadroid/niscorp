import { z } from 'zod';
import { RenderTree, useRenderTree } from '@react';
import type { NovaComponent, NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// ActionSlot — structural component that renders a single action
// instance inside a canvas's actionLayout. Resolves to nothing
// when instanceId is missing (e.g. the canvas has no active).
// ═══════════════════════════════════════════════════════════

export const ActionSlotPropsSchema = z
  .object({
    instanceId: z
      .string()
      .optional()
      .describe('Id of the action instance to render. Usually bound from canvas scope, e.g. "$.active.id" or "$.i.id".'),
  })
  .strict()
  .describe('Renders an action instance by id. Resolves to nothing when instanceId is missing.');

export type ActionSlotProps = z.infer<typeof ActionSlotPropsSchema>;

export const ActionSlot: NovaComponent<ActionSlotProps> = ({
  instanceId,
}: NovaComponentProps & ActionSlotProps) => {
  const tree = useRenderTree(instanceId ?? '');
  if (instanceId === undefined || instanceId === '') return null;
  return <RenderTree nodes={tree} />;
};

ActionSlot.meta = {
  description: 'Renders an action instance by id. Used inside a canvas actionLayout.',
  propsSchema: ActionSlotPropsSchema,
};
