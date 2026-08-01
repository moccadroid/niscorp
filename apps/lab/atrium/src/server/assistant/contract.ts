import { z } from 'zod';
import type { Shell } from '@niscorp/nova';
import { reconcileCanvas, type Desired } from '@niscorp/nova';
import { mountInputKeys } from '@niscorp/nova/reflect';
import { definitionsNow, type AvailableAction } from './knowledge';

// What the assistant returns, and the only code that applies it. Both the dock
// and the watcher use this.
//
// The answer is a state, not a sequence of edits: a canvas is a list, so a
// duplicate cannot be expressed, and anything absent from a listed canvas closes.
// nova's `reconcileCanvas` does the placing; what is atrium's is which canvases
// this person granted, what may be seeded into an action, and what they refused.

// Everything the assistant places carries this origin, so nova can answer "is
// this still mine" without the app tracking instances itself.
export const ASSISTANT = 'assistant';

const Placement = z.object({
  id: z.string().describe('an ACTIONS id'),
  input: z.record(z.string(), z.unknown()).optional().describe("the action's input, per its schema in ACTIONS"),
});

const Fill = z.object({
  id: z.string().describe('an ACTIONS id already on SCREEN'),
  input: z.record(z.string(), z.unknown()).describe('fields to write into it, per its input schema'),
});

const COLUMNS = 'The COMPLETE contents of each canvas you name, not a change to it — a card you leave out of a canvas you named is closed. A canvas you do not name is left alone.';
const FILL = 'Write into cards already on screen, including theirs. Only the fields you name change.';

// `data` holds what is ATRIUM'S — the screen — and nothing else.
//
// It used to carry `say` as well, which was the envelope's own `response`
// spelled a second time one level down. Two fields for one concept, and the
// duplicate won because it was the one this app read. The envelope already has
// `response` ("Human-facing text answer") and `reasoning` ("WHY you did what
// you did"); both are now used as they were designed, and `data` stopped
// competing with them.
//
// What the required-ness bought is not lost: `responseMode: 'required'` makes
// the envelope's `response` a required string, so a turn that finishes having
// said nothing still fails validation and cortex asks again.
// `columns` is REQUIRED where the caller holds canvases, and that is the schema
// catching up with the prose.
//
// It was optional, so `data: {}` validated — an answer that says nothing passes
// the machine contract while violating every line of the written one. And
// because omission closes, the shortest valid answer was also the most
// destructive one. Requiring it means every run states the screen it means,
// which is what complete-state was supposed to guarantee all along.
export const answerSchemaFor = (places: readonly string[]) =>
  z.object({
    ...(places.length === 0
      ? {}
      : { columns: z.object(Object.fromEntries(places.map((canvas) => [canvas, z.array(Placement).optional()]))).describe(COLUMNS) }),
    fill: z.array(Fill).optional().describe(FILL),
  });

// The widest shape, for types and for anything that must accept any profile.
export const AnswerSchema = z.object({
  columns: z
    .object({
      sheet: z.array(Placement).optional(),
      main: z.array(Placement).optional(),
      work: z.array(Placement).optional(),
      detail: z.array(Placement).optional(),
      aside: z.array(Placement).optional(),
    })
    .optional()
    .describe(COLUMNS),
  fill: z.array(Fill).optional().describe(FILL),
});

export type Answer = z.infer<typeof AnswerSchema>;
// `wrote` is every (instance, key) this answer wrote, by either verb — the
// second half of the self-trigger brake. A write lands in card data, which the
// watcher's fingerprint reads, so without it the assistant's own typing is
// indistinguishable from the clerk's and every answer wakes the next run.
// `closed` is every instance this answer took down. The watcher needs it for the
// same reason it needs `wrote`: a granted canvas is the assistant's whoever
// opened what is on it, so it closes cards the clerk pushed, and nothing else on
// the screen distinguishes that from the clerk closing them.
export type Applied = { changed: boolean; notes: string[]; wrote: WrittenKeys; closed: Set<string> };

