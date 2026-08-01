import type { Shell } from '@niscorp/nova';
import type { Message } from '@niscorp/signal';
import { describeShell, mountInputKeys } from '@niscorp/nova/reflect';
import { definitionsNow, type AvailableAction } from './knowledge';
import { COLUMN_NOTES, GUEST_SCREEN, STAFF_SCREEN } from './profiles';

// The placement MECHANICS both agents share, written once. Each agent authors
// its own prompt (chat.ts, watch/prompt.ts); what lives here is the vocabulary
// neither may drift on — the screen dump, the canvas contract, the catalog —
// because both answers go through the same `apply`. Nothing here names a
// surface, a capability or a scenario — the catalogs are the vocabulary,
// resolved per caller.
//
// Each block is either STATIC for the life of a session or DYNAMIC per run, never
// both, so the static half sits in a provider's prefix cache.

// ─── the screen (dynamic) ──────────────────────────────────

// WHERE A PERSON WORKS. Not a list of every canvas in the building.
//
// This was the union of every canvas any audience has, so a desk run was
// handed `main: (empty)`, `home: (empty)` and `sheet: (empty)` on every wake.
// Those three are the GUEST shell's canvases. They are not empty on a clerk's
// screen; they do not exist on it. The model was being shown the absence of
// things that were never there, and asked to reason about a screen described in
// vocabulary that did not match the one it had just been told about in THEIR
// SCREEN.
//
// What is left is where work happens, per shell. Anything empty is dropped
// below, except a canvas we may place on: `aside: (empty)` is the assistant
// being told its own column is free, which is a fact worth having.
const WORKED = ['work', 'detail', 'home', 'sheet'];

// The model needs the record, not its colour.
const NOISE = /_tone$|_display$/;

// Arrays and objects go down the same path, so NOISE applies at every depth. A
// nested record kept its presentation keys when only array items were cleaned,
// which is how `amount_display` and `price_line` reached the model and came back
// as input.
const clean = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(clean)
    : value !== null && typeof value === 'object'
      ? readable(value as Record<string, unknown>)
      : value;

const readable = (data: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (NOISE.test(key)) continue;
    out[key] = clean(value);
  }
  return out;
};

export const screenOf = (shell: Shell, owned: (instanceId: string) => boolean = () => false, places: readonly string[] = []): string => {
  const canvases = shell.getState().canvases;
  // A canvas this shell does not have, or has nothing on, is not worth a line —
  // unless it is ours, where empty is the answer to "what have I got room for".
  const occupied = WORKED.filter((id) => (canvases[id]?.stack.length ?? 0) > 0);
  return describeShell(shell, {
    only: [...new Set([...places, ...occupied])],
    mark: (id) => (owned(id) ? '[YOURS]' : undefined),
    clean: readable,
  });
};

// The screen and the refusals are one block: they answer the same question, and
// a refusal in a system message of its own reads as an orphan.
//
// The heading says how to READ the dump, not just what is in it — the JSON under
// each card is live data to reason about, not decoration.
export const screenBlock = (screen: string, refused: string): string =>
  section(
    'SCREEN',
    [
      'The user\'s screen as it is now. One block per canvas. Under each canvas: the cards on it, a * on the card the user can see, and under each card the data that card is showing. [YOURS] marks a card you opened. Long lists are truncated.',
      '',
      'SCREEN is current. WHAT CHANGED, at the end, says what triggered this run. If the two disagree, SCREEN is correct.',
      '',
      screen,
      ...(refused === '' ? [] : ['', refused]),
    ].join('\n'),
  );

// ─── section headings ──────────────────────────────────────
//
// Every block this file produces is NAMED, in the same form cortex already uses
// for its tool guides. The prompt used to arrive as seven anonymous slabs in
// assembly order — the producer list was the document's only outline and it was
// never written down anywhere a reader could see it. Naming them costs a line
// each and turns the prompt into something with a table of contents.
export const section = (title: string, body: string): string => `── ${title} ──\n${body}`;

// ─── who and what (static per persona) ─────────────────────
//
// The agent is memoized per persona, so folding the name in here keeps it
// inside the cacheable prefix.
//
// It says what the mechanism IS rather than what it is LIKE. The old version
// read "You PREPARE; they COMMIT. A card you put up is an offer and a field you
// fill is a suggestion" — three metaphors for one fact, and the fact itself
// (nothing you do completes anything) had to be inferred from all three.

// `reads` says whether this caller has tools. The watcher does not, and a prompt
// that offers a lookup to something with nothing to call is describing a door
// that is not in the wall — the model spends its turn looking for it.
export const voiceFor = (persona: { name: string; character: string }, reads = true): string =>
  [
    // The persona row carries the job description, so this says who and hands
    // straight over.
    section('IDENTITY', `You are ${persona.name}. ${persona.character}`),
    '',
    section(
      'WHAT YOU DO',
      [
        'You are part of the hotel software the user works in. The user is a member of front office staff. Guests are the people staying at the hotel. The user talks to guests. You do not.',
        '',
        'Your answer replaces part of the user\'s screen. What you return in `columns` is what the user sees a moment later.',
        '',
        'Nothing you return is submitted. Opening a card shows a form. Writing into a field types a value into it. The user presses the button. Nothing reaches a guest, a colleague or the accounts until the user does.',
        '',
        reads
          ? 'State only what SCREEN shows or what a tool returns. If a value is in neither, you do not have it, and text written for a guest must not contain it.'
          : 'SCREEN is everything you know. You have no way to look anything up. State only what SCREEN shows. If a value is not on SCREEN you do not have it, and text written for a guest must not contain it.',
      ].join('\n'),
    ),
  ].join('\n');

