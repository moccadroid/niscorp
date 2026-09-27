import { useMemo, type FC } from 'react';
import type { CompiledIr } from '@niscorp/prism';
import { Chip, INK } from '@showroom/chrome/stage/ui';
import type { PrismStory } from '@showroom/modules/prism/story-types';
import { useCompiledIr } from '@showroom/modules/prism/use-compiled-ir';
import { Block, json } from '@showroom/modules/prism/parts';
import { Legend } from './stats-tab';

const LEGEND =
  'The tree the runtime actually evaluates, after desugaring, constant folding, handler attachment and path inlining.';

type Props = { story: PrismStory };

// Walk the optimized core and produce a "decorated" version for display: each
// op node gets a synthetic `__op` field showing which handler is attached, so
// users can SEE the work the optimizer did. Without this, the non-enumerable
// `__op` and `__segments` properties are invisible to JSON.stringify and the
// optimized core looks identical to the source for most stories.
//
// We also surface attached `__segments` arrays where present.
const HANDLER_KEY = '__op';
const SEGMENTS_KEY = '__segments';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const opKeyOf = (node: Record<string, unknown>): string | undefined => {
  for (const key of Object.keys(node)) {
    if (key.startsWith('$')) return key;
  }
  return undefined;
};

const decorate = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(decorate);
  if (!isPlainObject(node)) return node;

  const out: Record<string, unknown> = {};
  // Surface the non-enumerable attachments first so they're visually prominent.
  const attachedHandler = Reflect.get(node, HANDLER_KEY);
  const attachedSegments = Reflect.get(node, SEGMENTS_KEY);
  if (typeof attachedHandler === 'function') {
    out['__op'] = opKeyOf(node) ?? 'attached';
  }
  if (Array.isArray(attachedSegments)) {
    out['__segments'] = attachedSegments;
  }
  for (const key of Object.keys(node)) {
    out[key] = decorate(node[key]);
  }
  return out;
};

export const CompiledTab: FC<Props> = ({ story }) => {
  const state = useCompiledIr(story.config);

  return (
    <div>
      <Legend>{LEGEND}</Legend>
      {state.status === 'loading' && <div style={{ padding: 16, color: INK.faint, fontSize: 12.5 }}>Compiling…</div>}
      {state.status === 'ok' && <CompiledView ir={state.ir} />}
      {state.status === 'error' && (
        <div style={{ padding: 16 }}>
          <Block tone="bad">{state.error}</Block>
        </div>
      )}
    </div>
  );
};

const CompiledView: FC<{ ir: CompiledIr }> = ({ ir }) => {
  const decorated = useMemo(() => decorate(ir.core), [ir]);
  const opt = ir.meta.stats.optimizations;

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip tone="ok">{opt.constantsFolded} folded</Chip>
        <Chip tone="accent">{opt.refsInlined} $ref inlined</Chip>
        <Chip tone="warn">{opt.handlersAttached} handlers attached</Chip>
      </div>
      <Block maxHeight={2000}>{json(decorated)}</Block>
    </div>
  );
};
