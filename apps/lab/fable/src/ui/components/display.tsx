import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/react';
import {
  Calendar,
  Check,
  Feather,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '../lib/cx';
import { FS, TEXT_COLOR } from '../lib/tokens';

// Display primitives — Text, Badge, Icon. Read-only visuals.

// ─── Text ──────────────────────────────────────────────────
const TextProps = z
  .object({
    size: z.string().optional(),
    weight: z.number().optional(),
    color: z.string().optional(),
    upper: z.boolean().optional(),
    truncate: z.boolean().optional(),
  })
  .strict();

export const Text: NovaComponent<z.infer<typeof TextProps>> = ({
  size = 'md',
  weight,
  color = 'default',
  upper,
  truncate,
  children,
}) => (
  <span
    style={{
      fontSize: FS[size],
      fontWeight: weight,
      color: TEXT_COLOR[color] ?? color,
      textTransform: upper === true ? 'uppercase' : undefined,
      letterSpacing: upper === true ? '0.4px' : undefined,
      overflow: truncate === true ? 'hidden' : undefined,
      textOverflow: truncate === true ? 'ellipsis' : undefined,
      whiteSpace: truncate === true ? 'nowrap' : undefined,
    }}
  >
    {children}
  </span>
);
Text.meta = { description: 'Inline text with size/weight/color.', propsSchema: TextProps };

// ─── Badge ─────────────────────────────────────────────────
// `tone` is an open string: a known tone gets its tint class, an unknown one
// falls back to the base badge — so a data-driven toneMap can never crash a
// render.
const TONES = ['accent', 'green', 'amber', 'red', 'blue'];

const BadgeProps = z
  .object({
    tone: z.string().optional().describe('One of slate|accent|green|amber|red|blue; unknown tones fall back to slate.'),
  })
  .strict();

export const Badge: NovaComponent<z.infer<typeof BadgeProps>> = ({ tone = 'slate', children }) => (
  <span className={cx('fb-badge', TONES.includes(tone) && `fb-badge--${tone}`)}>{children}</span>
);
Badge.meta = { description: 'A small status pill.', propsSchema: BadgeProps };

// ─── Icon ──────────────────────────────────────────────────
const ICONS: Record<string, LucideIcon> = {
  calendar: Calendar,
  check: Check,
  feather: Feather,
  inbox: Inbox,
  more: MoreHorizontal,
  edit: Pencil,
  plus: Plus,
  search: Search,
  trash: Trash2,
};

const IconProps = z.object({ name: z.string(), size: z.number().optional() }).strict();

export const Icon: NovaComponent<z.infer<typeof IconProps>> = ({ name, size = 16 }) => {
  const C = ICONS[name];
  return C !== undefined ? <C width={size} height={size} /> : null;
};
Icon.meta = { description: 'A named icon.', propsSchema: IconProps };
