import type { Catalog, EnvSpec, Item, Part } from './items';

// Question id → the id of the item that answers it.
export type Picks = Readonly<Record<string, string>>;

const itemNamed = (catalog: Catalog, id: string): Item | undefined => catalog.items.find((item) => item.id === id);

// What the items picked so far say other questions must be answered with.
export const impliedBy = (catalog: Catalog, picks: Picks): Record<string, string> => {
  const implied: Record<string, string> = {};
  for (const id of Object.values(picks)) Object.assign(implied, itemNamed(catalog, id)?.requires ?? {});
  return implied;
};

// The items that can still answer a question, beside what is picked.
export const offered = (catalog: Catalog, question: string, picks: Picks): Item[] => {
  const implied = impliedBy(catalog, picks)[question];
  return catalog.items.filter(
    (item) =>
      item.answers === question &&
      (implied === undefined || implied === item.id) &&
      Object.entries(item.requires ?? {}).every(([other, wanted]) => picks[other] === undefined || picks[other] === wanted),
  );
};

// Answers every question the picks leave open the way a person who takes the defaults would.
export const completed = (catalog: Catalog, picks: Picks): Record<string, string> => {
  const done: Record<string, string> = { ...picks };
  for (const question of catalog.questions) {
    if (done[question.id] !== undefined) continue;
    const choices = offered(catalog, question.id, done);
    const chosen = choices.find((item) => item.default === true) ?? choices[0];
    if (chosen === undefined) throw new Error(`create-nisc: nothing can answer "${question.message}" beside ${Object.values(done).join(', ')}`);
    done[question.id] = chosen.id;
  }
  return done;
};

// The items an app is made of: the one answering each question, in the order they are asked, then the ones every
// app has. Refused when a question is unanswered or an item's requirement is not met.
export const itemsOf = (catalog: Catalog, picks: Picks): Item[] => {
  const answering = catalog.questions.map((question) => {
    const id = picks[question.id];
    const item = id === undefined ? undefined : itemNamed(catalog, id);
    if (item === undefined || item.answers !== question.id) throw new Error(`create-nisc: "${question.message}" has no answer${id === undefined ? '' : ` — "${id}" does not answer it`}`);
    return item;
  });
  for (const item of answering) {
    for (const [question, wanted] of Object.entries(item.requires ?? {})) {
      if (picks[question] !== wanted) throw new Error(`create-nisc: "${item.id}" needs "${wanted}", not "${picks[question] ?? 'nothing'}"`);
    }
  }
  return [...answering, ...catalog.items.filter((item) => item.answers === undefined)];
};

// Each item's own part, followed by its part for every other item the app is made of.
export const partsOf = (items: readonly Item[]): Part[] => {
  const ids = new Set(items.map((item) => item.id));
  return items.flatMap((item) => [item, ...Object.entries(item.with ?? {}).flatMap(([other, part]) => (ids.has(other) ? [part] : []))]);
};

export const envOf = (items: readonly Item[]): EnvSpec[] => partsOf(items).flatMap((part) => part.env ?? []);
