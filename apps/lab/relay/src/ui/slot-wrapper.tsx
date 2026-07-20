import type { Wire } from '@niscorp/moss/client';
import type { TerminalSlotWrapper } from '@niscorp/moss/terminal/react';

// Relay's slotWrapper — the per-instance boundary chrome, at the terminal's
// ActionSlot seam. Two jobs:
//   1. `.rl-fade-in` — every action instance fades in on mount (the seam is
//      instanceId-keyed, so an instance swap remounts and the animation fires).
//   2. The devtools chip — when the devtools dock is mounted (its canvas tree
//      is non-empty on the wire), every instance grows a hover ⚙ that opens
//      that instance in the dock's inspector. The wrapper closes over the
//      app-created wire — no terminal API additions, no drilling.
// Policy lives here (skip the devtools canvas, chip only when devtools is on);
// the seam itself stays dumb.
export const createSlotWrapper = (wire: Wire): TerminalSlotWrapper => {
  const inspect = (instanceId: string): void =>
    wire.dispatch('devtools', { type: 'ui:click', ref: 'inspect', payload: instanceId });

  return ({ canvasId, instanceId, definitionId, children }) => {
    const devtoolsOn = (wire.snapshot().trees.get('devtools') ?? []).length > 0;
    const chip = devtoolsOn && canvasId !== 'devtools' && instanceId !== undefined;
    return (
      <div className="rl-fade-in rl-slotwrap">
        {chip && (
          <button
            type="button"
            className="rl-devchip"
            title={`inspect ${definitionId ?? instanceId}`}
            onClick={() => inspect(instanceId)}
          >
            ⚙
          </button>
        )}
        {children}
      </div>
    );
  };
};
