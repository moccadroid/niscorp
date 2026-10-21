import type { Screen } from '../../app/screens';
import type { Catalog } from './catalog';
import type { OpenCanvas } from './screen';

export type Question = { type: 'noul'; instructions: string };

// A yes is a probability of 0.5 or more.
export type Picked = { yes: boolean; probability?: number };

export type Decide = (state: Record<string, unknown>, questions: Record<string, Question>) => Promise<Record<string, Picked>>;

export type Picks = {
  actions: { id: string; probability: number }[];
  reads: { fingerprint: string; probability: number }[];
  writes: { fingerprint: string; probability: number }[];
  screens: { id: string; probability: number }[];
};

const probabilityOf = (picked: Picked | undefined): number => picked?.probability ?? (picked?.yes === true ? 1 : 0);

// The state carries what each candidate is, in words; each question names its candidate by key.
export const pick = async (message: string, open: readonly OpenCanvas[], catalog: Catalog, screens: readonly Screen[], decide: Decide): Promise<Picks> => {
  const state = {
    message,
    open_screen: Object.fromEntries(open.map((canvas) => [canvas.area, canvas.intent])),
    actions: Object.fromEntries(catalog.actions.map((action) => [action.id, action.description])),
    reads: Object.fromEntries(catalog.reads.map((read) => [read.fingerprint, read.intent])),
    writes: Object.fromEntries(catalog.writes.map((write) => [write.fingerprint, write.intent])),
    screens: Object.fromEntries(screens.map((screen) => [screen.id, screen.description])),
  };
  const questions: Record<string, Question> = {};
  catalog.actions.forEach((action, at) => {
    questions[`action${at}`] = { type: 'noul', instructions: `Does the answer to the message need actions["${action.id}"]?` };
  });
  catalog.reads.forEach((read, at) => {
    questions[`read${at}`] = { type: 'noul', instructions: `Does the message ask for what reads["${read.fingerprint}"] answers?` };
  });
  catalog.writes.forEach((write, at) => {
    questions[`write${at}`] = { type: 'noul', instructions: `Does the message ask to do what writes["${write.fingerprint}"] does?` };
  });
  screens.forEach((screen, at) => {
    questions[`screen${at}`] = { type: 'noul', instructions: `Does the message ask to see screens["${screen.id}"] as it is?` };
  });

  const picked = await decide(state, questions);
  return {
    actions: catalog.actions.map((action, at) => ({ id: action.id, probability: probabilityOf(picked[`action${at}`]) })),
    reads: catalog.reads.map((read, at) => ({ fingerprint: read.fingerprint, probability: probabilityOf(picked[`read${at}`]) })),
    writes: catalog.writes.map((write, at) => ({ fingerprint: write.fingerprint, probability: probabilityOf(picked[`write${at}`]) })),
    screens: screens.map((screen, at) => ({ id: screen.id, probability: probabilityOf(picked[`screen${at}`]) })),
  };
};
