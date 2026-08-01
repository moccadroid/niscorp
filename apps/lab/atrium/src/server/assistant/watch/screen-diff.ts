import type { ActionDefinition, Shell } from '@niscorp/nova';
import { lifecycleKeys, loadedKeys } from '@niscorp/nova/reflect';

// Has the person's half of the screen changed, and how.
//
// The readings are nova's (`@niscorp/nova/reflect`) — what an endpoint writes,
// what a lifecycle step writes. This file only decides which canvases count and
// turns a difference into sentences.

// The person's working surfaces. `assistant` is the dock's own furniture and
// `chrome` is the frame; neither is a gesture. `detail` and `nav` are here
// because the desk's commonest gestures happen nowhere else — a row click opens
// the record on `detail` and writes nothing to the list.
//
// `aside` is watched too, even though the assistant is the only thing that
// places there: the clerk PRESSING a card it staged is the gesture this whole
// feature exists to follow. Not watching itself is `mine` below, which is a
// finer cut than dropping the canvas.
export const WATCHED: readonly string[] = ['main', 'home', 'work', 'detail', 'nav', 'sheet', 'aside'];

const quietCache = new WeakMap<ActionDefinition, ReadonlySet<string>>();

// A list records which of its rows is open, and that is not a second event. It
// is written by the same click that opens the record, so counting it produces
// two lines for one gesture — the weaker one first:
//
//   "Needs a person": openRow is now stay_olav
//   the user opened "The conversation" on detail showing stayId=stay_olav
//
// It stays in SCREEN, where knowing which row is open is worth having. It is
// only the DIFF that must not treat it as something that happened.
const SELECTION = new Set(['openRow']);

// Keys whose movement is not a gesture: a surface re-reading itself, telling
// itself it has finished loading a beat after the mount that already woke us, or
// noting which of its own rows is open.
const quietKeys = (definition: ActionDefinition): ReadonlySet<string> => {
  const cached = quietCache.get(definition);
  if (cached !== undefined) return cached;
  const keys = new Set([...loadedKeys(definition), ...lifecycleKeys(definition), ...SELECTION]);
  quietCache.set(definition, keys);
  return keys;
};

export type Card = { canvas: string; definitionId: string; title: string; mine: boolean; values: Record<string, unknown> };
export type Fingerprint = Map<string, Card>;

// `mine` marks the assistant's own instances; it does not drop them. PLACING is
// ours and what moves INSIDE a card is theirs, so an open or a close of a card we
// own is not a gesture while a value changing on it is.
export const fingerprintOf = (shell: Shell, definitions: Record<string, ActionDefinition>, mine: (instanceId: string) => boolean): Fingerprint => {
  const out: Fingerprint = new Map();
  const state = shell.getState();
  for (const canvas of WATCHED) {
    for (const item of state.canvases[canvas]?.stack ?? []) {
      const definition = definitions[item.definitionId];
      if (definition === undefined) continue;
      const quiet = quietKeys(definition);
      const values: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shell.getRuntime(item.id)?.getData() ?? {})) if (!quiet.has(key)) values[key] = value;
      out.set(item.id, { canvas, definitionId: item.definitionId, title: definition.title ?? item.definitionId, mine: mine(item.id), values });
    }
  }
  return out;
};

const brief = (value: unknown, cap: number): string => {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  return text.length <= cap ? text : `${text.slice(0, cap)}…`;
};

