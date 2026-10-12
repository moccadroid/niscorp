import type { OkCacheEntry } from '@niscorp/vex';
import { compile } from '@niscorp/prism';
import { todosOpen, todosToday, todosDone, todoStats } from './todos';

export type CacheEntry = Pick<OkCacheEntry, 'shape' | 'dsl' | 'intent'> & {
  fingerprint: string;
  mapping?: unknown;
};

export const ENTRIES: CacheEntry[] = [todosOpen, todosToday, todosDone, todoStats];

export const buildCacheSeed = async (): Promise<string> => {
  const stmts: string[] = [];
  for (const e of ENTRIES) {
    // An entry without a mapping is seeded with the identity IR: a NULL
    // prism_ir makes Vex's reader fall through to the LLM mapper, which this
    // engine does not have.
    const prismIr = await compile(e.mapping ?? { $ref: '$.result' });
    const prismCol = `$j$${JSON.stringify(prismIr)}$j$::jsonb`;
    stmts.push(
      `INSERT INTO vex_cache (key, kind, intent, shape, dsl, prism_ir, created_at, protected) VALUES (` +
        `$j$${e.fingerprint}$j$, 'ok', $j$${e.intent ?? ''}$j$, ` +
        `$j$${JSON.stringify(e.shape)}$j$::jsonb, $j$${JSON.stringify(e.dsl)}$j$::jsonb, ${prismCol}, now(), true) ` +
        `ON CONFLICT (key) DO NOTHING;`,
    );
  }
  return stmts.join('\n');
};
