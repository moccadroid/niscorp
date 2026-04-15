// ═══════════════════════════════════════════════════════════
// Maps a story id to the raw text of its defining recipe file.
//
// Priority:
//   <id>.recipe.tsx   — the authored Demo (what runs)
//   <id>.ts           — showroom wrapper (fallback)
//
// When a sibling `<id>.ui.tsx` exists (per-story renderer) it's
// appended so the Source tab shows both in one scroll.
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
