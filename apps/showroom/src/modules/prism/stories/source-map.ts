// ═══════════════════════════════════════════════════════════
// Maps a prism story id to the raw text of its defining .ts
// file. Stories are flat (id = filename). This powers the
// Source tab, which prints the authored story verbatim.
// ═══════════════════════════════════════════════════════════

const rawSources = import.meta.glob('./**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const byBasename: Record<string, string> = {};
for (const [path, src] of Object.entries(rawSources)) {
  const base = path.split('/').pop()?.replace(/\.ts$/, '');
  if (base !== undefined) byBasename[base] = src;
}

export const getStorySource = (storyId: string): string => byBasename[storyId] ?? '';
