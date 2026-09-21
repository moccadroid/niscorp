import { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// ROWS THAT CHANGED → EVENTS. Pure.
//
// A reaction said a table was written; the watcher re-read what changed; this
// turns those rows into the few things that HAPPENED — and merges them, by kind
// and place, the way the pacer merges keystrokes. Three hundred scan rows at one
// gate are one event ("West Gate: 300 tickets scanned in the last minute"); five
// updates to one zone's count are the last of them.
//
// AN EVENT IS LABELS, because it is about to be a decision model's STATE: what
// kind of thing, where, the reading in words, and the band the festival's own
// alerting rules put it in. The bands are authored here and they are crude on
// purpose — they are what a feed would stamp on a reading ("amber"), not a
// judgement about what to DO; that question is Jev's, asked of every event.
//
// `gone` is the one thing decided here rather than asked: an incident that was
// closed, or a scanner that came back, is a cause that has LEFT, and whatever it
// raised comes down without a round trip to anybody.
// ═══════════════════════════════════════════════════════════

export type EventBand = 'routine' | 'warning' | 'critical';

export type FeedEvent = {
  // What merges, and what a raised card is remembered by: kind + place.
  key: string;
  kind: 'crowd' | 'incident' | 'gate' | 'scans';
  place: string;
  band: EventBand;
  // A few words for the rail and the strip; the whole reading for the model.
  short: string;
  line: string;
  gone: boolean;
  // Words retrieval can find rows by: the place's own name.
  tokens: string[];
};

// The festival's alerting rules. A zone is a warning at nine tenths full and
// critical at ninety-five percent; an incident's own severity is its band.
export const CROWD_WARNING_AT = 0.9;
export const CROWD_CRITICAL_AT = 0.95;
const INCIDENT_BAND: readonly EventBand[] = ['routine', 'routine', 'warning', 'critical'];

export const ZoneCountRows = z.array(z.object({ rev: z.number(), zone_id: z.string(), zone_name: z.string(), day: z.string(), hour: z.number(), headcount: z.number(), capacity: z.number() }));
export const IncidentRows = z.array(z.object({ rev: z.number(), incident_id: z.string(), zone_name: z.string(), at: z.string(), kind: z.string(), severity: z.number(), summary: z.string(), status: z.string() }).loose());
export const GateRows = z.array(z.object({ rev: z.number(), gate_id: z.string(), gate_name: z.string(), zone_name: z.string(), is_open: z.boolean(), scanner_ok: z.boolean() }).loose());
export const ScanRows = z.array(z.object({ rev: z.number(), gate_id: z.string(), gate_name: z.string(), minute: z.number(), scans: z.number() }));

export type FeedRows = {
  zoneCounts: z.infer<typeof ZoneCountRows>;
  incidents: z.infer<typeof IncidentRows>;
  gates: z.infer<typeof GateRows>;
  scans: z.infer<typeof ScanRows>;
};

const wordsOf = (name: string): string[] => name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
const count = (value: number): string => value.toLocaleString('en-GB');

const crowdBand = (fill: number): EventBand => (fill >= CROWD_CRITICAL_AT ? 'critical' : fill >= CROWD_WARNING_AT ? 'warning' : 'routine');

const BAND_WORDS: Record<EventBand, string> = {
  routine: 'routine',
  warning: 'warning — needs attention soon',
  critical: 'critical — over the line, immediate',
};

// THE SAME READING, FOR A PERSON. The model is told the alerting rule's band in
// words because it has nothing else to go on; a raised card already wears its
// severity as a badge, and saying it twice — possibly two ways — is noise.
export const withoutBand = (event: FeedEvent): string => {
  const suffix = Object.values(BAND_WORDS).map((words) => ` — ${words}`).find((words) => event.line.endsWith(words));
  return suffix === undefined ? event.line : event.line.slice(0, -suffix.length);
};

export const eventsFrom = (rows: FeedRows, clock: { day: string; hour: number }): FeedEvent[] => {
  const events = new Map<string, FeedEvent>();

  // The head count that matters is the one for the hour it IS. Later rows win.
  for (const row of rows.zoneCounts) {
    if (row.day !== clock.day || row.hour !== clock.hour || row.capacity <= 0) continue;
    const fill = row.headcount / row.capacity;
    const band = crowdBand(fill);
    const percent = `${Math.round(fill * 100)}%`;
    events.set(`crowd:${row.zone_id}`, {
      key: `crowd:${row.zone_id}`,
      kind: 'crowd',
      place: row.zone_name,
      band,
      short: `${row.zone_name} ${percent}`,
      line: `${row.zone_name} crowding: ${percent} of capacity (${count(row.headcount)} of ${count(row.capacity)}) — ${BAND_WORDS[band]}`,
      gone: false,
      tokens: wordsOf(row.zone_name),
    });
  }

  for (const row of rows.incidents) {
    const band = INCIDENT_BAND[Math.min(3, Math.max(0, row.severity))] ?? 'routine';
    const isClosed = row.status !== 'open';
    events.set(`incident:${row.incident_id}`, {
      key: `incident:${row.incident_id}`,
      kind: 'incident',
      place: row.zone_name,
      band,
      short: `${row.kind} incident, ${row.zone_name}${isClosed ? ' — closed' : ''}`,
      line: `${row.kind} incident reported in ${row.zone_name} at ${row.at}: ${row.summary} — ${BAND_WORDS[band]}`,
      gone: isClosed,
      tokens: wordsOf(row.zone_name),
    });
  }

  for (const row of rows.gates) {
    const isFine = row.scanner_ok && row.is_open;
    events.set(`gate:${row.gate_id}`, {
      key: `gate:${row.gate_id}`,
      kind: 'gate',
      place: row.gate_name,
      band: isFine ? 'routine' : 'warning',
      short: `${row.gate_name} ${row.is_open ? 'scanners down' : 'shut'}`,
      line: `${row.gate_name} (into ${row.zone_name}): ${row.is_open ? 'the scanners are down — a fault; the gate is open and the queue is not moving' : 'the gate is shut'} — ${BAND_WORDS.warning}`,
      gone: isFine,
      tokens: [...wordsOf(row.gate_name), ...wordsOf(row.zone_name)],
    });
  }

  // A STORM OF SCANS IS ONE STATE.
  const scanned = new Map<string, { name: string; scans: number }>();
  for (const row of rows.scans) scanned.set(row.gate_id, { name: row.gate_name, scans: (scanned.get(row.gate_id)?.scans ?? 0) + row.scans });
  for (const [gateId, gate] of scanned) {
    events.set(`scans:${gateId}`, {
      key: `scans:${gateId}`,
      kind: 'scans',
      place: gate.name,
      band: 'routine',
      short: `${gate.name} ${count(gate.scans)} scans`,
      line: `${gate.name}: ${count(gate.scans)} tickets scanned in the last minute — ${BAND_WORDS.routine}`,
      gone: false,
      tokens: wordsOf(gate.name),
    });
  }

  return [...events.values()];
};
