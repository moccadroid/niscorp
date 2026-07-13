import { z } from 'zod';
import type { ReactNode } from 'react';
import { useNovaDispatch } from '@niscorp/nova/react';
import type { NovaComponent } from '@niscorp/nova/react';

// ═══════════════════════════════════════════════════════════
// Doodle — a pastel glyph: a plant drawn by `kind`, in one of
// three stages. Domain-blind: it knows kinds and stages, not
// what they mean upstream. With a ref it is clickable and
// dispatches ui:click (payload included), so a glyph can be a
// control as well as a decoration.
// ═══════════════════════════════════════════════════════════

const DoodlePropsSchema = z
  .object({
    kind: z.string().optional().describe('Glyph kind: tulip | daisy | poppy | lotus | bell | fern.'),
    stage: z.string().optional().describe('Growth stage: sprout | bloom | wilt. Default sprout.'),
    size: z.enum(['sm', 'md', 'lg']).optional().describe('Default md.'),
    payload: z.unknown().optional().describe('Dispatched as the ui:click event payload when clickable.'),
    title: z.string().optional().describe('Hover tooltip.'),
  })
  .strict()
  .describe('A pastel plant glyph; clickable when given a ref.');

type DoodleProps = z.infer<typeof DoodlePropsSchema>;

type Palette = { a: string; b: string };

const FALLBACK: Palette = { a: '#f2cf9b', b: '#dfae63' };
const KINDS: Record<string, Palette> = {
  tulip: { a: '#f4a7b9', b: '#e87f9a' },
  daisy: { a: '#fbf6e3', b: '#f2cf5b' },
  poppy: { a: '#f5a973', b: '#a96a48' },
  lotus: { a: '#d8b4e2', b: '#b98cd1' },
  bell: { a: '#a9c1ec', b: '#7f9fd9' },
  fern: { a: '#8fd0a5', b: '#5da97c' },
};

const STEM = '#7fae8e';
const LEAF = '#a5d4b4';

// Flower heads, drawn around (32, 18) in a 64×80 viewBox.
const head = (kind: string, p: Palette): ReactNode => {
  if (kind === 'daisy') {
    return (
      <g>
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <ellipse key={deg} cx={32} cy={7} rx={5.5} ry={11} fill={p.a} transform={`rotate(${deg} 32 18)`} />
        ))}
        <circle cx={32} cy={18} r={6.5} fill={p.b} />
      </g>
    );
  }
  if (kind === 'poppy') {
    return (
      <g>
        <circle cx={25} cy={14} r={9} fill={p.a} />
        <circle cx={39} cy={14} r={9} fill={p.a} />
        <circle cx={25} cy={24} r={9} fill={p.a} />
        <circle cx={39} cy={24} r={9} fill={p.a} />
        <circle cx={32} cy={19} r={4.5} fill={p.b} />
      </g>
    );
  }
  if (kind === 'lotus') {
    return (
      <g>
        <path d="M32 4 C38 12 38 22 32 28 C26 22 26 12 32 4" fill={p.b} />
        <path d="M18 12 C28 14 32 22 32 28 C24 28 18 20 18 12" fill={p.a} />
        <path d="M46 12 C36 14 32 22 32 28 C40 28 46 20 46 12" fill={p.a} />
      </g>
    );
  }
  if (kind === 'bell') {
    return (
      <g>
        <path d="M22 10 C22 2 42 2 42 10 L44 24 C44 27 20 27 20 24 Z" fill={p.a} />
        <circle cx={32} cy={28} r={3.5} fill={p.b} />
      </g>
    );
  }
  if (kind === 'fern') {
    return (
      <g stroke={p.a} strokeWidth={3} fill="none" strokeLinecap="round">
        <path d="M32 30 C30 18 22 12 14 12" />
        <path d="M32 26 C34 14 42 8 50 10" />
        <path d="M32 22 C31 12 28 6 32 2" stroke={p.b} />
      </g>
    );
  }
  // tulip (and the fallback shape)
  return (
    <g>
      <path d="M20 20 C20 6 26 6 32 12 C38 6 44 6 44 20 C44 28 38 32 32 32 C26 32 20 28 20 20" fill={p.a} />
      <path d="M28 10 C30 14 34 14 36 10 L32 26 Z" fill={p.b} />
    </g>
  );
};

const drawing = (kind: string, stage: string, p: Palette): ReactNode => {
  const ground = <ellipse cx={32} cy={74} rx={15} ry={4} fill="rgba(80, 70, 60, 0.08)" />;
  if (stage === 'bloom') {
    return (
      <g>
        {ground}
        <path d="M32 72 C32 58 32 46 32 32" stroke={STEM} strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d="M32 58 C24 56 20 50 19 44 C28 45 32 50 32 58" fill={LEAF} />
        <path d="M32 50 C40 48 44 42 45 36 C36 37 32 42 32 50" fill={LEAF} />
        {head(kind, p)}
      </g>
    );
  }
  if (stage === 'wilt') {
    return (
      <g style={{ filter: 'saturate(0.45) brightness(0.97)' }}>
        {ground}
        <path d="M32 72 C32 54 32 40 40 34 C48 28 52 34 50 40" stroke={STEM} strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d="M32 60 C24 58 21 52 20 47 C28 48 32 53 32 60" fill={LEAF} opacity={0.8} />
        <g transform="rotate(130 50 42) scale(0.8) translate(13 27)">{head(kind, p)}</g>
      </g>
    );
  }
  // sprout
  return (
    <g>
      {ground}
      <path d="M32 72 C32 64 32 58 32 52" stroke={STEM} strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d="M32 62 C25 60 22 55 21 50 C29 51 32 56 32 62" fill={LEAF} />
      <path d="M32 58 C39 56 42 51 43 46 C35 47 32 52 32 58" fill={LEAF} />
      <circle cx={32} cy={48} r={4.5} fill={p.a} />
    </g>
  );
};

const SIZES: Record<string, number> = { sm: 26, md: 42, lg: 62 };

export const Doodle: NovaComponent<DoodleProps> = ({ kind, stage, size, payload, title, novaRef }) => {
  const dispatch = useNovaDispatch();
  const k = kind ?? 'tulip';
  const s = stage ?? 'sprout';
  const width = SIZES[size ?? 'md'] ?? 42;
  const svg = (
    <svg
      width={width}
      height={width * 1.25}
      viewBox="0 0 64 80"
      role="img"
      aria-label={`${k} (${s})`}
      style={s === 'wilt' ? { animation: 'm-sway 5s ease-in-out infinite' } : undefined}
    >
      {drawing(k, s, KINDS[k] ?? FALLBACK)}
    </svg>
  );
  if (novaRef === undefined) return <span title={title}>{svg}</span>;
  return (
    <button
      type="button"
      title={title}
      className="m-doodle"
      style={{ background: 'transparent', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0 }}
      onClick={() => dispatch({ type: 'ui:click', ref: novaRef, payload })}
    >
      {svg}
    </button>
  );
};

Doodle.meta = { description: 'A pastel plant glyph (kind × stage); clickable when given a ref.', propsSchema: DoodlePropsSchema };
