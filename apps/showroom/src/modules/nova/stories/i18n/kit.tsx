import { z } from 'zod';
import type { Shell } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { LOCALES } from './books';

// ═══════════════════════════════════════════════════════════
// Shared furniture for the Language stories.
//
// NOTE WHAT IS NOT HERE: not one of these components looks up a phrase, holds a
// book, or knows a second language exists. They receive props and draw them.
// That is the whole claim of this section — the swap happens in nova's
// RENDERER, so an adapter and the kit on top of it are downstream of it and
// stay ignorant. Read them and check.
// ═══════════════════════════════════════════════════════════

const shell: React.CSSProperties = { fontFamily: 'system-ui, sans-serif', color: '#1f2937' };

// ── the locale switcher ──────────────────────────────────────
//
// Plain React, outside the tree — it drives `shell.setPhrases`, which is how a
// book is replaced on a shell that is already running. The instances on screen
// were mounted in the old language and pick up the new one because a runtime
// asks for the book at each render rather than holding one from spawn.
export const LocaleBar = ({ shell: target, at, onPick }: { shell?: Shell; at: string; onPick?: (tag: string) => void }) => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
    <span style={{ ...shell, fontSize: 12, color: '#6b7280', marginRight: 4 }}>Reading in</span>
    {LOCALES.map((locale) => (
      <button
        key={locale.tag}
        type="button"
        onClick={() => {
          target?.setPhrases(locale.book);
          onPick?.(locale.tag);
        }}
        style={{
          ...shell,
          fontSize: 13,
          padding: '5px 12px',
          borderRadius: 999,
          cursor: 'pointer',
          border: `1px solid ${at === locale.tag ? '#2563eb' : '#d1d5db'}`,
          background: at === locale.tag ? '#2563eb' : '#ffffff',
          color: at === locale.tag ? '#ffffff' : '#374151',
        }}
      >
        {locale.label}
      </button>
    ))}
  </div>
);

/** A note in the demo's own voice — chrome, never part of the nova tree, so
 *  nothing here is translated and that is the point of putting it beside the
 *  thing that is. */
export const Aside = ({ children }: { children: React.ReactNode }) => (
  <div style={{ ...shell, fontSize: 12.5, lineHeight: 1.55, color: '#6b7280', marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>{children}</div>
);

// ── nova components ──────────────────────────────────────────

const CardProps = z
  .object({
    // `title` is in nova's DEFAULT_PHRASE_KEYS. `name` is deliberately not, and
    // never will be — it is where a person's name lives.
    title: z.string().optional(),
    name: z.string().optional(),
    caption: z.string().optional(),
  })
  .strict();

export const Card: NovaComponent<z.infer<typeof CardProps>> = ({ title, name, caption, children }: z.infer<typeof CardProps> & { children?: React.ReactNode }) => (
  <div style={{ ...shell, border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fff', minWidth: 0 }}>
    {title === undefined ? null : <div style={{ fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 6 }}>{title}</div>}
    {name === undefined ? null : <div style={{ fontSize: 19, fontWeight: 600 }}>{name}</div>}
    {caption === undefined ? null : <div style={{ fontSize: 14, color: '#4b5563', marginTop: 4 }}>{caption}</div>}
    {children}
  </div>
);
Card.meta = { description: 'A titled card. `title` and `caption` are prose; `name` holds data and is never translated.', propsSchema: CardProps };

const TableProps = z
  .object({
    // A SPEC prop: the repeated structure of the screen, as data. `label` sits
    // two levels down, which is why the swap matches at any depth.
    columns: z.array(z.object({ label: z.string(), key: z.string() }).strict()),
    rows: z.array(z.record(z.string(), z.unknown())),
    empty: z.string().optional(),
  })
  .strict();

export const Table: NovaComponent<Partial<z.infer<typeof TableProps>>> = ({ columns, rows, empty }: Partial<z.infer<typeof TableProps>>) => {
  const cols = columns ?? [];
  const list = rows ?? [];
  if (list.length === 0) return <div style={{ ...shell, padding: 20, color: '#9ca3af', fontSize: 14 }}>{empty ?? ''}</div>;
  return (
    <table style={{ ...shell, borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
      <thead>
        <tr>
          {cols.map((column) => (
            <th key={column.key} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 600 }}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {list.map((row, i) => (
          <tr key={String(row['id'] ?? i)}>
            {cols.map((column) => (
              <td key={column.key} style={{ padding: '9px 10px', borderBottom: '1px solid #f3f4f6' }}>
                {String(row[column.key] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
Table.meta = { description: 'Rows against a column spec. Column labels are prose at depth 2; row values are data.', propsSchema: TableProps };

const ChipsProps = z
  .object({
    // An array of bare strings under a prose key: every element inherits the
    // key's proseness, so `['Yes','No']` translates without becoming objects.
    options: z.array(z.string()),
  })
  .strict();

export const Chips: NovaComponent<Partial<z.infer<typeof ChipsProps>>> = ({ options }: Partial<z.infer<typeof ChipsProps>>) => (
  <div style={{ display: 'flex', gap: 6 }}>
    {(options ?? []).map((option) => (
      <span key={option} style={{ ...shell, fontSize: 13, padding: '4px 11px', borderRadius: 999, background: '#f3f4f6', color: '#374151' }}>
        {option}
      </span>
    ))}
  </div>
);
Chips.meta = { description: 'A row of chips from a bare string array — the array inherits its key’s proseness.', propsSchema: ChipsProps };

const StatProps = z
  .object({
    label: z.string(),
    value: z.string().optional(),
    // A COUNTED phrase lands here: `{ phrase, slots }`, closed by the renderer.
    // `caption` is a default prose key, which is what makes it a pattern site.
    caption: z.string().optional(),
  })
  .strict();

export const Stat: NovaComponent<Partial<z.infer<typeof StatProps>>> = ({ label, value, caption }: Partial<z.infer<typeof StatProps>>) => (
  <div style={{ ...shell, border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', background: '#fff', minWidth: 150 }}>
    <div style={{ fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}</div>
    {value === undefined ? null : <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>{value}</div>}
    {caption === undefined ? null : <div style={{ fontSize: 14, color: '#4b5563', marginTop: 4 }}>{caption}</div>}
  </div>
);
Stat.meta = { description: 'A figure with a label and a caption. The caption is a prose key, so a counted phrase can land there.', propsSchema: StatProps };

export const LANGUAGE_KIT = { Card, Table, Chips, Stat };
