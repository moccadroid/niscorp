import { useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { z } from 'zod';
import { useNovaDispatch } from '@niscorp/nova/react';
import type { NovaComponent } from '@niscorp/nova/react';

// ═══════════════════════════════════════════════════════════
// The kit: domain-blind primitives. Props in, events out —
// nothing here knows what a todo is. Palette flows through the
// --m-* custom properties that Surface sets per mood.
// ═══════════════════════════════════════════════════════════

type MoodVars = { bg: string; panel: string; accent: string; soft: string; ink: string; sub: string; line: string };

const MINT: MoodVars = { bg: '#edf8f0', panel: '#ffffff', accent: '#5fc493', soft: '#d9f2e3', ink: '#2f4451', sub: '#7d948c', line: '#dcefe3' };
const MOODS: Record<string, MoodVars> = {
  mint: MINT,
  butter: { bg: '#fdf7e2', panel: '#fffdf5', accent: '#dfae3e', soft: '#f7ecc6', ink: '#4a4430', sub: '#a2986e', line: '#f0e6c2' },
  peach: { bg: '#fdf0e5', panel: '#fffaf5', accent: '#eb9564', soft: '#fae2d0', ink: '#4d3a2f', sub: '#b08a72', line: '#f3ded0' },
  blush: { bg: '#fbebee', panel: '#fff8f9', accent: '#e2798f', soft: '#f7d8de', ink: '#4a2f38', sub: '#b57f8d', line: '#f2dae0' },
};

const ROSE = { bg: '#fbe3e9', ink: '#b0455e' };

// ─── Surface ───────────────────────────────────────────────

const SurfacePropsSchema = z
  .object({
    mood: z.string().optional().describe('Palette token: mint | butter | peach | blush. Default mint.'),
    pad: z.number().optional().describe('Padding in px.'),
    fill: z.boolean().optional().describe('Fill and scroll the available height.'),
  })
  .strict()
  .describe('Palette provider: paints the mood background and sets the --m-* variables the kit reads.');

type SurfaceProps = z.infer<typeof SurfacePropsSchema>;

export const Surface: NovaComponent<SurfaceProps> = ({ mood, pad, fill, children }) => {
  const m = MOODS[mood ?? 'mint'] ?? MINT;
  const style: CSSProperties = {
    '--m-bg': m.bg,
    '--m-panel': m.panel,
    '--m-accent': m.accent,
    '--m-soft': m.soft,
    '--m-ink': m.ink,
    '--m-sub': m.sub,
    '--m-line': m.line,
    background: m.bg,
    color: m.ink,
    padding: pad,
    boxSizing: 'border-box',
    transition: 'background 600ms ease, color 600ms ease',
    ...(fill === true ? { flex: 1, minHeight: 0, overflowY: 'auto' } : {}),
  };
  return <div style={style}>{children}</div>;
};

Surface.meta = { description: 'Mood palette provider and page background.', propsSchema: SurfacePropsSchema };

// ─── Stack ─────────────────────────────────────────────────

const StackPropsSchema = z
  .object({
    direction: z.enum(['row', 'column']).optional().describe('Flex direction. Default column.'),
    gap: z.number().optional().describe('Gap in px.'),
    align: z.enum(['start', 'center', 'end', 'stretch', 'baseline']).optional(),
    justify: z.enum(['start', 'center', 'end', 'between']).optional(),
    wrap: z.boolean().optional().describe('Allow wrapping.'),
    padding: z.number().optional(),
    grow: z.boolean().optional().describe('flex: 1.'),
    maxWidth: z.number().optional().describe('Center the stack at this max width.'),
  })
  .strict()
  .describe('Flex container.');

type StackProps = z.infer<typeof StackPropsSchema>;

const JUSTIFY: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' };
const ALIGN: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline' };

export const Stack: NovaComponent<StackProps> = ({ direction, gap, align, justify, wrap, padding, grow, maxWidth, children }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: direction ?? 'column',
      gap,
      alignItems: align !== undefined ? ALIGN[align] : undefined,
      justifyContent: justify !== undefined ? JUSTIFY[justify] : undefined,
      flexWrap: wrap === true ? 'wrap' : undefined,
      padding,
      flex: grow === true ? 1 : undefined,
      minHeight: grow === true ? 0 : undefined,
      ...(maxWidth !== undefined ? { maxWidth, width: '100%', marginLeft: 'auto', marginRight: 'auto' } : {}),
      boxSizing: 'border-box',
    }}
  >
    {children}
  </div>
);

