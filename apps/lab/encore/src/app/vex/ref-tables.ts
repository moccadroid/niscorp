import { candidateActs, candidateStages, candidateZones } from './candidates.entries';

// `rowKeys`: how a row of any read names a row of this table (`act_id`, worded by
// `act_name`), the convention every entry in this app follows.
export type RefTable = { fingerprint: string; closed: boolean; noun: string; rowKeys: { id: string; labels: readonly string[] } };

export const REF_TABLES: Record<string, RefTable> = {
  acts: { fingerprint: candidateActs.fingerprint, closed: false, noun: 'an act', rowKeys: { id: 'act_id', labels: ['act_name'] } },
  stages: { fingerprint: candidateStages.fingerprint, closed: true, noun: 'a stage', rowKeys: { id: 'stage_id', labels: ['stage_name', 'name'] } },
  zones: { fingerprint: candidateZones.fingerprint, closed: true, noun: 'a zone', rowKeys: { id: 'zone_id', labels: ['zone_name', 'name'] } },
};
