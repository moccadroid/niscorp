import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import {
  Home,
  Users,
  Building2,
  Target,
  CheckSquare,
  Activity,
  DollarSign,
  TrendingUp,
  Plus,
  Search,
  Inbox,
  Zap,
  Clock,
  Settings,
  BarChart3,
  Calendar,
  Mail,
  Phone,
  SlidersHorizontal,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Command,
  Check,
  Briefcase,
  ArrowUpDown,
  Filter,
  CircleDot,
  ArrowRight,
  Star,
  Globe,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '../lib/cx';
import { FS, TEXT_COLOR } from '../lib/tokens';

// Display primitives — Text, Badge, Avatar, Icon. Read-only visuals.

// ─── Text ──────────────────────────────────────────────────
const TextProps = z
  .object({
    size: z.string().optional(),
    weight: z.number().optional(),
    color: z.string().optional(),
    mono: z.boolean().optional(),
    upper: z.boolean().optional(),
    truncate: z.boolean().optional(),
  })
  .strict();

export const Text: NovaComponent<z.infer<typeof TextProps>> = ({
  size = 'md',
  weight,
  color = 'default',
  mono,
  upper,
  truncate,
  children,
}) => (
  <span
    style={{
      fontSize: FS[size],
      fontWeight: weight,
      color: TEXT_COLOR[color] ?? color,
      fontFamily: mono === true ? 'var(--mono)' : undefined,
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

// ─── Stat ──────────────────────────────────────────────────
// A metric card. Semantics in, appearance owned by .rl-stat CSS — the
// ONE sanctioned way to show a number prominently, so screens never
// hand-style Text into a KPI.
const StatProps = z
  .object({
    label: z.string().describe('What the number is, e.g. "Overdue tasks".'),
    delta: z.string().optional().describe('Small change annotation shown under the value, e.g. "+12%".'),
    trend: z.enum(['up', 'down']).optional().describe('Colors the delta (up = green, down = red).'),
  })
  .strict();

export const Stat: NovaComponent<z.infer<typeof StatProps>> = ({ label, delta, trend, children }) => (
  <div className="rl-stat">
    <div className="rl-stat__label">{label}</div>
    <div className="rl-stat__value">{children}</div>
    {delta !== undefined && (
      <div className={cx('rl-stat__delta', trend === 'up' && 'rl-stat__delta--up', trend === 'down' && 'rl-stat__delta--down')}>
        {delta}
      </div>
    )}
  </div>
);
Stat.meta = {
  description: 'A metric: the value is `children` (bind it), `label` says what it is. Use this for every KPI/number — never hand-style Text into one.',
  propsSchema: StatProps,
};

// ─── Badge ─────────────────────────────────────────────────
const BadgeProps = z
  .object({
    tone: z.enum(['slate', 'accent', 'green', 'amber', 'red', 'blue', 'pink']).optional(),
    dot: z.boolean().optional(),
  })
  .strict();

export const Badge: NovaComponent<z.infer<typeof BadgeProps>> = ({ tone = 'slate', dot, children }) => (
  <span className={cx('rl-badge', tone !== 'slate' && `rl-badge--${tone}`)}>
    {dot === true && <span className="rl-badge__dot" />}
    {children}
  </span>
);
Badge.meta = { description: 'A small status pill.', propsSchema: BadgeProps };

// ─── Avatar ────────────────────────────────────────────────
const AV_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#ef4444',
  '#3b82f6',
  '#a855f7',
  '#14b8a6',
];

const colorFor = (s: string): string => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length]!;
};

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();

const AvatarProps = z
  .object({ name: z.string(), size: z.enum(['sm', 'md', 'lg']).optional() })
  .strict();

export const Avatar: NovaComponent<z.infer<typeof AvatarProps>> = ({ name, size = 'md' }) => (
  <span
    className={cx('rl-avatar', size !== 'md' && `rl-avatar--${size}`)}
    style={{ background: colorFor(name) }}
    title={name}
  >
    {initials(name)}
  </span>
);
Avatar.meta = {
  description: 'Circular initials avatar; color derived from the name.',
  propsSchema: AvatarProps,
};

// ─── Icon ──────────────────────────────────────────────────
const ICONS: Record<string, LucideIcon> = {
  home: Home,
  users: Users,
  building: Building2,
  target: Target,
  'check-square': CheckSquare,
  activity: Activity,
  dollar: DollarSign,
  'trending-up': TrendingUp,
  plus: Plus,
  search: Search,
  inbox: Inbox,
  zap: Zap,
  clock: Clock,
  settings: Settings,
  'bar-chart': BarChart3,
  calendar: Calendar,
  mail: Mail,
  phone: Phone,
  sliders: SlidersHorizontal,
  bell: Bell,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  more: MoreHorizontal,
  command: Command,
  check: Check,
  briefcase: Briefcase,
  sort: ArrowUpDown,
  filter: Filter,
  'circle-dot': CircleDot,
  'arrow-right': ArrowRight,
  star: Star,
  globe: Globe,
  edit: Pencil,
  trash: Trash2,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  sparkles: Sparkles,
  'log-out': LogOut,
};

const IconProps = z.object({ name: z.string(), size: z.number().optional() }).strict();

export const Icon: NovaComponent<z.infer<typeof IconProps>> = ({ name, size = 16 }) => {
  const C = ICONS[name];
  return C !== undefined ? <C width={size} height={size} /> : null;
};
Icon.meta = { description: 'A named icon.', propsSchema: IconProps };
