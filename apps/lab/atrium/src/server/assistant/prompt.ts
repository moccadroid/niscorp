import type { Shell } from '@niscorp/nova';
import type { Message } from '@niscorp/signal';
import { describeShell, mountInputKeys } from '@niscorp/nova/reflect';
import { definitionsNow, type AvailableAction } from './knowledge';
import { COLUMN_NOTES, GUEST_SCREEN, STAFF_SCREEN } from './profiles';

const WORKED = ['work', 'detail', 'home', 'sheet'];

const NOISE = /_tone$|_display$/;

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
  const occupied = WORKED.filter((id) => (canvases[id]?.stack.length ?? 0) > 0);
  return describeShell(shell, {
    only: [...new Set([...places, ...occupied])],
    mark: (id) => (owned(id) ? '[YOURS]' : undefined),
    clean: readable,
  });
};

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

export const section = (title: string, body: string): string => `── ${title} ──\n${body}`;

export const voiceFor = (persona: { name: string; character: string }, reads = true): string =>
  [
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

const FILLING = [
  '`fill` writes values into a card already on SCREEN, including a card the user opened. It changes only the keys you name. It does not reload the card and does not submit it.',
  '',
  'Use `fill` when the card is already open. Naming that card in `columns` instead replaces it and discards what the user has typed into it.',
  '',
  'Keys marked (loads) set what a card reads when it opens. Set those in `columns` when you open the card. `fill` refuses them.',
].join('\n');

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
    section('THE SCREEN', places.includes('sheet') ? GUEST_SCREEN : STAFF_SCREEN),
    '',
    section(
      'YOUR CANVASES',
      [
        `You may write to ${places.join(', ')}. SCREEN shows other canvases as well. Anything you return for those is discarded.`,
        '',
        ...places.map((canvas) => `  ${canvas.padEnd(7)} ${COLUMN_NOTES[canvas] ?? ''}`),
        '',
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

const AUTHORED = /seeded by the (chrome|opener)/i;

const SHARED: Record<string, string> = {
  expanded: 'false renders the one-line card a composed workspace uses, true (the default) the full surface. Leave it out.',
};

const inputLine = (key: string, spec: { type?: string; description?: string; properties?: Record<string, unknown> }, atOpen: boolean): string => {
  const shape = spec.type === 'object' && spec.properties !== undefined ? `object{${Object.keys(spec.properties).join(', ')}}` : (spec.type ?? 'any');
  const note = spec.description !== undefined && SHARED[key] === undefined && !AUTHORED.test(spec.description) ? ` — ${spec.description}` : '';
  // The marker stays apart from the key: glued on (`*issueId`), the model returns
  // it as part of the key name, which is not a declared input and is dropped.
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

// No keywords in the prompt: match terms would compete with the blurb for the
// choice. The guest concierge's redirect (tools.ts) matches on them.
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
        ...action.also.map((other) => `    also offered as "${other.title}": ${other.blurb}`),
        action.capabilities.length > 1 ? `    capability: one of ${action.capabilities.join(', ')}` : undefined,
        inputLines(action),
      ]
        .filter((line) => line !== undefined)
        .join('\n'),
    ),
  ].join('\n'));
};

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
