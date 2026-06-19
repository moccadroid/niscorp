import { z } from 'zod';
import { RenderTree, useRenderTree, useShell, useSlotWrapper } from '@react';
import type { NovaComponent, NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// ActionSlot — structural component that renders a single action
// instance inside a canvas's actionLayout. Resolves to nothing
// when instanceId is missing (e.g. the canvas has no active).
//
// This is the one seam where an instance's content mounts/unmounts,
// so it's where an app-supplied `slotWrapper` (if any) wraps the
// content — for animation, gating, logging, etc. Nova owns none of
// that; it just hands the wrapper identity and the rendered tree.
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
  const slotWrapper = useSlotWrapper();
  const shell = useShell();
  const hasInstance = instanceId !== undefined && instanceId !== '';

  // No app-supplied wrapper → original behavior, unchanged.
  if (slotWrapper === undefined) {
    if (!hasInstance) return null;
    return <RenderTree nodes={tree} />;
  }

  // With a wrapper, render it PERSISTENTLY (content or null) so a
  // presence-managing wrapper can animate an instance leaving. Identity
  // (canvasId / the ActionDefinition) resolves from the live runtime when one
  // is present; it is undefined while the slot is empty or exiting.
  const runtime = hasInstance ? shell.getRuntime(instanceId) : undefined;
  const Wrapper = slotWrapper;
  return (
    <Wrapper
      canvasId={runtime?.instance.canvasId}
      instanceId={hasInstance ? instanceId : undefined}
      action={runtime?.definition}
    >
      {hasInstance && tree.length ? <RenderTree nodes={tree} /> : null}
    </Wrapper>
  );
};

ActionSlot.meta = {
  description: 'Renders an action instance by id. Used inside a canvas actionLayout.',
  propsSchema: ActionSlotPropsSchema,
};
