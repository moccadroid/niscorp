import type { CSSProperties, FC, ReactNode } from 'react';

// ═══════════════════════════════════════════════════════════
// The strata pages' own parts: page frame, panels, buttons, chips and a
// JSON diff. Showroom chrome is light; these follow it.
// ═══════════════════════════════════════════════════════════

export const INK = {
  text: '#111827',
  soft: '#4b5563',
  faint: '#9ca3af',
  line: '#e5e7eb',
  wash: '#f9fafb',
  accent: '#4f46e5',
  accentWash: '#eef2ff',
  ok: '#059669',
  okWash: '#ecfdf5',
  bad: '#dc2626',
  badWash: '#fef2f2',
  warn: '#b45309',
  warnWash: '#fffbeb',
};

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const Page: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 64px', display: 'flex', flexDirection: 'column', gap: 24, color: INK.text }}>
    {children}
  </div>
);

export const Lead: FC<{ eyebrow: string; title: string; children?: ReactNode }> = ({ eyebrow, title, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 820 }}>
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: INK.accent }}>{eyebrow}</div>
    <div style={{ fontSize: 28, fontWeight: 750, letterSpacing: -0.6, lineHeight: 1.15 }}>{title}</div>
    {children !== undefined && <div style={{ fontSize: 15, lineHeight: 1.6, color: INK.soft }}>{children}</div>}
  </div>
);

