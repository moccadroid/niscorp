import { headOf, shellView } from '../shell';
import type { Shell } from '../shell';
import { createHeadKeeper } from './head-keeper';
import type { HeadKeeper } from './head-keeper';

export type ShellHead = {
  enter: () => void;
  leave: () => void;
  watch: () => () => void;
};

export const createShellHead = (shell: Shell): ShellHead => {
  const view = shellView(shell);
  let present = 0;
  let keep: HeadKeeper | undefined;
  let queued = false;
  const read = (): void => {
    if (queued || typeof document === 'undefined') return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      keep ??= createHeadKeeper(document);
      keep(present > 0 ? headOf(view.api)?.elements : undefined);
    });
  };
  return {
    enter: () => {
      present += 1;
      read();
    },
    leave: () => {
      present -= 1;
      read();
    },
    watch: () =>
      view.subscribe(() => {
        if (present > 0) read();
      }),
  };
};
