import { z } from 'zod';
import type { Shell } from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { Callout, INK, MONO } from '@showroom/chrome/stage/ui';
import { Device, type DeviceSize } from '../../stage/device';
import { LOCALES } from './books';

const shell: React.CSSProperties = { fontFamily: 'system-ui, sans-serif', color: '#1f2937' };

export const LocaleBar = ({ shell: target, at, onPick }: { shell?: Shell; at: string; onPick?: (tag: string) => void }) => (
  <PickBar label="Reading in" options={LOCALES.map((locale) => ({ id: locale.tag, label: locale.label }))} at={at} onPick={(tag) => {
    target?.setPhrases(LOCALES.find((locale) => locale.tag === tag)?.book);
    onPick?.(tag);
  }} />
);

export const PickBar = ({ label, options, at, onPick, mono = false }: { label: string; options: readonly { id: string; label: string }[]; at: string; onPick: (id: string) => void; mono?: boolean }) => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
    <span style={{ fontSize: 12, color: INK.soft, marginRight: 4 }}>{label}</span>
    {options.map((option) => {
      const on = at === option.id;
      return (
        <button
          key={option.id}
          type="button"
          onClick={() => onPick(option.id)}
          style={{
            font: 'inherit',
            fontFamily: mono ? MONO : 'inherit',
            fontSize: 12.5,
            fontWeight: 650,
            padding: '4px 12px',
            borderRadius: 999,
            cursor: 'pointer',
            border: `1px solid ${on ? '#c7d2fe' : INK.line}`,
            background: on ? INK.accentWash : '#ffffff',
            color: on ? INK.accent : INK.soft,
          }}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export const Aside = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 620 }}>
    <Callout tone="accent" title="What to watch">
      {children}
    </Callout>
  </div>
);

export const LanguageStage = ({ bar, size = 'phone', status, aside, children }: { bar?: React.ReactNode; size?: DeviceSize; status?: string; aside?: React.ReactNode; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%' }}>
    {bar}
    <Device size={size} status={status ?? 'Acme Studio · front desk'} minHeight={240}>
      {children}
    </Device>
    {aside}
  </div>
);

const CardProps = z
  .object({
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
