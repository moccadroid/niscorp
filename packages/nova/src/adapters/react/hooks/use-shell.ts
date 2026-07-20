import { useContext } from 'react';
import type { Shell } from '@shell';
import { NovaShellContext } from '../context';

export const useShell = (): Shell => {
  const shell = useContext(NovaShellContext);
  if (shell === undefined) {
    throw new Error('useShell must be used inside <NovaShellProvider>');
  }
  return shell;
};
