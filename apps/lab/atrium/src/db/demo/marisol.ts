import { at, ago, between, chance, day, DEFAULTS, insert, pick, rng, ts, type Val } from './sql';

// ═══════════════════════════════════════════════════════════
// CASA MARISOL — Palma, 14 casitas, Mews + HotelFix.
//
// The second hotel is not a smaller copy of the first, and the reason it exists
// is that the two DIFFER in what they can do rather than in how much of it there
// is. Marisol has a spa with a diary to run and a minibar to post; it has no
// door API at any version, so nobody here ever cuts a key. Its clerk works a
// genuinely different afternoon with the same code.
//
// It carries the mirror of The Lumen's billing beat on purpose: Inés disputes a
// charge too, and Pilar corrects it through the MEWS surface. Same gesture, same
// two taps, a different vendor's service behind it — which is the whole claim of
// the product, demonstrated without anybody having to say it out loud.
// ═══════════════════════════════════════════════════════════

const P = 'prop_marisol';

// number, kind, rate, status
type RoomSpec = [string, string, number, string];

const ROOMS: RoomSpec[] = [
  ['1', 'Garden Casita', 260, 'clean'],
  ['2', 'Garden Casita', 260, 'clean'],
  ['3', 'Garden Casita', 260, 'clean'],
  ['4', 'Garden Casita', 260, 'dirty'],
  ['5', 'Garden Casita', 260, 'clean'],
  ['6', 'Garden Casita', 260, 'out_of_order'],
  ['7', 'Sea View Casita', 340, 'clean'],
  ['8', 'Sea View Casita', 340, 'clean'],
  ['9', 'Sea View Casita', 340, 'clean'],
  ['10', 'Sea View Casita', 340, 'inspected'],
  ['11', 'Sea View Casita', 340, 'clean'],
  ['12', 'Pool Suite', 450, 'clean'],
  ['13', 'Pool Suite', 450, 'inspected'],
  ['14', 'Pool Suite', 450, 'clean'],
];

const rate = (number: string): number => ROOMS.find((r) => r[0] === number)?.[2] ?? 260;

type Cast = { id: string; name: string; email: string; tier: string; language: string; room: string; from: number; to: number; state: string; adults: number; eta?: string; checkedIn?: boolean };

const CAST: Cast[] = [
  // THE BILL, the other vendor's half. She added a beer to her own bill by
  // mistake through the honesty bar and has written to say so.
  { id: 'gst_ines', name: 'Inés Marchetti', email: 'ines.m@example.com', tier: 'silver', language: 'es', room: '3', from: -1, to: 4, state: 'in_house', adults: 2, checkedIn: true },
  // The spa's best customer — two treatments taken, one booked.
  { id: 'gst_carmen', name: 'Carmen Vidal', email: 'c.vidal@example.es', tier: 'gold', language: 'es', room: '8', from: -3, to: 2, state: 'in_house', adults: 1, checkedIn: true },
  { id: 'gst_dieter', name: 'Dieter Falk', email: 'd.falk@example.de', tier: 'gold', language: 'de', room: '12', from: -2, to: 3, state: 'in_house', adults: 2, checkedIn: true },
  { id: 'gst_lucia', name: 'Lucía Ortega', email: 'l.ortega@example.es', tier: 'none', language: 'es', room: '5', from: -1, to: 1, state: 'in_house', adults: 2, checkedIn: true },
  { id: 'gst_james', name: 'James Cowan', email: 'j.cowan@example.co.uk', tier: 'none', language: 'en', room: '9', from: -4, to: 0, state: 'in_house', adults: 1, checkedIn: true },
  { id: 'gst_sylvie', name: 'Sylvie Marchand', email: 's.marchand@example.fr', tier: 'silver', language: 'fr', room: '14', from: -2, to: 2, state: 'in_house', adults: 2, checkedIn: true },
  { id: 'gst_tomas', name: 'Tomás Herrera', email: 't.herrera@example.es', tier: 'none', language: 'es', room: '1', from: -1, to: 3, state: 'in_house', adults: 1, checkedIn: true },
  { id: 'gst_anouk', name: 'Anouk Visser', email: 'a.visser@example.nl', tier: 'none', language: 'en', room: '2', from: -2, to: 1, state: 'in_house', adults: 2, checkedIn: true },
  { id: 'gst_pablo', name: 'Pablo Serrano', email: 'p.serrano@example.es', tier: 'silver', language: 'es', room: '7', from: -3, to: 1, state: 'in_house', adults: 2, checkedIn: true },
  { id: 'gst_greta', name: 'Greta Lindholm', email: 'g.lindholm@example.se', tier: 'none', language: 'sv', room: '11', from: -1, to: 5, state: 'in_house', adults: 1, checkedIn: true },
  // Arriving this afternoon.
  { id: 'gst_rafa', name: 'Rafael Ibáñez', email: 'r.ibanez@example.es', tier: 'none', language: 'es', room: '10', from: 0, to: 3, state: 'arriving', adults: 2, eta: '18:00' },
  { id: 'gst_maeve', name: 'Maeve Donnelly', email: 'm.donnelly@example.ie', tier: 'none', language: 'en', room: '13', from: 0, to: 4, state: 'arriving', adults: 2, eta: '15:30' },
  // Gone this morning; casita 4 is being turned.
  { id: 'gst_bruno', name: 'Bruno Salvatore', email: 'b.salvatore@example.it', tier: 'none', language: 'it', room: '4', from: -3, to: 0, state: 'departed', adults: 2, checkedIn: true },
];

