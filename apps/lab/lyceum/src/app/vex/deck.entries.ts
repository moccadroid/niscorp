import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── the deck: which slide is on screen, and moving it ──

// The talk's deck — the one row of `deck`, by its key. Named once, here: the
// reads below filter on it, the seed creates it, and a timer writes to it.
export const TALK_DECK = 'talk';

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
  intent: 'The slide on screen — its action, title and place — the slides either side of it, and how many there are',
  shape: [{ slide_id: '', title: '', position: 0, number: 0, count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' }],
  dsl: {
    from: [
      'slides',
      { as: 'cur', query: { from: ['deck', 'slides'], fields: [{ field: 'slides.position', as: 'at' }], filter: { eq: ['deck.deck_id', TALK_DECK] } } },
    ],
    fields: ['slides.slide_id', 'slides.title', 'slides.position', 'cur.at'],
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

// The speaker's notes for the slide on screen, in order. Reactive: the deck
// row moving is a write to a table this reads, so the notes follow the deck.
export const slideNotes: SeedEntry = {
  fingerprint: 'slides/notes',
  refresh: 'reactive',
  intent: 'The speaker\'s notes for the slide on screen, in order',
  shape: [{ position: 0, note: '' }],
  dsl: {
    from: ['deck', 'slides', 'slide_notes'],
    fields: ['slide_notes.position', 'slide_notes.note'],
    filter: { eq: ['deck.deck_id', TALK_DECK] },
    sort: [{ field: 'slide_notes.position', dir: 'asc' }],
  },
};

// The tools the slide on screen puts on the controller, in order. A snapshot:
// the speaker's deck reads it when the deck moves and makes the tool region
// hold exactly these (a `reconcile` step).
export const slideTools: SeedEntry = {
  fingerprint: 'slides/tools',
  intent: 'The tools the slide on screen puts on the controller, in order',
  shape: [{ position: 0, tool_id: '' }],
  dsl: {
    from: ['deck', 'slides', 'slide_tools'],
    fields: ['slide_tools.position', 'slide_tools.tool_id'],
    filter: { eq: ['deck.deck_id', TALK_DECK] },
    sort: [{ field: 'slide_tools.position', dir: 'asc' }],
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
      // A new slide starts unrevealed.
      step: 0,
    },
    where: { eq: ['deck.deck_id', { $context: 'deck' }] },
  },
};

// The deck as the assistant knows it: every slide's id, its number and its
// title. Ids included, because an automation names the slide it shows.
export const slidesDeck: SeedEntry = {
  fingerprint: 'slides/deck',
  intent: 'Every slide in the deck with its id, number and title, in order',
  shape: [{ slide_id: '', number: 0, title: '' }],
  dsl: {
    from: ['slides'],
    fields: ['slides.slide_id', 'slides.position', 'slides.title'],
    filter: { gte: ['slides.position', 0] },
    sort: [{ field: 'slides.position', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'slide',
      body: {
        slide_id: { $get: { from: { $var: 'slide' }, path: ['slide_id'] } },
        number: { $add: [{ $get: { from: { $var: 'slide' }, path: ['position'] } }, 1] },
        title: { $get: { from: { $var: 'slide' }, path: ['title'] } },
      },
    },
  },
};

// Put a named slide on screen — what a timer does when it fires (as the
// `clock` principal, whose only grant is this write). By id rather than by
// position: an automation names what it means, and the foreign key refuses a
// slide that is not in the deck.
export const deckShow: SeedMutation = {
  fingerprint: 'deck/show',
  intent: 'Put a named slide on screen',
  mutation: {
    op: 'update',
    table: 'deck',
    set: { slide_id: { $context: 'slideId' }, step: 0 },
    where: { eq: ['deck.deck_id', { $context: 'deck' }] },
  },
};

// HOW FAR THE SLIDE ON SCREEN HAS BEEN REVEALED. Where a traditional deck has
// three slides that each add a line, this one has one slide and a number: the
// controller's step tool writes it, the slide reads it and shows more.
// Reactive, so the stage follows a press on its own.
export const deckStep: SeedEntry = {
  fingerprint: 'deck/step',
  refresh: 'reactive',
  intent: 'How far the slide on screen has been revealed: its step, from 0, how many parts it has, and which part is showing',
  shape: { step: 0, parts: 1, part: 1 },
  dsl: {
    from: ['deck', 'slides'],
    fields: ['deck.step', 'slides.parts'],
    filter: { eq: ['deck.deck_id', TALK_DECK] },
    sort: [{ field: 'deck.deck_id', dir: 'asc' }],
  },
  mapping: {
    step: { $ref: '$.result.step' },
    parts: { $ref: '$.result.parts' },
    part: { $add: [{ $ref: '$.result.step' }, 1] },
  },
};

export const deckStepSet: SeedMutation = {
  fingerprint: 'deck/step/set',
  intent: 'Reveal the slide on screen up to a step',
  mutation: {
    op: 'update',
    table: 'deck',
    set: { step: { $context: 'step' } },
    where: { eq: ['deck.deck_id', { $context: 'deck' }] },
  },
};

export const DECK_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [deckCurrent, slidesAll, slidesDeck, slideNotes, slideTools, deckGo, deckShow, deckStep, deckStepSet];
