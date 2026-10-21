import type { Arrangement } from '../../app/arrangements';
import type { Screen } from '../../app/screens';
import type { Catalog } from './catalog';
import type { OpenCanvas } from './screen';

export type Question = { type: 'noul'; instructions: string } | { type: 'choice'; instructions: string; criteria: Record<string, string> };

// One decision: `yes` for a yes/no (a probability of 0.5 or more is yes), `choice` for a choice, and `p` the
// probability, where the model gave one.
export type Picked = { yes?: boolean; choice?: string; p?: number };

export type Decide = (state: Record<string, unknown>, questions: Record<string, Question>) => Promise<Record<string, Picked>>;

// What Jev made of a message: each action, read, write and screen with how likely it belongs in the answer, and the
// arrangement.
export type Picks = {
  actions: { id: string; p: number }[];
  reads: { fingerprint: string; p: number }[];
  writes: { fingerprint: string; p: number }[];
  screens: { id: string; p: number }[];
  arrangement?: string;
};

const probability = (picked: Picked | undefined): number => picked?.p ?? (picked?.yes === true ? 1 : 0);

// One pass over the message and the open screen. The state carries what each candidate is, in words; each question
// names its candidate by key.
export const pick = async (message: string, open: readonly OpenCanvas[], catalog: Catalog, screens: readonly Screen[], arrangements: readonly Arrangement[], decide: Decide): Promise<Picks> => {
  const state = {
    message,
    open_screen: Object.fromEntries(open.map((canvas) => [canvas.area, canvas.intent])),
    actions: Object.fromEntries(catalog.actions.map((action) => [action.id, action.description])),
    reads: Object.fromEntries(catalog.reads.map((read) => [read.fingerprint, read.intent])),
    writes: Object.fromEntries(catalog.writes.map((write) => [write.fingerprint, write.intent])),
    screens: Object.fromEntries(screens.map((screen) => [screen.id, `${screen.label}: ${screen.canvases.map((canvas) => canvas.intent).join('; ')}`])),
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
  if (arrangements.length > 0) {
    questions['arrangement'] = { type: 'choice', instructions: 'How should the answer to the message be laid out?', criteria: Object.fromEntries(arrangements.map((arrangement) => [arrangement.id, arrangement.suits])) };
  }

  const picked = await decide(state, questions);
  const arrangement = picked['arrangement']?.choice;
  return {
    actions: catalog.actions.map((action, at) => ({ id: action.id, p: probability(picked[`action${at}`]) })),
    reads: catalog.reads.map((read, at) => ({ fingerprint: read.fingerprint, p: probability(picked[`read${at}`]) })),
    writes: catalog.writes.map((write, at) => ({ fingerprint: write.fingerprint, p: probability(picked[`write${at}`]) })),
    screens: screens.map((screen, at) => ({ id: screen.id, p: probability(picked[`screen${at}`]) })),
    ...(arrangement !== undefined ? { arrangement } : {}),
  };
};
