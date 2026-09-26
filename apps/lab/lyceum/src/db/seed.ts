// What exists before anybody walks in: the houses, the two principals that
// are not people, and the deck. Everything else is written by the room.
//
// Run on every boot, against an empty database or a live one, and it treats
// the two kinds of row differently:
//
//   · AUTHORED rows — the houses' words, the slides and their order — CONVERGE:
//     whatever this file says is what the database holds, the way vex's seed
//     path converges its entries. Editing the deck here and restarting is
//     enough; there is no migration to write.
//   · THE TALK'S STATE — the room, the grants, which slide is on screen — is
//     left alone. A restart must not reset the talk.
//
// When the streamed agenda composes the deck at runtime (PLAN.md), the order
// becomes the room's data, and stops converging here.
//
// The houses are provisional (PLAN.md, Open). Each house_id is also a charter
// role — sorting a person into a house IS giving them that role — and
// `sorting-check` asserts the two lists agree.

type House = { houseId: string; name: string; character: string; mark: string; sigil: string };

export const HOUSES: readonly House[] = [
  { houseId: 'ravens', name: 'Ravens', character: 'The curious: they ask the question behind the question and follow it wherever it goes.', mark: 'stripes', sigil: 'triangle' },
  { houseId: 'owls', name: 'Owls', character: 'The careful: they read the whole thing first and trust what they can check.', mark: 'dots', sigil: 'circle' },
  { houseId: 'foxes', name: 'Foxes', character: 'The quick: they try it before they are told how, and learn from what breaks.', mark: 'bars', sigil: 'cross' },
  { houseId: 'stags', name: 'Stags', character: 'The steadfast: they build the thing that is still standing next year.', mark: 'checks', sigil: 'square' },
];

// The two principals that are not people, and the role each wears. Their
// sessions are minted by whoever runs the talk (dev: /dev/as/<principal>).
export const STAFF: readonly { principal: string; role: string }[] = [
  { principal: 'speaker', role: 'speaker' },
  { principal: 'stage', role: 'stage' },
  // The kit's kitchen sink — every piece of the look on one screen, to lock
  // it before a feature leans on it (order of work, step 4).
  { principal: 'kit', role: 'kit' },
];

// The deck, in order. Each id is an action the stage is granted — `deck-check`
// asserts it. Provisional: the streamed agenda composes the real order.
export const SLIDES: readonly { slideId: string; title: string }[] = [
  { slideId: 'slide.title', title: 'The talk is an application' },
  { slideId: 'stage.roster', title: 'The room' },
  { slideId: 'slide.data', title: 'Everything is data' },
  { slideId: 'slide.existence', title: 'If you can’t use it, it isn’t there' },
  { slideId: 'slide.live', title: 'Nobody announced anything' },
  { slideId: 'slide.end', title: 'It is all in the folder' },
];

export const DECK_ID = 'talk';

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const slideIds = SLIDES.map((slide) => quote(slide.slideId)).join(', ');

export const buildSeedSql = (): string =>
  [
    // Houses: their words converge. None is ever deleted here — a house holds
    // members, and a house_id is a charter role.
    ...HOUSES.map(
      (house, position) =>
        `INSERT INTO houses (house_id, name, character, mark, sigil, position) VALUES (${quote(house.houseId)}, ${quote(house.name)}, ${quote(house.character)}, ${quote(house.mark)}, ${quote(house.sigil)}, ${position})
         ON CONFLICT (house_id) DO UPDATE SET name = EXCLUDED.name, character = EXCLUDED.character, mark = EXCLUDED.mark, sigil = EXCLUDED.sigil, position = EXCLUDED.position;`,
    ),
    ...STAFF.map((staff) => `INSERT INTO grants (principal, role) VALUES (${quote(staff.principal)}, ${quote(staff.role)}) ON CONFLICT DO NOTHING;`),

    // Slides: the deck converges to SLIDES. Positions are unique, so a reorder
    // would collide with itself mid-way; every existing position is first moved
    // out of the way (negative), then each authored slide is written to its own.
    `UPDATE slides SET position = -1 - position WHERE position >= 0;`,
    ...SLIDES.map(
      (slide, position) =>
        `INSERT INTO slides (slide_id, position, title) VALUES (${quote(slide.slideId)}, ${position}, ${quote(slide.title)})
         ON CONFLICT (slide_id) DO UPDATE SET position = EXCLUDED.position, title = EXCLUDED.title;`,
    ),
    // The deck row is the talk's state: seeded once, never reset by a restart —
    // unless the slide it names was taken out of the deck, when it goes back to
    // the first one rather than point at nothing.
    `INSERT INTO deck (deck_id, slide_id) VALUES (${quote(DECK_ID)}, ${quote(SLIDES[0]?.slideId ?? '')}) ON CONFLICT DO NOTHING;`,
    `UPDATE deck SET slide_id = ${quote(SLIDES[0]?.slideId ?? '')} WHERE slide_id NOT IN (${slideIds});`,
    `DELETE FROM slides WHERE slide_id NOT IN (${slideIds});`,
  ].join('\n');
