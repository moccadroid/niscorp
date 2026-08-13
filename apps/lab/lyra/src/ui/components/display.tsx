import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { COLOR, HUE, RADIUS, SIZE, TONE, WEIGHT, colorToken, hueOf, hueToken, markColor, markToken, sizeToken, toneToken } from '../lib/tokens';
import { ICON_PATHS } from '../lib/icons';

const TextProps = z
  .object({
    size: sizeToken,
    color: colorToken,
    weight: z.enum(['normal', 'medium', 'semi', 'bold']).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    uppercase: z.boolean().optional(),
    mono: z.boolean().optional(),
    truncate: z.boolean().optional(),
    tabular: z.boolean().optional().describe('Lining figures — for anything in a column that should line up'),
  })
  .strict();

type TextP = z.infer<typeof TextProps> & { children?: React.ReactNode };

export const Text: NovaComponent<z.infer<typeof TextProps>> = ({ size, color, weight, align, uppercase, mono, truncate, tabular, children }: TextP) => (
  <span
    style={{
      fontSize: SIZE[size ?? 'md'],
      color: COLOR[color ?? 'ink'],
      fontWeight: WEIGHT[weight ?? 'normal'],
      ...(align === undefined ? {} : { textAlign: align, display: 'block' }),
      ...(uppercase === true ? { textTransform: 'uppercase', letterSpacing: '0.06em' } : {}),
      ...(mono === true ? { fontFamily: 'var(--font-mono)' } : {}),
      ...(truncate === true ? { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : {}),
      ...(tabular === true ? { fontVariantNumeric: 'tabular-nums' } : {}),
      ...(size === 'display' || size === 'xxl' ? { letterSpacing: '-0.02em', lineHeight: 1.1 } : {}),
    }}
  >
    {children}
  </span>
);
Text.meta = { description: 'Text. Size and weight carry the hierarchy — there is no second typeface in this kit.', propsSchema: TextProps };

const BadgeProps = z.object({ tone: toneToken, hue: hueToken, label: z.string().optional(), icon: z.string().optional() }).strict();
type BadgeP = z.infer<typeof BadgeProps> & { children?: React.ReactNode };

export const Badge: NovaComponent<z.infer<typeof BadgeProps>> = ({ tone, hue, label, icon, children }: BadgeP) => {
  const t = hue !== undefined ? HUE[hue] : (TONE[tone ?? 'neutral'] ?? TONE['neutral']);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: t?.bg,
        color: t?.fg,
        fontSize: SIZE['xs'],
        fontWeight: WEIGHT['semi'],
        padding: '3px 8px',
        borderRadius: RADIUS['pill'],
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {icon === undefined ? null : <Icon name={icon} size={12} />}
      {label ?? children}
    </span>
  );
};
Badge.meta = { description: 'A small status pill. `tone` is a token, so a status never carries its own colour.', propsSchema: BadgeProps };

const StatProps = z.object({ label: z.string(), value: z.string(), hint: z.string().optional(), tone: toneToken }).strict();

