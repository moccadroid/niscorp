import type { FC, ReactNode } from 'react';
import type { CompiledIr } from '@niscorp/prism';
import { INK, MONO } from '@showroom/chrome/stage/ui';
import type { PrismStory } from '@showroom/modules/prism/story-types';
import { useCompiledIr } from '@showroom/modules/prism/use-compiled-ir';
import { Block } from '@showroom/modules/prism/parts';

// ═══════════════════════════════════════════════════════════
// Stats — what the real compiler says about this story's config: how many
// nodes, how deep, which operators, which source paths it reads.
// ═══════════════════════════════════════════════════════════

const LEGEND = 'What the compiler found in this config: how many nodes, how deep, which operators, and which paths of the input it reads.';

type Props = { story: PrismStory };

const Row: FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 16px', borderBottom: `1px solid ${INK.wash}`, fontSize: 12.5 }}>
    <span style={{ color: INK.soft }}>{label}</span>
    <span style={{ color: INK.text, fontFamily: MONO, fontSize: 12 }}>{value}</span>
  </div>
);

const Section: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ padding: '8px 16px 6px', fontSize: 12, fontWeight: 650, color: INK.soft, borderBottom: `1px solid ${INK.line}` }}>{title}</div>
    {children}
  </div>
);

export const Legend: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ padding: '12px 16px', color: INK.soft, fontSize: 12.5, lineHeight: 1.5, borderBottom: `1px solid ${INK.line}`, background: INK.wash }}>{children}</div>
);

export const StatsTab: FC<Props> = ({ story }) => {
  const state = useCompiledIr(story.config);

  return (
    <div style={{ color: INK.text }}>
      <Legend>{LEGEND}</Legend>
      {state.status === 'loading' && <div style={{ padding: 16, color: INK.faint, fontSize: 12.5 }}>Compiling…</div>}
      {state.status === 'ok' && <StatsView ir={state.ir} />}
      {state.status === 'error' && (
        <div style={{ padding: 16 }}>
          <Block tone="bad">{state.error}</Block>
        </div>
      )}
    </div>
  );
};

const StatsView: FC<{ ir: CompiledIr }> = ({ ir }) => {
  const { meta, tables } = ir;
  const opEntries = Object.entries(meta.stats.opCount).sort((a, b) => b[1] - a[1]);
  const opt = meta.stats.optimizations;
  return (
    <div style={{ paddingTop: 6, paddingBottom: 16 }}>
      <Section title="Overview">
        <Row label="Node count" value={meta.stats.nodeCount} />
        <Row label="Max depth" value={meta.stats.maxDepth} />
        <Row label="Distinct ops" value={opEntries.length} />
        <Row label="Source paths" value={tables.paths.length} />
        <Row label="String literals" value={tables.strings.length} />
        <Row label="Compiler" value={`${ir.compiler.name} ${ir.compiler.version}`} />
        <Row label="Fingerprint" value={meta.fingerprint.slice(0, 12)} />
      </Section>
      <Section title="What the optimizer did">
        <Row label="Constants folded" value={opt.constantsFolded} />
        <Row label="$ref segments inlined" value={opt.refsInlined} />
        <Row label="Op handlers attached" value={opt.handlersAttached} />
      </Section>
      <Section title="Operators used">
        {opEntries.length === 0 ? (
          <div style={{ padding: '8px 16px', color: INK.faint, fontSize: 12.5 }}>(no operators)</div>
        ) : (
          opEntries.map(([op, count]) => <Row key={op} label={op} value={count} />)
        )}
      </Section>
      {tables.paths.length > 0 && (
        <Section title="Paths it reads from the input">
          {tables.paths.map((p) => (
            <div key={p} style={{ padding: '5px 16px', fontSize: 12, color: INK.text, fontFamily: MONO, borderBottom: `1px solid ${INK.wash}` }}>
              {p}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
};
