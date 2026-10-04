import { createContext, useContext, useEffect, useMemo, type FC, type ReactNode } from 'react';
import type { Shell } from '@shell';
import { createShellHead, type ShellHead } from '../../document/shell-head';

// ═══════════════════════════════════════════════════════════
// A head node (`nova:head`), in React.
//
// It draws nothing, and neither does anything it holds. Where the shell lives
// in this page it says that it is on the screen, so the page's head is read
// off the shell only while there is one to read (document/shell-head). Under a
// served screen there is no shell here and nothing to say to: the terminal
// keeps the head off the wire.
//
// Effects do not run where a screen is drawn to a string, so none of this
// touches a document that is not a browser's.
// ═══════════════════════════════════════════════════════════

const ShellHeadContext = createContext<ShellHead | undefined>(undefined);

export const HeadMark: FC = () => {
  const head = useContext(ShellHeadContext);
  useEffect(() => {
    if (head === undefined) return undefined;
    head.enter();
    return head.leave;
  }, [head]);
  return null;
};

export const ShellHeadProvider: FC<{ shell: Shell; children?: ReactNode }> = ({ shell, children }) => {
  const head = useMemo(() => createShellHead(shell), [shell]);
  useEffect(() => head.watch(), [head]);
  return <ShellHeadContext.Provider value={head}>{children}</ShellHeadContext.Provider>;
};
