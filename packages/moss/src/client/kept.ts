import type { NovaEvent, RenderNode } from '@niscorp/nova';

// Longer than a check on a dead socket (2 s) and the connection made after it.
const KEEP_MS = 5000;

type KeptEvent = { canvas: string; event: NovaEvent; pressedOn: string | undefined };

export type KeptEvents = {
  keep: (canvas: string, event: NovaEvent) => void;
  any: () => boolean;
  arrived: (canvas: string) => void;
  judge: () => void;
  fresh: () => void;
  drop: () => void;
  dropped: () => number;
  dispose: () => void;
};

const textOf = (tree: RenderNode[] | undefined): string | undefined => (tree === undefined ? undefined : JSON.stringify(tree));

// Sent together or dropped together: an intention replayed against a screen
// that has moved since is worse than one lost, and so is half of a sequence.
export const createKeptEvents = (deps: {
  treeOf: (canvas: string) => RenderNode[] | undefined;
  open: () => boolean;
  send: (canvas: string, event: NovaEvent) => void;
  changed: () => void;
}): KeptEvents => {
  let kept: KeptEvent[] = [];
  let dropped = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arrivedSince = new Set<string>();

  const end = (): KeptEvent[] => {
    const ended = kept;
    kept = [];
    clearTimeout(timer);
    timer = undefined;
    return ended;
  };
  const drop = (): void => {
    const ended = end();
    if (ended.length === 0) return;
    dropped += ended.length;
    deps.changed();
  };
  const judge = (): void => {
    if (kept.length === 0 || !deps.open()) return;
    if (!kept.every((h) => arrivedSince.has(h.canvas))) return;
    if (!kept.every((h) => h.pressedOn !== undefined && h.pressedOn === textOf(deps.treeOf(h.canvas)))) {
      drop();
      return;
    }
    for (const h of end()) deps.send(h.canvas, h.event);
  };

  return {
    keep: (canvas, event) => {
      if (kept.length === 0) timer = setTimeout(drop, KEEP_MS);
      kept.push({ canvas, event, pressedOn: textOf(deps.treeOf(canvas)) });
      judge();
    },
    any: () => kept.length > 0,
    arrived: (canvas) => {
      arrivedSince.add(canvas);
      judge();
    },
    judge,
    fresh: () => arrivedSince.clear(),
    drop,
    dropped: () => dropped,
    dispose: () => void end(),
  };
};