// ─── the contract (static per profile) ─────────────────────
//
// The schema descriptions carry the mechanics. This is what they cannot express:
// which canvas to choose, and the bounds `apply` holds it to regardless.

// What comes back, in the order it is written, stated here and nowhere else.
//
// `reasoning` and `response` are shown by example rather than described: worded
// abstractly they come back as the same sentence twice. One is the step, the
// other is a person talking.
//
// Brevity is asked for on `fill` ALONE. `columns` is complete state, so an
// omission there is a canvas emptied — advice to be brief must never reach it.
const RETURNS = [
  'Return three fields, in this order.',
  '',
  '  reasoning  Which action you are about to open, and what it will do.',
  '  response   One or two sentences for the user to read.',
  '  data       `columns`, and `fill` if you are filling anything.',
  '',
  '`reasoning` and `response` are plain text. No markdown, no lists, no greeting. This does not apply to text you write into a card\'s fields.',
  '',
  'Omit `fill` when you are not filling anything.',
].join('\n');

// The fill rules, including the one bound `apply` enforces silently.
const FILLING = [
  '`fill` writes values into a card already on SCREEN, including a card the user opened. It changes only the keys you name. It does not reload the card and does not submit it.',
  '',
  'Use `fill` when the card is already open. Naming that card in `columns` instead replaces it and discards what the user has typed into it.',
  '',
  'Keys marked (loads) set what a card reads when it opens. Set those in `columns` when you open the card. `fill` refuses them.',
].join('\n');

// The MECHANISM only. Whether a card should stay is one sentence in HOW TO
// DECIDE: keep it while it contributes to the task. A branch list here asks the
// reader to match a situation instead of applying a test.
const KEEPING = [
  '`columns` maps a canvas name to a list of cards.',
  '',
  'A canvas you name is set to exactly the list you give. Cards on that canvas that you do not name are closed.',
  '',
  'A canvas you do not name is left untouched.',
  '',
  'One card per action id per canvas. A second copy of the same action is ignored.',
  '',
  'Every canvas listed above is yours to arrange, including a card the user opened. [YOURS] in SCREEN marks a card you opened. It records where a card came from. It does not limit which cards you may name.',
  '',
  'Closing a card the user opened removes it from the user\'s screen. Close it when the user has finished with it. Do not close it to make room.',
].join('\n');

export const contractFor = (places: readonly string[]): string => {
  if (places.length === 0) {
    return [
      section('YOUR CANVASES', 'None. The user arranges the screen. Anything you return in `columns` is discarded.'),
      '',
      section('FILL', 'You may still `fill` a card that is already open. It writes a value the user can edit or clear. It does not submit anything.'),
      '',
      section('WHAT YOU RETURN', RETURNS),
    ].join('\n');
  }
  return [
    // Only guests hold the sheet, and only guests have the phone page — the
    // places already say which room this is.
    section('THE SCREEN', places.includes('sheet') ? GUEST_SCREEN : STAFF_SCREEN),
    '',
    section(
      'YOUR CANVASES',
      [
        `You may write to ${places.join(', ')}. SCREEN shows other canvases as well. Anything you return for those is discarded.`,
        '',
        ...places.map((canvas) => `  ${canvas.padEnd(7)} ${COLUMN_NOTES[canvas] ?? ''}`),
        '',
        // The coherence rule, binding the screen being SENT rather than the one
        // received: a run that means to move the user on clears `detail` first,
        // and would otherwise read its own aside as unconstrained.
        //
        // Holding the aside WITHOUT detail, the rule binds to the record the
        // USER has open instead — the aside follows their focus, it cannot set
        // it.
        ...(places.includes('aside') && places.includes('detail')
          ? [
              '`aside` is about the record on `detail`. This applies to the screen you return, not the screen you received. If you put a different record on `detail`, `aside` must be about that record. If you return `detail` empty, return `aside` empty.',
            ]
          : places.includes('aside')
            ? [
                '`aside` is about the record the user has open on `detail`. When the user moves to a different record, return `aside` about that one — a card about the record they left is stale.',
              ]
            : []),
      ].join('\n'),
    ),
    '',
    section('COLUMNS', KEEPING),
    '',
    section('FILL', FILLING),
    '',
    section('WHAT YOU RETURN', RETURNS),
  ].join('\n');
};

// ─── the action catalog (static per session) ───────────────

