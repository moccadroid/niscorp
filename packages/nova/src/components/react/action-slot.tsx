import { useContext, useMemo } from 'react';
import { z } from 'zod';
import { RenderTree, useRenderTree, useShell, useSlotWrapper } from '@react';
import type { NovaComponent, NovaComponentProps, NovaRenderContextValue } from '@react';
import { NovaRenderContext } from '@react/context';

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

  // Scope dispatch to THIS instance: every UI event dispatched from within its
  // rendered subtree gets stamped with `origin: instanceId`, so the runtime
  // delivers it to this instance's own triggers only (two instances of the same
  // action on different canvases no longer both react to one click). An event
  // that already carries an origin (a re-dispatch) keeps it.
  const ctx = useContext(NovaRenderContext);
  const scoped = useMemo<NovaRenderContextValue | undefined>(() => {
    if (ctx === undefined || instanceId === undefined || instanceId === '') return ctx;
    const base = ctx.dispatch;
    return { ...ctx, dispatch: (e) => base(e.origin === undefined ? { ...e, origin: instanceId } : e) };
  }, [ctx, instanceId]);

  // No app-supplied wrapper → original behavior, plus the scoped dispatch.
  if (slotWrapper === undefined) {
    if (!hasInstance) return null;
    return (
      <NovaRenderContext.Provider value={scoped}>
        <RenderTree nodes={tree} />
      </NovaRenderContext.Provider>
    );
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
      {hasInstance && tree.length ? (
        <NovaRenderContext.Provider value={scoped}>
          <RenderTree nodes={tree} />
        </NovaRenderContext.Provider>
      ) : null}
    </Wrapper>
  );
};

ActionSlot.meta = {
  description: 'Renders an action instance by id. Used inside a canvas actionLayout.',
  propsSchema: ActionSlotPropsSchema,
};
