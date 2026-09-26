import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── the deck: which slide is on screen, and moving it ──

// Reactive: the controller follows the deck without being told. The stage
// follows it too, but a new slide is a new ACTION on its canvas, which no
// data update can mount — so the stage also hears `deck-moved` (reactions).
export const deckCurrent: SeedEntry = {
  fingerprint: 'deck/current',
  refresh: 'reactive',
  intent: 'The slide on screen now: its action, its title and its place in the deck',
  shape: { slide_id: '', title: '', position: 0, number: 0 },
  dsl: {
    from: ['deck', 'slides'],
    fields: ['slides.slide_id', 'slides.title', 'slides.position'],
    filter: { eq: ['deck.deck_id', 'talk'] },
  },
  mapping: {
    slide_id: { $ref: '$.result.slide_id' },
    title: { $ref: '$.result.title' },
    position: { $ref: '$.result.position' },
    // Counted from one, for people.
    number: { $add: [{ $ref: '$.result.position' }, 1] },
  },
};

export const slidesCount: SeedEntry = {
  fingerprint: 'slides/count',
  refresh: 'reactive',
  intent: 'How many slides the deck holds',
  shape: { slides: 0 },
  dsl: { from: ['slides'], aggregate: { slides: { count: '*' } } },
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

export const DECK_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [deckCurrent, slidesCount, deckGo];
