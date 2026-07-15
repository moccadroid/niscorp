import { useEffect, useState } from 'react';
import { NovaShell } from '@niscorp/nova/react';
import type { Shell } from '@niscorp/nova';
import { buildShell } from './nova/shell';
import { identity, subscribe, type Identity } from './auth';
import { installRouter } from './ui/router';
import { devtoolsSlotWrapper, NovaDevtoolsRoot } from './nova-devtools';

// Relay is a Nova shell, built PER PRINCIPAL: the charter resolves the
// signed-in identity to a catalog and buildShell constructs the shell from
// exactly those definitions. Signing in/out rebuilds it (the key remount).
// React only mounts the result.

// One live shell per principal, cached outside React so StrictMode's double
// render can't build twice; switching principals disposes the old shell.
let cached: { key: string; shell: Shell } | null = null;
const shellFor = (who: Identity | null): Shell => {
  const key = who?.userId ?? 'anon';
  if (cached !== null && cached.key === key) return cached.shell;
  cached?.shell.dispose();
  cached = { key, shell: buildShell(who) };
  return cached.shell;
};

const Relay = () => {
  const [who, setWho] = useState(identity);
  useEffect(() => subscribe(() => setWho(identity())), []);
  const shell = shellFor(who);
  useEffect(() => installRouter(shell), [shell]);
  return (
    <>
      <NovaShell key={who?.userId ?? 'anon'} shell={shell} slotWrapper={devtoolsSlotWrapper} />
      <NovaDevtoolsRoot key={`dt-${who?.userId ?? 'anon'}`} shell={shell} />
    </>
  );
};

export default Relay;