// instance id → the keys written into it.
export type WrittenKeys = Map<string, Set<string>>;
export type Session = { stayId: string; propertyId: string };

// Rule 14: only the target's declared input keys survive, and the session pins
// what a caller must never choose.
export const seedFor = (
  entry: AvailableAction,
  given: Record<string, unknown>,
  session: Session,
  // Keys that were sent and thrown away. Silently dropping them means nobody
  // ever learns: the model reads a card's loaded data off SCREEN, sends it back
  // as input, and pays for the tokens and the nesting depth every run.
  ignored?: string[],
): Record<string, unknown> => {
  const declared = new Set(Object.keys((entry.input as { properties?: Record<string, unknown> }).properties ?? {}));
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(given)) if (declared.has(key)) kept[key] = value;
  if (ignored !== undefined) for (const key of Object.keys(given)) if (!declared.has(key)) ignored.push(key);
  if (declared.has('stayId') && session.stayId !== '') kept['stayId'] = session.stayId;
  if (declared.has('propertyId')) kept['propertyId'] = session.propertyId;
  // The capability is the caller's CHOICE where a surface serves several, and
  // refused when it is not one this property runs. Validating a choice does the
  // job the slot id used to, without a second id space for the model to translate.
  if (declared.has('capability') && entry.capabilities.length > 0) {
    const asked = String(kept['capability'] ?? '');
    kept['capability'] = entry.capabilities.includes(asked) ? asked : (entry.capabilities[0] ?? '');
  }
  return kept;
};

// NO PER-COLUMN CAP. There was one — two cards, silently truncating the third
// with a note nobody read — and it was the mechanism behind the worst failure
// this feature has had: two stale cards held the aside, the car Nadia asked for
// had nowhere to go, and the model wrote "we will arrange a car" instead of
// putting the booking up. It could not obey the rule against unbacked promises
// because obeying it needed a slot that did not exist.
//
// A cap the model cannot see is not a bound, it is a trapdoor. What actually
// keeps a column sane is that the answer is COMPLETE STATE — the model writes
// the whole column every time, so a column it overfills is a column it chose to
// overfill and can see itself doing. `reconcileCanvas` still refuses a second
// copy of the same action, which is the one bound worth keeping because a
// duplicate is never intent.

// What a card is pointed at. Sorted, and without the fragment's own `sheetTitle`,
// so the same offer produces the same string however it was assembled.
const aimOf = (input: Record<string, unknown>): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(input)
        .filter(([key]) => key !== 'sheetTitle')
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );

// A card the assistant offered and the person closed. Re-offering it is the
// fastest way to have the feature switched off, so closures are remembered and
// fed back as context. In-session only: the shell dies, this dies with it.
export type Dismissal = { title: string; definitionId: string; aim: string; at: number };
const DISMISSAL_CAP = 8;

// A refusal was a PERMANENT veto on that exact card and aim for the whole
// session. Two things were wrong with that. A card closed after five minutes was
// used, not rejected — the close is how you finish with something. And a person
// tidying their screen once could silently disable an offer for the rest of the
// shift, with nothing anywhere saying why it stopped coming.
//
// So a closure counts as a refusal only if it was FAST — shut almost as soon as
// it appeared, which is what "no" looks like — and it expires. Long enough that
// re-offering inside a minute reads as not listening; short enough that the
// feature comes back.
const REFUSAL_WINDOW_MS = 20_000;
const REFUSAL_TTL_MS = 5 * 60_000;

export type Ledger = {
  // What is currently on offer, recorded by `apply` as it places.
  remember: (instanceId: string, card: Dismissal) => void;
  // Anything of ours off the screen that we did not close, they closed. Run on
  // the settled tick, never mid-burst.
  sweep: (shell: Shell) => void;
  dismissals: () => readonly Dismissal[];
  // The refusals, for the prompt. Empty when there are none: it used to also
  // count the cards on offer, which SCREEN already marks [YOURS] card by card.
  lines: () => string;
};

