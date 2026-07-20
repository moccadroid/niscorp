import type { CSSProperties } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import type { NovaManifestEntry } from '@niscorp/loom/plugins/nova/react';

// The content library — a tiny Nova component set, passed to the Nova plugin as
// its manifest. Each entry declares its name, a Zod schema for its props, the
// render, and whether it nests children. A loud neon kit, so the thing being
// edited never looks like the editor editing it.

// ─── Box — a glowing panel ───────────────────────────────────

const Box: NovaComponent<{ padding?: number; background?: string; radius?: number }> = ({
  padding = 16,
  background = '#16213e',
  radius = 12,
  children,
}) => (
  <div
    style={{
      padding,
      background,
      borderRadius: radius,
      border: '1px solid #0f3460',
      boxShadow: '0 0 24px rgba(123, 47, 247, 0.35), inset 0 0 0 1px rgba(0, 217, 255, 0.08)',
    }}
  >
    {children}
  </div>
);

const boxDef: NovaManifestEntry = {
  name: 'Box',
  container: true,
  render: Box,
  props: z.object({
    padding: z.number().int().meta({ title: 'Padding' }).default(16),
    background: z.string().meta({ title: 'Background' }).default('#16213e'),
    radius: z.number().int().meta({ title: 'Corner radius' }).default(12),
  }),
};

// ─── Stack — flex layout ─────────────────────────────────────

const ALIGN: Record<string, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
};

const Stack: NovaComponent<{ direction?: string; gap?: number; align?: string }> = ({
  direction = 'column',
  gap = 12,
  align = 'start',
  children,
}) => (
  <div style={{ display: 'flex', flexDirection: direction === 'row' ? 'row' : 'column', gap, alignItems: ALIGN[align] ?? 'flex-start' }}>
    {children}
  </div>
);

const stackDef: NovaManifestEntry = {
  name: 'Stack',
  container: true,
  render: Stack,
  props: z.object({
    direction: z.enum(['row', 'column']).meta({ title: 'Direction' }).default('column'),
    gap: z.number().int().meta({ title: 'Gap' }).default(12),
    align: z.enum(['start', 'center', 'end']).meta({ title: 'Align' }).default('start'),
  }),
};

// ─── Text — neon type ────────────────────────────────────────

const SIZE: Record<string, number> = { sm: 13, md: 16, lg: 22, xl: 32 };

const Text: NovaComponent<{ content?: string; size?: string; weight?: string; color?: string }> = ({
  content = 'Text',
  size = 'md',
  weight = 'normal',
  color = '#e94560',
}) => (
  <span
    style={{
      fontSize: SIZE[size] ?? 16,
      fontWeight: weight === 'bold' ? 700 : 400,
      color,
      textShadow: `0 0 12px ${color}55`,
      fontFamily: 'system-ui, sans-serif',
    }}
  >
    {content}
  </span>
);

const textDef: NovaManifestEntry = {
  name: 'Text',
  render: Text,
  props: z.object({
    content: z.string().meta({ title: 'Content' }).default('Neon text'),
    size: z.enum(['sm', 'md', 'lg', 'xl']).meta({ title: 'Size' }).default('md'),
    weight: z.enum(['normal', 'bold']).meta({ title: 'Weight' }).default('normal'),
    color: z.string().meta({ title: 'Color' }).default('#e94560'),
  }),
};

// ─── Button — gradient pill ──────────────────────────────────

const Button: NovaComponent<{ label?: string; variant?: string }> = ({ label = 'Click', variant = 'primary' }) => (
  <button
    type="button"
    style={{
      padding: '8px 18px',
      borderRadius: 999,
      border: variant === 'ghost' ? '1px solid #00d9ff' : 'none',
      background: variant === 'ghost' ? 'transparent' : 'linear-gradient(135deg, #7b2ff7, #e94560)',
      color: variant === 'ghost' ? '#00d9ff' : '#fff',
      fontWeight: 600,
      fontSize: 14,
      cursor: 'pointer',
      boxShadow: variant === 'ghost' ? 'none' : '0 0 18px rgba(233, 69, 96, 0.5)',
    }}
  >
    {label}
  </button>
);

const buttonDef: NovaManifestEntry = {
  name: 'Button',
  render: Button,
  props: z.object({
    label: z.string().meta({ title: 'Label' }).default('Launch'),
    variant: z.enum(['primary', 'ghost']).meta({ title: 'Variant' }).default('primary'),
  }),
};

// ─── The manifest ────────────────────────────────────────────

export const library: readonly NovaManifestEntry[] = [boxDef, stackDef, textDef, buttonDef];
