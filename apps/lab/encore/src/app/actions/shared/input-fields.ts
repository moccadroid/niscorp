import { z } from 'zod';

// The intent loop derives its questions from these schemas. Two fields that emit
// the same question (same table, same words) are asked once and the answer
// shared. The `.meta()` keys it reads:
//   ref       the table a value is a row id of: a `choice` over its candidate rows
//   parse     filled from the sentence by the parser, never a question
//   fallback  'now': when the sentence names no such value, the festival clock's
//   levels    words for a bounded integer's steps in a `score` question
//   write     free text a text model may author, unless a person has touched it

export const actRef = z.string().describe('The act whose set this concerns.').meta({ ref: 'acts' });

export const toStageRef = z.string().describe('The stage the act is moving to.').meta({ ref: 'stages' });

export const zoneRef = z.string().describe('The zone of the site this is about.').meta({ ref: 'zones' });

export const dayField = z.enum(['fri', 'sat', 'sun']).describe('Festival day: fri, sat or sun.').meta({ parse: 'day', fallback: 'now' });

export const hourField = z.number().int().min(0).max(23).describe('Hour of the day, 0–23.').meta({ parse: 'hour', fallback: 'now' });
