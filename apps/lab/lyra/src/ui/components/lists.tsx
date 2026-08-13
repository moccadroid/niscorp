import { z } from 'zod';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { COLOR, HUE, SIZE, TONE, WEIGHT, hueOf, hueToken, toneToken } from '../lib/tokens';
import { Badge, Icon } from './display';
import { Empty } from './feedback';
import { cx } from '../lib/cx';
import { fillPhrase } from '../lib/phrase';

type Row = Record<string, unknown>;
const str = (row: Row, key: string | undefined): string => {
  if (key === undefined) return '';
  // Counted phrases reach an untranslated session as `{ phrase, slots }` —
  // the kit fills them; see ../lib/phrase.ts.
  const v = fillPhrase(row[key]);
  return v === undefined || v === null ? '' : String(v);
};

// ── LINKS ────────────────────────────────────────────────────

const LinkItemSchema = z
  .object({
    value: z.string().optional(),
    action: z.string().optional(),
    label: z.string(),
    blurb: z.string().optional(),
    icon: z.string().optional(),
    badge: z.string().optional(),
    hue: z.string().optional(),
  })
  .loose();

const LinksProps = z
  .object({
    items: z.array(LinkItemSchema).optional(),
    ref: z.string().optional(),
    empty: z.string().optional(),
    emptyHint: z.string().optional(),
    emptyIcon: z.string().optional(),
    loading: z.boolean().optional(),
    density: z.enum(['comfortable', 'compact']).optional(),
  })
  .strict();

export const Links: NovaComponent<Partial<z.infer<typeof LinksProps>>> = ({ items, empty, emptyHint, emptyIcon, loading, density, novaRef }: Partial<z.infer<typeof LinksProps>> & { novaRef?: string }) => {
  const dispatch = useNovaDispatch();
  const list = Array.isArray(items) ? (items as Row[]) : [];
  if (loading === true) return null;
  if (list.length === 0) return <Empty title={empty ?? 'Nothing here.'} hint={emptyHint} icon={emptyIcon} />;
  const pad = density === 'compact' ? '10px 14px' : '13px 16px';
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {list.map((item, i) => {
        const payload = { ...item, action: str(item, 'action') || str(item, 'value') };
        const blurb = str(item, 'blurb');
        const icon = str(item, 'icon');
        const badge = str(item, 'badge');
        return (
          <div
            key={str(item, 'value') || str(item, 'action') || String(i)}
            className={cx('ly-row-item', novaRef !== undefined && 'ly-row-item--clickable')}
            role={novaRef === undefined ? undefined : 'button'}
            tabIndex={novaRef === undefined ? undefined : 0}
            onClick={novaRef === undefined ? undefined : () => dispatch({ type: 'ui:click', ref: novaRef, payload })}
            onKeyDown={
              novaRef === undefined
                ? undefined
                : (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      dispatch({ type: 'ui:click', ref: novaRef, payload });
                    }
                  }
            }
            style={{
              display: 'flex',
              alignItems: blurb === '' ? 'center' : 'flex-start',
              gap: 13,
              padding: pad,
              minHeight: 44,
              ...(i === 0 ? {} : { borderTop: '1px solid var(--line)' }),
            }}
          >
            {icon === '' ? null : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-sunk)',
                  color: str(item, 'hue') === '' ? 'var(--ink-soft)' : `var(--hue-${str(item, 'hue')})`,
                  marginTop: blurb === '' ? 0 : -1,
                }}
              >
                <Icon name={icon} size={17} />
              </span>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 auto' }}>
              <span style={{ fontSize: SIZE['md'], fontWeight: WEIGHT['medium'], color: COLOR['ink'] }}>{str(item, 'label')}</span>
              {/* IT WRAPS AT A MEASURE. This is the sentence that made a hub
                  row look broken: a full explanation set as a table subtitle,
                  running the width of a desktop or clipping at an ellipsis. */}
              {blurb === '' ? null : (
                <span style={{ fontSize: SIZE['sm'], color: COLOR['mute'], lineHeight: 1.5, maxWidth: '68ch' }}>{blurb}</span>
              )}
            </div>
            {badge === '' ? null : <Badge label={badge} tone="neutral" />}
            {novaRef === undefined ? null : (
              <span style={{ color: 'var(--ink-faint)', marginTop: blurb === '' ? 0 : 3, flexShrink: 0 }}>
                <Icon name="chevronRight" size={17} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
Links.meta = { description: 'A navigation list: icon, title, a sentence that wraps, and a chevron. For menus and choosers — not a table.', propsSchema: LinksProps };

// ── CARDS ────────────────────────────────────────────────────

const CardActionSchema = z.object({ label: z.string(), ref: z.string(), variant: z.string().optional(), showKey: z.string().optional(), hideKey: z.string().optional(), icon: z.string().optional() }).loose();

const CardsProps = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())).optional(),
    rowKey: z.string(),
    titleKey: z.string(),
    subtitleKey: z.string().optional(),
    bodyKey: z.string().optional(),
    badgeKey: z.string().optional(),
    badgeToneKey: z.string().optional(),
    iconKey: z.string().optional(),
    icon: z.string().optional(),
    factsKey: z.string().optional().describe('Row key holding [{label, value}] — rendered as a fact row'),
    actions: z.array(CardActionSchema).optional(),
    empty: z.string().optional(),
    emptyHint: z.string().optional(),
    emptyIcon: z.string().optional(),
    loading: z.boolean().optional(),
    columns: z.number().optional().describe('Minimum card width in px for the auto-fill grid; omit for one column'),
  })
  .strict();

