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

const ADAPTER = join('adapters', 'react');

describe('adapter boundary', () => {
  it('core (everything outside src/adapters/react) never imports react or the adapter', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (rel === ADAPTER || rel.startsWith(`${ADAPTER}${sep}`)) continue;
      const content = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(content)) violations.push(`${rel}: ${String(pattern)}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
