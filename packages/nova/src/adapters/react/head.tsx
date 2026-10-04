import { createContext, useContext, useEffect, useMemo, type FC, type ReactNode } from 'react';
import type { Shell } from '@shell';
import { createShellTitle, type ShellTitle } from '../../document/shell-title';

// ═══════════════════════════════════════════════════════════
// A head node (`nova:head`), in React.
//
// It draws nothing. Where the shell lives in this page it says that it is on
// the screen, so the tab's title is read off the shell only while there is a
// head to read (document/shell-title). Under a served screen there is no shell
// here and nothing to say to: the terminal keeps the title off the wire.
//
// Effects do not run where a screen is drawn to a string, so none of this
// touches a document that is not a browser's.
// ═══════════════════════════════════════════════════════════

const ShellTitleContext = createContext<ShellTitle | undefined>(undefined);

export const HeadMark: FC = () => {
  const title = useContext(ShellTitleContext);
  useEffect(() => {
    if (title === undefined) return undefined;
    title.enter();
    return title.leave;
  }, [title]);
  return null;
};

export const ShellTitleProvider: FC<{ shell: Shell; children?: ReactNode }> = ({ shell, children }) => {
  const title = useMemo(() => createShellTitle(shell), [shell]);
  useEffect(() => title.watch(), [title]);
  return <ShellTitleContext.Provider value={title}>{children}</ShellTitleContext.Provider>;
};
