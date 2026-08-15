// What each studio teaches, and the two dated blocks running now.
import { day, insert } from '../sql';
import { LUMEN, NORTHROCK } from './studios';

export const PROGRAMS_SQL = insert(
  'programs',
  ['id', 'studio_id', 'name', 'blurb', 'colour', 'active'],
  [
    ['pr_vinyasa', LUMEN, 'Vinyasa Flow', 'Breath-led, continuous movement. All levels.', 'violet', true],
    ['pr_yin', LUMEN, 'Yin & Restore', 'Long holds, props, quiet. Evenings.', 'teal', true],
    ['pr_beginners', LUMEN, 'Foundations', 'From nothing, at your own pace. Ask about the next beginners block.', 'amber', true],
    ['pr_gi', NORTHROCK, 'Gi', 'Traditional jiu-jitsu in the gi.', 'indigo', true],
    ['pr_nogi', NORTHROCK, 'No-Gi', 'Grappling without the jacket.', 'sky', true],
    ['pr_fundamentals', NORTHROCK, 'Fundamentals', 'Where everybody starts. Technique first, sparring when you are ready.', 'lime', true],
    ['pr_comp', NORTHROCK, 'Competition', 'For members preparing to compete. Ask a coach.', 'rose', true],
  ],
);

// ─── the blocks ──────────────────────────────────────────────
export const COURSES_SQL = insert(
  'courses',
  ['id', 'studio_id', 'program_id', 'name', 'blurb', 'starts_on', 'ends_on', 'capacity', 'price_cents'],
  [
    ['co_lumen_found', LUMEN, 'pr_beginners', 'Foundations — autumn block', 'Six weeks, from nothing. Every posture from the beginning, in a room where everybody else is new too.', day(3, LUMEN), day(3 + 35, LUMEN), 12, 12000],
    ['co_rock_intake', NORTHROCK, 'pr_fundamentals', 'Fundamentals intake', 'Four weeks of the basics before you step onto the main mat. No sparring.', day(2, NORTHROCK), day(2 + 21, NORTHROCK), 16, 9000],
  ],
);
