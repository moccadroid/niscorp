import type { Charter } from '@niscorp/charter';

export const CHARTER: Charter = {
  public: [],

  operator: {
    actions: ['intent.*', 'assist.*', 'site.*', 'stage.*', 'lineup.*', 'act.*', 'weather.*', 'crowd.*', 'attendance.*', 'situation.*', 'incident.*', 'move.*', 'attention.*', 'director.*', 'sales.*', 'slot.*', 'set.*', 'push.*'],
    data: [
      'acts.read',
      'stages.read',
      'slots.read',
      'zones.read',
      'zone_counts.read',
      'gates.read',
      'crew.read',
      'weather_hours.read',
      'sales_hourly.read',
      'incidents.read',
      'delays.read',
      'pushes.read',
      // Holds and pushes are ledger rows, insert-only on purpose: nobody edits what was sent.
      'slots.write.update',
      'delays.write.insert',
      'pushes.write.insert',
      // Whose rows these are is not a grant: the engine fences them per principal (vex/behaviors.ts).
      'agent_turns.read',
      'agent_turns.write.insert',
      'gate_scans.read',
      'festival_clock.read',
      'attention_labels.read',
      'attention_labels.write.insert',
    ],
  },

  director: {
    actions: [],
    data: ['zone_counts.write.update', 'incidents.write.insert', 'incidents.write.update', 'gates.write.update', 'gate_scans.write.insert', 'festival_clock.write.update', 'festival_clock.read'],
  },

  'vendor-liaison': {
    // Not theirs, deliberately: `situation.now` and `incident.feed`. Both read
    // `incidents`: medical and security reports. `attendance.now` is theirs: it
    // reads `zones` and `zone_counts`, the two tables behind the gauge they hold.
    actions: ['intent.*', 'assist.*', 'attention.*', 'site.map', 'crowd.gauge', 'attendance.now', 'sales.chart', 'push.compose'],
    data: ['zones.read', 'zone_counts.read', 'sales_hourly.read', 'pushes.read', 'pushes.write.insert', 'agent_turns.read', 'agent_turns.write.insert', 'festival_clock.read', 'attention_labels.read', 'attention_labels.write.insert'],
  },
};
