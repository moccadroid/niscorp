import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// `rev` is one counter across every feed: an insert or an update stamps the next
// value. The feed reads are newest first, with a limit: a watcher's first read,
// cursor 0, is how it learns where "now" is without replaying the whole festival.
// It reverses them.
const AFTER = { $context: 'after' };

export const feedZoneCounts: SeedEntry = {
  fingerprint: 'feed/zoneCounts',
  intent: 'Zone head counts that changed after a cursor, each with its zone and capacity',
  shape: [{ rev: 0, zone_id: '', zone_name: '', day: '', hour: 0, headcount: 0, capacity: 0 }],
  dsl: {
    from: ['zone_counts', 'zones'],
    fields: ['zone_counts.rev', { field: 'zones.id', as: 'zone_id' }, { field: 'zones.name', as: 'zone_name' }, 'zone_counts.day', 'zone_counts.hour', 'zone_counts.headcount', 'zones.capacity'],
    filter: { gt: ['zone_counts.rev', AFTER] },
    sort: [{ field: 'zone_counts.rev', dir: 'desc' }],
    limit: 200,
  },
};

export const feedIncidents: SeedEntry = {
  fingerprint: 'feed/incidents',
  intent: 'Incidents that were reported or changed after a cursor, each with where it is',
  shape: [{ rev: 0, incident_id: '', zone_id: '', zone_name: '', at: '', kind: '', severity: 0, summary: '', status: '' }],
  dsl: {
    from: ['incidents', 'zones'],
    fields: ['incidents.rev', { field: 'incidents.id', as: 'incident_id' }, { field: 'zones.id', as: 'zone_id' }, { field: 'zones.name', as: 'zone_name' }, 'incidents.at', 'incidents.kind', 'incidents.severity', 'incidents.summary', 'incidents.status'],
    filter: { gt: ['incidents.rev', AFTER] },
    sort: [{ field: 'incidents.rev', dir: 'desc' }],
    limit: 200,
  },
};

export const feedGates: SeedEntry = {
  fingerprint: 'feed/gates',
  intent: 'Gates whose state changed after a cursor: open or shut, scanners working or down',
  shape: [{ rev: 0, gate_id: '', gate_name: '', zone_id: '', zone_name: '', is_open: true, scanner_ok: true }],
  dsl: {
    from: ['gates', 'zones'],
    fields: ['gates.rev', { field: 'gates.id', as: 'gate_id' }, { field: 'gates.name', as: 'gate_name' }, { field: 'zones.id', as: 'zone_id' }, { field: 'zones.name', as: 'zone_name' }, 'gates.is_open', 'gates.scanner_ok'],
    filter: { gt: ['gates.rev', AFTER] },
    sort: [{ field: 'gates.rev', dir: 'desc' }],
    limit: 50,
  },
};

export const feedScans: SeedEntry = {
  fingerprint: 'feed/scans',
  intent: 'Ticket scans recorded after a cursor, each with its gate',
  shape: [{ rev: 0, gate_id: '', gate_name: '', minute: 0, scans: 0 }],
  dsl: {
    from: ['gate_scans', 'gates'],
    fields: ['gate_scans.rev', { field: 'gates.id', as: 'gate_id' }, { field: 'gates.name', as: 'gate_name' }, 'gate_scans.minute', 'gate_scans.scans'],
    filter: { gt: ['gate_scans.rev', AFTER] },
    sort: [{ field: 'gate_scans.rev', dir: 'desc' }],
    limit: 1000,
  },
};

export const clockNow: SeedEntry = {
  fingerprint: 'clock/now',
  intent: 'The festival clock: which day it is and the minute of that day',
  shape: { day: '', minute: 0 },
  dsl: { from: ['festival_clock'], fields: ['festival_clock.day', 'festival_clock.minute'], limit: 1 },
};

export const labelsSince: SeedEntry = {
  fingerprint: 'attention/labelsSince',
  intent: 'The caller\'s own keep and dismiss clicks on raised cards, after a cursor',
  shape: [{ seq: 0, verdict: '', action_id: '', cause: '' }],
  dsl: {
    from: ['attention_labels'],
    fields: ['attention_labels.seq', 'attention_labels.verdict', 'attention_labels.action_id', 'attention_labels.cause'],
    filter: { gt: ['attention_labels.seq', AFTER] },
    sort: [{ field: 'attention_labels.seq', dir: 'asc' }],
    limit: 100,
  },
};

export const labelAdd: SeedMutation = {
  fingerprint: 'attention/label',
  intent: 'Record that the caller kept or dismissed a card the room raised, with the probabilities it was raised on',
  mutation: {
    op: 'insert',
    table: 'attention_labels',
    values: { verdict: { $context: 'verdict' }, action_id: { $context: 'actionId' }, cause: { $context: 'cause' }, probabilities: { $context: 'probabilities' } },
  },
};

export const feedSetCount: SeedMutation = {
  fingerprint: 'feed/setCount',
  intent: 'Set the head count of one zone at one day and hour',
  mutation: {
    op: 'update',
    table: 'zone_counts',
    set: { headcount: { $context: 'headcount' } },
    where: { and: [{ eq: ['zone_counts.zone_id', { $context: 'zoneId' }] }, { eq: ['zone_counts.day', { $context: 'day' }] }, { eq: ['zone_counts.hour', { $context: 'hour' }] }] },
  },
};

export const feedOpenIncident: SeedMutation = {
  fingerprint: 'feed/openIncident',
  intent: 'Report an incident',
  mutation: {
    op: 'insert',
    table: 'incidents',
    values: { id: { $context: 'id' }, day: { $context: 'day' }, at: { $context: 'at' }, zone_id: { $context: 'zoneId' }, kind: { $context: 'kind' }, severity: { $context: 'severity' }, summary: { $context: 'summary' } },
  },
};

export const feedSetIncidentStatus: SeedMutation = {
  fingerprint: 'feed/setIncidentStatus',
  intent: 'Open or close an incident',
  mutation: { op: 'update', table: 'incidents', set: { status: { $context: 'status' } }, where: { eq: ['incidents.id', { $context: 'id' }] } },
};

export const feedSetScanner: SeedMutation = {
  fingerprint: 'feed/setScanner',
  intent: 'Mark the scanners at one gate as working or down',
  mutation: { op: 'update', table: 'gates', set: { scanner_ok: { $context: 'ok' } }, where: { eq: ['gates.id', { $context: 'gateId' }] } },
};

export const feedScan: SeedMutation = {
  fingerprint: 'feed/scan',
  intent: 'Record a batch of ticket scans at one gate',
  mutation: { op: 'insert', table: 'gate_scans', values: { gate_id: { $context: 'gateId' }, day: { $context: 'day' }, minute: { $context: 'minute' }, scans: { $context: 'scans' } } },
};

export const clockSet: SeedMutation = {
  fingerprint: 'clock/set',
  intent: 'Set the festival clock to a day and a minute of that day',
  mutation: { op: 'update', table: 'festival_clock', set: { day: { $context: 'day' }, minute: { $context: 'minute' } }, where: { eq: ['festival_clock.id', { $context: 'id' }] } },
};

export const WATCH_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [feedZoneCounts, feedIncidents, feedGates, feedScans, clockNow, labelsSince, labelAdd, feedSetCount, feedOpenIncident, feedSetIncidentStatus, feedSetScanner, feedScan, clockSet];
