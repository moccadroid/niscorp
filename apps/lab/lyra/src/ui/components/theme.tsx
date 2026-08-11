import { useEffect } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// The SURFACE half of theming (PLAN.md): a studio's token set, applied to the
// document as CSS custom properties. Renders nothing.
//
// The difference from a stylesheet-per-tenant is the whole product argument.
// The tokens arrive as DATA — a row, read per principal, delivered in the
// action's own boot input — so changing a studio's palette is a write, not a
// deploy, and it reaches shells that are already open. Nothing in a layout and
// nothing in a component learns that it happened, because every colour in the
// kit already resolves through one of these properties.
//
// The STRUCTURE half — replacing whole layouts per action — happens server-side
// at shell build and never reaches this file.
//
// Only names the stock palette declares are honoured. That is not a security
// boundary (a theme is not hostile, it is ours), it is a rot boundary: a token
// nobody consumes is a value somebody will keep maintaining long after the
// component that read it was deleted.
export const HUES = ['rose', 'amber', 'lime', 'emerald', 'teal', 'sky', 'indigo', 'violet', 'fuchsia', 'stone'] as const;

const KNOWN = new Set([
  'ground',
  'surface',
  'surface-sunk',
  'ink',
  'ink-soft',
  'ink-mute',
  'ink-faint',
  'line',
  'line-strong',
  'accent',
  'accent-ink',
  'accent-soft',
  'calm',
  'calm-soft',
  'warm',
  'warm-soft',
  'alert',
  'alert-soft',
  'good',
  'good-soft',
  // The identity scale. A studio may retune a hue — its Competition stream in
  // its own red — and every badge, dot and edge wearing it follows.
  ...HUES.flatMap((hue) => [`hue-${hue}`, `hue-${hue}-soft`]),
  'radius-sm',
  'radius-md',
  'radius-lg',
  'font',
  'font-mono',
]);

// WHICH PALETTE THE TOKENS SIT ON. A studio says `scheme: 'dark'` and inherits
// twenty hue values and five status tones already tuned against a dark ground,
// instead of hand-listing soft backgrounds it cannot pair with foregrounds it
// has no way to reach. It is an ATTRIBUTE rather than a token because CSS
// custom properties cannot branch — a value can be swapped, a whole set cannot.
const SCHEMES = new Set(['light', 'dark']);

const ThemeProps = z
  .object({
    tokens: z.record(z.string(), z.string()).optional().describe('Token name → CSS value. Unknown names are ignored.'),
    name: z.string().optional().describe('For the devtools tree — which theme is on'),
  })
  .strict();

export const Theme: NovaComponent<z.infer<typeof ThemeProps>> = ({ tokens }: z.infer<typeof ThemeProps>) => {
  useEffect(() => {
    if (tokens === undefined) return;
    const root = document.documentElement;
    const applied: string[] = [];
    const scheme = tokens['scheme'];
    if (scheme !== undefined && SCHEMES.has(scheme)) root.setAttribute('data-scheme', scheme);
    for (const [key, value] of Object.entries(tokens)) {
      if (!KNOWN.has(key)) continue;
      root.style.setProperty(`--${key}`, value);
      applied.push(key);
    }
    // Unmounting has to put the stock palette back rather than leave the last
    // studio's colours on the document — the case that bites when one browser
    // signs out of Lumen and into North Rock without a reload.
    return () => {
      for (const key of applied) root.style.removeProperty(`--${key}`);
      root.removeAttribute('data-scheme');
    };
  }, [tokens]);
  return null;
};
Theme.meta = { description: "Applies a studio's palette to the document as CSS custom properties. Renders nothing.", propsSchema: ThemeProps };