const PAST_NAMES: [string, string][] = [
  ['Marta Reyes', 'es'],
  ['Colin Fraser', 'en'],
  ['Ingeborg Sand', 'de'],
  ['Núria Vilà', 'es'],
  ['Yannick Perrot', 'fr'],
  ['Sara Aaltonen', 'en'],
  ['Diego Campos', 'es'],
  ['Hilde Brekke', 'en'],
];

const PAST_VISITS = 3;

type Generated = { stay: string; guest: string; name: string; language: string; tier: string; room: string; from: number; to: number };

// Same discipline as The Lumen: resolved once, read by both the stay rows and
// the folio rows, so nothing can be billed to a stay that does not exist.
const HISTORY: Generated[] = (() => {
  const past = rng(0x3a1ba);
  const rows: Generated[] = [];

  // Carmen and Inés have been before; the spa knows Carmen by name.
  const RETURNING: [string, number][] = [
    ['gst_carmen', -28],
    ['gst_carmen', -75],
    ['gst_ines', -52],
    ['gst_dieter', -90],
  ];
  RETURNING.forEach(([guest, from], index) => {
    const room = pick(past, ROOMS)[0];
    rows.push({ stay: `stay_mh_r${index}`, guest, name: '', language: '', tier: '', room, from, to: from + between(past, 2, 5) });
  });

  PAST_NAMES.forEach(([name, language], index) => {
    for (let visit = 0; visit < PAST_VISITS; visit += 1) {
      const room = pick(past, ROOMS)[0];
      const from = -between(past, 8, 120);
      rows.push({ stay: `stay_mh_${index}_${visit}`, guest: `gst_mp_${index}`, name, language, tier: chance(past, 0.25) ? 'silver' : 'none', room, from, to: from + between(past, 2, 6) });
    }
  });

  return rows;
})();

const roomsSql = (): string =>
  insert(
    'rooms',
    ['id', 'property_id', 'number', 'kind', 'floor', 'status', 'external_id'],
    ROOMS.map(([number, kind, , status]) => [`rm_m_${number}`, P, number, kind, 1, status, `MEWS-RM-${number}`] as Val[]),
  );

const peopleSql = (): string => {
  const guests: Val[][] = [];
  const stays: Val[][] = [];
  const guestRow = (id: string, name: string, email: string, tier: string, language: string, index: number): Val[] => [id, name, email, tier, language, P, `MEWS-CUS-${2200 + index}`];

  CAST.forEach((person, index) => {
    guests.push(guestRow(person.id, person.name, person.email, person.tier, person.language, index));
    stays.push([
      person.id.replace('gst_', 'stay_'),
      person.id,
      P,
      `rm_m_${person.room}`,
      null,
      day(person.from),
      day(person.to),
      person.eta ?? '',
      person.state,
      person.adults,
      rate(person.room),
      // No door API at any Mews version — nobody here has ever held a key.
      false,
      person.checkedIn ?? false,
      `MEWS-RES-${7700 + index}`,
    ]);
  });

  const seen = new Set<string>();
  HISTORY.forEach((entry, index) => {
    if (entry.name !== '' && !seen.has(entry.guest)) {
      seen.add(entry.guest);
      guests.push(guestRow(entry.guest, entry.name, `${entry.guest}@example.com`, entry.tier, entry.language, 400 + index));
    }
    stays.push([entry.stay, entry.guest, P, `rm_m_${entry.room}`, null, day(entry.from), day(entry.to), '', 'departed', 2, rate(entry.room), false, true, `MEWS-RES-${7900 + index}`]);
  });

  return (
    insert('guests', ['id', 'name', 'email', 'tier', 'language', 'property_id', 'external_id'], guests) +
    insert('stays', ['id', 'guest_id', 'property_id', 'room_id', 'group_id', 'arrival', 'departure', 'eta', 'state', 'adults', 'rate', 'key_issued', 'checked_in', 'external_id'], stays)
  );
};

