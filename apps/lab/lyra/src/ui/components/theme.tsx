import { useEffect } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

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
    return () => {
      for (const key of applied) root.style.removeProperty(`--${key}`);
      root.removeAttribute('data-scheme');
    };
  }, [tokens]);
  return null;
};
Theme.meta = { description: "Applies a studio's palette to the document as CSS custom properties. Renders nothing.", propsSchema: ThemeProps };
