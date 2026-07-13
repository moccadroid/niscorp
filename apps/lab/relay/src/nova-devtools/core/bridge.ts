import type { Shell } from '@niscorp/nova';

// The devtools ↔ shell bridge, same pattern as ray/bridge: devtools functions
// are registered INTO the shell at createShell time, so they can't import the
// shell module (cycle). The shell binds itself here right after construction.
let bound: Shell | undefined;

export const bindDevtoolsShell = (shell: Shell): void => {
  bound = shell;
};

export const getDevtoolsShell = (): Shell => {
  if (bound === undefined) throw new Error('nova-devtools: shell not bound — call bindDevtoolsShell(shell) after createShell');
  return bound;
};
