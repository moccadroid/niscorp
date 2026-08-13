import * as React from 'react';
import { z } from 'zod';
import { createPortal } from 'react-dom';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import { ALIGN, BG, JUSTIFY, RADIUS, bgToken, border, borderStyle, radiusToken } from '../lib/tokens';
import { Icon } from './display';
import { cx } from '../lib/cx';
import { displayText } from '../lib/display';
import { Avatar } from './display';

// The arrangement primitives. Domain-blind by construction: none of them can be
// given a colour that is not a token, and none of them knows what it contains.

const spacing = z.number().optional();

const BoxProps = z
  .object({
    pad: spacing,
    px: spacing,
    py: spacing,
    bg: bgToken,
    border,
    radius: radiusToken,
    grow: z.boolean().optional(),
    scroll: z.boolean().optional(),
    w: z.union([z.number(), z.string()]).optional(),
    h: z.union([z.number(), z.string()]).optional(),
    maxWidth: z.number().optional(),
    center: z.boolean().optional().describe('Centres the box horizontally within its parent'),
  })
  .strict();

type BoxP = z.infer<typeof BoxProps> & { children?: React.ReactNode };

export const Box: NovaComponent<z.infer<typeof BoxProps>> = ({ pad, px, py, bg, border: b, radius, grow, scroll, w, h, maxWidth, center, children }: BoxP) => (
  <div
    style={{
      ...(pad === undefined ? {} : { padding: pad }),
      ...(px === undefined ? {} : { paddingLeft: px, paddingRight: px }),
      ...(py === undefined ? {} : { paddingTop: py, paddingBottom: py }),
      ...(bg === undefined ? {} : { background: BG[bg] }),
      ...borderStyle(b),
      ...(radius === undefined ? {} : { borderRadius: RADIUS[radius] }),
      ...(grow === true ? { flex: 1, minHeight: 0 } : {}),
      ...(scroll === true ? { overflowY: 'auto' } : {}),
      ...(w === undefined ? {} : { width: w }),
      ...(h === undefined ? {} : { height: h }),
      ...(maxWidth === undefined ? {} : { maxWidth }),
      ...(center === true ? { marginLeft: 'auto', marginRight: 'auto', width: '100%' } : {}),
    }}
  >
    {children}
  </div>
);
Box.meta = { description: 'A block: padding, background, border, radius, size. The kit’s only container with no direction.', propsSchema: BoxProps };

const flexProps = {
  gap: spacing,
  pad: spacing,
  px: spacing,
  py: spacing,
  align: z.enum(['start', 'center', 'end', 'stretch', 'baseline']).optional(),
  justify: z.enum(['start', 'center', 'end', 'between', 'around']).optional(),
  wrap: z.boolean().optional(),
  grow: z.boolean().optional(),
  scroll: z.boolean().optional(),
  bg: bgToken,
  border,
  radius: radiusToken,
  maxWidth: z.number().optional(),
  h: z.union([z.number(), z.string()]).optional(),
  center: z.boolean().optional(),
};

const StackProps = z.object(flexProps).strict();
type StackP = z.infer<typeof StackProps> & { children?: React.ReactNode };

const flexStyle = (p: z.infer<typeof StackProps>, direction: 'row' | 'column'): React.CSSProperties => ({
  display: 'flex',
  flexDirection: direction,
  ...(p.gap === undefined ? {} : { gap: p.gap }),
  ...(p.pad === undefined ? {} : { padding: p.pad }),
  ...(p.px === undefined ? {} : { paddingLeft: p.px, paddingRight: p.px }),
  ...(p.py === undefined ? {} : { paddingTop: p.py, paddingBottom: p.py }),
  ...(p.align === undefined ? {} : { alignItems: ALIGN[p.align] }),
  ...(p.justify === undefined ? {} : { justifyContent: JUSTIFY[p.justify] }),
  ...(p.wrap === true || p.justify === 'between' ? { flexWrap: 'wrap', ...(p.gap === undefined ? { rowGap: 12 } : {}) } : {}),
  ...(p.grow === true ? { flex: 1, minHeight: 0, minWidth: 0 } : {}),
  ...(p.scroll === true ? { overflowY: 'auto' } : {}),
  ...(p.bg === undefined ? {} : { background: BG[p.bg] }),
  ...borderStyle(p.border),
  ...(p.radius === undefined ? {} : { borderRadius: RADIUS[p.radius] }),
  ...(p.maxWidth === undefined ? {} : { maxWidth: p.maxWidth, width: '100%' }),
  ...(p.h === undefined ? {} : { height: p.h, minHeight: 0 }),
  ...(p.center === true ? { marginLeft: 'auto', marginRight: 'auto' } : {}),
});

