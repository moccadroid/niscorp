import type { RenderNode } from '@niscorp/nova';
import { ServerMessageSchema, applyDelta, frameHash } from '../protocol';
import type { DeltaOp, DocumentSnapshot } from '../protocol';

export type WireSnapshot = {
  frame: RenderNode[];
  trees: ReadonlyMap<string, RenderNode[]>;
};

const EMPTY: WireSnapshot = { frame: [], trees: new Map() };

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
  render: (canvas: string, tree: RenderNode[], text: string) => void;
  renderDelta: (canvas: string, ops: readonly DeltaOp[], hash: number) => boolean;
  blank: () => void;
  forgetBases: () => void;
};

export const createScreen = (config: {
  initial: DocumentSnapshot | undefined;
  delta: boolean;
  changed: () => void;
}): Screen => {
  const { initial } = config;
  let snapshot: WireSnapshot = initial === undefined ? EMPTY : { frame: initial.frame, trees: new Map(Object.entries(initial.trees)) };
  // Each canvas's last render message, byte for byte as it arrived: what the next delta is written against.
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
