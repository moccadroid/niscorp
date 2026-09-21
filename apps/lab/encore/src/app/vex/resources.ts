// Vex resources — the entity subgraphs mounted under /api/<name>/vex.
//
// App reads are replay-only, so these bite on discovery alone; they are still
// the honest statement of which tables belong together, and they are what a
// later slice's ad-hoc path would be held to. The intent loop's candidate reads
// use the bare /api/vex on purpose: a candidate list is cut across whichever
// tables the principal's actions happen to reference, which is no one
// subgraph's business.

export const RESOURCES: Record<string, { entities: readonly string[] }> = {
  lineup: { entities: ['acts', 'slots', 'stages', 'zones', 'delays'] },
  site: { entities: ['zones', 'zone_counts', 'gates', 'crew'] },
  readings: { entities: ['weather_hours', 'sales_hourly', 'incidents'] },
  ledger: { entities: ['pushes', 'delays'] },
  thread: { entities: ['agent_turns'] },
  // What the room watches, and what a person did about what it raised.
  feeds: { entities: ['zone_counts', 'zones', 'incidents', 'gates', 'gate_scans', 'festival_clock', 'attention_labels'] },
};
