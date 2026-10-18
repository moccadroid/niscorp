import type { SavedRows, SavedVersion } from './saves';

export const TOUCH_EVERY_MS = 3_600_000;

// A person's artifacts in force are stamped as used when a shell is built for
// them, once within `everyMs` for each, so a shell that is rebuilt often writes
// seldom. The stamp is what the sweep over what is unused reads.
export const createUsage = (everyMs: number, now: () => number = Date.now): { touch: (principal: string, versions: readonly SavedVersion[], rows: Pick<SavedRows, 'touch'>) => void } => {
  const stamped = new Map<string, number>();
  return {
    touch: (principal, versions, rows) => {
      const at = now();
      for (const [key, when] of stamped) if (when <= at - everyMs) stamped.delete(key);
      const due = versions.filter((version) => version.body !== null && !stamped.has(`${principal}\0${version.kind}\0${version.id}`));
      if (due.length === 0) return;
      for (const version of due) stamped.set(`${principal}\0${version.kind}\0${version.id}`, at);
      rows
        .touch(
          due.map((version) => ({ kind: version.kind, id: version.id })),
          new Date(at).toISOString(),
        )
        .catch((error: unknown) => console.error(`[moss] the artifacts of ${principal} could not be stamped as used:`, error));
    },
  };
};
