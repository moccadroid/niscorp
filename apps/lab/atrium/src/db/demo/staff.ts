import { insert, type Val } from './sql';

const STAFF: [string, string, string, string, string][] = [
  ['stf_rosa', 'prop_lumen', 'Rosa Delgado', 'Front office', 'full'],
  ['stf_jonas', 'prop_lumen', 'Jonas Riis', 'Front office — nights', 'mixed'],
  ['stf_mette', 'prop_lumen', 'Mette Klausen', 'Duty manager', 'mixed'],
  ['stf_kwame', 'prop_lumen', 'Kwame Boateng', 'Maintenance', 'mixed'],
  ['stf_anders', 'prop_lumen', 'Anders Krogh', 'Maintenance', 'mixed'],
  ['stf_liv', 'prop_lumen', 'Liv Andersen', 'Housekeeping', 'mixed'],
  ['stf_maja', 'prop_lumen', 'Maja Petersen', 'Housekeeping', 'mixed'],
  ['stf_henrik', 'prop_lumen', 'Henrik Sørensen', 'Operations', 'mixed'],
  ['stf_pilar', 'prop_marisol', 'Pilar Ferrer', 'Front office', 'mixed'],
  ['stf_nuria', 'prop_marisol', 'Núria Blanch', 'Front office', 'mixed'],
  ['stf_marc', 'prop_marisol', 'Marc Oliver', 'Maintenance', 'mixed'],
  ['stf_rocio', 'prop_marisol', 'Rocío Navarro', 'Housekeeping', 'mixed'],
  ['stf_henrik_m', 'prop_marisol', 'Henrik Sørensen', 'Operations', 'mixed'],
];

export const staffSql = (): string =>
  insert('staff', ['id', 'property_id', 'name', 'job', 'layout_control', 'assistant_model'], STAFF.map((row) => [...row, ''] as Val[]));

export const assistantsSql = (): string =>
  insert(
    'assistants',
    ['id', 'audience', 'name', 'character', 'model', 'provider'],
    [
      ['ast_guest', 'guest', 'Aria', 'The hotel concierge. Warm, brief, unhurried — a good hotel speaks quietly.', 'qwen/qwen3.8-27b', 'groq'],
      ['ast_desk', 'desk', 'Marta', 'A seasoned front-office colleague. Brisk, precise, first-name basis.', 'qwen/qwen3.8-27b', 'groq'],
      ['ast_service', 'service', 'Timo', 'A fellow tradesperson. Short sentences, no ceremony. Room numbers first.', 'qwen/qwen3.8-27b', 'groq'],
      ['ast_ops', 'ops', 'Nils', 'An operations analyst. Numbers before adjectives; name the figure, then the read on it.', 'qwen/qwen3.8-27b', 'groq'],
      ['ast_vendor', 'vendor', 'Vega', 'An integration engineer at Atrium. Talks in capabilities and diffs. Dry.', 'qwen/qwen3.8-27b', 'groq'],
    ],
  );

// The epoch, so everything is unread on first login and the unread reads never meet a NULL.
export const seenSql = (): string =>
  insert(
    'seen_marks',
    ['id', 'user_id', 'property_id', 'topic', 'seen_at'],
    [
      ['seen_amara', 'gst_amara', 'prop_lumen', 'messages', '1970-01-01T00:00:00Z'],
      ['seen_theo', 'gst_theo', 'prop_lumen', 'messages', '1970-01-01T00:00:00Z'],
      ['seen_ines', 'gst_ines', 'prop_marisol', 'messages', '1970-01-01T00:00:00Z'],
      ['seen_rosa', 'stf_rosa', 'prop_lumen', 'messages', '1970-01-01T00:00:00Z'],
      ['seen_pilar', 'stf_pilar', 'prop_marisol', 'messages', '1970-01-01T00:00:00Z'],
      ['seen_kwame', 'stf_kwame', 'prop_lumen', 'messages', '1970-01-01T00:00:00Z'],
      ['seen_henrik', 'stf_henrik', 'prop_lumen', 'messages', '1970-01-01T00:00:00Z'],
      ['seen_henrik_m', 'stf_henrik_m', 'prop_marisol', 'messages', '1970-01-01T00:00:00Z'],
    ],
  );
