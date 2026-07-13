import { useEffect } from 'react';
import { NovaShell } from '@niscorp/nova/react';
import { shell } from './nova/shell';
import { installRouter } from './ui/router';
import { devtoolsSlotWrapper, NovaDevtoolsRoot } from './nova-devtools';

// Relay is a Nova shell. Everything visible — sidebar, topbar, every screen —
// is an action on a canvas, composed from primitives. React only mounts it.
// `devtoolsSlotWrapper` is `relaySlotWrapper` (the panel/screen transitions at
// the ActionSlot seam) with the flag-gated debug chip composed in;
// `NovaDevtoolsRoot` hosts the `devtools` canvas (the dock/inspector are Nova
// actions — see nova-devtools/); `installRouter` is a thin edge adapter that
// mirrors the shell's nav into the address bar — Nova stays URL-agnostic.
const Relay = () => {
  useEffect(() => installRouter(shell), []);
  return (
    <>
      <NovaShell shell={shell} slotWrapper={devtoolsSlotWrapper} />
      <NovaDevtoolsRoot shell={shell} />
    </>
  );
};

export default Relay;
