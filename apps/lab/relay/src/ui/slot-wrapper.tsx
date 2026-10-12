import type { Wire } from '@niscorp/moss/client';
import type { TerminalSlotWrapper } from '@niscorp/moss/terminal/react';

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