export const Panel: FC<{ title?: ReactNode; aside?: ReactNode; children: ReactNode; tone?: 'plain' | 'ok' | 'bad'; style?: CSSProperties }> = ({
  title,
  aside,
  children,
  tone = 'plain',
  style,
}) => (
  <section
    style={{
      border: `1px solid ${tone === 'ok' ? '#a7f3d0' : tone === 'bad' ? '#fecaca' : INK.line}`,
      borderRadius: 14,
      background: '#ffffff',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      ...style,
    }}
  >
    {title !== undefined && (
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${INK.line}` }}>
        <div style={{ fontSize: 13, fontWeight: 650 }}>{title}</div>
        {aside !== undefined && <div style={{ fontSize: 12, color: INK.soft }}>{aside}</div>}
      </header>
    )}
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, flex: 1 }}>{children}</div>
  </section>
);

export const Btn: FC<{ children: ReactNode; onClick: () => void; kind?: 'primary' | 'plain' | 'quiet'; disabled?: boolean; title?: string }> = ({
  children,
  onClick,
  kind = 'plain',
  disabled = false,
  title,
}) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    onClick={onClick}
    style={{
      font: 'inherit',
      padding: '7px 13px',
      borderRadius: 9,
      fontSize: 13,
      fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      border: kind === 'primary' ? `1px solid ${INK.accent}` : kind === 'quiet' ? '1px solid transparent' : `1px solid ${INK.line}`,
      background: kind === 'primary' ? INK.accent : kind === 'quiet' ? 'transparent' : '#ffffff',
      color: kind === 'primary' ? '#ffffff' : kind === 'quiet' ? INK.soft : INK.text,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </button>
);

export type Tone = 'ok' | 'bad' | 'warn' | 'idle' | 'accent';
const toneColors: Record<Tone, { fg: string; bg: string; border: string }> = {
  ok: { fg: INK.ok, bg: INK.okWash, border: '#a7f3d0' },
  bad: { fg: INK.bad, bg: INK.badWash, border: '#fecaca' },
  warn: { fg: INK.warn, bg: INK.warnWash, border: '#fde68a' },
  idle: { fg: INK.soft, bg: INK.wash, border: INK.line },
  accent: { fg: INK.accent, bg: INK.accentWash, border: '#c7d2fe' },
};

export const Chip: FC<{ tone?: Tone; children: ReactNode; mono?: boolean }> = ({ tone = 'idle', children, mono = false }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 9px',
      borderRadius: 999,
      fontSize: 11.5,
      fontWeight: 600,
      fontFamily: mono ? MONO : 'inherit',
      color: toneColors[tone].fg,
      background: toneColors[tone].bg,
      border: `1px solid ${toneColors[tone].border}`,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
);

export const Callout: FC<{ tone?: Tone; title?: ReactNode; children: ReactNode }> = ({ tone = 'idle', title, children }) => (
  <div
    style={{
      borderRadius: 12,
      padding: '12px 14px',
      background: toneColors[tone].bg,
      border: `1px solid ${toneColors[tone].border}`,
      fontSize: 13,
      lineHeight: 1.55,
      color: INK.text,
    }}
  >
    {title !== undefined && <div style={{ fontWeight: 700, color: toneColors[tone].fg, marginBottom: 4 }}>{title}</div>}
    {children}
  </div>
);

export const Code: FC<{ children: string; maxHeight?: number }> = ({ children, maxHeight = 320 }) => (
  <pre
    style={{
      margin: 0,
      padding: 12,
      borderRadius: 10,
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: MONO,
      fontSize: 11.5,
      lineHeight: 1.55,
      overflow: 'auto',
      maxHeight,
      whiteSpace: 'pre',
    }}
  >
    {children}
  </pre>
);

export const Grid: FC<{ min?: number; children: ReactNode; gap?: number }> = ({ min = 300, children, gap = 16 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap, alignItems: 'start' }}>{children}</div>
);

export const Mono: FC<{ children: ReactNode }> = ({ children }) => (
  <code style={{ fontFamily: MONO, fontSize: '0.92em', background: INK.wash, border: `1px solid ${INK.line}`, borderRadius: 5, padding: '0 4px' }}>{children}</code>
);

// ── JSON diff ───────────────────────────────────────────────────
// Two documents, pretty-printed, each line knowing the path it prints. A path
// only one side has, or whose value differs, is marked on that side — so a
// renamed key shows as red on the left and green on the right.

type JsonLine = { depth: number; text: string; path: string };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const printLines = (value: unknown, path: string, prefix: string, depth: number, comma: boolean, out: JsonLine[]): void => {
  const tail = comma ? ',' : '';
  if (Array.isArray(value)) {
    if (value.length === 0) return void out.push({ depth, text: `${prefix}[]${tail}`, path });
    out.push({ depth, text: `${prefix}[`, path });
    value.forEach((v, i) => printLines(v, `${path}[${i}]`, '', depth + 1, i < value.length - 1, out));
    out.push({ depth, text: `]${tail}`, path });
    return;
  }
  if (isObj(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return void out.push({ depth, text: `${prefix}{}${tail}`, path });
    out.push({ depth, text: `${prefix}{`, path });
    entries.forEach(([k, v], i) => printLines(v, path === '' ? k : `${path}.${k}`, `"${k}": `, depth + 1, i < entries.length - 1, out));
    out.push({ depth, text: `}${tail}`, path });
    return;
  }
  out.push({ depth, text: `${prefix}${JSON.stringify(value)}${tail}`, path });
};

const collectDiff = (a: unknown, b: unknown, path: string, onlyA: string[], onlyB: string[]): void => {
  const join = (k: string | number): string => (typeof k === 'number' ? `${path}[${k}]` : path === '' ? k : `${path}.${k}`);
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) if (!(k in b)) onlyA.push(join(k));
    for (const k of Object.keys(b)) if (!(k in a)) onlyB.push(join(k));
    for (const k of Object.keys(a)) if (k in b) collectDiff(a[k], b[k], join(k), onlyA, onlyB);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
      if (i >= a.length) onlyB.push(join(i));
      else if (i >= b.length) onlyA.push(join(i));
      else collectDiff(a[i], b[i], join(i), onlyA, onlyB);
    }
    return;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    onlyA.push(path);
    onlyB.push(path);
  }
};

const under = (path: string, marks: readonly string[]): boolean =>
  marks.some((m) => path === m || path.startsWith(`${m}.`) || path.startsWith(`${m}[`));

const JsonSide: FC<{ lines: readonly JsonLine[]; marks: readonly string[]; tone: 'ok' | 'bad'; maxHeight: number }> = ({ lines, marks, tone, maxHeight }) => (
  <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.6, background: INK.wash, border: `1px solid ${INK.line}`, borderRadius: 10, padding: '8px 0', overflow: 'auto', maxHeight }}>
    {lines.map((line, i) => {
      const marked = under(line.path, marks);
      return (
        <div
          key={i}
          style={{
            whiteSpace: 'pre',
            padding: '0 12px',
            paddingLeft: 12 + line.depth * 14,
            background: marked ? (tone === 'ok' ? '#d1fae5' : '#fee2e2') : 'transparent',
            color: marked ? (tone === 'ok' ? '#065f46' : '#991b1b') : INK.text,
            fontWeight: marked ? 600 : 400,
          }}
        >
          {marked ? (tone === 'ok' ? '+ ' : '− ') : '  '}
          {line.text}
        </div>
      );
    })}
  </div>
);

export const JsonDiff: FC<{ before: unknown; after: unknown; beforeTitle: ReactNode; afterTitle: ReactNode; maxHeight?: number }> = ({
  before,
  after,
  beforeTitle,
  afterTitle,
  maxHeight = 460,
}) => {
  const a: JsonLine[] = [];
  const b: JsonLine[] = [];
  printLines(before, '', '', 0, false, a);
  printLines(after, '', '', 0, false, b);
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  collectDiff(before, after, '', onlyA, onlyB);
  return (
    <Grid min={320} gap={12}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: INK.soft }}>{beforeTitle}</div>
        <JsonSide lines={a} marks={onlyA} tone="bad" maxHeight={maxHeight} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: INK.soft }}>{afterTitle}</div>
        <JsonSide lines={b} marks={onlyB} tone="ok" maxHeight={maxHeight} />
      </div>
    </Grid>
  );
};

// A stamp, readable: { "nisc.nova": 1, "acme.kit": 2 } → nova 1 · prism 1 · kit 2.
// nisc's own grammars first, then the app's — whatever order the keys arrived in.
export const stampText = (stamp: Readonly<Record<string, number>>): string =>
  Object.entries(stamp)
    .sort(([a], [b]) => Number(!a.startsWith('nisc.')) - Number(!b.startsWith('nisc.')) || a.localeCompare(b))
    .map(([k, v]) => `${k.replace(/^nisc\./, '').replace(/^acme\./, '')} ${v}`)
    .join(' · ');
