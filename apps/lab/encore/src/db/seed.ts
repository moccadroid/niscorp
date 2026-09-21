import { DAYS } from '@encore/lib/festival-clock';
import type { Day } from '@encore/lib/festival-clock';

// Encore Fields, three days in late summer. All of it is fiction and all of it
// is DETERMINISTIC: no clock, no random — the readings are closed-form curves
// over (day, hour), so two boots hold the same rows and a check can assert a
// number. The one hand-placed reading is the storm.

type Value = string | number | boolean;

const quote = (value: Value): string => (typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : String(value));

const insert = (table: string, columns: readonly string[], rows: readonly (readonly Value[])[]): string =>
  `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${rows.map((row) => `  (${row.map(quote).join(', ')})`).join(',\n')};\n`;

// ─── the site ────────────────────────────────────────────────

const ZONES: readonly (readonly Value[])[] = [
  ['zone_arena', 'Main Arena', 'open field', 25000, 4, 4, 46, 30],
  ['zone_tent', 'Tent Field', 'covered field', 9000, 54, 4, 24, 18],
  ['zone_grove', 'The Grove', 'woodland', 4000, 54, 26, 24, 14],
  ['zone_dock', 'Dockside', 'waterfront', 2500, 82, 4, 14, 36],
  ['zone_food', 'Food Court', 'concessions', 6000, 4, 38, 46, 18],
  ['zone_camp', 'Campsite', 'camping', 18000, 54, 44, 42, 12],
];

const GATES: readonly (readonly Value[])[] = [
  ['gate_north', 'North Gate', 'zone_arena', 3200, true],
  ['gate_east', 'East Gate', 'zone_dock', 1400, true],
  ['gate_south', 'South Gate', 'zone_camp', 2600, true],
  ['gate_west', 'West Gate', 'zone_food', 1800, true],
  ['gate_artist', 'Artist Gate', 'zone_tent', 300, true],
];

const CREW: readonly (readonly Value[])[] = [
  ['crew_okafor', 'Ada Okafor', 'site manager', 'zone_arena', true],
  ['crew_lindqvist', 'Tomas Lindqvist', 'main stage manager', 'zone_arena', true],
  ['crew_baptiste', 'Renée Baptiste', 'tent stage manager', 'zone_tent', true],
  ['crew_mori', 'Kenji Mori', 'sound engineer', 'zone_arena', true],
  ['crew_whitlock', 'Priya Whitlock', 'lighting director', 'zone_tent', true],
  ['crew_adeyemi', 'Sola Adeyemi', 'security lead', 'zone_arena', true],
  ['crew_havel', 'Marta Havel', 'gate supervisor', 'zone_food', true],
  ['crew_quinn', 'Desmond Quinn', 'medic', 'zone_food', true],
  ['crew_nakata', 'Yui Nakata', 'medic', 'zone_camp', false],
  ['crew_ferreira', 'Luis Ferreira', 'site electrician', 'zone_tent', true],
  ['crew_brandt', 'Ilse Brandt', 'bar manager', 'zone_food', true],
  ['crew_osei', 'Kwame Osei', 'runner', 'zone_grove', true],
  ['crew_varga', 'Noor Varga', 'artist liaison', 'zone_dock', true],
  ['crew_pellegrini', 'Gio Pellegrini', 'rigger', 'zone_tent', false],
];

// ─── the bill ────────────────────────────────────────────────

const STAGES: readonly (readonly Value[])[] = [
  ['stage_main', 'Main Stage', 'open-air', 25000, 'zone_arena'],
  ['stage_tent', 'The Tent', 'covered', 6000, 'zone_tent'],
  ['stage_grove', 'The Grove', 'open-air', 4000, 'zone_grove'],
  ['stage_dock', 'Dockside', 'open-air', 2500, 'zone_dock'],
];

// Exactly ONE headliner. "move headliner" has to mean somebody, and a bill
// with three of them would make the sentence a question instead of an order.
const ACTS: readonly (readonly Value[])[] = [
  ['act_nova_kestrel', 'Nova Kestrel', 'headliner', 'electronic', 22000],
  ['act_lantern_club', 'The Lantern Club', 'main support', 'indie rock', 15000],
  ['act_marisol_vega', 'Marisol Vega', 'main support', 'latin pop', 14000],
  ['act_brass_tide', 'Brass Against the Tide', 'support', 'brass band', 6000],
  ['act_juniper_static', 'Juniper Static', 'support', 'synth pop', 7000],
  ['act_old_growth', 'Old Growth', 'support', 'folk', 3500],
  ['act_kite_anchor', 'Kite & Anchor', 'support', 'indie folk', 3000],
  ['act_dj_halcyon', 'DJ Halcyon', 'support', 'house', 8000],
  ['act_saltwater_choir', 'Saltwater Choir', 'opener', 'choral', 1200],
  ['act_paper_tigers', 'Paper Tigers', 'opener', 'punk', 2000],
  ['act_velvet_arcade', 'Velvet Arcade', 'support', 'disco', 6500],
  ['act_ghost_orchid', 'Ghost Orchid', 'support', 'dream pop', 4000],
  ['act_hollow_pines', 'Hollow Pines', 'opener', 'americana', 1500],
  ['act_sundial', 'Sundial', 'support', 'ambient', 1800],
  ['act_low_tide_social', 'Low Tide Social', 'opener', 'reggae', 2200],
  ['act_copper_wire', 'Copper Wire', 'support', 'blues rock', 5000],
  ['act_minor_planets', 'Minor Planets', 'opener', 'post rock', 1600],
  ['act_amber_run_club', 'Amber Run Club', 'support', 'dance', 7500],
  // Saturday evening on the two small open-air stages: what makes the storm a
  // problem for THREE sets and a decision about one.
  ['act_night_heron', 'Night Heron', 'support', 'psych rock', 3800],
  ['act_tidal_bloom', 'Tidal Bloom', 'support', 'electro soul', 2400],
];

