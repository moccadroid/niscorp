import { candidateActs, candidateStages, candidateZones } from './candidates.entries';

// WHICH TABLES AN INPUT MAY POINT AT, and the read that lists each one.
//
// An action says `.meta({ ref: 'acts' })` on a field; this is the other half of
// that sentence. The intent loop never learns what an act is — it looks the
// table name up here, replays the fingerprint, and offers the labels. A new
// referencable table is one row in this record and one entry beside it.
//
// `closed` tables send every row every pass and take no tokens.

export type RefTable = { fingerprint: string; closed: boolean };

export const REF_TABLES: Record<string, RefTable> = {
  acts: { fingerprint: candidateActs.fingerprint, closed: false },
  stages: { fingerprint: candidateStages.fingerprint, closed: true },
  zones: { fingerprint: candidateZones.fingerprint, closed: true },
};
