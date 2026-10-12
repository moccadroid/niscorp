import { useContext, useMemo } from 'react';
import { ActionSlotPropsSchema, type ActionSlotProps } from '../../primitive-props';
import { scopeDispatch } from '@shared/event-bus';
import { RenderTree, useRenderTree, useShell, useSlotWrapper } from '@react';
import type { NovaComponent, NovaComponentProps, NovaRenderContextValue } from '@react';
import { NovaRenderContext } from '@react/context';

export { ActionSlotPropsSchema, type ActionSlotProps };

export const ActionSlot: NovaComponent<ActionSlotProps> = ({
  instanceId,
}: NovaComponentProps & ActionSlotProps) => {
  const tree = useRenderTree(instanceId ?? '');
  const slotWrapper = useSlotWrapper();
  const shell = useShell();
  const hasInstance = instanceId !== undefined && instanceId !== '';

  const ctx = useContext(NovaRenderContext);
  const scoped = useMemo<NovaRenderContextValue | undefined>(() => {
    if (ctx === undefined || instanceId === undefined || instanceId === '') return ctx;
    return { ...ctx, dispatch: scopeDispatch(ctx.dispatch, instanceId) };
  }, [ctx, instanceId]);

  if (slotWrapper === undefined) {
    if (!hasInstance) return null;
    return (
      <NovaRenderContext.Provider value={scoped}>
        <RenderTree nodes={tree} />
      </NovaRenderContext.Provider>
    );
  }

  // The wrapper is rendered even with no content, so one that manages presence
  // can animate an instance leaving.
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
