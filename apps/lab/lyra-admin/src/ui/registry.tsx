import { createComponentRegistry } from '@niscorp/nova';
import { Fragment, useState } from 'react';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { CanvasSlot, ActionSlot } from '@niscorp/nova/adapters/react/components';

type Props = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

const Stack: NovaComponent<Props> = ({ children, gap }: Props & { children?: unknown }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: typeof gap === 'number' ? gap : 12 }}>{children as never}</div>
);

const Row: NovaComponent<Props> = ({ children, gap, align }: Props & { children?: unknown }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: align === 'end' ? 'flex-end' : 'center', gap: typeof gap === 'number' ? gap : 10 }}>
    {children as never}
  </div>
);

const Hero: NovaComponent<Props> = ({ title, lead }: Props) => (
  <div>
    <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 600 }}>{str(title)}</h1>
    {lead === undefined ? null : <p style={{ margin: 0, color: '#555' }}>{str(lead)}</p>}
  </div>
);

const Section: NovaComponent<Props> = ({ title, subtitle, children }: Props & { children?: unknown }) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{str(title)}</h2>
    {subtitle === undefined ? null : <p style={{ margin: 0, fontSize: 13, color: '#666' }}>{str(subtitle)}</p>}
    {children as never}
  </section>
);

const Card: NovaComponent<Props> = ({ children, pad }: Props & { children?: unknown }) => (
  <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: typeof pad === 'number' ? pad : 12, background: '#fff' }}>
    {children as never}
  </div>
);

const Text: NovaComponent<Props> = ({ children, color }: Props & { children?: unknown }) => (
  <span style={{ fontSize: 13, color: color === 'mute' ? '#666' : '#111' }}>{children as never}</span>
);

const messageOf = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const shape = value as { message?: unknown; error?: unknown; reasons?: unknown };
    if (typeof shape.message === 'string') return shape.message;
    if (typeof shape.error === 'string') return shape.error;
    if (Array.isArray(shape.reasons)) return shape.reasons.join('; ');
    return JSON.stringify(value);
  }
  return String(value);
};

const Notice: NovaComponent<Props> = ({ message, tone }: Props) => {
  const text = messageOf(message);
  if (text === '') return null;
  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: 4,
        border: `1px solid ${tone === 'alert' ? '#c33' : '#aaa'}`,
        color: tone === 'alert' ? '#900' : '#222',
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
};

// Reveal is React state, not shell state: whether the secret is on screen must
// not survive a reload or travel the socket.
const Secret: NovaComponent<Props> = ({ value, label }: Props) => {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const secret = str(value);
  if (secret === '') return null;
  const copy = (): void => {
    void navigator.clipboard?.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ border: '1px solid #b45309', borderRadius: 6, background: '#fffbeb', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {str(label) || 'Integration key — shown now, and never again'}
      </div>
      <div style={{ fontSize: 12.5, color: '#78350f' }}>
        Put it in the service&apos;s environment. Lyra keeps only a hash — there is no way to see this value again, only to re-register.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <code
          style={{
            fontSize: 12.5,
            padding: '6px 10px',
            background: '#fff',
            border: '1px solid #e5d9b8',
            borderRadius: 4,
            flex: '1 1 auto',
            overflowWrap: 'anywhere',
            userSelect: revealed ? 'all' : 'none',
          }}
        >
          {revealed ? secret : `${secret.slice(0, 3)}${'•'.repeat(32)}`}
        </code>
        <button type="button" onClick={() => setRevealed((r) => !r)} style={{ padding: '5px 10px', fontSize: 12.5, cursor: 'pointer' }}>
          {revealed ? 'Hide' : 'Reveal'}
        </button>
        <button type="button" onClick={copy} style={{ padding: '5px 10px', fontSize: 12.5, cursor: 'pointer' }}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

const Button: NovaComponent<Props> = ({ label, novaRef }: Props) => {
  const dispatch = useNovaDispatch();
  return (
  <button
    type="button"
    onClick={() => dispatch({ type: 'ui:click', ref: novaRef as string })}
    style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}
  >
    {str(label)}
  </button>
  );
};

const Input: NovaComponent<Props> = ({ label, placeholder, secret, novaRef, novaModel, value }: Props & { novaModel?: { ref?: string } }) => {
  const dispatch = useNovaDispatch();
  const ref = (novaModel?.ref ?? novaRef) as string;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: '#555' }}>
      {str(label)}
      <input
        type={secret === true ? 'password' : 'text'}
        placeholder={str(placeholder)}
        defaultValue={str(value)}
        onChange={(e) => dispatch({ type: 'ui:model', ref, payload: e.target.value })}
        style={{ padding: '6px 8px', fontSize: 13, minWidth: 260 }}
      />
    </label>
  );
};

type Column = { label?: string; cell?: { kind?: string; key?: string; label?: string; ref?: string; showKey?: string; hideKey?: string } };