export const Stat: NovaComponent<Partial<z.infer<typeof StatProps>>> = ({ label, value, hint, tone }: Partial<z.infer<typeof StatProps>>) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <span style={{ fontSize: SIZE['xs'], color: COLOR['mute'], fontWeight: WEIGHT['medium'], textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    <span
      style={{
        fontSize: SIZE['xl'],
        fontWeight: WEIGHT['semi'],
        color: tone === undefined ? COLOR['ink'] : TONE[tone]?.fg,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
        minWidth: 0,
        overflowWrap: 'anywhere',
        lineHeight: 1.25,
      }}
    >
      {value}
    </span>
    {hint === undefined ? null : <span style={{ fontSize: SIZE['sm'], color: COLOR['mute'] }}>{hint}</span>}
  </div>
);
Stat.meta = { description: 'A figure with its label. Formatting happens upstream in a transform — this renders strings.', propsSchema: StatProps };

const SegmentSchema = z.union([
  z.string(),
  z
    .object({
      color: z.string(),
      w: z.number().optional(),
      ticks: z.number().optional(),
      tickColor: z.string().optional(),
    })
    .strict(),
]);

const BandsProps = z
  .object({
    bands: z.array(SegmentSchema).optional().describe('Colored segments, painted left to right; a segment may carry ticks'),
    w: z.union([z.number(), z.string()]).optional(),
    h: z.number().optional(),
  })
  .strict();

type Segment = { color: string; w?: number; ticks?: number; tickColor?: string };
const asSegment = (value: unknown): Segment | null => {
  if (typeof value === 'string') return { color: value };
  if (value !== null && typeof value === 'object' && typeof (value as Segment).color === 'string') return value as Segment;
  return null;
};

export const Bands: NovaComponent<Partial<z.infer<typeof BandsProps>>> = ({ bands, w, h }: Partial<z.infer<typeof BandsProps>>) => {
  const list = (Array.isArray(bands) ? bands : []).map(asSegment).filter((segment): segment is Segment => segment !== null);
  if (list.length === 0) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        width: w ?? 120,
        height: h ?? 12,
        borderRadius: 3,
        overflow: 'hidden',
        flex: 'none',
        boxShadow: 'inset 0 0 0 1px rgba(127, 127, 127, 0.35)',
        verticalAlign: 'middle',
      }}
    >
      {list.map((segment, i) => (
        <span
          key={i}
          style={{ flex: segment.w ?? 1, background: segment.color, display: 'flex', alignItems: 'stretch', justifyContent: 'space-evenly' }}
        >
          {Array.from({ length: Math.max(0, Math.min(6, segment.ticks ?? 0)) }, (_, t) => (
            <span key={t} style={{ width: 2, margin: '1px 0', background: segment.tickColor ?? '#f5f5f4', borderRadius: 1 }} />
          ))}
        </span>
      ))}
    </span>
  );
};
Bands.meta = { description: 'A horizontal strip of colored segments; a segment may carry tick marks. Colors are content from rows, never theme tokens.', propsSchema: BandsProps };

// ── prose ────────────────────────────────────────────────────
const ProseProps = z
  .object({
    size: sizeToken,
    color: colorToken,
    measure: z.union([z.number(), z.literal('none')]).optional().describe('Line length cap in ch; "none" fills the container'),
    align: z.enum(['left', 'center']).optional(),
  })
  .strict();

export const Prose: NovaComponent<z.infer<typeof ProseProps>> = ({ size, color, measure, align, children }: z.infer<typeof ProseProps> & { children?: React.ReactNode }) => (
  <p
    style={{
      margin: 0,
      fontSize: SIZE[size ?? 'md'],
      color: COLOR[color ?? 'soft'],
      lineHeight: 1.6,
      maxWidth: measure === 'none' ? undefined : `${measure ?? 62}ch`,
      overflowWrap: 'anywhere',
      ...(align === 'center' ? { textAlign: 'center', marginInline: 'auto' } : {}),
    }}
  >
    {children}
  </p>
);
Prose.meta = { description: 'A paragraph: real leading, a readable measure, and it wraps. For explanations — Text is for labels and values.', propsSchema: ProseProps };

// ── field ────────────────────────────────────────────────────
const FieldProps = z
  .object({
    label: z.string(),
    value: z.string().optional(),
    hint: z.string().optional(),
    icon: z.string().optional(),
    empty: z.string().optional().describe('Shown when the value is blank — "Not given" beats a silent gap'),
  })
  .strict();

export const Field: NovaComponent<Partial<z.infer<typeof FieldProps>>> = ({ label, value, hint, icon, empty }: Partial<z.infer<typeof FieldProps>>) => {
  const shown = value === undefined || value === '' ? undefined : value;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: SIZE['xs'], color: COLOR['mute'], fontWeight: WEIGHT['medium'], textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {icon === undefined ? null : <Icon name={icon} size={13} />}
        {label}
      </span>
      <span style={{ fontSize: SIZE['md'], color: shown === undefined ? COLOR['faint'] : COLOR['ink'], overflowWrap: 'anywhere', lineHeight: 1.45 }}>
        {shown ?? empty ?? '—'}
      </span>
      {hint === undefined ? null : <span style={{ fontSize: SIZE['sm'], color: COLOR['mute'], maxWidth: '46ch', lineHeight: 1.5 }}>{hint}</span>}
    </div>
  );
};
Field.meta = { description: 'A label and its value, sized for text. Stat is for figures; this is for facts.', propsSchema: FieldProps };

// ── meter ────────────────────────────────────────────────────
const MeterProps = z
  .object({
    value: z.number(),
    max: z.number(),
    label: z.string().optional(),
    caption: z.string().optional(),
    hue: hueToken,
    w: z.union([z.number(), z.string()]).optional(),
    showValue: z.boolean().optional(),
  })
  .strict();

