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

export const admitFact = async (store: TideStore, fact: NewFact): Promise<Admission> => {
  const stored = await store.appendIfAbsent('fact', fact);
  return stored === undefined ? { refused: fact } : { stored };
};

export const announceFact = (emit: (event: TideEvent) => void, admission: Admission): void => {
  if ('stored' in admission) emit({ type: 'fact.ingested', fact: admission.stored });
  else emit({ type: 'fact.deduped', fact: admission.refused });
};