const folioSql = (): string => {
  const lines: Val[][] = [];
  const push = (id: string | null, stay: string, description: string, amount: number, posted: Val): void => {
    lines.push([id ?? DEFAULTS, stay, P, description, amount, posted]);
  };

  // Inés — the massage she took yesterday, and the beer she says she did not.
  push('fol_mi_1', 'stay_ines', 'Room — Garden Casita', 260, at(-1, 23, 59));
  push('fol_mi_2', 'stay_ines', '60-minute massage', 89, at(-1, 17, 30));
  push('fol_mi_3', 'stay_ines', 'Restaurant — dinner', 72, at(-1, 21, 10));
  // The charge she disputes. Deliberately NOT a beer: the functional check
  // drives its own honesty-bar beer through this same stay, and two lines with
  // one description makes both stories ambiguous.
  push('fol_mi_4', 'stay_ines', 'Rioja, half bottle', 24, ago(2, 15));

  push('fol_mc_1', 'stay_carmen', 'Room — Sea View Casita', 340, at(-3, 23, 59));
  push('fol_mc_2', 'stay_carmen', 'Room — Sea View Casita', 340, at(-2, 23, 59));
  push('fol_mc_3', 'stay_carmen', 'Room — Sea View Casita', 340, at(-1, 23, 59));
  push('fol_mc_4', 'stay_carmen', 'Hammam ritual', 110, at(-2, 16, 0));
  push('fol_mc_5', 'stay_carmen', 'Facial', 75, at(-1, 11, 30));
  push('fol_mc_6', 'stay_carmen', 'Restaurant — dinner', 96, at(-1, 21, 0));

  push('fol_md_1', 'stay_dieter', 'Room — Pool Suite', 450, at(-2, 23, 59));
  push('fol_md_2', 'stay_dieter', 'Room — Pool Suite', 450, at(-1, 23, 59));
  push('fol_md_3', 'stay_dieter', 'Restaurant — dinner', 128, at(-1, 21, 30));
  push('fol_md_4', 'stay_dieter', 'Rioja, half bottle', 24, at(-1, 19, 0));

  const next = rng(0x3f0110);
  const EXTRAS: [string, number, number][] = [
    ['Restaurant — dinner', 48, 130],
    ['Restaurant — breakfast', 18, 32],
    ['Still water', 6, 6],
    ['Local beer', 9, 9],
    ['Almonds & olives', 12, 12],
    ['Laundry', 20, 55],
  ];

  CAST.filter((person) => !['gst_ines', 'gst_carmen', 'gst_dieter'].includes(person.id) && person.state !== 'arriving').forEach((person) => {
    const elapsed = Math.abs(person.from);
    for (let night = 1; night <= elapsed; night += 1) push(null, person.id.replace('gst_', 'stay_'), `Room — ${ROOMS.find((r) => r[0] === person.room)?.[1] ?? 'Casita'}`, rate(person.room), at(-night, 23, 59));
    const extras = between(next, 0, 3);
    for (let extra = 0; extra < extras; extra += 1) {
      const [label, low, high] = pick(next, EXTRAS);
      push(null, person.id.replace('gst_', 'stay_'), label, between(next, low, high), at(-between(next, 1, elapsed), between(next, 9, 22), 0));
    }
  });

  const past = rng(0x3f0512);
  HISTORY.forEach((entry) => {
    const nights = Math.max(1, entry.to - entry.from);
    push(null, entry.stay, `Room — ${nights} night${nights === 1 ? '' : 's'}`, nights * rate(entry.room), at(entry.to, 23, 59));
    if (chance(past, 0.7)) {
      const [label, low, high] = pick(past, EXTRAS);
      push(null, entry.stay, label, between(past, low, high), at(entry.from, 20, 0));
    }
  });

  return insert('folio_lines', ['id', 'stay_id', 'property_id', 'description', 'amount', 'posted_at'], lines);
};

