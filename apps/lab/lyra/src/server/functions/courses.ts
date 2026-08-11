import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';

// A COURSE THAT IS ACTUALLY ON THE CALENDAR.
//
// The bug this exists to fix: creating a course wrote one row with a start
// date, an end date, a capacity and a price — and no classes. Nothing said so.
// "Fundamentals intake, Mon 10 Aug – Mon 31 Aug" appeared on the courses
// screen, people could enrol on it, and there was no answer at all to "when do
// I turn up". The dates described a block that met on no days.
//
// A course is a SET OF WEEKLY SLOTS with an end date and a price. That is the
// whole idea, and modelling it as a separate thing beside the weekly plan is
// what made the pair confusing to begin with.
//
// A function rather than a fingerprint, for the same reason hiring somebody is:
// this is several writes that have to be one act, which the closed mutation
// grammar deliberately cannot express. What it does NOT do is reach past the
// engine — every write below is an ordinary replay of an authored entry, so
// `studio_id` is still stamped by the engine, the charter still gates each one,
// and a manager at Lumen still cannot put a course into North Rock. The fn's
// contribution is an ORDER, nothing more.
const call = async (session: FunctionSession, fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
  const response = await session.wire('/api/schedule/vex', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fingerprint, context }),
  });
  if (!response.ok) {
    const detail: unknown = await response.json().catch(() => null);
    const message = detail !== null && typeof detail === 'object' && 'message' in detail ? String((detail as { message: unknown }).message) : `refused (${response.status})`;
    throw new Error(message);
  }
  return response.json();
};

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Which weekdays were ticked, as the integers `class_templates.weekday` holds. */
const chosenDays = (data: Record<string, unknown>): number[] => DAYS.map((day, index) => (data[day] === true ? index : -1)).filter((index) => index >= 0);

export const courseFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  'courses.create': async (data) => {
    const name = String(data['name'] ?? '').trim();
    const startsOn = String(data['startsOn'] ?? '');
    const endsOn = String(data['endsOn'] ?? '');
    const days = chosenDays(data);

    if (name === '') throw new Error('A name is needed.');
    // A HUMAN SENTENCE, not a constraint name. Without this the screen showed
    // 'violates foreign key constraint courses_program_id_fkey' to somebody
    // whose actual mistake was not choosing a class type.
    if (String(data['programId'] ?? '') === '') throw new Error('Pick a class type for this course.');
    if (startsOn === '' || endsOn === '') throw new Error('A course needs a start and an end.');
    if (endsOn < startsOn) throw new Error('It cannot end before it starts.');
    // THE CHECK THAT WAS MISSING ENTIRELY. A course with no days is a course
    // with no classes, and it used to be the only kind you could make.
    if (days.length === 0) throw new Error('Pick at least one day it meets on. A course with no days has no classes.');

    const created = await call(session, 'courses/create', {
      programId: String(data['programId'] ?? ''),
      name,
      blurb: String(data['blurb'] ?? ''),
      startsOn,
      endsOn,
      capacity: Number(data['capacity'] ?? 12),
      priceCents: Number(data['priceCents'] ?? 0),
    });

    const courseId = created !== null && typeof created === 'object' ? String((created as { id?: unknown }).id ?? '') : '';
    if (courseId === '') throw new Error('The course was not created.');

    // One slot per chosen day, bounded by the course's own dates. The insert
    // trigger generates the sessions inside that window — so the moment this
    // returns, the block is on the timetable and a member can see when to come.
    for (const weekday of days) {
      await call(session, 'templates/create', {
        programId: String(data['programId'] ?? ''),
        name,
        weekday,
        startsAt: String(data['startsAt'] ?? '18:00'),
        durationMins: Number(data['durationMins'] ?? 60),
        // A seat on the block IS a seat in every class of it, so the slot
        // carries the course's capacity rather than a second, different number
        // that could quietly disagree with it.
        capacity: Number(data['capacity'] ?? 12),
        instructorId: String(data['instructorId'] ?? '') === '' ? null : String(data['instructorId']),
        courseId,
        startsOn,
        endsOn,
      });
    }

    return { course_id: courseId, slots: days.length };
  },
});
