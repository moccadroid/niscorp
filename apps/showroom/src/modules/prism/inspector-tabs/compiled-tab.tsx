import { useMemo, type FC } from 'react';
import type { CompiledIr } from '@niscorp/prism';
import type { PrismStory } from '@showroom/modules/prism/story-types';
import { useCompiledIr } from '@showroom/modules/prism/use-compiled-ir';

const LEGEND =
  'The tree the runtime actually evaluates after desugaring, constant folding, handler attachment, and JSONPath segment inlining.';

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
      <div
        style={{
          padding: '12px 16px',
          background: '#f3f4f6',
          color: '#4b5563',
          fontSize: 11,
          borderBottom: '1px solid #e5e7eb',
          fontStyle: 'italic',
        }}
      >
        {LEGEND}
      </div>
      {state.status === 'loading' && (
        <div style={{ padding: 16, color: '#9ca3af', fontSize: 12 }}>Compiling…</div>
      )}
      {state.status === 'ok' && <CompiledView ir={state.ir} />}
      {state.status === 'error' && (
        <pre
          style={{
            margin: 16,
            padding: 12,
            background: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'ui-monospace, Menlo, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {state.error}
        </pre>
      )}
    </div>
  );
};

const CompiledView: FC<{ ir: CompiledIr }> = ({ ir }) => {
  const decorated = useMemo(() => decorate(ir.core), [ir]);
  const opt = ir.meta.stats.optimizations;

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
          fontSize: 11,
        }}
      >
        <Badge label="folded" value={opt.constantsFolded} color="#dcfce7" textColor="#166534" />
        <Badge label="$ref inlined" value={opt.refsInlined} color="#dbeafe" textColor="#1e3a8a" />
        <Badge label="handlers attached" value={opt.handlersAttached} color="#fef3c7" textColor="#854d0e" />
      </div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          background: '#f9fafb',
          color: '#1f2937',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'ui-monospace, Menlo, monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflow: 'auto',
        }}
      >
        {JSON.stringify(decorated, null, 2)}
      </pre>
    </div>
  );
};

const Badge: FC<{ label: string; value: number; color: string; textColor: string }> = ({
  label,
  value,
  color,
  textColor,
}) => (
  <span
    style={{
      display: 'inline-block',
      padding: '4px 10px',
      background: color,
      color: textColor,
      borderRadius: 12,
      fontWeight: 600,
      fontFamily: 'ui-monospace, Menlo, monospace',
      fontSize: 11,
    }}
  >
    {value} {label}
  </span>
);