// One set per act. The Saturday evening is the interesting part: the headliner
// on the open-air main stage at 21:30, and the covered tent busy at 21:00 —
// the swap the storm sentence asks for is a real collision, not a free slot.
const SLOTS: readonly (readonly [string, string, Day, string, number])[] = [
  ['act_saltwater_choir', 'stage_grove', 'fri', '14:00', 45],
  ['act_paper_tigers', 'stage_dock', 'fri', '15:00', 45],
  ['act_old_growth', 'stage_grove', 'fri', '16:30', 60],
  ['act_copper_wire', 'stage_main', 'fri', '17:30', 60],
  ['act_juniper_static', 'stage_tent', 'fri', '19:00', 60],
  ['act_lantern_club', 'stage_main', 'fri', '21:00', 90],
  ['act_hollow_pines', 'stage_grove', 'sat', '13:30', 45],
  ['act_low_tide_social', 'stage_dock', 'sat', '15:00', 60],
  ['act_kite_anchor', 'stage_grove', 'sat', '17:00', 60],
  ['act_brass_tide', 'stage_main', 'sat', '18:00', 60],
  ['act_ghost_orchid', 'stage_tent', 'sat', '19:00', 60],
  ['act_velvet_arcade', 'stage_tent', 'sat', '21:00', 75],
  ['act_nova_kestrel', 'stage_main', 'sat', '21:30', 90],
  ['act_night_heron', 'stage_grove', 'sat', '20:30', 60],
  ['act_tidal_bloom', 'stage_dock', 'sat', '20:00', 75],
  ['act_minor_planets', 'stage_dock', 'sun', '14:00', 45],
  ['act_sundial', 'stage_grove', 'sun', '16:00', 60],
  ['act_amber_run_club', 'stage_tent', 'sun', '18:30', 75],
  ['act_dj_halcyon', 'stage_tent', 'sun', '20:30', 90],
  ['act_marisol_vega', 'stage_main', 'sun', '20:00', 90],
];

// ─── the readings ────────────────────────────────────────────

const HOURS: readonly number[] = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

// An evening bell curve, 0–1, peaking at `peak`. Every reading below is this
// shape scaled — crowds, bars and gates all follow the programme.
const bell = (hour: number, peak: number, width: number): number => Math.exp(-((hour - peak) ** 2) / (2 * width ** 2));

const DAY_WEIGHT: Record<Day, number> = { fri: 0.7, sat: 1, sun: 0.85 };

const weatherRows = (): (readonly Value[])[] =>
  DAYS.flatMap((day) =>
    HOURS.map((hour): readonly Value[] => {
      // The cell: builds from 20:00, breaks at 21:00, trails off by 23:00.
      if (day === 'sat' && hour === 20) return [`wx_${day}_${hour}`, day, hour, 'rain', 3.5, 38, 1];
      if (day === 'sat' && hour === 21) return [`wx_${day}_${hour}`, day, hour, 'storm', 16, 74, 3];
      if (day === 'sat' && hour === 22) return [`wx_${day}_${hour}`, day, hour, 'rain', 7, 52, 2];
      const cloudy = (hour + DAYS.indexOf(day)) % 4 === 0;
      return [`wx_${day}_${hour}`, day, hour, cloudy ? 'cloud' : 'clear', 0, cloudy ? 18 : 9, 0];
    }),
  );

// Where the crowd is follows where the music is: each zone peaks when its own
// stage does, and the food court peaks at dinner.
const ZONE_PEAK: Record<string, readonly [number, number]> = {
  zone_arena: [21.5, 2.2],
  zone_tent: [20.5, 2.4],
  zone_grove: [16.5, 2.5],
  zone_dock: [15, 2.5],
  zone_food: [18.5, 3],
  zone_camp: [11, 4],
};

