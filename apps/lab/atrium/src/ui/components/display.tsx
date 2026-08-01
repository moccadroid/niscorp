import type { CSSProperties } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { COLOR, SIZE, TONE } from '../lib/tokens';

// Display primitives. Text, chips, stats, icons, rules — all domain-blind.

// Semantic token, not a raw CSS value — the same rule as ALIGN and COLOR.
const TEXT_ALIGN: Record<string, CSSProperties['textAlign']> = { left: 'left', center: 'center', right: 'right' };

const TextProps = z
  .object({
    size: z.string().optional().describe('xs sm md lg xl xxl display'),
    weight: z.number().optional(),
    color: z.string().optional().describe('ink soft mute faint accent warn alert good invert'),
    serif: z.boolean().optional().describe('The display face. Headings and numbers a guest reads, not interface labels.'),
    caps: z.boolean().optional(),
    italic: z.boolean().optional(),
    lines: z.number().optional().describe('Clamp to N lines with an ellipsis.'),
    align: z.string().optional(),
    as: z.string().optional(),
  })
  .strict();

export const Text: NovaComponent<z.infer<typeof TextProps>> = ({ size, weight, color, serif, caps, italic, lines, align, children }) => {
  const style: CSSProperties = {
    fontSize: size !== undefined ? SIZE[size] : undefined,
    fontWeight: weight,
    color: color !== undefined ? COLOR[color] : undefined,
    fontFamily: serif === true ? 'var(--serif)' : undefined,
    textTransform: caps === true ? 'uppercase' : undefined,
    letterSpacing: caps === true ? '0.07em' : undefined,
    fontStyle: italic === true ? 'italic' : undefined,
    textAlign: align !== undefined ? TEXT_ALIGN[align] : undefined,
    ...(lines !== undefined ? { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}),
    ...(serif === true ? { lineHeight: 1.25 } : {}),
  };
  return <span style={{ ...style, display: lines !== undefined ? '-webkit-box' : 'block' }}>{children}</span>;
};
Text.meta = { description: 'Typography. `serif` is the display face for headings and figures a guest reads.', propsSchema: TextProps };

const BadgeProps = z.object({ tone: z.string().optional().describe('neutral accent good warn alert'), dot: z.boolean().optional() }).strict();

export const Badge: NovaComponent<z.infer<typeof BadgeProps>> = ({ tone = 'neutral', dot, children }) => {
  const t = TONE[tone] ?? TONE['neutral']!;
  return (
    <span className="at-chip" style={{ background: t.bg, color: t.fg }}>
      {dot === true ? <span style={{ width: 6, height: 6, borderRadius: 999, background: t.fg, display: 'inline-block' }} /> : null}
      {children}
    </span>
  );
};
Badge.meta = { description: 'A small status chip. Tone carries the meaning; the layout never picks a colour.', propsSchema: BadgeProps };

const StatProps = z.object({ label: z.string(), value: z.string().optional(), tone: z.string().optional(), hint: z.string().optional() }).strict();

// The figure's size is a CSS variable, not an inline style, because DENSITY IS
// A PROPERTY OF THE REGION. The same action renders in a work column, a 400px
// workspace and an overlay; a surface that ships from a vendor cannot know
// which. So the region sets `--stat-size` and every figure in it obeys — see
// ui.css. Inline styles would win over that and did, which is how a €2400 came
// to be 32px in a narrow column.
export const Stat: NovaComponent<z.infer<typeof StatProps>> = ({ label, value, tone, hint }) => (
  <div className="at-stat">
    <span className="at-stat__label">{label}</span>
    <span className="at-stat__value" style={tone !== undefined ? { color: COLOR[tone] } : undefined}>
      {value ?? '—'}
    </span>
    {hint !== undefined && hint !== '' ? <span className="at-stat__hint">{hint}</span> : null}
  </div>
);
Stat.meta = { description: 'A labelled figure. The number is set in the display face, at the size its region asks for.', propsSchema: StatProps };

const RuleProps = z.object({ pad: z.number().optional(), label: z.string().optional().describe('Names the section the rule opens. Sits on the line, in the small caps every other heading in the kit uses.') }).strict();

// A LABELLED rule is still a rule. Layouts across the app — the wake
// switchboard, both folio surfaces, every new desk surface — were already
// passing `label` and the component silently dropped it, so a dozen sections
// rendered as unexplained hairlines. The prop was not wrong; it was unbuilt.
export const Rule: NovaComponent<z.infer<typeof RuleProps>> = ({ pad, label }) => {
  const line = <div style={{ height: 1, background: 'var(--line)', flex: 1 }} />;
  if (label === undefined || label === '') return <div style={{ height: 1, background: 'var(--line)', marginTop: pad, marginBottom: pad }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: pad, marginBottom: pad }}>
      <span style={{ fontSize: SIZE['xs'], textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 650, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>{label}</span>
      {line}
    </div>
  );
};
Rule.meta = { description: 'A hairline, optionally naming the section it opens. Atrium separates with rules rather than boxing everything in cards.', propsSchema: RuleProps };

const AvatarProps = z.object({ name: z.string().optional(), size: z.number().optional(), tone: z.string().optional() }).strict();

export const Avatar: NovaComponent<z.infer<typeof AvatarProps>> = ({ name = '', size = 36, tone = 'accent' }) => {
  const t = TONE[tone] ?? TONE['accent']!;
  const initials = name
    .split(/\s+/)
    .filter((p) => p.length > 0)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div style={{ width: size, height: size, borderRadius: 999, background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: size * 0.36, flexShrink: 0 }}>{initials}</div>
  );
};
Avatar.meta = { description: 'Initials in a circle.', propsSchema: AvatarProps };

// A small, self-contained glyph set. No icon dependency: the vocabulary is
// closed on purpose, so a layout can only name a mark that exists.
const PATHS: Record<string, string> = {
  bed: 'M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 18v2M21 18v2M7 10V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3',
  key: 'M15 7a4 4 0 1 1-3.9 5H8v3H5v-3H3v-2h8.1A4 4 0 0 1 15 7z',
  check: 'M4 12l5 5L20 6',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z',
  leaf: 'M4 20c0-8 6-14 16-14 0 10-6 14-12 14H4zM8 18c2-4 5-7 9-9',
  chat: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V6z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
  door: 'M6 3h9a1 1 0 0 1 1 1v17H6V3zM13 12h.01M16 21h3',
  flag: 'M5 21V4h9l-1 3h6l-2 5 2 5h-8l-1-3H5',
  wrench: 'M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4l9-9a4 4 0 0 0-1 -1z',
  chart: 'M4 20h16M7 16v-5M12 16V6M17 16v-8',
  plug: 'M9 3v6M15 3v6M7 9h10v3a5 5 0 0 1-10 0V9zM12 17v4',
  dot: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  'chevron-up': 'M6 15l6-6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 4l9 16H3l9-16zM12 10v4M12 17h.01',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
  moon: 'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z',
  send: 'M4 12l16-8-6 16-2-6-8-2z',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 4v6M8 14v6',
};

const IconProps = z.object({ name: z.string(), size: z.number().optional(), color: z.string().optional() }).strict();

export const Icon: NovaComponent<z.infer<typeof IconProps>> = ({ name, size = 18, color = 'soft' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={COLOR[color] ?? color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
    <path d={PATHS[name] ?? PATHS['dot']!} />
  </svg>
);
Icon.meta = { description: `A glyph from the closed set: ${Object.keys(PATHS).join(', ')}.`, propsSchema: IconProps };