Stack.meta = { description: 'Flex container.', propsSchema: StackPropsSchema };

// ─── Text ──────────────────────────────────────────────────

const TextPropsSchema = z
  .object({
    size: z.enum(['xs', 'sm', 'md', 'lg', 'xl', 'xxl']).optional().describe('Type size. Default md.'),
    weight: z.enum(['regular', 'medium', 'bold']).optional(),
    tone: z.enum(['ink', 'sub', 'accent', 'danger', 'inverse']).optional().describe('Color token. Default ink.'),
    strike: z.boolean().optional().describe('Line-through.'),
    align: z.enum(['left', 'center', 'right']).optional(),
  })
  .strict()
  .describe('Typography. Content is the node children.');

type TextProps = z.infer<typeof TextPropsSchema>;

const SIZES: Record<string, number> = { xs: 11, sm: 12.5, md: 14, lg: 17, xl: 22, xxl: 30 };
const WEIGHTS: Record<string, number> = { regular: 400, medium: 560, bold: 720 };
const TONES: Record<string, string> = {
  ink: 'var(--m-ink, #2f4451)',
  sub: 'var(--m-sub, #7d948c)',
  accent: 'var(--m-accent, #5fc493)',
  danger: ROSE.ink,
  inverse: '#ffffff',
};

export const Text: NovaComponent<TextProps> = ({ size, weight, tone, strike, align, children }) => (
  <span
    style={{
      fontSize: SIZES[size ?? 'md'],
      fontWeight: WEIGHTS[weight ?? 'regular'],
      color: TONES[tone ?? 'ink'],
      textDecoration: strike === true ? 'line-through' : undefined,
      textAlign: align,
      display: align !== undefined ? 'block' : undefined,
      lineHeight: 1.45,
      transition: 'color 600ms ease',
    }}
  >
    {children}
  </span>
);

Text.meta = { description: 'Typography element.', propsSchema: TextPropsSchema };

// ─── Card ──────────────────────────────────────────────────

const CardPropsSchema = z
  .object({
    pad: z.number().optional().describe('Padding in px. Default 14.'),
    tone: z.enum(['panel', 'soft', 'ghost']).optional().describe('panel = elevated white, soft = tinted, ghost = borderless.'),
    hover: z.boolean().optional().describe('Lift on hover.'),
    radius: z.number().optional(),
  })
  .strict()
  .describe('Rounded container.');

type CardProps = z.infer<typeof CardPropsSchema>;

export const Card: NovaComponent<CardProps> = ({ pad, tone, hover, radius, children }) => {
  const t = tone ?? 'panel';
  return (
    <div
      className={hover === true ? 'm-hover' : undefined}
      style={{
        padding: pad ?? 14,
        borderRadius: radius ?? 16,
        background: t === 'panel' ? 'var(--m-panel, #ffffff)' : t === 'soft' ? 'var(--m-soft, #eee)' : 'transparent',
        border: t === 'ghost' ? 'none' : '1px solid var(--m-line, #eee)',
        boxShadow: t === 'panel' ? '0 2px 10px rgba(90, 80, 110, 0.05)' : undefined,
        animation: 'm-fade-up 320ms ease both',
        boxSizing: 'border-box',
        transition: 'background 600ms ease, border-color 600ms ease',
      }}
    >
      {children}
    </div>
  );
};

Card.meta = { description: 'Rounded container.', propsSchema: CardPropsSchema };

// ─── Button ────────────────────────────────────────────────

const ButtonPropsSchema = z
  .object({
    label: z.string().optional().describe('Button label; falls back to children.'),
    variant: z.enum(['primary', 'soft', 'ghost', 'danger']).optional().describe('Default soft.'),
    size: z.enum(['sm', 'md']).optional(),
    disabled: z.boolean().optional(),
    active: z.boolean().optional().describe('Pressed/selected look (tabs).'),
    payload: z.unknown().optional().describe('Dispatched as the ui:click event payload.'),
  })
  .strict()
  .describe('Clickable button; dispatches ui:click with its ref and payload.');

