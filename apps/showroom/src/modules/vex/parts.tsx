import type { FC, ReactNode } from 'react';
import { PhoneFrame, type PhoneTone } from '@showroom/chrome/stage/phone';
import { INK, MONO } from '@showroom/chrome/stage/ui';

// ═══════════════════════════════════════════════════════════
// Vex's small shared parts on the stage language: a light code block for
// DSL / SQL / JSON, a numbered step label, and a phone that draws whatever a
// query answered — a list for rows, tiles for one record. Presentation only;
// nothing here talks to the engine.
// ═══════════════════════════════════════════════════════════

export const Block: FC<{ children: string; tone?: 'plain' | 'bad' | 'warn'; maxHeight?: number }> = ({ children, tone = 'plain', maxHeight = 320 }) => (
  <pre
    style={{
      margin: 0,
      padding: '10px 12px',
      borderRadius: 10,
      background: tone === 'bad' ? INK.badWash : tone === 'warn' ? INK.warnWash : INK.wash,
      color: tone === 'bad' ? '#991b1b' : tone === 'warn' ? '#92400e' : INK.text,
      border: `1px solid ${tone === 'bad' ? '#fecaca' : tone === 'warn' ? '#fde68a' : INK.line}`,
      fontFamily: MONO,
      fontSize: 11.5,
      lineHeight: 1.55,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflow: 'auto',
      maxHeight,
    }}
  >
    {children}
  </pre>
);

// A small caption over a block — sentence case, never shouted.
export const Label: FC<{ children: ReactNode; aside?: ReactNode }> = ({ children, aside }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
    <div style={{ fontSize: 12, fontWeight: 650, color: INK.soft }}>{children}</div>
    {aside}
  </div>
);

export const json = (v: unknown): string => JSON.stringify(v, null, 2) ?? String(v);

// SQL, one clause per line, so a reader can find the WHERE.
export const prettySql = (sql: string): string =>
  sql.replace(/\s+(FROM|JOIN|LEFT JOIN|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|RETURNING)\b/g, '\n$1');

// ── the phone ───────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cell = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// Rows → a list (first value bold, the rest beneath); one record → tiles.
export const Answer: FC<{ value: unknown; limit?: number }> = ({ value, limit = 8 }) => {
  if (Array.isArray(value)) {
    if (value.length === 0) return <div style={{ fontSize: 12.5, color: INK.soft }}>Nothing matches.</div>;
    const shown = value.slice(0, limit);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 12, border: '1px solid #eef0f3', overflow: 'hidden' }}>
        {shown.map((r, i) => {
          const values = isRecord(r) ? Object.values(r) : [r];
          const [head, ...rest] = values;
          return (
            <div key={i} style={{ padding: '9px 12px', borderTop: i === 0 ? 'none' : '1px solid #f1f2f4' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: INK.text }}>{cell(head)}</div>
              {rest.length > 0 && <div style={{ fontSize: 11.5, color: '#6b7280' }}>{rest.map(cell).join(' · ')}</div>}
            </div>
          );
        })}
        {value.length > limit && <div style={{ padding: '7px 12px', fontSize: 11, color: INK.faint, borderTop: '1px solid #f1f2f4' }}>+ {value.length - limit} more</div>}
      </div>
    );
  }
  if (isRecord(value)) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} style={{ background: '#fff', borderRadius: 12, border: '1px solid #eef0f3', padding: '10px 12px' }}>
            <div style={{ fontSize: 18, fontWeight: 750, color: INK.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell(v)}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{k}</div>
          </div>
        ))}
      </div>
    );
  }
  return <div style={{ fontSize: 18, fontWeight: 750 }}>{cell(value)}</div>;
};

export const AnswerPhone: FC<{ title: string; question?: string; value: unknown; tone?: PhoneTone; status?: ReactNode; width?: number; footer?: ReactNode }> = ({
  title,
  question,
  value,
  tone = 'plain',
  status,
  width = 290,
  footer,
}) => (
  <PhoneFrame tone={tone} width={width} status={status}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {question !== undefined && (
        <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: INK.accent, color: '#fff', padding: '7px 11px', borderRadius: '14px 14px 4px 14px', fontSize: 12.5, lineHeight: 1.4 }}>
          {question}
        </div>
      )}
      <div style={{ fontSize: 17, fontWeight: 750, letterSpacing: -0.3, color: INK.text }}>{title}</div>
      <Answer value={value} />
      {footer}
    </div>
  </PhoneFrame>
);