export const Stack: NovaComponent<z.infer<typeof StackProps>> = ({ children, ...p }: StackP) => <div style={flexStyle(p, 'column')}>{children}</div>;
Stack.meta = { description: 'Vertical flex. The default way to put things under each other.', propsSchema: StackProps };

export const Row: NovaComponent<z.infer<typeof StackProps>> = ({ children, ...p }: StackP) => <div style={flexStyle(p, 'row')}>{children}</div>;
Row.meta = { description: 'Horizontal flex. `justify: between` is how a label and its value sit on one line.', propsSchema: StackProps };

const GridProps = z
  .object({ cols: z.number().optional(), min: z.number().optional().describe('Minimum column width; the grid fits as many as will fit'), gap: spacing, pad: spacing })
  .strict();
type GridP = z.infer<typeof GridProps> & { children?: React.ReactNode };

export const Grid: NovaComponent<z.infer<typeof GridProps>> = ({ cols, min, gap, pad, children }: GridP) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: min !== undefined ? `repeat(auto-fill, minmax(${min}px, 1fr))` : `repeat(${cols ?? 2}, minmax(0, 1fr))`,
      ...(gap === undefined ? {} : { gap }),
      ...(pad === undefined ? {} : { padding: pad }),
    }}
  >
    {children}
  </div>
);
Grid.meta = { description: 'A grid. Give `min` for a responsive fit, or `cols` for a fixed count.', propsSchema: GridProps };

const SpacerProps = z.object({ size: z.number().optional() }).strict();
export const Spacer: NovaComponent<z.infer<typeof SpacerProps>> = ({ size }: z.infer<typeof SpacerProps>) => <div style={size === undefined ? { flex: 1 } : { height: size }} />;
Spacer.meta = { description: 'Empty space. Bare, it pushes siblings apart in a flex parent.', propsSchema: SpacerProps };

// ── the shell's own furniture ────────────────────────────────

const BarProps = z.object({ position: z.enum(['top', 'bottom']).optional() }).strict();
type BarP = Partial<z.infer<typeof BarProps>> & { children?: React.ReactNode };

/**
 * A bar that stays put while the surface scrolls under it.
 *
 * THE BOTTOM ONE IS PORTALLED, for the reason the scrim below already learned
 * the hard way: `position: fixed` resolves against the nearest ancestor with a
 * transform, and `.ly-slot` keeps an identity `matrix(1,0,0,1,0,0)` after its
 * entry animation (fill-mode `both`, a `from` keyframe that translates). So a
 * bar pinned to `bottom: 0` inside the chrome slot pinned itself to the bottom
 * of the CHROME — fifty-nine points tall, at the very top of the screen — and
 * the screenshot showed a thumb bar under the status bar.
 *
 * The rail does this, the sheet does this, the row menu does this. Anything
 * that means "relative to the window" has to leave the tree that is not.
 */
export const Bar: NovaComponent<Partial<z.infer<typeof BarProps>>> = ({ position = 'top', children }: BarP) => {
  const bar = <div className={cx('ly-bar', `ly-bar--${position}`)}>{children}</div>;
  return position === 'bottom' ? overlay(bar) : bar;
};
Bar.meta = { description: 'A fixed bar at the top or bottom of the frame. The bottom one is where a thumb is.', propsSchema: BarProps };

const SheetProps = z
  .object({
    open: z.boolean().optional(),
    title: z.string().optional(),
    depth: z.number().optional(),
  })
  .strict();
type SheetP = Partial<z.infer<typeof SheetProps>> & { children?: React.ReactNode; novaRef?: string };

