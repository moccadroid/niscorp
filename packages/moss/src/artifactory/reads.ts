import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import type { CacheEntry, SeedEntry } from '@niscorp/vex';
import { VEX_SCHEMAS } from '@niscorp/vex/migrations';
import type { z } from 'zod';
import { compileEntries } from './entries';
import type { SavedVersion } from './saves';

const SavedReadSchema = VEX_SCHEMAS['nisc.vex/entry'];

export type SavedRead = z.infer<typeof SavedReadSchema>;

export type ReadSources = {
  // What vex wrote under this fingerprint for a request, in its own table.
  written: (fingerprint: string) => Promise<CacheEntry | undefined>;
  // Throws, with vex's sentence, where the query does not run against the schema.
  compile: (dsl: SavedRead['dsl']) => void;
};

export type ReadHeldTo = { isAppEntry: (fingerprint: string) => boolean; sources: ReadSources };

type Read = { body: SavedRead } | { refusal: string };

const sentenceOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const seedOf = (fingerprint: string, read: SavedRead): SeedEntry => ({ fingerprint, ...read });

// Not protected, as an entry the app ships is: vex holds a query nobody reviewed to its limits, and lets a request write it anew.
export const compiledRead = async (fingerprint: string, read: SavedRead): Promise<CacheEntry | undefined> => {
  const compiled = (await compileEntries([seedOf(fingerprint, read)])).get(fingerprint);
  if (compiled === undefined) return undefined;
  const { protected: _shipped, ...entry } = compiled;
  return entry;
};

const shippedRefusal = (fingerprint: string): string =>
  `"${fingerprint}" is the fingerprint of an entry the app ships or was handed, and a read somebody generated never answers in its place`;

export const readSaved = async (body: unknown, fingerprint: string, heldTo: ReadHeldTo): Promise<Read> => {
  if (heldTo.isAppEntry(fingerprint)) return { refusal: shippedRefusal(fingerprint) };
  // First: the schema recurses, and a deep enough body overflows the stack.
  if (exceedsDepth(body)) return { refusal: depthRefusal() };
  const parsed = SavedReadSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { refusal: first === undefined ? 'no reason given' : `${first.path.join('.') || '(the body)'}: ${first.message}` };
  }
  try {
    heldTo.sources.compile(parsed.data.dsl);
    await compiledRead(fingerprint, parsed.data);
  } catch (error) {
    return { refusal: sentenceOf(error) };
  }
  return { body: parsed.data };
};

export const readWritten = async (fingerprint: string, heldTo: ReadHeldTo): Promise<Read> => {
  if (heldTo.isAppEntry(fingerprint)) return { refusal: shippedRefusal(fingerprint) };
  const entry = await heldTo.sources.written(fingerprint);
  if (entry === undefined || entry.requestHash === undefined) return { refusal: `vex holds no query it wrote under "${fingerprint}"` };
  if (entry.kind !== 'ok') return { refusal: `vex found no query to answer under "${fingerprint}"` };
  if (entry.shape !== undefined && entry.mapping === undefined) {
    return { refusal: `vex kept no prism config for the mapping of "${fingerprint}": it was written before vex kept one. Ask for it again.` };
  }
  return readSaved(
    {
      dsl: entry.dsl,
      ...(entry.mapping !== undefined ? { mapping: entry.mapping } : {}),
      ...(entry.shape !== undefined ? { shape: entry.shape } : {}),
      ...(entry.intent !== undefined ? { intent: entry.intent } : {}),
      ...(entry.reach !== undefined ? { reach: entry.reach } : {}),
      ...(entry.refresh !== undefined ? { refresh: entry.refresh } : {}),
    },
    fingerprint,
    heldTo,
  );
};

// What a replay is answered: vex compiles the query to run it, and refuses one that no longer runs.
export const answeredRead = async (fingerprint: string, body: unknown): Promise<CacheEntry | undefined> => {
  if (exceedsDepth(body)) return undefined;
  const parsed = SavedReadSchema.safeParse(body);
  return parsed.success ? compiledRead(fingerprint, parsed.data) : undefined;
};

// One that does not pass any more (a column it reads was dropped) is left out, and a line says why.
export const readsInForce = async (inForce: readonly SavedVersion[], heldTo: ReadHeldTo, whose?: string): Promise<ReadonlyMap<string, SavedRead>> => {
  const reads = new Map<string, SavedRead>();
  for (const version of inForce) {
    if (version.kind !== 'read' || version.body === null) continue;
    const read = version.unread !== undefined ? { refusal: version.unread } : await readSaved(version.body, version.id, heldTo);
    if ('body' in read) reads.set(version.id, read.body);
    else if (whose !== undefined) console.error(`[moss] the read "${version.id}" ${whose} is left out: ${read.refusal}`);
  }
  return reads;
};
