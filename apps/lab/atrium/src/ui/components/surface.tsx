import type { ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { cx } from '../lib/cx';
import { SIZE, TONE } from '../lib/tokens';
import { Icon } from './display';

// Surfaces — the shapes content sits in. Still domain-blind: `Tile` renders a
// title, a blurb, a glyph and a live flag. That those happen to be resolved
// capability slots is the caller's business, and the component cannot tell.

// A card is a panel with ONE padding, decided here. There used to be a `pad`
// prop, and across twenty-six uses it took nine different values — 0, 13, 15, 16,
// 18, 22, 24, 26 — none of them for a reason anybody could name, because a layout
// author reaching for a number has no way to know what the other twenty-five
// chose. Every surface then looked slightly wrong next to every other one.
//
// Padding is not information about the content, so a layout has no business
// carrying it. The only variant left is `sunk`, which is a KIND of surface (a
// quote, an inset panel) rather than a measurement, and it gets its own tighter
// padding for the same reason: one decision, in one place.
const PAD = 18;
const PAD_SUNK = 14;

const CardProps = z.object({ sunk: z.boolean().optional() }).strict();

export const Card: NovaComponent<z.infer<typeof CardProps>> = ({ sunk, children }) => (
  <div
    className="at-card"
    style={{ padding: sunk === true ? PAD_SUNK : PAD, ...(sunk === true ? { background: 'var(--surface-sunk)', boxShadow: 'none' } : {}) }}
  >
    {children}
  </div>
);
Card.meta = { description: 'A panel on the ground. Its padding is fixed — every card in the application is inset the same. `sunk` is an inset panel within one.', propsSchema: CardProps };

const SectionProps = z.object({ title: z.string().optional(), hint: z.string().optional(), gap: z.number().optional() }).strict();

export const Section: NovaComponent<z.infer<typeof SectionProps>> = ({ title, hint, gap = 12, children }) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap }}>
    {title !== undefined ? (
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: SIZE['xs'], textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 650, color: 'var(--ink-faint)' }}>{title}</span>
        {hint !== undefined && hint !== '' ? <span style={{ fontSize: SIZE['sm'], color: 'var(--ink-mute)' }}>{hint}</span> : null}
      </div>
    ) : null}
    {children}
  </section>
);
Section.meta = { description: 'A titled group. The title is a small caps label, not a heading.', propsSchema: SectionProps };

const HeroProps = z.object({ eyebrow: z.string().optional(), title: z.string().optional(), subtitle: z.string().optional() }).strict();

export const Hero: NovaComponent<z.infer<typeof HeroProps>> = ({ eyebrow, title, subtitle, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {eyebrow !== undefined && eyebrow !== '' ? <span style={{ fontSize: SIZE['xs'], textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 650, color: 'var(--accent)' }}>{eyebrow}</span> : null}
    {title !== undefined ? <span style={{ fontFamily: 'var(--serif)', fontSize: SIZE['display'], lineHeight: 1.08, letterSpacing: '-0.015em' }}>{title}</span> : null}
    {subtitle !== undefined && subtitle !== '' ? <span style={{ color: 'var(--ink-mute)', fontSize: SIZE['lg'] }}>{subtitle}</span> : null}
    {children}
  </div>
);
Hero.meta = { description: 'The opening block of a surface: eyebrow, display title, subtitle.', propsSchema: HeroProps };

// A placed slot. `live: false` renders the reason instead of a target — which is
// only ever used by the ops and vendor views, because a guest's shell is built
// from LIVE rows and a dark slot never reaches it at all.
const TileProps = z
  .object({
    title: z.string(),
    blurb: z.string().optional(),
    icon: z.string().optional(),
    live: z.boolean().optional(),
    reason: z.string().optional().describe('Shown in place of the target when live is false.'),
    // The current CHOICE, visible: a picker's selected tile wears the accent.
    // The layout decides equality; the tile only wears the state.
    active: z.boolean().optional(),
    value: z.unknown().optional(),
  })
  .strict();

type TileP = z.infer<typeof TileProps> & { novaRef?: string };

export const Tile: NovaComponent<z.infer<typeof TileProps>> = ({ title, blurb, icon, live = true, reason, active = false, value, novaRef }: TileP) => {
  const dispatch = useNovaDispatch();
  const dark = live === false;
  return (
    <button
      type="button"
      disabled={dark}
      className={cx('at-tile', dark && 'at-tile--dark', active && !dark && 'at-tile--active', !dark && 'at-appear')}
      onClick={() => {
        if (!dark && novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef, payload: value });
      }}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}
    >
      {icon !== undefined ? (
        <span style={{ width: 38, height: 38, borderRadius: 11, background: dark ? 'var(--line-soft)' : 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={icon} size={19} color={dark ? 'faint' : 'accent'} />
        </span>
      ) : null}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{title}</span>
        {dark ? <span style={{ fontSize: SIZE['sm'], color: 'var(--ink-faint)' }}>{reason ?? 'Not available here'}</span> : blurb !== undefined ? <span style={{ fontSize: SIZE['sm'], color: 'var(--ink-mute)' }}>{blurb}</span> : null}
      </span>
      {active && !dark ? <Icon name="check" size={16} color="accent" /> : null}
    </button>
  );
};
Tile.meta = { description: 'A tappable tile with a glyph, a title and a blurb. `active: true` wears the selected accent; `live: false` shows the reason and cannot be pressed.', propsSchema: TileProps };

const BubbleProps = z.object({ mine: z.boolean().optional(), stamp: z.string().optional(), label: z.string().optional().describe('A small caption above the bubble — who is speaking, when it is not obvious.') }).strict();

export const Bubble: NovaComponent<z.infer<typeof BubbleProps>> = ({ mine, stamp, label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: mine === true ? 'flex-end' : 'flex-start' }}>
    {label !== undefined && label !== '' ? <span style={{ fontSize: SIZE['xs'], color: 'var(--ink-faint)', padding: '0 6px' }}>{label}</span> : null}
    <div className={cx('at-bubble', mine === true ? 'at-bubble--me' : 'at-bubble--them')}>{children}</div>
    {stamp !== undefined && stamp !== '' ? <span style={{ fontSize: SIZE['xs'], color: 'var(--ink-faint)', padding: '0 6px' }}>{stamp}</span> : null}
  </div>
);
Bubble.meta = { description: 'One line of a thread. `mine` flips the side and the colour; `label` captions the speaker.', propsSchema: BubbleProps };

