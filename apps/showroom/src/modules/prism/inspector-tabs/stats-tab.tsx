import type { FC } from 'react';
import type { CompiledIr } from '@niscorp/prism';
import type { PrismStory } from '../story-types';
import { useCompiledIr } from '../use-compiled-ir';

const LEGEND =
  'Static analysis of the compiled config: how many nodes, how deep, which ops, what source paths it touches.';

type Props = { story: PrismStory };

const Row: FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '6px 12px',
      borderBottom: '1px solid #f3f4f6',
      fontSize: 12,
    }}
  >
    <span style={{ color: '#6b7280' }}>{label}</span>
    <span style={{ color: '#1f2937', fontFamily: 'ui-monospace, Menlo, monospace' }}>{value}</span>
  </div>
);

const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 16 }}>
    <div
      style={{
        padding: '6px 12px',
        background: '#f9fafb',
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: '#374151',
        borderTop: '1px solid #e5e7eb',
        borderBottom: '1px solid #e5e7eb',
      }}
    >
      {title}
    </div>
    {children}
  </div>
);

export const StatsTab: FC<Props> = ({ story }) => {
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
      {state.status === 'ok' && <StatsView ir={state.ir} />}
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

const StatsView: FC<{ ir: CompiledIr }> = ({ ir }) => {
  const { meta, tables } = ir;
  const opEntries = Object.entries(meta.stats.opCount).sort((a, b) => b[1] - a[1]);
  const opt = meta.stats.optimizations;
  return (
    <div style={{ paddingBottom: 16 }}>
      <Section title="Overview">
        <Row label="Node count" value={meta.stats.nodeCount} />
        <Row label="Max depth" value={meta.stats.maxDepth} />
        <Row label="Distinct ops" value={opEntries.length} />
        <Row label="Source paths" value={tables.paths.length} />
        <Row label="String literals" value={tables.strings.length} />
        <Row label="Compiler" value={`${ir.compiler.name} ${ir.compiler.version}`} />
        <Row label="Fingerprint" value={meta.fingerprint.slice(0, 12)} />
      </Section>
      <Section title="Optimizations">
        <Row label="Constants folded" value={opt.constantsFolded} />
        <Row label="$ref segments inlined" value={opt.refsInlined} />
        <Row label="Op handlers attached" value={opt.handlersAttached} />
      </Section>
      <Section title="Op usage">
        {opEntries.length === 0 ? (
          <div style={{ padding: 12, color: '#9ca3af', fontSize: 12 }}>(no ops)</div>
        ) : (
          opEntries.map(([op, count]) => <Row key={op} label={op} value={count} />)
        )}
      </Section>
      {tables.paths.length > 0 && (
        <Section title="Source paths">
          {tables.paths.map((p) => (
            <div
              key={p}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                color: '#1f2937',
                fontFamily: 'ui-monospace, Menlo, monospace',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              {p}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
};
