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

// A value that could end its own declaration is dropped: here it is written into
// markup and read as CSS, where `setProperty` below takes it as a value.
export const themeDocumentAttributes = (tokens: Record<string, string> | undefined): Record<string, string> => {
  if (tokens === undefined) return {};
  const scheme = tokens['scheme'];
  const declarations = Object.entries(tokens)
    .filter(([key, value]) => KNOWN.has(key) && !/[;{}<>]/.test(value))
    .map(([key, value]) => `--${key}:${value}`);
  return {
    ...(scheme !== undefined && SCHEMES.has(scheme) ? { 'data-scheme': scheme } : {}),
    ...(declarations.length > 0 ? { style: declarations.join(';') } : {}),
  };
};

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
