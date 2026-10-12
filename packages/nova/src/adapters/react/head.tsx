import { createContext, useContext, useEffect, useMemo, type FC, type ReactNode } from 'react';
import type { Shell } from '@shell';
import { createShellHead, type ShellHead } from '../../document/shell-head';

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
