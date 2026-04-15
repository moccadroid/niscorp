// ═══════════════════════════════════════════════════════════
// Maps a story id to the raw text of its defining recipe file.
// Vite's `?raw` glob loads every file's source at build time
// (eager), so there's no runtime cost. The inspector's Source
// tab reads from this map — the authored file IS the demo.
//
// Per story id, we look for (in priority):
//   <id>.recipe.tsx   — streaming recipes with a React Demo
//   <id>.recipe.ts    — chat recipes (plain async complete fn)
//   <id>.ts           — the showroom-wrapper fallback
//
// When a sibling <id>.ui.tsx file exists (per-story renderer,
// e.g. DashboardCard) it's appended below the recipe so a
// reader sees the full picture in one scroll.
// ═══════════════════════════════════════════════════════════

const rawSources = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const byBasename: Record<string, string> = {};
for (const [path, src] of Object.entries(rawSources)) {
  const last = path.split('/').pop();
  if (last === undefined) continue;
  const base = last.replace(/\.(ts|tsx)$/, '');
  byBasename[base] = src;
}

export const getStorySource = (storyId: string): string => {
  const recipe = byBasename[`${storyId}.recipe`] ?? byBasename[storyId] ?? '';
  const ui = byBasename[`${storyId}.ui`];
  if (ui === undefined) return recipe;
  return `${recipe}\n\n// ═══════════════════════════════════════════════════════════\n// ./${storyId}.ui.tsx — per-story renderer (presentational only)\n// ═══════════════════════════════════════════════════════════\n\n${ui}`;
};
