import type { Fact, NewFact, TideEvent, TideStore } from '../types';

// ═══════════════════════════════════════════════════════════════
// The ONE door into the fact table
//
// Facts arrive three ways — the host ingests one, a handler emits
// one, a settled run reports its stats as one — and they used to
// be three bare `appendIfAbsent('fact', …)` calls, each of which
// had to remember to announce what it wrote. One forgot: a chain
// continued by `ctx.emit` landed in the ledger and never appeared
// in the event stream, so a watcher saw a run start on a fact
// nobody announced. And none of them announced a REFUSAL, so an
// emitted fact that landed and one that collided on its dedupeKey
// looked identical — silence either way.
//
// So admitting and announcing are split, and both live here.
// `admitFact` writes and says what happened; `announceFact` turns
// that into the event. They are two functions rather than one
// because a write inside a transaction must not be announced until
// the transaction commits — an event describes a row that exists,
// never one a rollback is about to take back.
// ═══════════════════════════════════════════════════════════════

export type Admission = { stored: Fact } | { refused: NewFact };

// THE CHAIN'S ROOT, from what caused this fact: a task or a run, back to the
// fact that started the run, and from there to that fact's own root. None —
// a host's fact, or the first facts of a run nothing caused (a clock) — makes
// this fact a root itself.
const rootOf = async (store: TideStore, cause: string | undefined): Promise<string | undefined> => {
  if (cause === undefined) return undefined;
  let runId: string | undefined;
  if (cause.startsWith('task:')) {
    const [task] = await store.query({ table: 'task', where: { id: cause.slice('task:'.length) }, limit: 1 });
    runId = task?.runId;
  } else if (cause.startsWith('run:')) {
    runId = cause.slice('run:'.length);
  }
  if (runId === undefined) return undefined;
  const [run] = await store.query({ table: 'run', where: { id: runId }, limit: 1 });
  const parentId = run?.factIds?.[0];
  if (parentId === undefined) return undefined;
  const [parent] = await store.query({ table: 'fact', where: { id: parentId }, limit: 1 });
  return parent === undefined ? undefined : (parent.root ?? parent.id);
};

// Every fact minted beneath a root is counted ON the root, atomically, and
// one past `maxChainFacts` is stored PARKED — breadth's ceiling, as depth's is
// in the matcher. A root swept from the ledger can no longer be counted; its
// chain is long past the point this exists for.
export const admitFact = async (store: TideStore, fact: NewFact, maxChainFacts: number): Promise<Admission> => {
  const root = await rootOf(store, fact.cause);
  let parked: string | undefined;
  if (root !== undefined && (await store.cas('fact', root, {}, { descendants: { inc: 1 } }))) {
    const [counted] = await store.query({ table: 'fact', where: { id: root }, limit: 1 });
    const minted = counted?.descendants ?? 0;
    if (minted > maxChainFacts) parked = `chain from fact ${root} minted ${minted} facts, past maxChainFacts ${maxChainFacts}`;
  }
  const row = { ...fact, ...(root === undefined ? {} : { root }), ...(parked === undefined ? {} : { parked }) };
  const stored = await store.appendIfAbsent('fact', row);
  return stored === undefined ? { refused: fact } : { stored };
};

export const announceFact = (emit: (event: TideEvent) => void, admission: Admission): void => {
  if ('stored' in admission) emit({ type: 'fact.ingested', fact: admission.stored });
  else emit({ type: 'fact.deduped', fact: admission.refused });
};
