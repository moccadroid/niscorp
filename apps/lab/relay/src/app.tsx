import { useEffect } from 'react';
import { NovaShell } from '@niscorp/nova/react';
import { shell } from './nova/shell';
import { relaySlotWrapper } from './ui';
import { installRouter } from './ui/router';

// Relay is a Nova shell. Everything visible — sidebar, topbar, every screen —
// is an action on a canvas, composed from primitives. React only mounts it.
// `relaySlotWrapper` adds the panel/screen transitions at the ActionSlot seam;
// `installRouter` is a thin edge adapter that mirrors the shell's nav into the
// address bar (and back), in memory — Nova stays URL-agnostic.
const Relay = () => {
  useEffect(() => installRouter(shell), []);
  return <NovaShell shell={shell} slotWrapper={relaySlotWrapper} />;
};

export default Relay;