/**
 * A panel over the surface: a bottom sheet on a phone, a side panel on a desk.
 *
 * A form is not a place you go, it is something you do to what is already on
 * screen — so it belongs over the screen rather than instead of it. Closed, it
 * renders nothing at all, which is what makes an empty canvas free.
 */
export const Sheet: NovaComponent<Partial<z.infer<typeof SheetProps>>> = ({ open, title, depth, children, novaRef }: SheetP) => {
  const dispatch = useNovaDispatch();
  // Two or more on the stack: this returns you to the one underneath.
  const back = (depth ?? 1) > 1;
  if (open === false) return null;
  const close = (): void => {
    if (novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef });
  };
  return overlay(
    <div className="ly-sheet-scrim" style={SCRIM} onClick={close} role="presentation">
      <div className="ly-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="ly-sheet__grip" />
        {/* A HEADER IN FLOW, not a button floated over the content.
         *
         * It was `position: absolute`, and the body renders after it in DOM
         * order — so the content painted over everything below the first few
         * pixels and only the top sliver of the button was clickable. The
         * circle and the hit area are now the same element, in the layout,
         * with nothing above it to steal the tap.
         *
         * Sticky, so it is still reachable after scrolling a long form. */}
        <div className="ly-sheet__head">
          <button type="button" className="ly-sheet__close" aria-label={back ? 'Back' : 'Close'} onClick={close}>
            {back ? '←' : '×'}
          </button>
          {title === undefined ? null : <span className="ly-sheet__title">{displayText(title)}</span>}
        </div>
        <div className="ly-sheet__body">{children}</div>
      </div>
    </div>,
  );
};
Sheet.meta = { description: 'A panel over the surface — a bottom sheet on a phone, a side panel on a desk.', propsSchema: SheetProps };

const WIDE = '(min-width: 860px)';

const useWide = (): boolean => {
  const [wide, setWide] = React.useState(() => (typeof window === 'undefined' ? false : window.matchMedia(WIDE).matches));
  React.useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = (): void => setWide(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
};

const overlay = (node: React.ReactNode): React.ReactNode =>
  typeof document === 'undefined' ? node : createPortal(node, document.body);

const SCRIM: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: 1000,
  display: 'flex',
  background: 'rgba(0, 0, 0, 0.38)',
};
const PANEL_LEFT: React.CSSProperties = { position: 'relative', height: '100%', maxWidth: '84vw', width: 320, overflowY: 'auto', background: 'var(--surface, #fff)' };

const DrawerProps = z.object({ open: z.boolean().optional(), title: z.string().optional() }).strict();
type DrawerP = Partial<z.infer<typeof DrawerProps>> & { children?: React.ReactNode; novaRef?: string };

/**
 * The navigation, in one place.
 *
 * Lyra had a tab bar at the bottom AND a strip of nine links at the top, which
 * is the same "collection of things" a flat nav was — split across two edges of
 * the screen instead of one. A phone gets ONE navigation surface. This is it:
 * closed it is a button, open it is every destination, grouped.
 */
export const Drawer: NovaComponent<Partial<z.infer<typeof DrawerProps>>> = ({ open, children, novaRef }: DrawerP) => {
  const dispatch = useNovaDispatch();
  const wide = useWide();
  if (wide) {
    return overlay(
      <nav className="ly-drawer ly-drawer--rail" aria-label="Navigation">
        {children}
      </nav>,
    );
  }
  if (open !== true) return null;
  const close = (): void => {
    if (novaRef !== undefined) dispatch({ type: 'ui:click', ref: novaRef });
  };
  return overlay(
    <div className="ly-drawer-scrim" style={SCRIM} onClick={close} role="presentation">
      <nav className="ly-drawer" style={PANEL_LEFT} onClick={(e) => e.stopPropagation()} aria-label="Navigation">
        {children}
      </nav>
    </div>,
  );
};
Drawer.meta = { description: 'The navigation panel. One surface, every destination, grouped.', propsSchema: DrawerProps };

