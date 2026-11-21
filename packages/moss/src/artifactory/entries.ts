import { createMemoryCache, seedCache } from '@niscorp/vex';
import type { CacheEntry, Query, SeedEntry, SeedMutation } from '@niscorp/vex';

type Entry = SeedEntry | SeedMutation;

export type CompileRead = (dsl: Query) => void;

const refuseUnrunnable = (entries: readonly Entry[], compile: CompileRead | undefined, heading: string): void => {
  if (compile === undefined) return;
  const unrunnable = entries.flatMap((entry) => {
    if (!('dsl' in entry)) return [];
    try {
      compile(entry.dsl);
      return [];
    } catch (error) {
      return [`  "${entry.fingerprint}": ${error instanceof Error ? error.message : String(error)}`];
    }
  });
  if (unrunnable.length > 0) throw new Error([heading, ...unrunnable].join('\n'));
};

type CompiledEntries = ReadonlyMap<string, CacheEntry>;

export const compileEntries = async (entries: readonly Entry[]): Promise<CompiledEntries> => {
  const compiled = createMemoryCache();
  await seedCache(compiled, entries);
  return new Map(((await compiled.entries?.()) ?? []).map(({ key, entry }) => [key, entry]));
};

const mergedEntries = (own: readonly Entry[], sets: ReadonlyMap<string, readonly Entry[]>): readonly Entry[] => {
  const byFingerprint = new Map<string, Entry>();
  for (const entry of [...own, ...[...sets.values()].flat()]) byFingerprint.set(entry.fingerprint, entry);
  return Object.freeze([...byFingerprint.values()]);
};

type EntriesInForce = {
  list: () => readonly Entry[];
  byFingerprint: () => ReadonlyMap<string, Entry>;
  hasSet: (source: string) => boolean;
  withSet: (source: string, handed: readonly Entry[]) => readonly Entry[];
  takeSet: (source: string, handed: readonly Entry[], compiled: CompiledEntries) => void;
  compiled: () => Promise<CompiledEntries>;
};

// `compileRead`, given: every seeded read is compiled against the database when it is taken, at boot and on a refresh.
export const createEntriesInForce = (own: readonly Entry[], compileRead?: CompileRead): EntriesInForce => {
  refuseUnrunnable(own, compileRead, 'Seeded reads that do not run — refusing to serve:');
  let sets: ReadonlyMap<string, readonly Entry[]> = new Map();
  let list = mergedEntries(own, sets);
  let byFingerprint: ReadonlyMap<string, Entry> = new Map(list.map((entry) => [entry.fingerprint, entry]));
  let ownCompiled: Promise<CompiledEntries> | undefined;
  let setsCompiled: ReadonlyMap<string, CompiledEntries> = new Map();
  let compiled: Promise<CompiledEntries> | undefined;

  return {
    list: () => list,
    byFingerprint: () => byFingerprint,
    hasSet: (source) => sets.has(source),
    withSet: (source, handed) => mergedEntries(own, new Map([...sets, [source, handed]])),
    takeSet: (source, handed, taken) => {
      refuseUnrunnable(handed, compileRead, 'Refresh refused — seeded reads that do not run:');
      sets =new Map([...sets, [source, handed]]);
      list = mergedEntries(own, sets);
      byFingerprint = new Map(list.map((entry) => [entry.fingerprint, entry]));
      setsCompiled = new Map([...setsCompiled, [source, taken]]);
      compiled = undefined;
    },
    compiled: () => {
      compiled ??= (async (): Promise<CompiledEntries> => {
        ownCompiled ??= compileEntries(own);
        return new Map([...(await ownCompiled), ...[...setsCompiled.values()].flatMap((set) => [...set])]);
      })();
      return compiled;
    },
  };
};
