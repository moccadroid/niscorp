import { candidateActs, candidateStages, candidateZones } from './candidates.entries';

// WHICH TABLES AN INPUT MAY POINT AT, and the read that lists each one.
//
// An action says `.meta({ ref: 'acts' })` on a field; this is the other half of
// that sentence. The intent loop never learns what an act is — it looks the
// table name up here, replays the fingerprint, and offers the labels. A new
// referencable table is one row in this record and one entry beside it.
//
// `closed` tables send every row every pass and take no tokens.

// `noun`: what one row is called, to an operator — "it needs an act".
// `rowKeys`: how a row of ANY read names a row of this table (`act_id`, worded by
// `act_name`) — the convention every entry in this app follows, and what lets the
// rows the assistant looked up be named by the answer that read them.
export type RefTable = { fingerprint: string; closed: boolean; noun: string; rowKeys: { id: string; labels: readonly string[] } };

export const REF_TABLES: Record<string, RefTable> = {
  acts: { fingerprint: candidateActs.fingerprint, closed: false, noun: 'an act', rowKeys: { id: 'act_id', labels: ['act_name'] } },
  stages: { fingerprint: candidateStages.fingerprint, closed: true, noun: 'a stage', rowKeys: { id: 'stage_id', labels: ['stage_name', 'name'] } },
  zones: { fingerprint: candidateZones.fingerprint, closed: true, noun: 'a zone', rowKeys: { id: 'zone_id', labels: ['zone_name', 'name'] } },
};