const BurgerProps = z.object({ label: z.string().optional() }).strict();
export const Burger: NovaComponent<Partial<z.infer<typeof BurgerProps>>> = ({ label, novaRef }: Partial<z.infer<typeof BurgerProps>> & { novaRef?: string }) => {
  const dispatch = useNovaDispatch();
  return (
    <button type="button" className="ly-burger" aria-label={label ?? 'Menu'} onClick={() => novaRef !== undefined && dispatch({ type: 'ui:click', ref: novaRef })}>
      <span />
      <span />
      <span />
    </button>
  );
};
Burger.meta = { description: 'Opens the navigation. The one control that is always in the same place.', propsSchema: BurgerProps };

const DrawerGroupProps = z.object({ label: z.string() }).strict();
export const DrawerGroup: NovaComponent<Partial<z.infer<typeof DrawerGroupProps>>> = ({ label }: Partial<z.infer<typeof DrawerGroupProps>>) => (
  <div className="ly-drawer__group">{label}</div>
);
DrawerGroup.meta = { description: 'A heading in the drawer — the question a group of destinations answers.', propsSchema: DrawerGroupProps };

const DrawerLinkProps = z
  .object({
    label: z.string(),
    value: z.string().optional(),
    current: z.string().optional(),
    icon: z.string().optional(),
    payload: z.string().optional(),
    // A screen INSIDE the open area — indented, quieter, and marked with its
    // own current-state so an area and a screen can both be lit at once.
    sub: z.boolean().optional(),
  })
  .strict();
export const DrawerLink: NovaComponent<Partial<z.infer<typeof DrawerLinkProps>>> = ({ label, value, current, icon, payload, sub, novaRef }: Partial<z.infer<typeof DrawerLinkProps>> & { novaRef?: string }) => {
  const dispatch = useNovaDispatch();
  // Compared HERE, because a layout cannot compare — and a menu that does not
  // say where you already are makes you read all twelve entries to find out.
  const here = value !== undefined && value !== '' && value === current;
  return (
    <button
      type="button"
      aria-current={here ? 'page' : undefined}
      className={cx('ly-drawer__link', sub === true && 'ly-drawer__link--sub', here && 'ly-drawer__link--here')}
      onClick={() => novaRef !== undefined && dispatch({ type: 'ui:click', ref: novaRef, payload: payload ?? value ?? label })}
    >
      {icon === undefined || icon === '' ? null : <Icon name={icon} size={sub === true ? 15 : 17} />}
      {label}
    </button>
  );
};
DrawerLink.meta = { description: 'One destination in the drawer. Full width, thumb-sized.', propsSchema: DrawerLinkProps };

// ── the menu's own furniture ─────────────────────────────────

const DrawerHeaderProps = z.object({ name: z.string(), role: z.string().optional(), studio: z.string().optional() }).strict();

/**
 * Who you are and where you are, at the top of the menu.
 *
 * A drawer without one makes identity homeless: the previous version had the
 * person's name only in the top bar and "Sign out" floating at the end of a
 * list of destinations, as though signing out were a place to go.
 */
export const DrawerHeader: NovaComponent<Partial<z.infer<typeof DrawerHeaderProps>>> = ({ name, role, studio }: Partial<z.infer<typeof DrawerHeaderProps>>) => (
  <div className="ly-drawer__header">
    <Avatar name={name ?? ''} size={40} />
    <div style={{ minWidth: 0 }}>
      <div className="ly-drawer__name">{name}</div>
      <div className="ly-drawer__sub">
        {role}
        {role !== undefined && studio !== undefined ? ' · ' : ''}
        {studio}
      </div>
    </div>
  </div>
);
DrawerHeader.meta = { description: 'Who you are and which studio you are in — the top of the menu.', propsSchema: DrawerHeaderProps };

const DrawerFooterProps = z.object({ label: z.string() }).strict();
export const DrawerFooter: NovaComponent<Partial<z.infer<typeof DrawerFooterProps>>> = ({ label, novaRef }: Partial<z.infer<typeof DrawerFooterProps>> & { novaRef?: string }) => {
  const dispatch = useNovaDispatch();
  return (
    <div className="ly-drawer__footer">
      <button type="button" className="ly-drawer__link ly-drawer__link--quiet" onClick={() => novaRef !== undefined && dispatch({ type: 'ui:click', ref: novaRef })}>
        {label}
      </button>
    </div>
  );
};
DrawerFooter.meta = { description: 'The way out, kept below everything and visually quiet.', propsSchema: DrawerFooterProps };
