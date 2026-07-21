import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ═══════════════════════════════════════════════════════════
// Adapter boundary — core must stay framework-free. Every React
// binding lives under src/adapters/react/; nothing outside it may
// import react or reach into the adapter. This replaces what a
// package boundary would enforce. See ADAPTER.md.
// ═══════════════════════════════════════════════════════════

const SRC = fileURLToPath(new URL('../../src', import.meta.url));

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

const FORBIDDEN = [
  /from\s+['"]react['"]/,
  /from\s+['"]react-dom(\/|['"])/,
  /from\s+['"]@react(\/|['"])/,
  /from\s+['"]\.{1,2}\/react(\/|['"])/,
  /import\s*\(\s*['"](?:react|@react|\.{1,2}\/react)/,
];

// React lives in adapters/react — and in adapters/ink, which rides the react
// walker with an Ink kit (Ink IS react). Everything else is react-free.
const REACT_ADAPTERS = [join('adapters', 'react'), join('adapters', 'ink')];
const INK_ADAPTER = join('adapters', 'ink');
const INK_FORBIDDEN = /from\s+['"]ink(-text-input)?['"]/;

const inside = (rel: string, dir: string): boolean => rel === dir || rel.startsWith(`${dir}${sep}`);

describe('adapter boundary', () => {
  it('core (everything outside the react-shaped adapters) never imports react or reaches into them', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (REACT_ADAPTERS.some((dir) => inside(rel, dir))) continue;
      const content = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(content)) violations.push(`${rel}: ${String(pattern)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('nothing outside src/adapters/ink imports ink', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (inside(rel, INK_ADAPTER)) continue;
      if (INK_FORBIDDEN.test(readFileSync(file, 'utf8'))) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });

  it('core never imports ANY adapter — adapters are leaves, reached only via their subpaths', () => {
    const reachesIn = /from\s+['"]\.{1,2}\/(?:\.\.\/)*adapters(\/|['"])/;
    const violations: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (rel.startsWith(`adapters${sep}`)) continue;
      if (reachesIn.test(readFileSync(file, 'utf8'))) violations.push(rel);
    }
    expect(violations).toEqual([]);
  });
});
