import { z } from 'zod';

// Semantic prop vocabularies. A layout names a TOKEN; the component turns it
// into CSS. Layouts never carry a colour, a class or a pixel that means
// something — only a word from one of these lists.
//
// This is rule 2 doing double duty. It exists so components stay domain-blind,
// but it is also the entire reason a theme can be a row: every colour in the
// running application resolves through a custom property, so a studio's palette
// is a set of values, not a fork. A single hex in a layout would be a hole in
// that, and it would be invisible until the day somebody rebrands.

export const ALIGN: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline' };
export const JUSTIFY: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around' };

export const COLOR: Record<string, string> = {
  ink: 'var(--ink)',
  soft: 'var(--ink-soft)',
  mute: 'var(--ink-mute)',
  faint: 'var(--ink-faint)',
  accent: 'var(--accent-ink)',
  calm: 'var(--calm)',
  warm: 'var(--warm)',
  alert: 'var(--alert)',
  good: 'var(--good)',
  invert: 'var(--ground)',
};

export const BG: Record<string, string> = {
  none: 'transparent',
  ground: 'var(--ground)',
  surface: 'var(--surface)',
  sunk: 'var(--surface-sunk)',
  ink: 'var(--ink)',
  accent: 'var(--accent)',
  accentSoft: 'var(--accent-soft)',
  calmSoft: 'var(--calm-soft)',
  warmSoft: 'var(--warm-soft)',
  alertSoft: 'var(--alert-soft)',
  goodSoft: 'var(--good-soft)',
};

// No display serif anywhere — the whole scale is one sans stack, and the
// hierarchy comes from size and weight rather than from a second face.
export const SIZE: Record<string, string> = { xs: '11px', sm: '12.5px', md: '14px', lg: '17px', xl: '22px', xxl: '30px', display: '44px' };
export const WEIGHT: Record<string, number> = { normal: 400, medium: 500, semi: 600, bold: 700 };

// ── STATUS. Five words, each one a claim about a state.
//
// `neutral` reads on `--ink-soft` rather than `--ink-mute`: mute on sunk is
// 4.6:1 in the stock palette and worse in a studio's, which is a caption
// pretending to be a label.
export const TONE: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--surface-sunk)', fg: 'var(--ink-soft)' },
  accent: { bg: 'var(--accent)', fg: 'var(--accent-ink)' },
  calm: { bg: 'var(--calm-soft)', fg: 'var(--calm)' },
  warm: { bg: 'var(--warm-soft)', fg: 'var(--warm)' },
  alert: { bg: 'var(--alert-soft)', fg: 'var(--alert)' },
  good: { bg: 'var(--good-soft)', fg: 'var(--good)' },
};

// ── IDENTITY. Ten colours, each one a claim about nothing.
//
// A program, a role, a belt rank picks one of these. They are deliberately
// named for what they LOOK like — a studio calling its competition stream
// "rose" is describing a colour, where calling it "alert" was describing a
// problem it does not have. `design-check` refuses a row that colours an
// identity with a TONE word.
export const HUES = ['rose', 'amber', 'lime', 'emerald', 'teal', 'sky', 'indigo', 'violet', 'fuchsia', 'stone'] as const;
export type HueName = (typeof HUES)[number];

export const HUE: Record<string, { bg: string; fg: string }> = Object.fromEntries(
  HUES.map((hue) => [hue, { bg: `var(--hue-${hue}-soft)`, fg: `var(--hue-${hue})` }]),
);

// A STABLE HUE FOR A STRING. Used for avatars: the same person is the same
// colour on every screen, forever, with no column to store and no meaning to
// misread. FNV-1a, the same hash the catalog's version token uses.
export const hueOf = (value: string): HueName => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return HUES[h % HUES.length] as HueName;
};

// A mark's colour: a hue if it names one, a tone if it names one of those, and
// the accent as the floor — so an unknown string is a visible mark rather than
// a transparent one.
export const markColor = (name: string | undefined): string =>
  name === undefined || name === ''
    ? 'var(--accent)'
    : (HUES as readonly string[]).includes(name)
      ? `var(--hue-${name})`
      : TONE[name] !== undefined
        ? (TONE[name] as { fg: string }).fg
        : 'var(--accent)';

export const RADIUS: Record<string, string> = { none: '0', sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', pill: '999px' };

export const LINE = '1px solid var(--line)';

// Shared prop fragments, so twelve components do not each re-declare `border`
// slightly differently.
export const border = z.union([z.boolean(), z.enum(['top', 'bottom', 'left', 'right'])]).optional();
export const colorToken = z.enum(['ink', 'soft', 'mute', 'faint', 'accent', 'calm', 'warm', 'alert', 'good', 'invert']).optional();
export const bgToken = z.enum(['none', 'ground', 'surface', 'sunk', 'ink', 'accent', 'accentSoft', 'calmSoft', 'warmSoft', 'alertSoft', 'goodSoft']).optional();
export const toneToken = z.enum(['neutral', 'accent', 'calm', 'warm', 'alert', 'good']).optional();
// A mark or pill may name either vocabulary; what it may not do is name a tone
// for a thing that has no state. The enum stays open to both because one prop
// (`Dot.tone`, a `dotKey` column) serves programs and statuses alike — the
// discipline is enforced where the DATA is authored, not here.
export const hueToken = z.enum(HUES).optional();
export const markToken = z.enum([...HUES, 'neutral', 'accent', 'calm', 'warm', 'alert', 'good']).optional();
export const sizeToken = z.enum(['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'display']).optional();
export const radiusToken = z.enum(['none', 'sm', 'md', 'lg', 'pill']).optional();

export const borderStyle = (value: boolean | 'top' | 'bottom' | 'left' | 'right' | undefined): Record<string, string> => {
  if (value === undefined || value === false) return {};
  if (value === true) return { border: LINE };
  const side = { top: 'borderTop', bottom: 'borderBottom', left: 'borderLeft', right: 'borderRight' }[value];
  return { [side]: LINE };
};