const SheetProps = z.object({ title: z.string().optional(), closeRef: z.string().optional() }).strict();

type SheetP = z.infer<typeof SheetProps> & { novaRef?: string; children?: ReactNode };

// The overlay an action lands on when it is pushed onto the sheet canvas. On a
// phone it rises from the bottom; on a desk it centres. One component, because
// the difference is CSS, not a second implementation.
export const Sheet: NovaComponent<z.infer<typeof SheetProps>> = ({ title, closeRef, children }: SheetP) => {
  const dispatch = useNovaDispatch();
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(31,29,26,.34)', backdropFilter: 'blur(2px)' }} onClick={() => closeRef !== undefined && dispatch({ type: 'ui:click', ref: closeRef })} />
      <div
        className="at-appear"
        style={{ position: 'relative', background: 'var(--surface)', width: '100%', maxWidth: 560, maxHeight: '88vh', borderTopLeftRadius: 22, borderTopRightRadius: 22, boxShadow: 'var(--shadow-lift)', display: 'flex', flexDirection: 'column', margin: '0 auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '1px solid var(--line-soft)' }}>
          <span style={{ fontFamily: 'var(--serif)', fontSize: SIZE['xl'] }}>{title ?? ''}</span>
          {closeRef !== undefined ? (
            <button type="button" onClick={() => dispatch({ type: 'ui:click', ref: closeRef })} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' }} aria-label="Close">
              <Icon name="close" size={18} color="mute" />
            </button>
          ) : null}
        </div>
        <div className="at-scroll" style={{ padding: 20, flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
};
Sheet.meta = { description: 'The overlay frame an action is composed with when it is pushed onto the sheet canvas.', propsSchema: SheetProps };

const NoticeProps = z.object({ tone: z.string().optional(), icon: z.string().optional(), title: z.string().optional() }).strict();

export const Notice: NovaComponent<z.infer<typeof NoticeProps>> = ({ tone = 'accent', icon, title, children }) => {
  const t = TONE[tone] ?? TONE['accent']!;
  return (
    <div className="at-appear" style={{ display: 'flex', gap: 11, padding: '13px 15px', background: t.bg, borderRadius: 'var(--radius-sm)', color: t.fg }}>
      {icon !== undefined ? <Icon name={icon} size={18} color={tone === 'alert' ? 'alert' : tone === 'warn' ? 'warn' : 'accent'} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {title !== undefined ? <span style={{ fontWeight: 620 }}>{title}</span> : null}
        <span style={{ fontSize: SIZE['sm'], lineHeight: 1.45 }}>{children}</span>
      </div>
    </div>
  );
};
Notice.meta = { description: 'A toned message block — a confirmation, a caution, a refusal.', propsSchema: NoticeProps };
