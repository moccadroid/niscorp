import type { RenderNode } from '@niscorp/nova';
import { ServerMessageSchema, applyDelta, frameHash } from '../protocol';
import type { DeltaOp, DocumentSnapshot } from '../protocol';

// What the wire holds of the screen: the frame, the tree of each canvas, and —
// when deltas are on — the text of each canvas's last frame, which the next
// delta is written against.

export type WireSnapshot = {
  // the frame: the canvas ARRANGEMENT — a served layout whose CanvasSlot
  // markers resolve against `trees`
  frame: RenderNode[];
  // the current tree per canvas id
  trees: ReadonlyMap<string, RenderNode[]>;
};

const EMPTY: WireSnapshot = { frame: [], trees: new Map() };

// A delta, applied and proven: the text it rebuilds carries the server's own
// checksum and is a render this terminal can read. Anything short of that is
// undefined — never a thrown error, never a frame half applied.
const rebuiltFrame = (base: string, ops: readonly DeltaOp[], hash: number): { text: string; tree: RenderNode[] } | undefined => {
  try {
    const text = applyDelta(base, ops);
    if (frameHash(text) !== hash) return undefined;
    const frame = ServerMessageSchema.safeParse(JSON.parse(text));
    return frame.success && frame.data.type === 'render' ? { text, tree: frame.data.tree } : undefined;
  } catch {
    return undefined;
  }
};

export type Screen = {
  snapshot: () => WireSnapshot;
  frame: (tree: RenderNode[]) => void;
  // A whole frame for one canvas. `text` is the message as it arrived: the
  // base the next delta for this canvas is written against.
  render: (canvas: string, tree: RenderNode[], text: string) => void;
  // A frame for one canvas as a delta against the last. False when it did not
  // rebuild the server's frame: nothing is shown, and the base is let go of.
  renderDelta: (canvas: string, ops: readonly DeltaOp[], hash: number) => boolean;
  // nothing on it: a different principal is a different application
  blank: () => void;
  forgetBases: () => void;
};

export const createScreen = (config: {
  // the screen the page already shows, when it was drawn for who this terminal is
  initial: DocumentSnapshot | undefined;
  delta: boolean;
  // called each time what is shown is replaced
  changed: () => void;
}): Screen => {
  const { initial } = config;
  let snapshot: WireSnapshot = initial === undefined ? EMPTY : { frame: initial.frame, trees: new Map(Object.entries(initial.trees)) };
  // The last `render` message TEXT per canvas — byte for byte as the server
  // holds it. Only populated when deltas are on; cleared on every connect,
  // because attaching serves whole frames and a base carried across a reconnect
  // is a base the server never assumed.
  const bases = new Map<string, string>();
  const show = (next: WireSnapshot): void => {
    snapshot = next;
    config.changed();
  };
  const showTree = (canvas: string, tree: RenderNode[]): void => show({ ...snapshot, trees: new Map(snapshot.trees).set(canvas, tree) });
  return {
    snapshot: () => snapshot,
    frame: (tree) => show({ ...snapshot, frame: tree }),
    render: (canvas, tree, text) => {
      if (config.delta) bases.set(canvas, text);
      showTree(canvas, tree);
    },
    // Rebuild, then PROVE it. Anything short of the server's own checksum and
    // we would be rendering a frame nobody authored. Never a thrown error and
    // never a partial apply; a terminal that goes blank on a bad delta is worse
    // than one that costs a round trip.
    renderDelta: (canvas, ops, hash) => {
      const base = bases.get(canvas);
      const rebuilt = base === undefined ? undefined : rebuiltFrame(base, ops, hash);
      if (rebuilt === undefined) {
        bases.delete(canvas);
        return false;
      }
      bases.set(canvas, rebuilt.text);
      showTree(canvas, rebuilt.tree);
      return true;
    },
    blank: () => show(EMPTY),
    forgetBases: () => bases.clear(),
  };
};