const messagesSql = (): string => {
  const rows: Val[][] = [];
  const say = (id: string, stay: string, sender: string, body: string, sent: Val): void => {
    rows.push([id, stay, P, sender, body, sent]);
  };

  say('msg_mines_1', 'stay_ines', 'desk', 'Buenos días — el spa tiene un hueco a las cuatro si le apetece.', at(-1, 9, 20));
  say('msg_mines_2', 'stay_ines', 'guest', 'Gracias. Una cosa: he apuntado media botella de Rioja en la cuenta por error desde el móvil. ¿Se puede quitar?', ago(2, 5));

  say('msg_mcarmen_1', 'stay_carmen', 'guest', '¿Podría cambiar el hammam de mañana a por la tarde?', ago(1, 25));

  say('msg_mdieter_1', 'stay_dieter', 'guest', 'Wir würden gern am Donnerstag später auschecken. Ist das möglich?', ago(3, 40));

  say('msg_mjames_1', 'stay_james', 'desk', 'Your casita is ready whenever you are — no rush this morning.', at(-1, 8, 0));
  say('msg_mjames_2', 'stay_james', 'guest', 'Thank you, it has been a wonderful few days.', ago(6, 0));

  say('msg_mgreta_1', 'stay_greta', 'guest', 'Is there a hairdryer in the casita?', at(-1, 19, 15));
  say('msg_mgreta_2', 'stay_greta', 'desk', 'There is, in the wardrobe drawer.', at(-1, 19, 25));

  say('msg_mmaeve_1', 'stay_maeve', 'guest', 'We will be with you around half three.', ago(5, 10));
  say('msg_mmaeve_2', 'stay_maeve', 'desk', 'Perfect — casita 13 is ready.', ago(4, 55));

  return insert('messages', ['id', 'stay_id', 'property_id', 'sender', 'body', 'sent_at'], rows);
};

const issuesSql = (): string =>
  insert(
    'issues',
    ['id', 'property_id', 'stay_id', 'room_id', 'kind', 'summary', 'detail', 'severity', 'status', 'raised_by', 'raised_at', 'resolved_at'],
    [
      ['iss_m_wifi', P, null, 'rm_m_2', 'wifi', 'Wi-Fi drops in the garden casitas', 'Repeater ordered, no date yet. Nobody assigned.', 'normal', 'open', 'guest', ts(-2 * 24), null],
      ['iss_m_6', P, null, 'rm_m_6', 'plumbing', 'Pool-side casita: hot water intermittent', 'Casita out of service until the heater is swapped.', 'high', 'open', 'staff', ts(-4 * 24), null],
      ['iss_m_pool', P, null, 'rm_m_1', 'other', 'Pool gate latch does not close', 'Safety item. Raised by housekeeping on Sunday; nothing dispatched. Logged against the casita nearest the gate.', 'high', 'open', 'staff', ts(-3 * 24), null],
      ['iss_m_air', P, 'stay_lucia', 'rm_m_5', 'climate', 'Ceiling fan rattles at the top speed', '', 'low', 'open', 'guest', ago(9, 0), null],
      ['iss_m_old', P, null, 'rm_m_11', 'other', 'Shutter will not close fully', 'Runner cleaned and greased.', 'low', 'resolved', 'guest', ts(-16 * 24), ts(-15 * 24)],
    ],
  );

const tasksSql = (): string =>
  insert(
    'tasks',
    ['id', 'property_id', 'room_id', 'issue_id', 'stay_id', 'title', 'detail', 'kind', 'status', 'assignee_id', 'created_at'],
    [
      ['tsk_m_6', P, 'rm_m_6', 'iss_m_6', null, 'Swap the water heater — casita 6', 'Unit is in the store room. Casita stays out of service until it runs hot for an hour.', 'maintenance', 'open', 'stf_marc', ts(-4 * 24)],
      ['tsk_m_4', P, 'rm_m_4', null, null, 'Turn casita 4', 'Departure this morning; nothing booked in tonight, so no hurry.', 'housekeeping', 'open', 'stf_rocio', ago(3, 0)],
      ['tsk_m_10', P, 'rm_m_10', null, 'stay_rafa', 'Turn casita 10 for a 18:00 arrival', '', 'housekeeping', 'done', 'stf_rocio', ago(5, 0)],
      ['tsk_m_13', P, 'rm_m_13', null, 'stay_maeve', 'Turn casita 13 for a 15:30 arrival', '', 'housekeeping', 'done', 'stf_rocio', ago(6, 0)],
      ['tsk_m_old', P, 'rm_m_11', 'iss_m_old', null, 'Grease the shutter runner — casita 11', '', 'maintenance', 'done', 'stf_marc', ts(-15 * 24)],
    ],
  );