type Fact = { label?: string; value?: string };

export const Cards: NovaComponent<Partial<z.infer<typeof CardsProps>>> = ({
  rows,
  rowKey,
  titleKey,
  subtitleKey,
  bodyKey,
  badgeKey,
  badgeToneKey,
  iconKey,
  icon,
  factsKey,
  actions,
  empty,
  emptyHint,
  emptyIcon,
  loading,
  columns,
}: Partial<z.infer<typeof CardsProps>>) => {
  const dispatch = useNovaDispatch();
  const list = Array.isArray(rows) ? (rows as Row[]) : [];
  const verbs = Array.isArray(actions) ? actions : [];
  if (loading === true) return null;
  if (list.length === 0) return <Empty title={empty ?? 'Nothing here.'} hint={emptyHint} icon={emptyIcon} />;

  return (
    <div
      style={
        columns === undefined
          ? { display: 'flex', flexDirection: 'column', gap: 12 }
          : { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${columns}px, 1fr))`, gap: 12 }
      }
    >
      {list.map((row, i) => {
        const facts = Array.isArray(row[String(factsKey)]) ? (row[String(factsKey)] as Fact[]) : [];
        const badge = str(row, badgeKey);
        const badgeTone = str(row, badgeToneKey);
        const glyph = str(row, iconKey) || icon || '';
        const body = str(row, bodyKey);
        const shown = verbs.filter((a) => {
          if (a.showKey !== undefined && row[a.showKey] !== true) return false;
          if (a.hideKey !== undefined && row[a.hideKey] === true) return false;
          return true;
        });
        return (
          <div
            key={str(row, rowKey) || String(i)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: 18,
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface)',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, minWidth: 0 }}>
              {glyph === '' ? null : (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 38,
                    height: 38,
                    flexShrink: 0,
                    borderRadius: 'var(--radius-sm)',
                    background: HUE[hueOf(str(row, titleKey))]?.bg,
                    color: HUE[hueOf(str(row, titleKey))]?.fg,
                  }}
                >
                  <Icon name={glyph} size={19} />
                </span>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 auto' }}>
                <span style={{ fontSize: SIZE['lg'], fontWeight: WEIGHT['semi'], color: COLOR['ink'], letterSpacing: '-0.01em' }}>{str(row, titleKey)}</span>
                {subtitleKey === undefined || str(row, subtitleKey) === '' ? null : (
                  <span style={{ fontSize: SIZE['sm'], color: COLOR['mute'] }}>{str(row, subtitleKey)}</span>
                )}
              </div>
              {badge === '' ? null : <Badge label={badge} tone={(TONE[badgeTone] !== undefined ? badgeTone : 'neutral') as never} />}
            </div>

            {body === '' ? null : (
              <p style={{ margin: 0, fontSize: SIZE['sm'], color: COLOR['soft'], lineHeight: 1.6, maxWidth: '68ch' }}>{body}</p>
            )}

            {facts.length === 0 ? null : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                {facts.map((fact, j) => (
                  <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <span style={{ fontSize: SIZE['xs'], color: COLOR['mute'], textTransform: 'uppercase', letterSpacing: '0.05em' }}>{fact.label}</span>
                    <span style={{ fontSize: SIZE['sm'], color: COLOR['ink'] }}>{fact.value}</span>
                  </div>
                ))}
              </div>
            )}

            {shown.length === 0 ? null : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {shown.map((action, j) => (
                  <button
                    key={j}
                    type="button"
                    className={cx('ly-btn', `ly-btn--${action.variant ?? 'outline'}`)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: SIZE['sm'] }}
                    onClick={() => dispatch({ type: 'ui:click', ref: action.ref, payload: row })}
                  >
                    {action.icon === undefined ? null : <Icon name={action.icon} size={14} />}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
Cards.meta = { description: 'One card per record: title, tagline, prose, facts and verbs. For objects worth a paragraph — a store, a plan, a programme.', propsSchema: CardsProps };
