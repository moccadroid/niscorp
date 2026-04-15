// ═══════════════════════════════════════════════════════════
// Pairs each cortex story with the raw source of its authoring
// file AND the raw source of every agent file it imports. Both
// are walked via Vite's `import.meta.glob` at build time so
// authors just write stories — no per-story raw-import
// threading, no regex hacks on comments or ids.
//
// The story-file → agent-file link comes from scanning the
// story file's `import ... from '../agents/<name>'` statements.
// That's a narrow, targeted parse of static import lines (not
// free-text scanning) and it's robust for the single import
// convention used throughout `./stories/*.stories.ts`.
// ═══════════════════════════════════════════════════════════

type UnknownModule = Record<string, unknown>;

const storyMods = import.meta.glob('./stories/*.stories.ts', { eager: true }) as Record<
  string,
  UnknownModule
>;
const storyRaws = import.meta.glob('./stories/*.stories.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const agentRaws = import.meta.glob('./agents/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Which agent files (by basename without extension) does a
// story file import? One narrow regex on static `from '...'`
// lines — won't match strings in comments or template literals.
const AGENT_IMPORT = /^\s*import\s[\s\S]*?from\s+['"]\.\.\/agents\/([A-Za-z0-9_-]+)['"]/gm;

const agentsReferencedIn = (raw: string): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of raw.matchAll(AGENT_IMPORT)) {
    const name = match[1];
    if (name !== undefined && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
};

const AGENT_SEPARATOR = (name: string): string =>
  `\n\n// ═══════════════════════════════════════════════════════════\n// ./agents/${name}.ts — imported by the story above\n// ═══════════════════════════════════════════════════════════\n\n`;

const buildCombined = (storyRaw: string): string => {
  const names = agentsReferencedIn(storyRaw);
  let out = storyRaw;
  for (const name of names) {
    const agentRaw = agentRaws[`./agents/${name}.ts`];
    if (agentRaw !== undefined) out += AGENT_SEPARATOR(name) + agentRaw;
  }
  return out;
};

const byId: Record<string, string> = {};

// Every id declared inside a `.stories.ts` module gets its file
// + its imported agent files concatenated.
for (const [path, mod] of Object.entries(storyMods)) {
  const storyRaw = storyRaws[path];
  if (storyRaw === undefined) continue;
  const combined = buildCombined(storyRaw);
  for (const value of Object.values(mod)) {
    if (!Array.isArray(value)) continue;
    for (const story of value) {
      if (story !== null && typeof story === 'object' && 'id' in story) {
        const id = (story as { id: unknown }).id;
        if (typeof id === 'string') byId[id] = combined;
      }
    }
  }
}

// Inline standalone stories in the root barrel point at that
// file instead. (Preferred: move them into a dedicated
// `.stories.ts` — then they auto-wire exactly like the others.)
import storiesBarrelRaw from './stories?raw';
import { stories } from './stories';
const barrelCombined = buildCombined(storiesBarrelRaw);
for (const story of stories) {
  if (byId[story.id] === undefined) byId[story.id] = barrelCombined;
}

export const getStorySource = (storyId: string): string => byId[storyId] ?? '';
