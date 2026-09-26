import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── the deck: which slide is on screen, and moving it ──

// Reactive: the controller follows the deck without being told. The stage
// follows it too, but a new slide is a new ACTION on its canvas, which no
// data update can mount — so the stage also hears `deck-moved` (reactions).
//
// It answers with the slide on screen AND its neighbours, so Back and Next can
// say where they go. Every slide row carries the deck's position (a cross-
// joined subquery), and the mapping picks the three out: here, before, after.
const field = (from: string, name: string, fallback: unknown): unknown => ({
  $get: { from: { $var: from }, path: [name], fallback: { $const: fallback } },
});
const at = (offset: number): unknown => ({
  $get: {
    from: {
      $filter: {
        over: { $var: 'rows' },
        as: 'row',
        when: { $eq: [{ $get: { from: { $var: 'row' }, path: ['position'] } }, { $add: [{ $var: 'at' }, offset] }] },
      },
    },
    path: [0],
    fallback: { $const: null },
  },
});

export const deckCurrent: SeedEntry = {
  fingerprint: 'deck/current',
  refresh: 'reactive',
  intent: 'The slide on screen — its action, title, place and tool — the slides either side of it, and how many there are',
  shape: [{ slide_id: '', title: '', position: 0, number: 0, tool_id: '', count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' }],
  dsl: {
    from: [
      'slides',
      { as: 'cur', query: { from: ['deck', 'slides'], fields: [{ field: 'slides.position', as: 'at' }], filter: { eq: ['deck.deck_id', 'talk'] } } },
    ],
    fields: ['slides.slide_id', 'slides.title', 'slides.position', 'slides.tool_id', 'cur.at'],
    filter: { gte: ['slides.position', 0] },
    sort: [{ field: 'slides.position', dir: 'asc' }],
    limit: 1000,
  },
  mapping: {
    $with: {
      let: {
        rows: { $ref: '$.result' },
        at: { $get: { from: { $ref: '$.result' }, path: [0, 'at'], fallback: { $const: 0 } } },
      },
      value: {
        $with: {
          let: { here: at(0), before: at(-1), after: at(1) },
          value: {
            slide_id: field('here', 'slide_id', ''),
            title: field('here', 'title', ''),
            position: { $var: 'at' },
            // Counted from one, for people.
            number: { $add: [{ $var: 'at' }, 1] },
            // A slide with no controls of its own still names a tool: the empty one.
            tool_id: { $coalesce: [field('here', 'tool_id', null), { $const: 'tools.none' }] },
            count: { $length: { $var: 'rows' } },
            prev_number: { $var: 'at' },
            prev_title: field('before', 'title', ''),
            next_number: { $add: [{ $var: 'at' }, 2] },
            next_title: field('after', 'title', ''),
          },
        },
      },
    },
  },
};

// The whole deck, for the controller's picker: every slide, its place and its
// title, counted from one.
export const slidesAll: SeedEntry = {
  fingerprint: 'slides/all',
  intent: 'Every slide in the deck, in order',
  shape: [{ position: 0, number: 0, title: '' }],
  dsl: {
    from: ['slides'],
    fields: ['slides.position', 'slides.title'],
    filter: { gte: ['slides.position', 0] },
    sort: [{ field: 'slides.position', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'slide',
      body: {
        position: { $get: { from: { $var: 'slide' }, path: ['position'] } },
        number: { $add: [{ $get: { from: { $var: 'slide' }, path: ['position'] } }, 1] },
        title: { $get: { from: { $var: 'slide' }, path: ['title'] } },
      },
    },
  },
};

// Put the slide at `position` on screen. The controller computes the position
// (one on, one back, clamped to the deck); the slide is looked up by it, so a
// request names a place in the deck, never an action. The deck is named too —
// there is one, but a write says which row it bounds.
export const deckGo: SeedMutation = {
  fingerprint: 'deck/go',
  intent: 'Put the slide at a position in the deck on screen',
  mutation: {
    op: 'update',
    table: 'deck',
    set: {
      slide_id: { $lookup: { from: 'slides', field: 'slide_id', where: { eq: ['slides.position', { $context: 'position' }] } } },
    },
    where: { eq: ['deck.deck_id', { $context: 'deck' }] },
  },
};

export const DECK_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [deckCurrent, slidesAll, deckGo];