// One line per input key, not the JSON Schema. Keys the surface consumes when it
// opens carry `*`, and that rule is stated once above the catalog rather than
// fifteen times inside it.
//
// Author-facing descriptions are dropped: "seeded by the chrome from the session"
// is advice for whoever writes the action, and the model cannot set those keys.
const AUTHORED = /seeded by the (chrome|opener)/i;

// Keys that mean one thing in every action declaring them, said once above the
// catalog instead of once per action. Eight surfaces declare `expanded` and each
// describes it in its own words; which composition renders the short form is the
// author's business, not the model's. It never sets the key.
const SHARED: Record<string, string> = {
  expanded: 'false renders the one-line card a composed workspace uses, true (the default) the full surface. Leave it out.',
};

const inputLine = (key: string, spec: { type?: string; description?: string; properties?: Record<string, unknown> }, atOpen: boolean): string => {
  const shape = spec.type === 'object' && spec.properties !== undefined ? `object{${Object.keys(spec.properties).join(', ')}}` : (spec.type ?? 'any');
  const note = spec.description !== undefined && SHARED[key] === undefined && !AUTHORED.test(spec.description) ? ` — ${spec.description}` : '';
  // THE MARKER NEVER TOUCHES THE KEY. Glued on, `*issueId` reads as the name of
  // the key, and the answer comes back with a `"*issueId"` field — which is not
  // a declared input, so it is dropped and the card opens pointed at nothing.
  return `    ${atOpen ? '(loads) ' : '        '}${key} (${shape})${note}`;
};

const keysOf = (action: AvailableAction): Record<string, { type?: string; description?: string; properties?: Record<string, unknown> }> =>
  (action.input as { properties?: Record<string, { type?: string; description?: string; properties?: Record<string, unknown> }> } | undefined)?.properties ?? {};

const inputLines = (action: AvailableAction): string => {
  const definition = definitionsNow()[action.id];
  const atOpen = definition === undefined ? new Set<string>() : mountInputKeys(definition);
  const lines = Object.entries(keysOf(action)).map(([key, spec]) => inputLine(key, spec, atOpen.has(key)));
  return lines.length === 0 ? '     (no input)' : lines.join('\n');
};

// NO KEYWORDS IN THE PROMPT. The blurb decides, and it is the only thing that
// does — it carries what an action does, when it applies and what it changes,
// which is everything a choice needs and all of it retrievable semantically.
//
// A bag of match terms cannot hold applicability without competing with the
// blurb for it, and whichever one the model trusts is then the one that decides.
// The column stays in the database: the guest concierge's redirect (tools.ts)
// matches on it lexically, which is what term bags are good at.
export const actionLines = (actions: readonly AvailableAction[]): string => {
  const shared = Object.entries(SHARED).filter(([key]) => actions.some((action) => keysOf(action)[key] !== undefined));
  return section('ACTIONS', [
    'Every action you may open. There are no others. If a step needs something not listed here, this hotel cannot do it from this screen.',
    'Each entry gives the action id, its title, what the action does, when it applies, and what changes when the user presses its button. Choose on that. Two actions can look similar and differ only in when they apply.',
    'Under each entry are its input keys. A key marked (loads) sets what the card reads when it opens. The marker is not part of the key name.',
    'Those keys are the only ones an action accepts. What a card shows in SCREEN is what it loaded for itself; sending any of that back as input has no effect.',
    ...shared.map(([key, note]) => `\`${key}\` — ${note}`),
    ...actions.map((action) =>
      [
        `  ${action.id} — ${action.title}: ${action.blurb}`,
        // One surface can be published as more than one job — the same request
        // form is housekeeping under one capability and fault reporting under
        // another. Both descriptions are shown, because the choice between them
        // is the choice of capability below.
        ...action.also.map((other) => `    also offered as "${other.title}": ${other.blurb}`),
        action.capabilities.length > 1 ? `    capability: one of ${action.capabilities.join(', ')}` : undefined,
        inputLines(action),
      ]
        .filter((line) => line !== undefined)
        .join('\n'),
    ),
  ].join('\n'));
};

// AIM is gone, absorbed rather than deleted. Both halves said something true and
// both were being said twice: seeding lives in the steering ("carrying
// everything you can fill in"), and reach-for-fill-when-it-is-already-up lives
// in WRITING INTO A CARD, beside the mechanism it is advice about. A block
// appended to both heads and repeating what each already said was a third of the
// duplication in the file.

// ─── the screen, per step (mechanics, both agents) ─────────

// The screen the model changed is the screen it must then see. Keyed by the
// deps object's identity, so each run tracks its own last look.
export const refreshScreen = (() => {
  const last = new WeakMap<object, string>();
  return ({ step, deps }: { step: number; deps: { screen: string; screenNow: () => string } }): { inject?: Message[] } | undefined => {
    if (step < 2) {
      last.set(deps, deps.screen);
      return undefined;
    }
    const now = deps.screenNow();
    if (last.get(deps) === now) return undefined;
    last.set(deps, now);
    return { inject: [{ role: 'system', content: `SCREEN (updated after your last action):\n${now}` }] };
  };
})();