const liveIds = (shell: Shell): Set<string> => {
  const out = new Set<string>();
  for (const state of Object.values(shell.getState().canvases)) for (const item of state.stack) out.add(item.id);
  return out;
};

export const createLedger = (): Ledger => {
  const offered = new Map<string, Dismissal>();
  const dismissed: Dismissal[] = [];

  // Only refusals still inside their TTL count, so a veto fades instead of
  // lasting the shift.
  const live = (): Dismissal[] => {
    const cutoff = Date.now() - REFUSAL_TTL_MS;
    while (dismissed.length > 0 && (dismissed[0]?.at ?? 0) < cutoff) dismissed.shift();
    return dismissed;
  };

  return {
    remember: (instanceId, card) => offered.set(instanceId, card),

    sweep: (shell) => {
      const present = liveIds(shell);
      const now = Date.now();
      for (const [id, card] of [...offered]) {
        if (present.has(id)) continue;
        offered.delete(id);
        // Closed long after it went up? They used it. Only a quick shut is a no.
        if (now - card.at > REFUSAL_WINDOW_MS) continue;
        dismissed.push({ ...card, at: now });
        while (dismissed.length > DISMISSAL_CAP) dismissed.shift();
      }
    },

    dismissals: () => live(),

    lines: () =>
      live().length === 0
        ? ''
        : `REFUSED — you offered these and they closed them straight away. They said no:\n${live()
            .map((entry) => `  "${entry.title}" (${entry.definitionId})${entry.aim === '{}' ? '' : ` aimed at ${entry.aim}`}`)
            .join('\n')}`,
  };
};

const topInstanceOf = (shell: Shell, actionId: string): string | undefined => {
  for (const state of Object.values(shell.getState().canvases)) {
    for (let index = state.stack.length - 1; index >= 0; index -= 1) {
      const item = state.stack[index];
      if (item !== undefined && item.definitionId === actionId) return item.id;
    }
  }
  return undefined;
};