type ButtonProps = z.infer<typeof ButtonPropsSchema>;

export const Button: NovaComponent<ButtonProps> = ({ label, variant, size, disabled, active, payload, novaRef, children }) => {
  const dispatch = useNovaDispatch();
  const v = variant ?? 'soft';
  const isDisabled = disabled ?? false;
  const base: CSSProperties = {
    border: 'none',
    borderRadius: 999,
    padding: size === 'sm' ? '5px 12px' : '8px 18px',
    fontSize: size === 'sm' ? 12.5 : 14,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.45 : 1,
    transition: 'background 250ms ease, transform 150ms ease, box-shadow 150ms ease',
  };
  const variants: Record<string, CSSProperties> = {
    primary: { background: 'var(--m-accent, #5fc493)', color: '#ffffff', boxShadow: '0 3px 10px rgba(90, 80, 110, 0.15)' },
    soft: { background: 'var(--m-soft, #eee)', color: 'var(--m-ink, #2f4451)' },
    ghost: {
      background: active === true ? 'var(--m-soft, #eee)' : 'transparent',
      color: active === true ? 'var(--m-ink, #2f4451)' : 'var(--m-sub, #7d948c)',
    },
    danger: { background: ROSE.bg, color: ROSE.ink },
  };
  return (
    <button
      type="button"
      disabled={isDisabled}
      className="m-hover"
      style={{ ...base, ...variants[v] }}
      onClick={() => {
        if (isDisabled || novaRef === undefined) return;
        dispatch({ type: 'ui:click', ref: novaRef, payload });
      }}
    >
      {label ?? children}
    </button>
  );
};

Button.meta = { description: 'Clickable button; dispatches ui:click.', propsSchema: ButtonPropsSchema };

// ─── Checkbox ──────────────────────────────────────────────

const CheckboxPropsSchema = z
  .object({
    checked: z.boolean().optional(),
    payload: z.unknown().optional().describe('Dispatched as the ui:click event payload.'),
  })
  .strict()
  .describe('Round check control; dispatches ui:click with its ref and payload.');

type CheckboxProps = z.infer<typeof CheckboxPropsSchema>;

export const Checkbox: NovaComponent<CheckboxProps> = ({ checked, payload, novaRef }) => {
  const dispatch = useNovaDispatch();
  const isChecked = checked ?? false;
  return (
    <button
      type="button"
      className="m-hover"
      aria-pressed={isChecked}
      style={{
        width: 24,
        height: 24,
        borderRadius: 999,
        flexShrink: 0,
        border: '2px solid var(--m-accent, #5fc493)',
        background: isChecked ? 'var(--m-accent, #5fc493)' : 'transparent',
        color: '#ffffff',
        fontSize: 13,
        lineHeight: 1,
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        transition: 'background 200ms ease',
        padding: 0,
      }}
      onClick={() => {
        if (novaRef === undefined) return;
        dispatch({ type: 'ui:click', ref: novaRef, payload });
      }}
    >
      {isChecked ? '✓' : ''}
    </button>
  );
};

Checkbox.meta = { description: 'Round check control.', propsSchema: CheckboxPropsSchema };

// ─── Chip ──────────────────────────────────────────────────

const ChipPropsSchema = z
  .object({
    label: z.string().optional().describe('Chip text.'),
    tone: z.enum(['soft', 'accent', 'danger', 'ghost']).optional().describe('Default soft.'),
  })
  .strict()
  .describe('Small pill of secondary information.');

type ChipProps = z.infer<typeof ChipPropsSchema>;

export const Chip: NovaComponent<ChipProps> = ({ label, tone, children }) => {
  const t = tone ?? 'soft';
  const tones: Record<string, CSSProperties> = {
    soft: { background: 'var(--m-soft, #eee)', color: 'var(--m-ink, #2f4451)' },
    accent: { background: 'var(--m-accent, #5fc493)', color: '#ffffff' },
    danger: { background: ROSE.bg, color: ROSE.ink },
    ghost: { background: 'transparent', color: 'var(--m-sub, #7d948c)', border: '1px dashed var(--m-line, #ddd)' },
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 11.5,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        transition: 'background 600ms ease',
        ...tones[t],
      }}
    >
      {label ?? children}
    </span>
  );
};

