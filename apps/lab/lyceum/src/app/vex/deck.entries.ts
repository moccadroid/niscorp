import type { Query, SeedEntry, SeedMutation } from '@niscorp/vex';

export const TALK_DECK = 'talk';

const current: Query['from'][number] = { as: 'cur', query: { from: ['deck', 'slides'], fields: [{ field: 'slides.position', as: 'at' }, { field: 'slides.talk_id', as: 'talk' }], filter: { eq: ['deck.deck_id', TALK_DECK] } } };
const talkOf = (rows: unknown): unknown => ({ $get: { from: rows, path: [0, 'talk'], fallback: { $const: '' } } });
const rowsOfTalk = (rows: unknown): unknown => ({
  $filter: { over: rows, as: 'row', when: { $eq: [{ $get: { from: { $var: 'row' }, path: ['talk_id'] } }, { $var: 'talk' }] } },
});

// Reactive, but a new slide is a new action on the stage's canvas, which no
// data update can mount: the stage also hears `deck-moved`.
// Every slide row carries the deck's position and talk (a cross-joined
// subquery), and the mapping picks three out of the talk's rows: here, before,
// after.
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
  intent: 'The slide on screen — its action, title and place in the talk that is on — the slides either side of it, and how many there are',
  shape: [{ slide_id: '', talk_id: '', title: '', position: 0, number: 0, count: 0, prev_number: 0, prev_title: '', next_number: 0, next_title: '' }],
  dsl: {
    from: ['slides', current],
    fields: ['slides.slide_id', 'slides.title', 'slides.position', 'slides.talk_id', 'cur.at', 'cur.talk'],
    filter: { gte: ['slides.position', 0] },
    sort: [{ field: 'slides.position', dir: 'asc' }],
    limit: 1000,
  },
  mapping: {
    $with: {
      let: {
        talk: talkOf({ $ref: '$.result' }),
        at: { $get: { from: { $ref: '$.result' }, path: [0, 'at'], fallback: { $const: 0 } } },
      },
      value: {
        $with: {
          let: { rows: rowsOfTalk({ $ref: '$.result' }) },
          value: {
            $with: {
              let: { here: at(0), before: at(-1), after: at(1) },
              value: {
                slide_id: field('here', 'slide_id', ''),
                talk_id: { $var: 'talk' },
                title: field('here', 'title', ''),
                position: { $var: 'at' },
                number: { $add: [{ $var: 'at' }, 1] },
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
    },
  },
};

export const slidesAll: SeedEntry = {
  fingerprint: 'slides/all',
  intent: 'Every slide of the talk that is on, in order',
  shape: [{ position: 0, number: 0, title: '' }],
  dsl: {
    from: ['slides', current],
    fields: ['slides.position', 'slides.title', 'slides.talk_id', 'cur.talk'],
    filter: { gte: ['slides.position', 0] },
    sort: [{ field: 'slides.position', dir: 'asc' }],
  },
  mapping: {
    $with: {
      let: { talk: talkOf({ $ref: '$.result' }) },
      value: {
        $map: {
          over: rowsOfTalk({ $ref: '$.result' }),
          as: 'slide',
          body: {
            position: { $get: { from: { $var: 'slide' }, path: ['position'] } },
            number: { $add: [{ $get: { from: { $var: 'slide' }, path: ['position'] } }, 1] },
            title: { $get: { from: { $var: 'slide' }, path: ['title'] } },
          },
        },
      },
    },
  },
};

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

export const deckGo: SeedMutation = {
  fingerprint: 'deck/go',
  intent: 'Put the slide at a position of a talk on screen',
  mutation: {
    op: 'update',
    table: 'deck',
    set: {
      slide_id: {
        $lookup: {
          from: 'slides',
          field: 'slide_id',
          where: { and: [{ eq: ['slides.talk_id', { $context: 'talk' }] }, { eq: ['slides.position', { $context: 'position' }] }] },
        },
      },
      talk_id: { $context: 'talk' },
      step: 0,
    },
    where: { eq: ['deck.deck_id', { $context: 'deck' }] },
  },
};

export const slidesDeck: SeedEntry = {
  fingerprint: 'slides/deck',
  intent: 'Every slide of the talk that is on, with its id, number and title, in order',
  shape: [{ slide_id: '', number: 0, title: '' }],
  dsl: {
    from: ['slides', current],
    fields: ['slides.slide_id', 'slides.position', 'slides.title', 'slides.talk_id', 'cur.talk'],
    filter: { gte: ['slides.position', 0] },
    sort: [{ field: 'slides.position', dir: 'asc' }],
  },
  mapping: {
    $with: {
      let: { talk: talkOf({ $ref: '$.result' }) },
      value: {
        $map: {
          over: rowsOfTalk({ $ref: '$.result' }),
          as: 'slide',
          body: {
            slide_id: { $get: { from: { $var: 'slide' }, path: ['slide_id'] } },
            number: { $add: [{ $get: { from: { $var: 'slide' }, path: ['position'] } }, 1] },
            title: { $get: { from: { $var: 'slide' }, path: ['title'] } },
          },
        },
      },
    },
  },
};

// By id rather than by position: an automation names what it means, and the
// foreign key refuses a slide that is in no talk. The talk follows the slide.
export const deckShow: SeedMutation = {
  fingerprint: 'deck/show',
  intent: 'Put a named slide on screen',
  mutation: {
    op: 'update',
    table: 'deck',
    set: {
      slide_id: { $context: 'slideId' },
      talk_id: { $lookup: { from: 'slides', field: 'talk_id', where: { eq: ['slides.slide_id', { $context: 'slideId' }] } } },
      step: 0,
    },
    where: { eq: ['deck.deck_id', { $context: 'deck' }] },
  },
};

export const talksAll: SeedEntry = {
  fingerprint: 'talks/all',
  intent: 'Every talk this room can give, in order',
  shape: [{ talk_id: '', title: '' }],
  dsl: {
    from: ['talks'],
    fields: ['talks.talk_id', 'talks.title'],
    sort: [{ field: 'talks.position', dir: 'asc' }],
  },
};

export const deckTalk: SeedEntry = {
  fingerprint: 'deck/talk',
  refresh: 'reactive',
  intent: 'The talk that is on: its id and title',
  shape: { talk_id: '', title: '' },
  dsl: {
    from: ['deck', 'talks'],
    fields: ['talks.talk_id', 'talks.title'],
    filter: { eq: ['deck.deck_id', TALK_DECK] },
    sort: [{ field: 'talks.talk_id', dir: 'asc' }],
  },
};

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

export const DECK_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [deckCurrent, slidesAll, slidesDeck, slideNotes, slideTools, deckGo, deckShow, talksAll, deckTalk, deckStep, deckStepSet];
