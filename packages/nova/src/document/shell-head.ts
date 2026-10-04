import { headOf, shellView } from '../shell';
import type { Shell } from '../shell';
import { createHeadKeeper } from './head-keeper';
import type { HeadKeeper } from './head-keeper';

// ═══════════════════════════════════════════════════════════
// The page's head, for an adapter that draws a shell living in its own page
// through a framework (react, vue).
//
// Such an adapter reads the shell's trees through its own subscriptions, so
// there is no one render to read the head off: reading it means rendering the
// shell's trees once more. That is worth doing only while a head is on the
// screen. So a head node says when it arrives and when it goes (`enter`,
// `leave`), and the shell is only read between the two.
// ═══════════════════════════════════════════════════════════

export type ShellHead = {
  enter: () => void;
  leave: () => void;
  // follow the shell's changes; returns the stop
  watch: () => () => void;
};

export const createShellHead = (shell: Shell): ShellHead => {
  const view = shellView(shell);
  let present = 0;
  let keep: HeadKeeper | undefined;
  let queued = false;
  // once a turn, however many heads came and went in it
  const read = (): void => {
    // nothing to keep where a screen is drawn to a string
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