export const apply = (
  shell: Shell,
  ledger: Ledger,
  actions: readonly AvailableAction[],
  session: Session,
  allowed: readonly string[],
  answer: Answer,
): Applied => {
  const byId = new Map(actions.map((entry) => [entry.id, entry]));
  const definitions = definitionsNow();
  const wrote: WrittenKeys = new Map();
  const closed = new Set<string>();
  const notes: string[] = [];
  let changed = false;

  const refused = new Set(ledger.dismissals().map((entry) => `${entry.definitionId}:${entry.aim}`));
  const columns = answer.columns ?? {};
  for (const canvas of Object.keys(columns)) if (!allowed.includes(canvas)) notes.push(`refused ${canvas}: not this person's to place`);

  // ONLY THE CANVASES THE ANSWER NAMES.
  //
  // Three cases, and the third is why this loop skips rather than reconciling
  // with an empty list:
  //
  //   named with cards   the canvas becomes exactly those
  //   named with []      the canvas is emptied
  //   not named          nothing on it changes
  //
  // Reconciling an unnamed canvas closes every card the assistant placed there,
  // which is not "untouched" by any reading. `columns: {}` is the answer the
  // model reaches for most often, meaning "leave the screen alone", and it was
  // taking the aside down every time.
  for (const canvas of allowed) {
    if (columns[canvas as keyof typeof columns] === undefined) continue;
    const wanted: Desired[] = [];
    for (const placement of columns[canvas as keyof typeof columns] ?? []) {
      const entry = byId.get(placement.id);
      if (entry === undefined) {
        notes.push(`unknown id "${placement.id}"`);
        continue;
      }
      const ignored: string[] = [];
      const input = seedFor(entry, (placement.input ?? {}) as Record<string, unknown>, session, ignored);
      if (ignored.length > 0) notes.push(`ignored on ${entry.id}: ${ignored.join(', ')} — not input`);
      if (refused.has(`${entry.id}:${aimOf(input)}`)) {
        notes.push(`dropped ${entry.id}: they closed this already`);
        continue;
      }
      const declared = new Set(Object.keys((entry.input as { properties?: Record<string, unknown> }).properties ?? {}));
      if (declared.has('sheetTitle')) input['sheetTitle'] = entry.title;
      // `detail` composes the close-on-work-reset fragment; every placement
      // composes `landed`, the one-shot arrival mark — an effect, not chrome,
      // and only a genuinely new or re-aimed instance replays it.
      wanted.push({ actionId: entry.id, input, with: canvas === 'aside' ? ['landed'] : ['detail', 'landed'] });
    }

    // A granted canvas is the assistant's, whoever pushed what is on it, so a
    // canvas the answer names is set to exactly what it names. That includes
    // closing a record the user opened by hand.
    //
    // Taken before reconcile, so what disappears is attributable to this answer.
    const standing = (shell.getState().canvases[canvas]?.stack ?? []).map((item) => item.id);
    const result = reconcileCanvas(shell, canvas, wanted, {
      origin: ASSISTANT,
      own: 'canvas',
      definitionOf: (id) => definitions[id],
    });
    const left = new Set((shell.getState().canvases[canvas]?.stack ?? []).map((item) => item.id));
    for (const id of standing) if (!left.has(id)) closed.add(id);
    changed = changed || result.changed;
    for (const note of result.notes) notes.push(`${note} on ${canvas}`);

    // TWO DIFFERENT QUESTIONS, and the origin test separates them.
    //
    //   `wrote`    did THIS ANSWER put these values here? Asked of every card it
    //              touched, whoever owns it.
    //   `remember` is this card an OFFER we made? Only of one we placed — a
    //              record the clerk opened and we wrote into is not an offer,
    //              and them closing it refuses nothing.
    for (const item of shell.getState().canvases[canvas]?.stack ?? []) {
      const entry = wanted.find((other) => other.actionId === item.definitionId);
      if (entry === undefined) continue;
      const keys = Object.keys(entry.input ?? {});
      if (keys.length > 0) wrote.set(item.id, new Set([...(wrote.get(item.id) ?? []), ...keys]));
      if (shell.originOf(item.id) !== ASSISTANT) continue;
      ledger.remember(item.id, {
        title: byId.get(entry.actionId)?.title ?? definitions[entry.actionId]?.title ?? entry.actionId,
        definitionId: entry.actionId,
        aim: aimOf(entry.input ?? {}),
        // When it went up. A card closed within seconds of appearing is a
        // refusal; one closed minutes later was used.
        at: Date.now(),
      });
    }
  }

  // Write into what is already there, whoever put it there. No lifecycle runs, so
  // nothing reloads over the value and nothing is submitted.
  for (const request of answer.fill ?? []) {
    const entry = byId.get(request.id);
    if (entry === undefined) {
      notes.push(`unknown id "${request.id}"`);
      continue;
    }
    const found = topInstanceOf(shell, entry.id);
    if (found === undefined) {
      notes.push(`cannot fill ${entry.id}: not on screen`);
      continue;
    }
    const definition = definitions[entry.id];
    const spare: string[] = [];
    const input = seedFor(entry, request.input as Record<string, unknown>, session, spare);
    if (spare.length > 0) notes.push(`ignored on ${entry.id}: ${spare.join(', ')} — not input`);
    for (const key of definition === undefined ? [] : Object.keys(input).filter((k) => mountInputKeys(definition).has(k))) {
      delete input[key];
      notes.push(`cannot fill ${entry.id}.${key}: it decides what that card loads`);
    }
    const runtime = shell.getRuntime(found);
    if (runtime === undefined || Object.keys(input).length === 0) continue;
    const before = runtime.getData();
    if (!Object.entries(input).some(([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value))) continue;
    runtime.setData({ ...before, ...input });
    changed = true;
    // Remember it as ours, so the wake gate does not read our own typing as
    // theirs.
    wrote.set(found, new Set([...(wrote.get(found) ?? []), ...Object.keys(input)]));
    notes.push(`filled ${Object.keys(input).join(', ')} on ${entry.id}`);
  }

  return { changed, notes, wrote, closed };
};