const Rows: NovaComponent<Props> = ({ rows, columns, empty, rowKey }: Props) => {
  const dispatch = useNovaDispatch();
  const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  const cols = Array.isArray(columns) ? (columns as Column[]) : [];
  if (list.length === 0) return <div style={{ padding: 10, color: '#777', fontSize: 13 }}>{str(empty) || 'Nothing here.'}</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          {cols.map((c, i) => (
            <th key={i} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #ddd', fontWeight: 600, color: '#666' }}>
              {c.label ?? ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {list.map((row, r) => (
          <tr key={str(row[str(rowKey)]) || r}>
            {cols.map((c, i) => {
              const cell = c.cell ?? {};
              if (cell.kind === 'action') {
                const hidden =
                  (cell.showKey !== undefined && row[cell.showKey] !== true) ||
                  (cell.hideKey !== undefined && row[cell.hideKey] === true);
                return (
                  <td key={i} style={{ padding: 6, borderBottom: '1px solid #eee' }}>
                    {hidden ? null : (
                      <button type="button" onClick={() => dispatch({ type: 'ui:click', ref: cell.ref as string, payload: row })} style={{ fontSize: 12 }}>
                        {cell.label ?? 'Go'}
                      </button>
                    )}
                  </td>
                );
              }
              return (
                <td key={i} style={{ padding: 6, borderBottom: '1px solid #eee' }}>
                  {str(row[cell.key ?? ''])}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};


type Fact = { label?: string; value?: string };
type Scope = { label?: string; state?: string };
type CardAction = { label?: string; ref?: string; showKey?: string; hideKey?: string };

const STATE_COLOUR: Record<string, string> = {
  granted: '#1a7f37',
  requested: '#9a6700',
  removed: '#666',
  approved: '#1a7f37',
  pending: '#9a6700',
  failed: '#b91c1c',
};

const Cards: NovaComponent<Props> = ({ rows, empty, titleKey, subtitleKey, badgeKey, problemKey, factsKey, scopesKey, scopesLabel, actions }: Props) => {
  const dispatch = useNovaDispatch();
  const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  const buttons = Array.isArray(actions) ? (actions as CardAction[]) : [];
  if (list.length === 0) return <div style={{ padding: 14, color: '#777' }}>{str(empty) || 'Nothing here.'}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {list.map((row, i) => {
        const facts = Array.isArray(row[str(factsKey)]) ? (row[str(factsKey)] as Fact[]) : [];
        const scopes = Array.isArray(row[str(scopesKey)]) ? (row[str(scopesKey)] as Scope[]) : [];
        const badge = str(row[str(badgeKey)]);
        return (
          <div key={i} style={{ border: '1px solid #ddd', borderRadius: 6, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 16px', borderBottom: '1px solid #eee' }}>
              <strong style={{ fontSize: 15 }}>{str(row[str(titleKey)])}</strong>
              {badge === '' ? null : (
                <span style={{ fontSize: 12, fontWeight: 600, color: STATE_COLOUR[badge.toLowerCase()] ?? '#444' }}>{badge}</span>
              )}
              <code style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>{str(row[str(subtitleKey)])}</code>
            </div>

            {/* THE ROW'S OWN PROBLEM, on the row. A failure that is recorded
                against an integration belongs beside it and stays there —
                unlike a banner at the top of the page, which says the same
                sentence a second time and disappears on the next click. */}
            {str(row[str(problemKey)]) === '' ? null : (
              <div style={{ padding: '8px 16px', background: '#fdf2f2', borderBottom: '1px solid #f2dede', fontSize: 12.5, color: '#900' }}>
                {str(row[str(problemKey)])}
              </div>
            )}

            {facts.length === 0 ? null : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: '10px 16px', borderBottom: '1px solid #f2f2f2' }}>
                {facts.map((fact, j) => (
                  <div key={j}>
                    <div style={{ fontSize: 11, color: '#777', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{fact.label}</div>
                    <div style={{ fontSize: 13 }}>{fact.value}</div>
                  </div>
                ))}
              </div>
            )}

            {scopes.length === 0 ? null : (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f2f2f2' }}>
                <div style={{ fontSize: 11, color: '#777', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  {str(scopesLabel) || 'Scopes'}
                </div>
                {/* A LIST, NOT A COMMA-SEPARATED STRING. Three scopes fit in a
                    sentence; twelve do not, and the one that changed on the last
                    import is the one somebody is looking for. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'max-content max-content', columnGap: 16, rowGap: 3 }}>
                  {scopes.map((scope, j) => (
                    <Fragment key={j}>
                      <code style={{ fontSize: 12.5 }}>{scope.label}</code>
                      <span style={{ fontSize: 12, color: STATE_COLOUR[String(scope.state)] ?? '#666' }}>{scope.state}</span>
                    </Fragment>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, padding: '10px 16px' }}>
              {buttons.map((action, j) => {
                const hidden =
                  (action.showKey !== undefined && row[action.showKey] !== true) ||
                  (action.hideKey !== undefined && row[action.hideKey] === true);
                if (hidden) return null;
                return (
                  <button
                    key={j}
                    type="button"
                    onClick={() => dispatch({ type: 'ui:click', ref: action.ref as string, payload: row })}
                    style={{ padding: '5px 10px', fontSize: 12.5, cursor: 'pointer' }}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const PRIMITIVES = { Stack, Row, Hero, Section, Card, Text, Notice, Button, Input, Rows, Cards, Secret };

export const buildAdminRegistry = (): ReturnType<typeof createComponentRegistry<NovaComponent>> => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll({ CanvasSlot, ActionSlot });
  registry.registerAll(PRIMITIVES);
  return registry;
};

export const ADMIN_COMPONENT_NAMES: string[] = [...Object.keys(PRIMITIVES), 'CanvasSlot', 'ActionSlot'];