const ZONE_CAPACITY: Record<string, number> = Object.fromEntries(ZONES.map((zone) => [String(zone[0]), Number(zone[3])]));

// The head count a zone STARTS an hour with. Exported because a feed that
// replays an evening has to be able to put the site back where it found it.
export const seededHeadcount = (zoneId: string, day: Day, hour: number): number => {
  const [peak, width] = ZONE_PEAK[zoneId] ?? [0, 1];
  return Math.round((ZONE_CAPACITY[zoneId] ?? 0) * 0.92 * DAY_WEIGHT[day] * bell(hour, peak, width));
};

const zoneCountRows = (): (readonly Value[])[] =>
  DAYS.flatMap((day) => HOURS.flatMap((hour) => Object.keys(ZONE_PEAK).map((zoneId): readonly Value[] => [`zc_${zoneId}_${day}_${hour}`, zoneId, day, hour, seededHeadcount(zoneId, day, hour)])));

const salesRows = (): (readonly Value[])[] =>
  DAYS.flatMap((day) =>
    HOURS.flatMap((hour): (readonly Value[])[] => {
      // Tickets sell at the gate in the early afternoon; the bars sell all
      // night and hardest around the main support.
      const tickets = Math.round(420 * DAY_WEIGHT[day] * bell(hour, 13, 2.5));
      const drinks = Math.round(2600 * DAY_WEIGHT[day] * bell(hour, 20, 3));
      return [
        [`sale_tickets_${day}_${hour}`, day, hour, 'tickets', tickets, tickets * 85],
        [`sale_bar_${day}_${hour}`, day, hour, 'bar', drinks, Math.round(drinks * 6.5)],
      ];
    }),
  );

const INCIDENTS: readonly (readonly Value[])[] = [
  ['inc_001', 'fri', '19:40', 'zone_food', 'medical', 1, 'Dehydration, treated on site and released.', 'closed'],
  ['inc_002', 'sat', '14:15', 'zone_dock', 'crowd', 2, 'Queue for the water taxi backing onto the East Gate lane.', 'closed'],
  ['inc_003', 'sat', '16:50', 'zone_tent', 'technical', 2, 'Tent stage left PA amp tripping on the generator feed.', 'open'],
  ['inc_004', 'sat', '17:30', 'zone_arena', 'security', 1, 'Lost child reunited at the welfare point.', 'closed'],
  ['inc_005', 'sat', '17:55', 'zone_camp', 'weather', 2, 'Met office amber warning: storm cell tracking in for 21:00.', 'open'],
  // Enough open ones, of different kinds, that "what's going on?" has
  // something to say and the feed has an order to be in.
  ['inc_006', 'sat', '17:20', 'zone_food', 'crowd', 2, 'Food Court at 90% and still filling; West Gate queue past the barrier line.', 'open'],
  ['inc_007', 'sat', '17:40', 'zone_arena', 'security', 1, 'Barrier section B3 at the main stage pit reported loose by stewards.', 'open'],
  ['inc_008', 'sat', '15:05', 'zone_grove', 'medical', 1, 'Bee sting, allergic reaction, treated by medics and monitored.', 'closed'],
];

export const buildSeedSql = (): string =>
  [
    // Saturday, 18:00 — the moment every sentence check is typed at. The clock is
    // a row now; nothing advances it unless a director is played.
    insert('festival_clock', ['id', 'day', 'minute'], [['now', 'sat', 18 * 60]]),
    insert('zones', ['id', 'name', 'kind', 'capacity', 'x', 'y', 'w', 'h'], ZONES),
    insert('gates', ['id', 'name', 'zone_id', 'capacity_per_hour', 'is_open'], GATES),
    insert('crew', ['id', 'name', 'role', 'zone_id', 'on_shift'], CREW),
    insert('stages', ['id', 'name', 'kind', 'capacity', 'zone_id'], STAGES),
    insert('acts', ['id', 'name', 'billing', 'genre', 'draw'], ACTS),
    // THE WEATHER FIRST: a slot's `exposure` is computed by a trigger as the row
    // goes in, from the hours it overlaps — which therefore have to be there.
    insert('weather_hours', ['id', 'day', 'hour', 'condition', 'rain_mm', 'wind_kph', 'severity'], weatherRows()),
    insert(
      'slots',
      ['id', 'act_id', 'stage_id', 'day', 'starts_at', 'duration_min'],
      SLOTS.map(([actId, stageId, day, startsAt, duration]) => [`slot_${actId.slice(4)}`, actId, stageId, day, startsAt, duration]),
    ),
    insert('zone_counts', ['id', 'zone_id', 'day', 'hour', 'headcount'], zoneCountRows()),
    insert('sales_hourly', ['id', 'day', 'hour', 'kind', 'units', 'revenue'], salesRows()),
    insert('incidents', ['id', 'day', 'at', 'zone_id', 'kind', 'severity', 'summary', 'status'], INCIDENTS),
  ].join('\n');
