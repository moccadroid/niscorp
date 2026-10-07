import { TALK_DECK } from '@lyceum/app/vex/deck.entries';
import { TALKS } from './talks';

// What exists before anybody walks in: the principals that are not people,
// and the talks. Everything else is written by the audience.
//
// Run on every boot, against an empty database or a live one, and it treats
// the two kinds of row differently:
//
//   · AUTHORED rows — the talks, their slides in order, the tools and notes —
//     CONVERGE: whatever the data files say is what the database has, the way
//     vex's seed path converges its entries. Editing a deck and restarting is
//     enough; there is no migration to write.
//   · THE TALK'S STATE — the renderers, the grants, which talk and slide are on
//     screen — is left alone. A restart must not reset the talk.

// The principals that are not people, and the role each wears. Their sessions
// are minted by whoever runs the talk (dev: /dev/as/<principal>).
export const STAFF: readonly { principal: string; role: string }[] = [
  { principal: 'speaker', role: 'speaker' },
  { principal: 'stage', role: 'stage' },
  // The kit's kitchen sink — every piece of the look on one screen.
  { principal: 'kit', role: 'kit' },
  // The moderator, which judges names and questions (server/moderation.ts).
  { principal: 'moderator', role: 'moderator' },
  // The talk's clock, which saved timers run as (server/timing.ts).
  { principal: 'clock', role: 'clock' },
];

// The nisc deck is ./deck.ts, the talks ./talks.ts — data alone; this file is
// what writes them. `SLIDES` stays exported: the checks walk the nisc talk by it.
export { SLIDES } from './deck';
export { TALKS } from './talks';

// The deck the entries read (app/vex/deck.entries.ts).
export const DECK_ID = TALK_DECK;

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const talkIds = TALKS.map((talk) => quote(talk.talkId)).join(', ');
const slideIds = TALKS.flatMap((talk) => talk.slides.map((slide) => quote(slide.slideId))).join(', ');
const firstTalk = TALKS[0];
if (firstTalk === undefined || firstTalk.slides[0] === undefined) throw new Error('lyceum: the first talk needs a slide to open on');
const opening = { talk: quote(firstTalk.talkId), slide: quote(firstTalk.slides[0].slideId) };

export const buildSeedSql = (): string =>
  [
    // The ID cards' registry is gone (the moderator took its place): its grant
    // goes from databases seeded before.
    `DELETE FROM grants WHERE principal = 'registry';`,
    // The X-ray and the assistant are given to `everybody` in one row now
    // (vex/grant.entries.ts): the rows per person from databases seeded before go.
    `DELETE FROM grants WHERE role IN ('xray', 'assistant') AND principal <> 'everybody';`,
    ...STAFF.map((staff) => `INSERT INTO grants (principal, role) VALUES (${quote(staff.principal)}, ${quote(staff.role)}) ON CONFLICT DO NOTHING;`),

    // Talks, then slides: each converges to the data. Positions are unique, so
    // a reorder would collide with itself mid-way; every existing position is
    // first moved out of the way (negative), then each authored row is written
    // to its own. A slide that moved to another talk follows it.
    `UPDATE talks SET position = -1 - position WHERE position >= 0;`,
    ...TALKS.map(
      (talk, position) =>
        `INSERT INTO talks (talk_id, position, title) VALUES (${quote(talk.talkId)}, ${position}, ${quote(talk.title)})
         ON CONFLICT (talk_id) DO UPDATE SET position = EXCLUDED.position, title = EXCLUDED.title;`,
    ),
    `UPDATE slides SET position = -1 - position WHERE position >= 0;`,
    ...TALKS.flatMap((talk) =>
      talk.slides.map(
        (slide, position) =>
          `INSERT INTO slides (slide_id, talk_id, position, title, parts) VALUES (${quote(slide.slideId)}, ${quote(talk.talkId)}, ${position}, ${quote(slide.title)}, ${slide.parts ?? 1})
           ON CONFLICT (slide_id) DO UPDATE SET talk_id = EXCLUDED.talk_id, position = EXCLUDED.position, title = EXCLUDED.title, parts = EXCLUDED.parts;`,
      ),
    ),
    // The deck row is the talk's state: seeded once, never reset by a restart —
    // unless the talk it names is gone (it goes to the first talk), or the slide
    // it names is no longer in that talk (it goes to the talk's first slide),
    // rather than point at nothing.
    `INSERT INTO deck (deck_id, talk_id, slide_id) VALUES (${quote(DECK_ID)}, ${opening.talk}, ${opening.slide}) ON CONFLICT DO NOTHING;`,
    `UPDATE deck SET talk_id = ${opening.talk} WHERE talk_id NOT IN (${talkIds});`,
    `UPDATE deck SET slide_id = (SELECT s.slide_id FROM slides s WHERE s.talk_id = deck.talk_id AND s.position = 0)
       WHERE slide_id NOT IN (${slideIds}) OR NOT EXISTS (SELECT 1 FROM slides s WHERE s.slide_id = deck.slide_id AND s.talk_id = deck.talk_id);`,
    `DELETE FROM slides WHERE slide_id NOT IN (${slideIds});`,
    `DELETE FROM talks WHERE talk_id NOT IN (${talkIds});`,
    // The tools and the notes converge too: replaced whole, every boot.
    `DELETE FROM slide_tools;`,
    ...TALKS.flatMap((talk) =>
      talk.slides.flatMap((slide) =>
        slide.tools.map((tool, position) => `INSERT INTO slide_tools (slide_id, position, tool_id) VALUES (${quote(slide.slideId)}, ${position}, ${quote(tool)});`),
      ),
    ),
    `DELETE FROM slide_notes;`,
    ...TALKS.flatMap((talk) =>
      talk.slides.flatMap((slide) =>
        slide.notes.map((note, position) => `INSERT INTO slide_notes (slide_id, position, note) VALUES (${quote(slide.slideId)}, ${position}, ${quote(note)});`),
      ),
    ),
  ].join('\n');
