import type { TerminalSlotWrapper } from '@niscorp/moss/terminal/react';

// The terminal wraps every action instance in this, keyed by instanceId, so a
// replaced instance remounts and the entrance animation plays again.
export const atriumSlotWrapper: TerminalSlotWrapper = ({ children }) => <div className="at-slot at-appear">{children}</div>;
