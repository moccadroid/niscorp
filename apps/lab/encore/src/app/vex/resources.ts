export const RESOURCES: Record<string, { entities: readonly string[] }> = {
  lineup: { entities: ['acts', 'slots', 'stages', 'zones', 'delays'] },
  site: { entities: ['zones', 'zone_counts', 'gates', 'crew'] },
  readings: { entities: ['weather_hours', 'sales_hourly', 'incidents'] },
  ledger: { entities: ['pushes', 'delays'] },
  thread: { entities: ['agent_turns'] },
  feeds: { entities: ['zone_counts', 'zones', 'incidents', 'gates', 'gate_scans', 'festival_clock', 'attention_labels'] },
};