const notesSql = (): string =>
  insert(
    'stay_notes',
    ['id', 'stay_id', 'property_id', 'kind', 'body', 'author', 'created_at'],
    [
      ['nte_ca_1', 'stay_carmen', P, 'preference', 'Books the spa every visit. Prefers the late afternoon and always the same therapist.', 'Pilar Ferrer', ts(-28 * 24)],
      ['nte_in_1', 'stay_ines', P, 'preference', 'Garden side, away from the pool. Travels with a small dog.', 'Pilar Ferrer', ts(-52 * 24)],
      ['nte_di_1', 'stay_dieter', P, 'note', 'Celebrating a retirement — the table on the terrace is held for Thursday.', 'Núria Blanch', at(-2, 12, 0)],
    ],
  );

// The spa has a working day, which is what makes the diary a diary: two taken
// this morning, one on the table now, three still to come, and a no-show from
// yesterday that nobody has marked.
const spaSql = (): string =>
  insert(
    'spa_bookings',
    ['id', 'stay_id', 'property_id', 'treatment', 'slot_at', 'confirmation', 'status', 'created_at'],
    [
      ['spa_001', 'stay_ines', P, '60-minute massage', at(-1, 17, 0), 'MEWS-SPA-1147', 'done', at(-1, 10, 0)],
      ['spa_002', 'stay_carmen', P, 'Hammam ritual', at(-2, 16, 0), 'MEWS-SPA-1131', 'done', at(-2, 9, 30)],
      ['spa_003', 'stay_carmen', P, 'Facial', at(-1, 11, 30), 'MEWS-SPA-1152', 'done', at(-1, 9, 0)],
      ['spa_004', 'stay_sylvie', P, 'Facial', ago(0, 20), 'MEWS-SPA-1188', 'booked', at(-1, 15, 0)],
      ['spa_005', 'stay_dieter', P, 'Treatment for two', at(0, 18, 0), 'MEWS-SPA-1190', 'booked', ago(4, 0)],
      ['spa_006', 'stay_ines', P, 'Hammam ritual', at(1, 11, 0), 'MEWS-SPA-1193', 'booked', ago(3, 30)],
      ['spa_007', 'stay_carmen', P, 'Hammam ritual', at(1, 10, 0), 'MEWS-SPA-1195', 'booked', ago(1, 20)],
      ['spa_008', 'stay_pablo', P, '60-minute massage', at(1, 16, 30), 'MEWS-SPA-1196', 'booked', ago(0, 45)],
      // Yesterday's four o'clock, never marked. It sits in the diary looking
      // like a booking until somebody says what happened to it.
      ['spa_009', 'stay_anouk', P, '60-minute massage', at(-1, 16, 0), 'MEWS-SPA-1149', 'booked', at(-2, 14, 0)],
      ['spa_010', 'stay_greta', P, 'Facial', at(2, 12, 0), 'MEWS-SPA-1199', 'booked', ago(2, 10)],
    ],
  );

const requestsSql = (): string =>
  insert(
    'stay_requests',
    ['id', 'stay_id', 'property_id', 'kind', 'label', 'detail', 'amount', 'status', 'created_at'],
    [
      ['sreq_m_dieter', 'stay_dieter', P, 'late-checkout', 'Until 4:00 pm', 'Half-day rate', 45, 'pending', ago(3, 35)],
      ['sreq_m_pablo', 'stay_pablo', P, 'late-checkout', 'Until 2:00 pm', 'On the house', 0, 'pending', ago(0, 40)],
      ['sreq_m_sylvie', 'stay_sylvie', P, 'upgrade', 'Pool Suite', 'Private terrace and plunge pool', 140, 'approved', at(-1, 12, 0)],
    ],
  );

const transfersSql = (): string =>
  insert(
    'transfers',
    ['id', 'stay_id', 'property_id', 'direction', 'pickup_on', 'pickup_at', 'destination', 'vehicle', 'confirmation', 'status', 'created_at'],
    [
      ['trf_m_james', 'stay_james', P, 'departure', day(0), '11:00', 'Palma Airport (PMI)', 'Saloon', 'MEWS-TRF-7712', 'done', at(-1, 16, 0)],
      ['trf_m_lucia', 'stay_lucia', P, 'departure', day(1), '09:15', 'Palma Airport (PMI)', 'Estate', 'MEWS-TRF-7721', 'booked', ago(4, 20)],
    ],
  );

export const marisolSql = (): string =>
  [roomsSql(), peopleSql(), folioSql(), messagesSql(), issuesSql(), tasksSql(), notesSql(), spaSql(), requestsSql(), transfersSql()].join('\n');

export const MARISOL = {
  property: P,
  dispute: { stay: 'stay_ines', line: 'fol_mi_4' },
  spaRegular: 'stay_carmen',
  unmarked: 'spa_009',
  unattended: ['iss_m_pool', 'iss_m_wifi'],
} as const;
