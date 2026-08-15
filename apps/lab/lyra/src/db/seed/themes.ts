// The two looks: one warm, one dark, so a theme swap is visible in the demo.
import { insert } from '../sql';

export const THEMES_SQL = insert(
  'themes',
  ['id', 'name', 'tokens'],
  [
    [
      'th_sand',
      'Sand',
      // Warm and quiet: off-white grounds, ink softened towards brown, a clay
      // accent that carries dark text. What a yoga studio would pick.
      JSON.stringify({
        ground: '#fdfcfa',
        surface: '#ffffff',
        'surface-sunk': '#f5f1ea',
        ink: '#1c1917',
        'ink-soft': '#44403c',
        'ink-mute': '#78716c',
        'ink-faint': '#a8a29e',
        line: '#eae4da',
        'line-strong': '#ddd4c6',
        accent: '#c2703d',
        'accent-ink': '#ffffff',
        'accent-soft': '#f8ece3',
        'radius-lg': '20px',
      }),
    ],
    [
      'th_charcoal',
      'Charcoal',
      JSON.stringify({
        ground: '#0c0c0d',
        surface: '#151517',
        'surface-sunk': '#1e1e21',
        ink: '#fafafa',
        'ink-soft': '#d4d4d8',
        'ink-mute': '#8b8b93',
        'ink-faint': '#5c5c63',
        line: '#26262a',
        'line-strong': '#38383e',
        accent: '#ccff00',
        'accent-ink': '#0c0c0d',
        'accent-soft': '#232a05',
        scheme: 'dark',
        'radius-lg': '10px',
      }),
    ],
  ],
);