export const Meter: NovaComponent<Partial<z.infer<typeof MeterProps>>> = ({ value, max, label, caption, hue, w, showValue }: Partial<z.infer<typeof MeterProps>>) => {
  const v = typeof value === 'number' ? value : 0;
  const m = typeof max === 'number' && max > 0 ? max : 0;
  const share = m === 0 ? 0 : Math.min(1, v / m);
  const fill = hue !== undefined ? `var(--hue-${hue})` : v > m && m > 0 ? 'var(--alert)' : share >= 1 ? 'var(--warm)' : 'var(--good)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, width: w ?? '100%' }}>
      {label === undefined && showValue !== true ? null : (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          {label === undefined ? <span /> : <span style={{ fontSize: SIZE['sm'], color: COLOR['soft'] }}>{label}</span>}
          {showValue !== true ? null : (
            <span style={{ fontSize: SIZE['sm'], color: COLOR['mute'], fontVariantNumeric: 'tabular-nums' }}>
              {v}
              {m === 0 ? '' : ` / ${m}`}
            </span>
          )}
        </div>
      )}
      <div
        role="meter"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={m === 0 ? undefined : m}
        aria-label={label ?? caption ?? 'quantity'}
        style={{ height: 6, borderRadius: 999, background: 'var(--surface-sunk)', overflow: 'hidden' }}
      >
        <div style={{ width: `${Math.round(share * 100)}%`, height: '100%', background: fill, borderRadius: 999, transition: 'width 0.2s ease' }} />
      </div>
      {caption === undefined ? null : <span style={{ fontSize: SIZE['xs'], color: COLOR['mute'] }}>{caption}</span>}
    </div>
  );
};
Meter.meta = { description: 'A quantity against its limit, as a bar. For capacity, allowance, progress — anything that was a string and a colour.', propsSchema: MeterProps };

const RuleProps = z.object({ my: z.number().optional() }).strict();
export const Rule: NovaComponent<z.infer<typeof RuleProps>> = ({ my }: z.infer<typeof RuleProps>) => <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: `${my ?? 0}px 0`, width: '100%' }} />;
Rule.meta = { description: 'A horizontal rule.', propsSchema: RuleProps };

// ── the icon ─────────────────────────────────────────────────
const IconProps = z
  .object({
    name: z.string().describe('A name from the kit vocabulary — see ui/lib/icons.ts'),
    size: z.number().optional(),
    color: colorToken,
    hue: hueToken,
  })
  .strict();

export const Icon: NovaComponent<Partial<z.infer<typeof IconProps>>> = ({ name, size, color, hue }: Partial<z.infer<typeof IconProps>>) => {
  const path = name === undefined ? undefined : ICON_PATHS[name];
  if (path === undefined) return null;
  const px = size ?? 18;
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke={hue !== undefined ? `var(--hue-${hue})` : color !== undefined ? COLOR[color] : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path d={path} />
    </svg>
  );
};
Icon.meta = { description: 'An icon by NAME from the kit vocabulary. Decorative — an unknown name renders nothing rather than a broken box.', propsSchema: IconProps };

const DotProps = z.object({ tone: markToken, size: z.number().optional() }).strict();
export const Dot: NovaComponent<z.infer<typeof DotProps>> = ({ tone, size }: z.infer<typeof DotProps>) => (
  <span style={{ display: 'inline-block', flexShrink: 0, width: size ?? 8, height: size ?? 8, borderRadius: '50%', background: markColor(tone) }} />
);
Dot.meta = { description: 'A small colour mark, for which stream or rank a thing belongs to.', propsSchema: DotProps };

const AvatarProps = z.object({ name: z.string(), size: z.number().optional(), tone: toneToken, hue: hueToken }).strict();
export const Avatar: NovaComponent<Partial<z.infer<typeof AvatarProps>>> = ({ name, size, tone, hue }: Partial<z.infer<typeof AvatarProps>>) => {
  const initials = (name ?? '')
    .split(/\s+/)
    .filter((p) => p !== '')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  const t = hue !== undefined ? HUE[hue] : tone !== undefined ? TONE[tone] : HUE[hueOf(name ?? '')];
  const px = size ?? 34;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: px,
        height: px,
        borderRadius: '50%',
        background: t?.bg,
        color: t?.fg,
        fontSize: Math.round(px * 0.36),
        fontWeight: WEIGHT['semi'],
        letterSpacing: '0.01em',
      }}
    >
      {initials}
    </span>
  );
};
Avatar.meta = { description: 'Initials in a circle. No image upload in this app, so initials are the whole story.', propsSchema: AvatarProps };