Chip.meta = { description: 'Small pill of secondary information.', propsSchema: ChipPropsSchema };

// ─── Meter ─────────────────────────────────────────────────

const MeterPropsSchema = z
  .object({
    value: z.number().optional().describe('Current value.'),
    max: z.number().optional().describe('Full-bar value. Default 5.'),
    label: z.string().optional().describe('Tiny caption under the bar.'),
  })
  .strict()
  .describe('Small progress meter with an animated fill.');

type MeterProps = z.infer<typeof MeterPropsSchema>;

export const Meter: NovaComponent<MeterProps> = ({ value, max, label }) => {
  const v = value ?? 0;
  const m = max ?? 5;
  const pct = Math.max(0, Math.min(100, m === 0 ? 0 : (v / m) * 100));
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, minWidth: 86 }}>
      <span style={{ height: 8, borderRadius: 999, background: 'var(--m-soft, #eee)', overflow: 'hidden' }}>
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${pct}%`,
            borderRadius: 999,
            background: 'var(--m-accent, #5fc493)',
            transition: 'width 600ms cubic-bezier(0.2, 0.9, 0.3, 1.1), background 600ms ease',
          }}
        />
      </span>
      {label !== undefined ? (
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--m-sub, #7d948c)' }}>{label}</span>
      ) : null}
    </span>
  );
};

Meter.meta = { description: 'Small progress meter.', propsSchema: MeterPropsSchema };

// ─── Input ─────────────────────────────────────────────────

const inputStyle = (focused: boolean): CSSProperties => ({
  padding: '9px 13px',
  borderRadius: 12,
  border: `1.5px solid ${focused ? 'var(--m-accent, #5fc493)' : 'var(--m-line, #ddd)'}`,
  boxShadow: focused ? '0 0 0 3px var(--m-soft, #eee)' : 'none',
  outline: 'none',
  fontSize: 14,
  fontFamily: 'inherit',
  color: 'var(--m-ink, #2f4451)',
  background: 'var(--m-panel, #fff)',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
  width: '100%',
  boxSizing: 'border-box',
});

const InputPropsSchema = z
  .object({
    placeholder: z.string().optional(),
    type: z.enum(['text', 'date']).optional().describe('Default text.'),
    value: z.string().optional().describe('Current value; supplied via a binding next to `model`.'),
  })
  .strict()
  .describe('Single-line input; two-way bound via the layout `model` field.');

type InputProps = z.infer<typeof InputPropsSchema>;

export const Input: NovaComponent<InputProps> = ({ placeholder, type, value, novaModel }) => {
  const dispatch = useNovaDispatch();
  const [focused, setFocused] = useState(false);
  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    if (novaModel === undefined) return;
    dispatch({ type: 'ui:model', ref: novaModel.ref, payload: event.target.value });
  };
  return (
    <input
      type={type ?? 'text'}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={inputStyle(focused)}
    />
  );
};

Input.meta = { description: 'Single-line input bound via `model`.', propsSchema: InputPropsSchema };

// ─── TextArea ──────────────────────────────────────────────

const TextAreaPropsSchema = z
  .object({
    placeholder: z.string().optional(),
    rows: z.number().optional().describe('Default 3.'),
    value: z.string().optional().describe('Current value; supplied via a binding next to `model`.'),
  })
  .strict()
  .describe('Multi-line input; two-way bound via the layout `model` field.');

type TextAreaProps = z.infer<typeof TextAreaPropsSchema>;

export const TextArea: NovaComponent<TextAreaProps> = ({ placeholder, rows, value, novaModel }) => {
  const dispatch = useNovaDispatch();
  const [focused, setFocused] = useState(false);
  const onChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    if (novaModel === undefined) return;
    dispatch({ type: 'ui:model', ref: novaModel.ref, payload: event.target.value });
  };
  return (
    <textarea
      placeholder={placeholder}
      rows={rows ?? 3}
      value={value ?? ''}
      onChange={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ ...inputStyle(focused), resize: 'vertical' }}
    />
  );
};

TextArea.meta = { description: 'Multi-line input bound via `model`.', propsSchema: TextAreaPropsSchema };
