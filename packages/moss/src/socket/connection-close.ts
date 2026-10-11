import type { Connection } from './connection';

// WHEN A CONNECTION ENDS, heard once and kept.
//
// A transport tells a close to whoever is listening when it happens (on Node,
// `ws` emits it), and to nobody who starts listening afterwards. Opening a
// session awaits: what somebody holds is asked, their shell is built. A
// listener registered after one of those, on a connection that closed
// meanwhile, was never called — so the connection stayed attached to its
// shell for ever. A kept shell never idled; a throwaway one was never
// disposed.
//
// So the close is listened for once, before the first of those awaits, and
// remembered. What has to be undone when the connection ends is said here as
// each thing is done: it runs when the close arrives, or at once if it has.
export type ConnectionClose = {
  ended: () => boolean;
  then: (undo: () => void) => void;
};

export const closeOf = (connection: Connection): ConnectionClose => {
  let ended = false;
  const undoing: (() => void)[] = [];
  connection.onClose(() => {
    ended = true;
    for (const undo of undoing.splice(0)) undo();
  });
  return {
    ended: () => ended,
    then: (undo) => {
      if (ended) undo();
      else undoing.push(undo);
    },
  };
};