// Whether a value is worth naming as something a card arrived carrying. An empty
// string, an empty object and `false` are the shape of "nothing chosen".
const carries = (value: unknown): boolean => {
  if (value === '' || value === undefined || value === null || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

// The diff, as sentences. Both the gate's verdict (empty means nothing happened)
// and the prompt's anchor, so the model reacts to exactly what woke it.
//
// WHAT THE LAST ANSWER DID IS NOT SOMETHING THE CLERK DID.
//
//   `wrote`   every (instance, key) it wrote, by fill or by placing onto a card
//             already up. A write lands in card data and is otherwise
//             indistinguishable from the clerk typing.
//   `closed`  every instance it took down. `mine` cannot answer this: a granted
//             canvas is the assistant's whoever opened what is on it, so it
//             closes cards the clerk pushed — and those are `mine: false`. Left
//             out, its own close comes back as "the user closed X" and it answers a
//             gesture nobody made.
//
// Cards it OWNS are skipped on open and on close for the same reason, from the
// other side. A close the CLERK makes is not lost — the ledger sweeps it and
// records a refusal, which is the right response to somebody dismissing an offer.
//
// Every line reads as something THE PERSON did. An instance appearing is a fact
// about our data structures; "the user opened Marco Bianchi's conversation" is the
// event the reader is being asked to react to.
export type Authored = { wrote?: ReadonlyMap<string, ReadonlySet<string>>; closed?: ReadonlySet<string> };

export const changesBetween = (before: Fingerprint, after: Fingerprint, ours: Authored = {}): string[] => {
  const lines: string[] = [];
  const opened: Card[] = [];
  const closed: Card[] = [];

  for (const [id, card] of after) {
    const prior = before.get(id);
    const written = ours.wrote?.get(id);
    if (prior === undefined) {
      if (!card.mine) opened.push(card);
      continue;
    }
    for (const [key, value] of Object.entries(card.values)) {
      if (JSON.stringify(prior.values[key]) === JSON.stringify(value)) continue;
      if (written?.has(key) === true) continue;
      // `expanded` is framework vocabulary, not one domain's. As a raw field
      // change it reads as noise and the model ignores it.
      if (key === 'expanded') {
        lines.push(value === true ? `the user opened "${card.title}" and is reading it now. Its contents are in SCREEN.` : `the user collapsed "${card.title}"`);
        continue;
      }
      // Said in their voice when the card is ours, because it is the whole
      // reason `aside` is watched: this is the clerk taking up an offer, and a
      // run that reads it as "a field changed" misses that the work is now done.
      const who = card.mine ? `the user used "${card.title}": ` : `"${card.title}": `;
      lines.push(carries(value) ? `${who}${key} is now ${brief(value, 400)}` : `${who}${key} was cleared`);
    }
  }
  for (const [id, card] of before) if (!after.has(id) && !card.mine && ours.closed?.has(id) !== true) closed.push(card);

  // A RE-AIM IS ONE EVENT. Clicking a second row `resetTo`s the canvas — nova
  // clears it and pushes — so the instance id changes and one navigation would
  // otherwise report as a close and an open of the same card in the same breath.
  const spare = [...closed];
  for (const card of opened) {
    const match = spare.findIndex((other) => other.canvas === card.canvas && other.definitionId === card.definitionId);
    if (match >= 0) spare.splice(match, 1);
    const carried = Object.entries(card.values).filter(([, value]) => carries(value));
    lines.push(`the user opened "${card.title}" on ${card.canvas}${carried.length === 0 ? '' : ` showing ${carried.map(([key, value]) => `${key}=${brief(value, 140)}`).join(', ')}`}`);
  }
  for (const card of spare) lines.push(`the user closed "${card.title}" on ${card.canvas}`);
  return lines;
};

// Did they go somewhere ELSE, as opposed to working where they already were.
//
// A value moving inside a card is a person doing the thing in front of them; a
// card of theirs opening or closing is a person changing what is in front of
// them, and an answer being composed for the old one is an answer about the
// wrong record. That is the distinction the gate cancels an in-flight run on,
// and it has to be narrow: aborting on every keystroke would mean a clerk who
// types never gets an answer at all.
//
// Ours are excluded for the same reason as everywhere else — we place, and
// placing must not read as them moving.
export const navigatedBetween = (before: Fingerprint, after: Fingerprint): boolean => {
  for (const [id, card] of after) if (!card.mine && !before.has(id)) return true;
  for (const [id, card] of before) if (!card.mine && !after.has(id)) return true;
  return false;
};
