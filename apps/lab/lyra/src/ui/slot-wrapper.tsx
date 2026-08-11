import type { TerminalSlotWrapper } from '@niscorp/moss/terminal/react';

// HOW AN ACTION ENTERS THE SCREEN — decided here, and nowhere else.
//
// moss's ActionSlot seam wraps every action instance, keyed by instanceId, so
// an instance being replaced remounts and the entrance plays again. That key is
// why the decision belongs here rather than in a layout: the same surface is a
// row in a list, a record beside a queue and a sheet over a phone, and it is
// the PLACEMENT that differs, not the content. An action that specified its own
// animation would be an action reaching outside itself.
export const lyraSlotWrapper: TerminalSlotWrapper = ({ children }) => <div className="ly-slot">{children}</div>;
