import type { TerminalSlotWrapper } from '@niscorp/moss/terminal/react';

// HOW AN ACTION ENTERS THE SCREEN — decided here, and nowhere else.
//
// This is moss's ActionSlot seam: the terminal wraps every action instance in
// it, keyed by instanceId, so an instance being replaced REMOUNTS and the
// animation plays again. That key is the whole reason the decision belongs
// here — a layout cannot know it is being placed, and the canvas wrapper
// around it stays mounted while the action inside swaps, so neither of them
// can time an entrance.
//
// It used to be `appear: true`, a prop on Card/Box/Stack that five layouts set
// by hand. An action saying how it arrives is an action reaching outside
// itself: the same surface is a card on a home, a record beside a queue and a
// sheet over a phone, and it is the placement that differs, not the content.
// The prop is gone from the kit, so there is no way back into that.
export const atriumSlotWrapper: TerminalSlotWrapper = ({ children }) => <div className="at-slot at-appear">{children}</div>;
