import type { Usage } from '@niscorp/cortex';
import type { Screen } from '../../app/screens';
import type { Catalog } from './catalog';
import type { OpenCanvas } from './screen';

type Question = { type: 'noul'; instructions: string };
type Picked = { yes: boolean; probability?: number };

export type Decide = (state: Record<string, unknown>, questions: Record<string, Question>) => Promise<{ picked: Record<string, Picked>; usage: Usage }>;

const KINDS = ['actions', 'reads', 'writes', 'screens'] as const;
type Kind = (typeof KINDS)[number];
type Candidate = { name: string; says: string };

export type Picks = Record<Kind, { name: string; probability: number }[]>;

const ASK: Record<Kind, (name: string) => string> = {
  actions: (name) => `Does the answer to the message need actions["${name}"]?`,
  reads: (name) => `Does the message ask for what reads["${name}"] answers?`,
  writes: (name) => `Does the message ask to do what writes["${name}"] does?`,
  screens: (name) => `Does the message ask to see screens["${name}"] as it is?`,
};

const probabilityOf = (picked: Picked | undefined): number => picked?.probability ?? (picked?.yes === true ? 1 : 0);

// The state carries what each candidate is, in words; each question names its candidate by key.
export const pick = async (message: string, open: readonly OpenCanvas[], catalog: Catalog, screens: readonly Screen[], decide: Decide): Promise<{ picks: Picks; usage: Usage }> => {
  const candidates: Record<Kind, Candidate[]> = {
    actions: catalog.actions.map((action) => ({ name: action.id, says: action.description })),
    reads: catalog.reads.map((read) => ({ name: read.fingerprint, says: read.intent })),
    writes: catalog.writes.map((write) => ({ name: write.fingerprint, says: write.intent })),
    screens: screens.map((screen) => ({ name: screen.id, says: screen.description })),
  };
  const state = {
    message,
    open_screen: Object.fromEntries(open.map((canvas) => [canvas.area, canvas.intent])),
    ...Object.fromEntries(KINDS.map((kind) => [kind, Object.fromEntries(candidates[kind].map(({ name, says }) => [name, says]))])),
  };
  const questions = Object.fromEntries(KINDS.flatMap((kind) => candidates[kind].map(({ name }, at): [string, Question] => [`${kind}${at}`, { type: 'noul', instructions: ASK[kind](name) }])));

  const { picked, usage } = await decide(state, questions);
  const scored = (kind: Kind): Picks[Kind] => candidates[kind].map(({ name }, at) => ({ name, probability: probabilityOf(picked[`${kind}${at}`]) }));
  return { picks: { actions: scored('actions'), reads: scored('reads'), writes: scored('writes'), screens: scored('screens') }, usage };
};
