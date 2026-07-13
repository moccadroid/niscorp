import { useMemo } from 'react';
import { renderLayout } from '@niscorp/nova';
import type { ComponentRegistry, NovaEvent } from '@niscorp/nova';
import { NovaRenderProvider, RenderTree, useShell } from '@niscorp/nova/react';
import type { NovaComponent, SlotWrapper } from '@niscorp/nova/react';
import { useDevtoolsEnabled } from '../core/flag';
import { chipLayout } from '../actions/chip.layout';
import { DEVTOOLS_CANVAS } from '../core/log';

// The chip anchor — the one per-framework piece of the per-instance debug
// chip. A zero-height positioned anchor (no layout footprint) rendering the
// portable `chipLayout` through Nova's own renderer; the only React here is
// the anchor div and a dispatch that routes the chip's ui:click to an
// inspector push. Everything visual is the layout + the registry's Button.
const Chip = ({ instanceId, canvasId, definitionId }: { instanceId: string; canvasId?: string; definitionId: string }) => {
  const shell = useShell();
  // The shell's registry is component-type-erased; the React adapter's
  // providers want it re-narrowed (same cast Nova.Shell performs internally).
  const registry = shell.registry as ComponentRegistry<NovaComponent>;
  const nodes = useMemo(
    () => renderLayout(chipLayout, { id: definitionId }, { registry: shell.registry, store: shell.layoutStore }),
    [definitionId, shell],
  );
  const dispatch = (event: NovaEvent): void => {
    if (event.type === 'ui:click' && event.ref === 'chip') {
      shell.push(DEVTOOLS_CANVAS, 'devtools.inspect', { instanceId }, ['devtools.frame']);
    }
  };
  return (
    <div className={canvasId === 'modal' ? 'nd-anchor nd-anchor--pinned' : 'nd-anchor'}>
      <NovaRenderProvider registry={registry} dispatch={dispatch}>
        <RenderTree nodes={nodes} />
      </NovaRenderProvider>
    </div>
  );
};

// Compose devtools onto an existing slotWrapper. The inner wrapper renders
// exactly as before; with the flag on, the chip anchor is prepended INSIDE it
// so it lands as the first child of whatever block the inner wrapper draws.
// Flag off (or an empty slot) is a pure passthrough.
export const withDevtools = (Inner: SlotWrapper): SlotWrapper => {
  const DevtoolsSlotWrapper: SlotWrapper = ({ canvasId, instanceId, action, children }) => {
    const enabled = useDevtoolsEnabled();
    const decorate = enabled && instanceId !== undefined && action !== undefined && canvasId !== DEVTOOLS_CANVAS;
    return (
      <Inner canvasId={canvasId} instanceId={instanceId} action={action}>
        {decorate ? (
          <>
            <Chip instanceId={instanceId} canvasId={canvasId} definitionId={action.id} />
            {children}
          </>
        ) : (
          children
        )}
      </Inner>
    );
  };
  return DevtoolsSlotWrapper;
};
