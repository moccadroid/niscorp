import { createComponentRegistry } from '@niscorp/nova';
import { Fragment, useState } from 'react';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { CanvasSlot, ActionSlot } from '@niscorp/nova/adapters/react/components';

// THE TOOL'S OWN COMPONENTS, AND THEY ARE DELIBERATELY PLAIN.
//
// This does not import Lyra's kit and does not want to. Nobody buys this tool,
// nobody looks at it who is not us, and it needs to be legible rather than
// designed. A dozen unstyled elements is the correct amount of effort.
//
// The alternative — extracting Lyra's kit into a shared package so the admin
// could reuse it — was the reason this thing spent a day living as a strip
// injected into Lyra's page. That was a shortcut to borrow components, and it
// put operator credentials in a tenant's browsing context to save writing the
// file below.

type Props = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

const Stack: NovaComponent<Props> = ({ children, gap }: Props & { children?: unknown }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: typeof gap === 'number' ? gap : 12 }}>{children as never}</div>
);

// `align: 'end'` bottom-aligns — the register row needs it, because an Input is
// a label ABOVE a field and a Button is just a button: centred between the two,
// the button floats. Bottom edges are the ones that line up.
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

// A NOTICE WITH NOTHING IN IT IS WORSE THAN NO NOTICE.
//
// `errorTarget` writes whatever the runtime caught — an object, usually, not a
// string. Binding `message` straight to it rendered an empty red box: a border
// saying something went wrong and refusing to say what.
//
// So this digs a sentence out of whatever it is handed, and renders NOTHING
// when there is no sentence to show.
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

// THE ONE-TIME CREDENTIAL BLOCK. Renders nothing without a value, and when
// there is one it looks like what it is: the most important thing on the page
// for the next thirty seconds and gone forever after.
//
// Masked by default — reveal is a LOCAL decision (React state, not shell
// state): whether a secret is on the glass is a property of this screen right
// now, not of the durable shell, and it must not survive a reload or travel a
// socket. Copy works while masked, which is the path that never puts the value
// on a screen at all.
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
        // A CREDENTIAL FIELD IS A PASSWORD FIELD. Not decoration: it keeps the
        // value off the screen, out of a screenshot, and out of the browser's
        // form history.
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


// ── ONE CARD PER RECORD ──────────────────────────────────────
//
// The screen this replaces was laid out by WIDGET: a notice box, a form, a
// table of states, and a second table of permissions — four boxes, all about
// the same integration, and eight boxes as soon as there were two of them.
//
// Everything about one record belongs in one place. This takes a list and
// renders a block each: a heading, a row of facts, a list of scopes with a
// state, and the buttons that act on it.
//
// Generic on purpose — it names keys, not integrations — but no more general
// than this tool needs.
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
