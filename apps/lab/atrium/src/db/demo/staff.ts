import { insert, type Val } from './sql';

// The floor of both houses, the personas that talk to it, and where everybody's
// unread count starts.
//
// The roster grew from three people to thirteen for one reason: dispatching work
// is a CHOICE. With one maintenance man on the list, sending a job to him is a
// formality and the assistant staging an assignee proves nothing. With two
// trades, four people, and a duty manager to escalate to, picking the right one
// is a judgement — and a judgement is the only thing worth watching a machine
// make.

// id, property, name, job, layout_control
const STAFF: [string, string, string, string, string][] = [
  // ── The Lumen ──
  // Rosa runs the demo, so she is the one on `full`: the assistant places every
  // working column for her. Everyone else stays on `mixed`, where it owns its
  // own column and their navigation is theirs.
  ['stf_rosa', 'prop_lumen', 'Rosa Delgado', 'Front office', 'full'],
  ['stf_jonas', 'prop_lumen', 'Jonas Riis', 'Front office — nights', 'mixed'],
  ['stf_mette', 'prop_lumen', 'Mette Klausen', 'Duty manager', 'mixed'],
  ['stf_kwame', 'prop_lumen', 'Kwame Boateng', 'Maintenance', 'mixed'],
  ['stf_anders', 'prop_lumen', 'Anders Krogh', 'Maintenance', 'mixed'],
  ['stf_liv', 'prop_lumen', 'Liv Andersen', 'Housekeeping', 'mixed'],
  ['stf_maja', 'prop_lumen', 'Maja Petersen', 'Housekeeping', 'mixed'],
  ['stf_henrik', 'prop_lumen', 'Henrik Sørensen', 'Operations', 'mixed'],
  // ── Casa Marisol ──
  // Henrik runs operations for BOTH houses — two principals, one person. The
  // chrome's property switcher moves him between them; each principal stays
  // single-tenant, so the boundary never bends.
  ['stf_pilar', 'prop_marisol', 'Pilar Ferrer', 'Front office', 'mixed'],
  ['stf_nuria', 'prop_marisol', 'Núria Blanch', 'Front office', 'mixed'],
  ['stf_marc', 'prop_marisol', 'Marc Oliver', 'Maintenance', 'mixed'],
  ['stf_rocio', 'prop_marisol', 'Rocío Navarro', 'Housekeeping', 'mixed'],
  ['stf_henrik_m', 'prop_marisol', 'Henrik Sørensen', 'Operations', 'mixed'],
];

// Everybody starts on the house default — an empty `assistant_model` means the
// persona row decides, so the seam personas already had stays the one that ships
// and the picker is an override on top of it.
export const staffSql = (): string =>
  insert('staff', ['id', 'property_id', 'name', 'job', 'layout_control', 'assistant_model'], STAFF.map((row) => [...row, ''] as Val[]));

// ─── the assistants: one persona per audience ────────────────
// Character is VOICE ONLY — tone, cadence, register. Behavior (the honesty rule,
// tool order, what it may place) lives in the instructions and tool guides;
// restating policy here made two sources of truth that drifted. Abilities are
// never authored — they are derived per session from the caller's catalog, live
// slots and scope policy.
export const assistantsSql = (): string =>
  insert(
    'assistants',
    ['id', 'audience', 'name', 'character', 'model', 'provider'],
    [
      // Aria runs on a different model than the staff personas — the guest shell
      // leans hardest on tool discipline, and retuning her is one row.
      ['ast_guest', 'guest', 'Aria', 'The hotel concierge. Warm, brief, unhurried — a good hotel speaks quietly.', 'llama-3.3-70b-versatile', 'groq'],
      ['ast_desk', 'desk', 'Marta', 'A seasoned front-office colleague. Brisk, precise, first-name basis.', 'openai/gpt-oss-120b', 'groq'],
      ['ast_service', 'service', 'Timo', 'A fellow tradesperson. Short sentences, no ceremony. Room numbers first.', 'openai/gpt-oss-120b', 'groq'],
      ['ast_ops', 'ops', 'Nils', 'An operations analyst. Numbers before adjectives; name the figure, then the read on it.', 'openai/gpt-oss-120b', 'groq'],
      ['ast_vendor', 'vendor', 'Vega', 'An integration engineer at Atrium. Talks in capabilities and diffs. Dry.', 'openai/gpt-oss-120b', 'groq'],
    ],
  );

// Everyone's mark starts at epoch, so everything the house has said is genuinely
// unseen on first login and the unread reads never meet a NULL. One row per
// principal that can actually sign in — a mark for somebody with no login is a
// row nothing will ever read.
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
