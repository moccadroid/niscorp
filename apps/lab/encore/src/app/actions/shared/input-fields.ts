import { z } from 'zod';

// THE FIELDS MORE THAN ONE CARD DECLARES, written once.
//
// Not a convenience. The intent loop derives its questions from these schemas,
// and two fields that emit the SAME question — same table, same words — are
// asked once and the answer shared. "Which act?" is one decision however many
// cards want it; spelling the description three slightly different ways would
// turn it into three, and let them disagree.
//
// These annotations ride `.meta()` into the JSON Schema, and the loop reads
// nothing else about a field:
//
//   ref       the table a value is a row id of → a `choice` over that table's
//             candidate rows. The model picks a row; it never writes an id.
//   parse     the value is said in the sentence, not judged from it: `day`,
//             `hour`, `time`, `minutes`. Filled by the deterministic parser and
//             NEVER a question — a bounded integer without it becomes a `score`.
//   fallback  'now' → when the sentence names no such value, the festival
//             clock's. A radar with no hour is aimed at this one; a swap form
//             with no time is left for the operator.
//   levels    words for a bounded integer's steps, so a `score` question reads
//             "routine / important / critical" instead of "0 / 1 / 2".
//   write     free text a TEXT model may author (Slice 1b). The fast model
//             returns no strings, so without this mark a field like a push's
//             body can only ever hold the operator's own sentence; with it, the
//             slow path may replace that draft — unless a person has touched it.

export const actRef = z.string().describe('The act whose set this concerns.').meta({ ref: 'acts' });

// WHERE A SET IS MOVING TO. One schema object, used by the swap form AND the
// impact card beside it: the loop asks one question per distinct question, so
// two cards that share this field share its answer and cannot be aimed at two
// different moves.
export const toStageRef = z.string().describe('The stage the act is moving to.').meta({ ref: 'stages' });

export const zoneRef = z.string().describe('The zone of the site this is about.').meta({ ref: 'zones' });

export const dayField = z.enum(['fri', 'sat', 'sun']).describe('Festival day: fri, sat or sun.').meta({ parse: 'day', fallback: 'now' });

export const hourField = z.number().int().min(0).max(23).describe('Hour of the day, 0–23.').meta({ parse: 'hour', fallback: 'now' });
