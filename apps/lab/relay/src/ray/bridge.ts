import type { Shell } from '@niscorp/nova';

// The shell is created in nova/shell, and Ray's tools/run need to drive it. The
// `ray.run` function is registered INTO the shell at creation, so it can't import
// the shell instance (cycle). Instead the shell binds itself here once built, and
// the tools/run read it back at call time.
let current: Shell | undefined;

export const bindShell = (shell: Shell): void => {
  current = shell;
};

export const getShell = (): Shell => {
  if (current === undefined) throw new Error('Ray: shell not bound yet');
  return current;
};
