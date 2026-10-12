import type { Fact, NewFact, TideEvent, TideStore } from '../types';

export type Admission = { stored: Fact } | { refused: NewFact };

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
