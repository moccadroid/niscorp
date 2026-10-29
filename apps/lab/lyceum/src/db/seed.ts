import { TALK_DECK } from '@lyceum/app/vex/deck.entries';
import { TALKS } from './talks';

export const STAFF: readonly { principal: string; role: string }[] = [
  { principal: 'speaker', role: 'speaker' },
  { principal: 'stage', role: 'stage' },
  { principal: 'kit', role: 'kit' },
  { principal: 'moderator', role: 'moderator' },
  { principal: 'clock', role: 'clock' },
];

export { SLIDES } from './deck';
export { TALKS } from './talks';

export const DECK_ID = TALK_DECK;

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const talkIds = TALKS.map((talk) => quote(talk.talkId)).join(', ');
const slideIds = TALKS.flatMap((talk) => talk.slides.map((slide) => quote(slide.slideId))).join(', ');
const firstTalk = TALKS[0];
if (firstTalk === undefined || firstTalk.slides[0] === undefined) throw new Error('lyceum: the first talk needs a slide to open on');
const opening = { talk: quote(firstTalk.talkId), slide: quote(firstTalk.slides[0].slideId) };

export const buildSeedSql = (): string =>
  [
    `DELETE FROM grants WHERE principal = 'registry';`,
    `DELETE FROM grants WHERE role IN ('xray', 'assistant') AND principal <> 'everybody';`,
    ...STAFF.map((staff) => `INSERT INTO grants (principal, role) VALUES (${quote(staff.principal)}, ${quote(staff.role)}) ON CONFLICT DO NOTHING;`),

    // Positions are unique, so a reorder would collide with itself mid-way: every
    // existing position is first moved out of the way (negative).
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
    `INSERT INTO deck (deck_id, talk_id, slide_id) VALUES (${quote(DECK_ID)}, ${opening.talk}, ${opening.slide}) ON CONFLICT DO NOTHING;`,
    `UPDATE deck SET talk_id = ${opening.talk} WHERE talk_id NOT IN (${talkIds});`,
    `UPDATE deck SET slide_id = (SELECT s.slide_id FROM slides s WHERE s.talk_id = deck.talk_id AND s.position = 0)
       WHERE slide_id NOT IN (${slideIds}) OR NOT EXISTS (SELECT 1 FROM slides s WHERE s.slide_id = deck.slide_id AND s.talk_id = deck.talk_id);`,
    `DELETE FROM slides WHERE slide_id NOT IN (${slideIds});`,
    `DELETE FROM talks WHERE talk_id NOT IN (${talkIds});`,
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
