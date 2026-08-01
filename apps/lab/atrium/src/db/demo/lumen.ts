import { at, ago, between, chance, day, DEFAULTS, insert, pick, rng, ts, type Val } from './sql';

// ═══════════════════════════════════════════════════════════
// THE LUMEN — Copenhagen, 36 rooms, Opera Cloud + HotelFix.
//
// A hotel in motion at a quarter to four on a Tuesday, which is the busiest and
// least glamorous hour a front desk has: the night's departures are gone but
// their rooms are not yet clean, the afternoon's arrivals are walking in, and
// everything anybody complained about this morning is still open.
//
// The dataset is built so that EVERY surface a clerk opens has something true
// and specific in it, and so that the obvious next step differs from one record
// to the next. A demo where the assistant does the same clever thing twice is a
// demo that ends after the first one.
//
// Read the rooming list below as the spine: every stay, issue, message and
// charge in this file hangs off a room, and the occupancy adds to 36.
// ═══════════════════════════════════════════════════════════

const P = 'prop_lumen';

// ─── the rooming list ────────────────────────────────────────
// number, kind, floor, rate, status
//
// status is the front desk's whole afternoon: `inspected` may be sold to
// somebody standing at the counter, `dirty` may not, and the difference between
// those two words is the reason three of the five wedding guests can check in
// at half four and two of them cannot.
type RoomSpec = [string, string, number, number, string];

const ROOMS: RoomSpec[] = [
  // Floor 2 — Double. The wedding block lands here.
  ['210', 'Double', 2, 195, 'inspected'],
  ['211', 'Double', 2, 195, 'inspected'],
  ['212', 'Double', 2, 195, 'inspected'],
  ['213', 'Double', 2, 195, 'dirty'],
  ['214', 'Double', 2, 195, 'dirty'],
  ['215', 'Double', 2, 195, 'clean'],
  // Floor 3 — Double.
  ['310', 'Double', 3, 195, 'clean'],
  ['311', 'Double', 3, 195, 'clean'],
  ['312', 'Double', 3, 195, 'out_of_order'],
  ['313', 'Double', 3, 195, 'dirty'],
  ['314', 'Double', 3, 195, 'clean'],
  ['315', 'Double', 3, 195, 'clean'],
  // Floor 4 — Deluxe Double. 415 has been out for a fortnight on a compressor.
  ['410', 'Deluxe Double', 4, 240, 'clean'],
  ['411', 'Deluxe Double', 4, 240, 'clean'],
  ['412', 'Deluxe Double', 4, 240, 'clean'],
  ['413', 'Deluxe Double', 4, 240, 'clean'],
  ['414', 'Deluxe Double', 4, 240, 'dirty'],
  ['415', 'Deluxe Double', 4, 240, 'out_of_order'],
  // Floor 5 — Deluxe Double.
  ['510', 'Deluxe Double', 5, 240, 'clean'],
  ['511', 'Deluxe Double', 5, 240, 'inspected'],
  ['512', 'Deluxe Double', 5, 240, 'dirty'],
  ['513', 'Deluxe Double', 5, 240, 'clean'],
  ['514', 'Deluxe Double', 5, 240, 'clean'],
  ['515', 'Deluxe Double', 5, 240, 'clean'],
  // Floor 6 — Junior Suite. 613 is the quiet one that is free tonight.
  ['610', 'Junior Suite', 6, 330, 'clean'],
  ['611', 'Junior Suite', 6, 330, 'clean'],
  ['612', 'Junior Suite', 6, 330, 'clean'],
  ['613', 'Junior Suite', 6, 330, 'inspected'],
  ['614', 'Junior Suite', 6, 330, 'out_of_order'],
  ['615', 'Junior Suite', 6, 330, 'clean'],
  // Floor 7 — the two suites and four junior suites under the roof.
  ['710', 'Suite', 7, 480, 'clean'],
  ['711', 'Suite', 7, 480, 'inspected'],
  ['712', 'Junior Suite', 7, 330, 'clean'],
  ['713', 'Junior Suite', 7, 330, 'clean'],
  ['714', 'Junior Suite', 7, 330, 'clean'],
  ['715', 'Junior Suite', 7, 330, 'inspected'],
];

const rate = (number: string): number => ROOMS.find((r) => r[0] === number)?.[3] ?? 195;

// ─── the people the demo is about ────────────────────────────
// id, name, email, tier, language, room, arrival offset, departure offset, state, adults, eta, group
//
// Every one of these carries a beat. The generated stays below fill the house
// around them so the lists are lists rather than a handful of rows, but nothing
// generated is ever the subject of anything — a background guest with a story
// would be a story nobody wrote down.
type Cast = {
  id: string;
  name: string;
  email: string;
  tier: string;
  language: string;
  room: string | null;
  from: number;
  to: number;
  state: string;
  adults: number;
  eta?: string;
  group?: string;
  checkedIn?: boolean;
  key?: boolean;
};

const CAST: Cast[] = [
  // THE COMPLAINT. Night 3 of 5, gold, and the air conditioning in 412 has
  // now been reported three times this quarter by three different guests.
  { id: 'gst_amara', name: 'Amara Osei', email: 'amara.osei@example.com', tier: 'gold', language: 'en', room: '412', from: -2, to: 3, state: 'in_house', adults: 1, checkedIn: true },
  // THE BILL. A local beer she says she did not take, posted forty minutes ago.
  { id: 'gst_sofia', name: 'Sofia Reinhardt', email: 's.reinhardt@example.com', tier: 'silver', language: 'en', room: '413', from: -1, to: 2, state: 'in_house', adults: 2, checkedIn: true },
  // THE LANGUAGE. Writes in German; the thread is in German and so is the reply.
  { id: 'gst_jurgen', name: 'Jürgen Brandt', email: 'j.brandt@example.de', tier: 'none', language: 'de', room: '510', from: -3, to: 1, state: 'in_house', adults: 1, checkedIn: true },
  // THE TAXI. Flight at 08:20 tomorrow, and she has asked for a car.
  { id: 'gst_nadia', name: 'Nadia Haddad', email: 'n.haddad@example.com', tier: 'gold', language: 'en', room: '712', from: -2, to: 1, state: 'in_house', adults: 1, checkedIn: true, key: true },
  // THE LATE CHECKOUT, asked for in prose rather than on the form.
  { id: 'gst_marco', name: 'Marco Bianchi', email: 'm.bianchi@example.it', tier: 'none', language: 'it', room: '215', from: -2, to: 1, state: 'in_house', adults: 2, checkedIn: true },
  // THE ANNIVERSARY. Mentioned in passing, which is how they always are.
  { id: 'gst_olav', name: 'Olav Dahl', email: 'olav.dahl@example.dk', tier: 'silver', language: 'da', room: '311', from: -1, to: 2, state: 'in_house', adults: 2, checkedIn: true },
  // THE UPSELL. Third stay this year, spends well, two nights left, and the
  // suite across the landing is empty tonight.
  { id: 'gst_priya', name: 'Priya Raman', email: 'p.raman@example.com', tier: 'gold', language: 'en', room: '611', from: -3, to: 2, state: 'in_house', adults: 1, checkedIn: true, key: true },
  // THE CLASH. Wake-up call at 07:00, car to Kastrup at 07:15.
  { id: 'gst_yuki', name: 'Yuki Tanaka', email: 'y.tanaka@example.jp', tier: 'silver', language: 'ja', room: '713', from: -1, to: 1, state: 'in_house', adults: 1, checkedIn: true },
  // Departing today, late checkout already approved and posted.
  { id: 'gst_ingrid', name: 'Ingrid Sørensen', email: 'i.sorensen@example.dk', tier: 'none', language: 'da', room: '513', from: -2, to: 0, state: 'in_house', adults: 1, checkedIn: true },

  // ── arriving ──
  // Theo keeps his pre-arrival shell, and now he has a reason to want one: he
  // has asked for the junior suite and 715 is sitting empty.
  { id: 'gst_theo', name: 'Theo Lindqvist', email: 'theo.l@example.se', tier: 'none', language: 'en', room: '511', from: 0, to: 3, state: 'arriving', adults: 2, eta: '17:00' },
  // Lands at 21:50. Nobody should be holding the desk for him at four.
  { id: 'gst_wei', name: 'Wei Chen', email: 'wei.chen@example.com', tier: 'none', language: 'en', room: '313', from: 0, to: 2, state: 'arriving', adults: 1, eta: '22:40' },
  // THE BLOCK. Five rooms, one arrival, half past four — and two of the five
  // rooms are still dirty.
  { id: 'gst_erik', name: 'Erik Lindqvist', email: 'erik.l@example.se', tier: 'none', language: 'sv', room: '210', from: 0, to: 4, state: 'arriving', adults: 2, eta: '16:30', group: 'grp_wedding' },
  { id: 'gst_astrid', name: 'Astrid Holm', email: 'a.holm@example.se', tier: 'none', language: 'sv', room: '211', from: 0, to: 4, state: 'arriving', adults: 2, eta: '16:30', group: 'grp_wedding' },
  { id: 'gst_freja', name: 'Freja Nilsson', email: 'f.nilsson@example.se', tier: 'none', language: 'sv', room: '212', from: 0, to: 4, state: 'arriving', adults: 1, eta: '16:30', group: 'grp_wedding' },
  { id: 'gst_oskar', name: 'Oskar Berg', email: 'o.berg@example.se', tier: 'none', language: 'sv', room: '213', from: 0, to: 4, state: 'arriving', adults: 2, eta: '16:30', group: 'grp_wedding' },
  { id: 'gst_sanne', name: 'Sanne Vestergaard', email: 's.vestergaard@example.dk', tier: 'none', language: 'da', room: '214', from: 0, to: 4, state: 'arriving', adults: 1, eta: '16:30', group: 'grp_wedding' },

  // ── gone this morning, rooms not yet turned ──
  { id: 'gst_hannah', name: 'Hannah Weiss', email: 'h.weiss@example.de', tier: 'none', language: 'de', room: '414', from: -3, to: 0, state: 'departed', adults: 1, checkedIn: true },
  { id: 'gst_pierre', name: 'Pierre Lambert', email: 'p.lambert@example.fr', tier: 'silver', language: 'fr', room: '512', from: -2, to: 0, state: 'departed', adults: 2, checkedIn: true },
];

// The rooms the cast leaves for the generated house to fill.
const FILLER_ROOMS = ['310', '314', '315', '410', '411', '514', '515', '610', '612', '615', '710', '714'];

const FILLER_NAMES: [string, string][] = [
  ['Lars Poulsen', 'da'],
  ['Emma Whitfield', 'en'],
  ['Tomas Novák', 'en'],
  ['Béatrice Morel', 'fr'],
  ['Andrés Cabrera', 'es'],
  ['Karin Lindgren', 'sv'],
  ['Daniel Okonkwo', 'en'],
  ['Sanna Virtanen', 'en'],
  ['Ruben de Vries', 'en'],
  ['Chiara Fontana', 'it'],
  ['Matthias Keller', 'de'],
  ['Aoife Byrne', 'en'],
];

const PAST_NAMES: [string, string][] = [
  ['Henrietta Bloom', 'en'],
  ['Viktor Ahlberg', 'sv'],
  ['Noor Alami', 'en'],
  ['Gustav Meyer', 'de'],
  ['Lucia Ferrari', 'it'],
  ['Peter Halvorsen', 'da'],
  ['Mei Lin', 'en'],
  ['Rafael Duarte', 'es'],
  ['Elisabeth Hoff', 'de'],
  ['Jonas Lund', 'sv'],
  ['Amelie Girard', 'fr'],
  ['Sam Whitaker', 'en'],
  ['Nina Kovač', 'en'],
  ['Otto Brenner', 'de'],
  ['Clara Nyström', 'sv'],
  ['Tariq Mansour', 'en'],
  ['Josefine Dahl', 'da'],
  ['Robert Ainsworth', 'en'],
];

// ─── rooms ───────────────────────────────────────────────────
const roomsSql = (): string =>
  insert(
    'rooms',
    ['id', 'property_id', 'number', 'kind', 'floor', 'status', 'external_id'],
    ROOMS.map(([number, kind, floor, , status]) => [`rm_l_${number}`, P, number, kind, floor, status, `OPERA-RM-${number}`] as Val[]),
  );

// ─── the block ───────────────────────────────────────────────
const groupsSql = (): string =>
  insert(
    'stay_groups',
    ['id', 'property_id', 'label', 'kind', 'note'],
    [['grp_wedding', P, 'Lindqvist–Holm wedding', 'wedding', 'Ceremony Saturday at the town hall. Erik is the groom; his brother Theo books separately and is not on the block.']],
  );

// ─── the generated house, resolved ONCE ──────────────────────
// Every generated stay is materialised here, at module load, and both the stay
// rows and the folio rows are then read off the same array.
//
// They used to be generated twice — once when writing `stays`, once when writing
// `folio_lines` — from two independently seeded streams. That is a foreign key
// waiting to fail and, before it failed, a bill posted three nights before its
// guest arrived. One array, read twice, cannot drift from itself.
type Generated = { stay: string; guest: string; name: string; language: string; tier: string; room: string; from: number; to: number; adults: number; key: boolean };

const PAST_VISITS = 3;

const FILLERS: Generated[] = (() => {
  const next = rng(0x10a5e1);
  return FILLER_ROOMS.flatMap((room, index) => {
    const entry = FILLER_NAMES[index];
    if (entry === undefined) return [];
    const [name, language] = entry;
    const from = -between(next, 1, 5);
    // 615 and 714 leave today; the rest are staying the night.
    const to = room === '615' || room === '714' ? 0 : between(next, 1, 4);
    return [
      {
        stay: `stay_l_${index}`,
        guest: `gst_l_${index}`,
        name,
        language,
        tier: chance(next, 0.25) ? 'silver' : 'none',
        room,
        from,
        to,
        adults: between(next, 1, 2),
        key: chance(next, 0.4),
      },
    ];
  });
})();

// The four months behind the house. Three of these belong to guests who are in
// a room right now, which is the entire point: "her third stay this year" is a
// COUNT over rows, not a sentence somebody typed into a profile.
const HISTORY: Generated[] = (() => {
  const past = rng(0x5ea501);
  const rows: Generated[] = [];

  const RETURNING: [string, number][] = [
    ['gst_amara', -34],
    ['gst_amara', -96],
    ['gst_priya', -22],
    ['gst_priya', -61],
    ['gst_priya', -110],
    ['gst_olav', -78],
    ['gst_nadia', -47],
    ['gst_jurgen', -102],
  ];
  RETURNING.forEach(([guest, from], index) => {
    const room = pick(past, ROOMS)[0];
    rows.push({ stay: `stay_h_r${index}`, guest, name: '', language: '', tier: '', room, from, to: from + between(past, 1, 4), adults: 1, key: false });
  });

  PAST_NAMES.forEach(([name, language], index) => {
    for (let visit = 0; visit < PAST_VISITS; visit += 1) {
      const room = pick(past, ROOMS)[0];
      const from = -between(past, 6, 120);
      rows.push({
        stay: `stay_h_${index}_${visit}`,
        guest: `gst_p_${index}`,
        name,
        language,
        tier: chance(past, 0.2) ? 'silver' : 'none',
        room,
        from,
        to: from + between(past, 1, 5),
        adults: between(past, 1, 2),
        key: false,
      });
    }
  });

  return rows;
})();

// ─── guests and stays ────────────────────────────────────────
const guestRow = (id: string, name: string, email: string, tier: string, language: string, index: number): Val[] => [id, name, email, tier, language, P, `OPERA-PRF-${88000 + index}`];

const stayRow = (entry: Generated, state: string, reference: number): Val[] => [
  entry.stay,
  entry.guest,
  P,
  `rm_l_${entry.room}`,
  null,
  day(entry.from),
  day(entry.to),
  '',
  state,
  entry.adults,
  rate(entry.room),
  entry.key,
  true,
  `OPERA-RES-${reference}`,
];

const peopleSql = (): string => {
  const guests: Val[][] = [];
  const stays: Val[][] = [];

  CAST.forEach((person, index) => {
    guests.push(guestRow(person.id, person.name, person.email, person.tier, person.language, index));
    stays.push([
      person.id.replace('gst_', 'stay_'),
      person.id,
      P,
      person.room === null ? null : `rm_l_${person.room}`,
      person.group ?? null,
      day(person.from),
      day(person.to),
      person.eta ?? '',
      person.state,
      person.adults,
      person.room === null ? 0 : rate(person.room),
      person.key ?? false,
      person.checkedIn ?? false,
      `OPERA-RES-${55200 + index}`,
    ]);
  });

  FILLERS.forEach((entry, index) => {
    guests.push(guestRow(entry.guest, entry.name, `guest${index}@example.com`, entry.tier, entry.language, 200 + index));
    stays.push(stayRow(entry, 'in_house', 56000 + index));
  });

  // A returning guest already has a `guests` row; only their past stays are new.
  const seen = new Set<string>();
  HISTORY.forEach((entry, index) => {
    if (entry.name !== '' && !seen.has(entry.guest)) {
      seen.add(entry.guest);
      guests.push(guestRow(entry.guest, entry.name, `${entry.guest}@example.com`, entry.tier, entry.language, 300 + index));
    }
    stays.push(stayRow(entry, 'departed', 57000 + index));
  });

  return (
    insert('guests', ['id', 'name', 'email', 'tier', 'language', 'property_id', 'external_id'], guests) +
    insert(
      'stays',
      ['id', 'guest_id', 'property_id', 'room_id', 'group_id', 'arrival', 'departure', 'eta', 'state', 'adults', 'rate', 'key_issued', 'checked_in', 'external_id'],
      stays,
    )
  );
};

// ─── the folio ───────────────────────────────────────────────
// Room posts at midnight, so a stay that arrived two days ago carries two room
// nights and tonight's has not landed. Everything else is what people actually
// spend money on in a hotel.
const folioSql = (): string => {
  const lines: Val[][] = [];
  // A null id means "let the column's default mint one" — the generated rows are
  // never referred to by name, and an explicit null would violate NOT NULL.
  const push = (id: string | null, stay: string, description: string, amount: number, posted: Val): void => {
    lines.push([id ?? DEFAULTS, stay, P, description, amount, posted]);
  };

  // Amara — three nights in, and the second dinner is the one she had while the
  // room was rattling.
  push('fol_am_1', 'stay_amara', 'Room — Deluxe Double', 240, at(-2, 23, 59));
  push('fol_am_2', 'stay_amara', 'Room — Deluxe Double', 240, at(-1, 23, 59));
  push('fol_am_3', 'stay_amara', 'Restaurant — dinner', 82, at(-2, 20, 40));
  push('fol_am_4', 'stay_amara', 'Restaurant — dinner', 96, at(-1, 20, 10));
  push('fol_am_5', 'stay_amara', 'Bar', 34, at(-1, 22, 15));
  push('fol_am_6', 'stay_amara', 'Minibar — still water', 6, at(-1, 18, 5));

  // Sofia — and the line she is disputing, posted while she was out.
  push('fol_so_1', 'stay_sofia', 'Room — Deluxe Double', 240, at(-1, 23, 59));
  push('fol_so_2', 'stay_sofia', 'Restaurant — dinner', 64, at(-1, 21, 0));
  push('fol_so_3', 'stay_sofia', 'Minibar — local beer', 9, ago(1, 40));

  // Priya — the reason she is worth walking a suite to.
  push('fol_pr_1', 'stay_priya', 'Room — Junior Suite', 330, at(-3, 23, 59));
  push('fol_pr_2', 'stay_priya', 'Room — Junior Suite', 330, at(-2, 23, 59));
  push('fol_pr_3', 'stay_priya', 'Room — Junior Suite', 330, at(-1, 23, 59));
  push('fol_pr_4', 'stay_priya', 'Restaurant — dinner', 124, at(-2, 20, 30));
  push('fol_pr_5', 'stay_priya', 'Bar', 58, at(-1, 23, 10));
  push('fol_pr_6', 'stay_priya', 'Laundry', 45, at(-1, 11, 20));
  push('fol_pr_7', 'stay_priya', 'Parking', 30, at(-3, 18, 0));
  push('fol_pr_8', 'stay_priya', 'Parking', 30, at(-2, 18, 0));
  push('fol_pr_9', 'stay_priya', 'Parking', 30, at(-1, 18, 0));

  push('fol_na_1', 'stay_nadia', 'Room — Junior Suite', 330, at(-2, 23, 59));
  push('fol_na_2', 'stay_nadia', 'Room — Junior Suite', 330, at(-1, 23, 59));
  push('fol_na_3', 'stay_nadia', 'Restaurant — dinner', 88, at(-1, 20, 50));
  push('fol_na_4', 'stay_nadia', 'Bar', 42, at(-2, 22, 40));

  push('fol_yu_1', 'stay_yuki', 'Room — Junior Suite', 330, at(-1, 23, 59));
  push('fol_yu_2', 'stay_yuki', 'Restaurant — dinner', 76, at(-1, 19, 40));

  push('fol_ju_1', 'stay_jurgen', 'Room — Deluxe Double', 240, at(-3, 23, 59));
  push('fol_ju_2', 'stay_jurgen', 'Room — Deluxe Double', 240, at(-2, 23, 59));
  push('fol_ju_3', 'stay_jurgen', 'Room — Deluxe Double', 240, at(-1, 23, 59));
  push('fol_ju_4', 'stay_jurgen', 'Restaurant — breakfast', 68, at(-1, 8, 30));
  push('fol_ju_5', 'stay_jurgen', 'Minibar — sparkling water', 14, at(-2, 17, 15));

  push('fol_ma_1', 'stay_marco', 'Room — Double', 195, at(-2, 23, 59));
  push('fol_ma_2', 'stay_marco', 'Room — Double', 195, at(-1, 23, 59));
  push('fol_ma_3', 'stay_marco', 'Bar', 28, at(-1, 22, 5));

  // Olav's anniversary dinner, on the bill before anybody at the desk knew it
  // was an anniversary.
  push('fol_ol_1', 'stay_olav', 'Room — Double', 195, at(-1, 23, 59));
  push('fol_ol_2', 'stay_olav', 'Restaurant — dinner', 110, at(-1, 20, 15));

  // Ingrid leaves today and the approved late checkout is already posted.
  push('fol_in_1', 'stay_ingrid', 'Room — Deluxe Double', 240, at(-2, 23, 59));
  push('fol_in_2', 'stay_ingrid', 'Room — Deluxe Double', 240, at(-1, 23, 59));
  push('fol_in_3', 'stay_ingrid', 'Restaurant — dinner', 54, at(-2, 19, 50));
  push('fol_in_4', 'stay_ingrid', 'Late checkout — until 16:00', 45, ago(5, 12));

  push('fol_ha_1', 'stay_hannah', 'Room — Deluxe Double', 240, at(-3, 23, 59));
  push('fol_ha_2', 'stay_hannah', 'Room — Deluxe Double', 240, at(-2, 23, 59));
  push('fol_ha_3', 'stay_hannah', 'Room — Deluxe Double', 240, at(-1, 23, 59));
  push('fol_pi_1', 'stay_pierre', 'Room — Deluxe Double', 240, at(-2, 23, 59));
  push('fol_pi_2', 'stay_pierre', 'Room — Deluxe Double', 240, at(-1, 23, 59));
  push('fol_pi_3', 'stay_pierre', 'Restaurant — dinner', 92, at(-1, 21, 15));

  // The house around them — a room night per night ELAPSED, off the same array
  // the stay rows came from, so no charge can be posted before its guest
  // arrived.
  const next = rng(0xf0110);
  const EXTRAS: [string, number, number][] = [
    ['Restaurant — dinner', 55, 140],
    ['Restaurant — breakfast', 22, 38],
    ['Bar', 18, 70],
    ['Minibar — still water', 6, 6],
    ['Minibar — local beer', 9, 9],
    ['Laundry', 25, 60],
    ['Parking', 30, 30],
  ];
  const kindOf = (number: string): string => ROOMS.find((r) => r[0] === number)?.[1] ?? 'Double';

  FILLERS.forEach((entry) => {
    const elapsed = Math.abs(entry.from);
    for (let night = 1; night <= elapsed; night += 1) push(null, entry.stay, `Room — ${kindOf(entry.room)}`, rate(entry.room), at(-night, 23, 59));
    const extras = between(next, 0, 3);
    for (let extra = 0; extra < extras; extra += 1) {
      const [label, low, high] = pick(next, EXTRAS);
      push(null, entry.stay, label, between(next, low, high), at(-between(next, 1, elapsed), between(next, 8, 22), 0));
    }
  });

  // History gets a consolidated room line plus the odd extra. Nobody opens a
  // departed guest's folio in the demo; these exist so a stay COUNT and a spend
  // figure have something behind them.
  const past = rng(0xf0512);
  HISTORY.forEach((entry) => {
    const nights = Math.max(1, entry.to - entry.from);
    push(null, entry.stay, `Room — ${nights} night${nights === 1 ? '' : 's'}`, nights * rate(entry.room), at(entry.to, 23, 59));
    if (chance(past, 0.6)) {
      const [label, low, high] = pick(past, EXTRAS);
      push(null, entry.stay, label, between(past, low, high), at(entry.from, 20, 0));
    }
  });

  return insert('folio_lines', ['id', 'stay_id', 'property_id', 'description', 'amount', 'posted_at'], lines);
};

// ─── the inbox ───────────────────────────────────────────────
// Fourteen threads in six states, because an inbox where everything is on fire
// teaches a clerk nothing and an inbox where nothing is teaches them less. The
// three that are genuinely waiting are the three the demo is about.
const messagesSql = (): string => {
  const rows: Val[][] = [];
  const say = (id: string, stay: string, sender: string, body: string, sent: Val): void => {
    rows.push([id, stay, P, sender, body, sent]);
  };

  // 1 — THE COMPLAINT. Two nights of it, and nobody has answered since the
  // welcome note.
  //
  // ONE CLOCK PER LIVE THREAD. `at` is a time of day and `ago` is an elapsed
  // gap, so mixing them inside one conversation lets the order flip: a demo
  // booted after midnight put `ago(6, 40)` earlier than `at(-1, 23, 12)` and the
  // follow-up arrived before the complaint it follows up on. Every message here
  // is elapsed, so the sequence holds whatever the hour.
  say('msg_am_1', 'stay_amara', 'desk', 'Welcome back, Ms Osei. Your usual table is held for eight.', ago(34, 0));
  say('msg_am_2', 'stay_amara', 'guest', 'The air conditioning is rattling again — this is the second night. It was doing it on my last stay too.', ago(26, 0));
  // The longest-waiting guest in the house, and therefore the top row of the
  // stall list. That ordering is the demo's opening move, so it is a seeded
  // fact rather than a coincidence of when somebody boots the app.
  say('msg_am_3', 'stay_amara', 'guest', 'Still nothing. I have barely slept and I have meetings all day tomorrow.', ago(6, 40));

  // 2 — THE BILL.
  say('msg_so_1', 'stay_sofia', 'guest', 'There is a €9 beer on my bill from this afternoon. I have not taken anything from the minibar.', ago(0, 35));

  // 3 — THE LANGUAGE.
  say('msg_ju_1', 'stay_jurgen', 'guest', 'Guten Tag, könnte ich bitte zwei zusätzliche Kissen bekommen und das Frühstück morgen erst um zehn Uhr? Vielen Dank.', ago(1, 20));

  // 4 — THE TAXI. The ask the concierge famously could not serve.
  say('msg_na_1', 'stay_nadia', 'guest', 'Could you arrange a car to the airport for tomorrow morning? My flight is at 08:20.', ago(2, 5));

  // 5 — THE LATE CHECKOUT, asked in prose. There is an action for this; the
  // right move is to put it up, not to write a note to a colleague.
  say('msg_mc_1', 'stay_marco', 'guest', 'Any chance we could keep the room a little longer tomorrow? Our train is not until four.', ago(3, 15));

  // 6 — THE ANNIVERSARY, mentioned in passing at the end of a thank-you.
  say('msg_ol_1', 'stay_olav', 'desk', 'Welcome back to The Lumen, Mr Dahl.', ago(20, 0));
  say('msg_ol_2', 'stay_olav', 'guest', 'Thank you — we are here for our tenth anniversary, so if anything can be done we would be delighted.', ago(5, 30));

  // 7–9 — answered and quiet. An inbox needs a floor, and every one of these
  // ENDS on the desk's side deliberately: a thread whose last word is "thank
  // you" is not waiting for anything, and a stall list that says it is teaches
  // a clerk to stop reading the stall list.
  say('msg_pr_1', 'stay_priya', 'guest', 'Could I have a late breakfast on Thursday?', at(-1, 9, 15));
  say('msg_pr_2', 'stay_priya', 'desk', 'Of course — the restaurant will hold a table until half ten.', at(-1, 9, 40));
  say('msg_pr_3', 'stay_priya', 'guest', 'Perfect, thank you.', at(-1, 9, 45));
  say('msg_pr_4', 'stay_priya', 'desk', 'A pleasure.', at(-1, 9, 50));
  say('msg_yu_1', 'stay_yuki', 'desk', 'Your wake-up call is set for 07:00 and the car is booked for 07:15.', at(-1, 18, 20));
  say('msg_yu_2', 'stay_yuki', 'guest', 'Thank you very much.', at(-1, 18, 35));
  say('msg_yu_3', 'stay_yuki', 'desk', 'Sleep well — we will ring you.', at(-1, 18, 40));
  say('msg_in_1', 'stay_ingrid', 'guest', 'Could I stay in the room until four? My flight is in the evening.', at(-1, 14, 5));
  say('msg_in_2', 'stay_ingrid', 'desk', 'Done — until four, and the charge is on the bill.', at(-1, 14, 25));
  say('msg_in_3', 'stay_ingrid', 'guest', 'Wonderful, thank you.', at(-1, 14, 30));
  say('msg_in_4', 'stay_ingrid', 'desk', 'Enjoy the rest of your morning.', at(-1, 14, 35));

  // 10 — the pre-arrival ask that is already sitting in the approvals queue.
  say('msg_th_1', 'stay_theo', 'guest', 'We will be arriving around five. Is the junior suite upgrade possible?', at(-1, 11, 0));
  say('msg_th_2', 'stay_theo', 'desk', 'I have put the request in — we will know closer to the day.', at(-1, 11, 30));

  // 11 — the block, announcing itself.
  say('msg_er_1', 'stay_erik', 'guest', 'We are five rooms for the wedding — can we all check in together around half four?', ago(6, 30));
  say('msg_er_2', 'stay_erik', 'desk', 'Of course. We will have you together on the second floor.', ago(6, 10));

  // 12 — the late arrival, already handled.
  say('msg_we_1', 'stay_wei', 'guest', 'My flight lands at 21:50, so I will be late checking in.', ago(7, 40));
  say('msg_we_2', 'stay_wei', 'desk', 'Noted — the night porter will have your key.', ago(7, 20));

  // 13 — a fault reported in prose two days ago, dealt with.
  say('msg_ha_1', 'stay_hannah', 'guest', 'The shower in 414 drains very slowly.', at(-2, 9, 10));
  say('msg_ha_2', 'stay_hannah', 'desk', 'Thank you — maintenance has been asked to look at it today.', at(-2, 9, 35));

  // 14 — a departed guest's thanks, so the feed has a bottom.
  say('msg_pi_1', 'stay_pierre', 'guest', 'Merci for a lovely stay — the room was perfect.', ago(8, 15));

  return insert('messages', ['id', 'stay_id', 'property_id', 'sender', 'body', 'sent_at'], rows);
};

// ─── the board ───────────────────────────────────────────────
// Twelve issues, and the shape of the set is the point: two of them are old,
// severe and have nobody on them, which is what a clerk should be told about
// before anything else. And 412 has now had three, which is what turns "a
// complaint" into "a pattern".
const issuesSql = (): string => {
  const rows: Val[][] = [];
  const raise = (id: string, stay: string | null, room: string | null, kind: string, summary: string, detail: string, severity: string, status: string, by: string, raised: Val, resolved: Val | null): void => {
    rows.push([id, P, stay, room === null ? null : `rm_l_${room}`, kind, summary, detail, severity, status, by, raised, resolved]);
  };

  // The pattern on 412 — twice resolved, and here it is again.
  raise('iss_412_a', null, '412', 'climate', 'Air conditioning noisy overnight', 'Guest reported a rattle under load. Contractor attended, no fault found.', 'normal', 'resolved', 'guest', ts(-40 * 24), ts(-38 * 24));
  raise('iss_412_b', null, '412', 'climate', 'Air conditioning rattles under load', 'Filter cleaned and mounts checked. Closed as fixed.', 'normal', 'resolved', 'guest', ts(-12 * 24), ts(-11 * 24));
  // …and the third, open, from the guest who is in the room right now.
  raise('iss_amara', 'stay_amara', '412', 'climate', 'Air conditioning rattling — second night', 'Guest reports the same fault as her previous stay. Nothing dispatched yet.', 'high', 'open', 'guest', at(-1, 23, 15), null);

  // The two that have been sitting there.
  // Logged against the nearest room, because that is how a fault gets a
  // location — every read that shows an issue shows where it is, and an issue
  // with nowhere is an issue nobody can be sent to.
  raise('iss_lift', null, '310', 'other', 'Lift 2 stops between the third and fourth floors', 'Reported by two guests and a housekeeper. Nobody has been assigned.', 'high', 'open', 'staff', ts(-3 * 24), null);
  raise('iss_wifi', null, '610', 'wifi', 'Wi-Fi drops on the sixth floor', 'Intermittent since the weekend. No ticket raised with the provider.', 'normal', 'open', 'guest', ts(-2 * 24), null);

  // Open, and being worked — these are the rooms that are out of order.
  raise('iss_001', null, '415', 'climate', 'Air conditioning compressor failed', 'Room out of order pending a replacement compressor. Part is on order.', 'high', 'open', 'staff', ts(-14 * 24), null);
  raise('iss_312', null, '312', 'plumbing', 'Bathroom leak into the room below', 'Room out of order. Plumber attended, waiting on a seal.', 'high', 'open', 'staff', ts(-5 * 24), null);
  raise('iss_614', null, '614', 'other', 'Carpet damaged by a spill', 'Room out of order until the replacement piece is fitted.', 'low', 'open', 'staff', ts(-6 * 24), null);

  // Recent, worked, closed.
  raise('iss_414', 'stay_hannah', '414', 'plumbing', 'Shower drains slowly', 'Snaked and cleared.', 'low', 'resolved', 'guest', at(-2, 9, 12), at(-1, 14, 0));
  raise('iss_210', null, '210', 'climate', 'Air conditioning noisy overnight', 'Guest moved rooms. Contractor looked at it, no fault found.', 'normal', 'resolved', 'guest', ts(-30 * 24), ts(-29 * 24));
  raise('iss_511', null, '511', 'other', 'Television will not switch on', 'Replaced the remote.', 'low', 'resolved', 'staff', ts(-8 * 24), ts(-8 * 24 + 3));
  raise('iss_710', null, '710', 'plumbing', 'No hot water in the morning', 'Circulation pump reset.', 'normal', 'resolved', 'guest', ts(-19 * 24), ts(-18 * 24));

  return insert('issues', ['id', 'property_id', 'stay_id', 'room_id', 'kind', 'summary', 'detail', 'severity', 'status', 'raised_by', 'raised_at', 'resolved_at'], rows);
};

// ─── the floor's work ────────────────────────────────────────
// Fourteen jobs across four people, so dispatching is a choice between
// colleagues rather than a formality with one name in the list. Note what is
// NOT here: nothing for `iss_amara`, `iss_lift` or `iss_wifi`.
const tasksSql = (): string => {
  const rows: Val[][] = [];
  const job = (id: string, room: string | null, issue: string | null, stay: string | null, title: string, detail: string, kind: string, status: string, assignee: string, created: Val): void => {
    rows.push([id, P, room === null ? null : `rm_l_${room}`, issue, stay, title, detail, kind, status, assignee, created]);
  };

  job('tsk_001', '415', 'iss_001', null, 'Replace AC compressor — 415', 'Part expected Thursday. Room stays out of order until it is in and tested.', 'maintenance', 'open', 'stf_kwame', ts(-14 * 24));
  job('tsk_312', '312', 'iss_312', null, 'Fit the new seal — 312', 'Plumber left the old one on the sill. Room out of order until it holds overnight.', 'maintenance', 'open', 'stf_anders', ts(-5 * 24));
  job('tsk_614', '614', 'iss_614', null, 'Fit the replacement carpet piece — 614', '', 'maintenance', 'open', 'stf_anders', ts(-6 * 24));

  // This afternoon's turn — the two rooms the wedding party is waiting on.
  job('tsk_213', '213', null, null, 'Turn 213 for a 16:30 arrival', 'Wedding block. Guest is due at half four.', 'housekeeping', 'open', 'stf_liv', ago(2, 0));
  job('tsk_214', '214', null, null, 'Turn 214 for a 16:30 arrival', 'Wedding block. Guest is due at half four.', 'housekeeping', 'open', 'stf_maja', ago(2, 0));
  job('tsk_313', '313', null, null, 'Turn 313 for a late arrival', 'Guest lands at 21:50 — no rush, but it must be done before the night shift.', 'housekeeping', 'open', 'stf_liv', ago(1, 30));
  job('tsk_414', '414', null, null, 'Turn 414', '', 'housekeeping', 'open', 'stf_maja', ago(1, 10));
  job('tsk_512', '512', null, null, 'Turn 512', '', 'housekeeping', 'open', 'stf_liv', ago(0, 55));

  job('tsk_amen', '210', null, 'stay_erik', 'Wedding amenity — 210 to 214', 'Five rooms. Cava and a card in each; the card is at the desk.', 'housekeeping', 'open', 'stf_maja', ago(3, 20));
  job('tsk_anniv', '311', null, 'stay_olav', 'Turndown — 311', '', 'housekeeping', 'open', 'stf_liv', ago(4, 0));

  job('tsk_414_iss', '414', 'iss_414', null, 'Snake the shower drain — 414', '', 'maintenance', 'done', 'stf_kwame', at(-2, 10, 0));
  job('tsk_210_iss', '210', 'iss_210', null, 'Check compressor mounts — 210', '', 'maintenance', 'done', 'stf_kwame', ts(-29 * 24));
  job('tsk_511_iss', '511', 'iss_511', null, 'Replace the remote — 511', '', 'maintenance', 'done', 'stf_anders', ts(-8 * 24));
  job('tsk_710_iss', '710', 'iss_710', null, 'Reset the circulation pump', '', 'maintenance', 'done', 'stf_kwame', ts(-18 * 24));

  return insert('tasks', ['id', 'property_id', 'room_id', 'issue_id', 'stay_id', 'title', 'detail', 'kind', 'status', 'assignee_id', 'created_at'], rows);
};

// ─── what the desk already knows ─────────────────────────────
// The oldest artefact in hotel-keeping. Two of these are the reason a clerk
// looks clever; the third is the reason one does not walk an upgrade at Priya.
const notesSql = (): string =>
  insert(
    'stay_notes',
    ['id', 'stay_id', 'property_id', 'kind', 'body', 'author', 'created_at'],
    [
      ['nte_am_1', 'stay_amara', P, 'preference', 'Always asks for a high floor away from the lift. Third stay this year.', 'Jonas Riis', ts(-34 * 24)],
      ['nte_am_2', 'stay_amara', P, 'watch', 'Reported the same air conditioning fault on her last stay. It was closed as no-fault-found.', 'Rosa Delgado', ts(-33 * 24)],
      ['nte_pr_1', 'stay_priya', P, 'preference', 'Books the junior suite every time and takes the corner one if it is free. Never wants turndown.', 'Rosa Delgado', ts(-22 * 24)],
      ['nte_yu_1', 'stay_yuki', P, 'preference', 'Early flights most visits — set the call and the car together.', 'Jonas Riis', at(-1, 18, 40)],
      ['nte_na_1', 'stay_nadia', P, 'preference', 'Quiet room, and she works late — do not schedule housekeeping before eleven.', 'Rosa Delgado', ts(-47 * 24)],
      ['nte_mc_1', 'stay_marco', P, 'note', 'Travelling with a folding bicycle; it lives behind the desk.', 'Rosa Delgado', at(-2, 16, 0)],
    ],
  );

// ─── tomorrow morning ────────────────────────────────────────
const wakeSql = (): string =>
  insert(
    'wake_calls',
    ['id', 'stay_id', 'property_id', 'call_on', 'call_at', 'status', 'created_at'],
    [
      ['wake_amara', 'stay_amara', P, day(1), '07:00', 'scheduled', at(-2, 21, 40)],
      ['wake_yuki', 'stay_yuki', P, day(1), '07:00', 'scheduled', at(-1, 18, 15)],
      ['wake_nadia', 'stay_nadia', P, day(1), '06:00', 'scheduled', ago(2, 0)],
      ['wake_marco', 'stay_marco', P, day(1), '08:30', 'scheduled', at(-1, 19, 0)],
      ['wake_jurgen', 'stay_jurgen', P, day(1), '07:30', 'scheduled', at(-1, 21, 30)],
      ['wake_priya', 'stay_priya', P, day(1), '06:15', 'scheduled', at(-1, 22, 0)],
      // Filler stays 9 and 11 leave today, so they are deliberately absent from
      // tomorrow's sheet — a call booked for a guest who has gone home is the
      // sort of detail that gets noticed on a stand.
      ['wake_l0', 'stay_l_0', P, day(1), '07:00', 'scheduled', at(-1, 20, 10)],
      ['wake_l3', 'stay_l_3', P, day(1), '08:00', 'scheduled', at(-1, 20, 40)],
      ['wake_l7', 'stay_l_7', P, day(1), '06:45', 'scheduled', ago(3, 30)],
      ['wake_l1', 'stay_l_1', P, day(1), '09:00', 'scheduled', ago(1, 15)],
    ],
  );

// ─── the cars ────────────────────────────────────────────────
// Transfers are LIVE at both hotels from the first boot — no switch to find, no
// console to visit. The point of the capability is that the taxi ask a
// concierge could never answer now opens a booking, and a feature you have to
// go and enable before it works is a feature nobody in the room believes in.
const transfersSql = (): string =>
  insert(
    'transfers',
    ['id', 'stay_id', 'property_id', 'direction', 'pickup_on', 'pickup_at', 'destination', 'vehicle', 'confirmation', 'status', 'created_at'],
    [
      // Yuki's call is at 07:00 and her car is at 07:15. Both were booked in the
      // same breath yesterday evening and neither is wrong on its own, which is
      // exactly why fifteen minutes is the kind of thing a morning shift finds
      // out about at 07:16.
      ['trf_yuki', 'stay_yuki', P, 'departure', day(1), '07:15', 'Copenhagen Airport (CPH)', 'Saloon', 'OPERA-TRF-3391', 'booked', at(-1, 18, 18)],
      ['trf_jurgen', 'stay_jurgen', P, 'departure', day(1), '08:30', 'Copenhagen Airport (CPH)', 'Saloon', 'OPERA-TRF-3402', 'booked', at(-1, 21, 35)],
      ['trf_pierre', 'stay_pierre', P, 'departure', day(0), '09:30', 'Copenhagen Airport (CPH)', 'Estate', 'OPERA-TRF-3376', 'done', at(-1, 17, 0)],
    ],
  );

// ─── waiting on a yes ────────────────────────────────────────
const requestsSql = (): string =>
  insert(
    'stay_requests',
    ['id', 'stay_id', 'property_id', 'kind', 'label', 'detail', 'amount', 'status', 'created_at'],
    [
      // Theo's, from before he arrived — and 715 is empty.
      ['sreq_theo', 'stay_theo', P, 'upgrade', 'Junior suite', 'Corner room, bathtub, harbour view', 90, 'pending', at(-1, 11, 5)],
      // Marco asked in prose; the desk turned it into a request but has not
      // answered it. He leaves tomorrow.
      ['sreq_marco', 'stay_marco', P, 'late-checkout', 'Until 4:00 pm', 'Half-day rate', 45, 'pending', ago(3, 10)],
      // The urgent one: filler stay 9 is in 615 and DEPARTS TODAY. It is a
      // quarter to four. An answer at five o'clock is not an answer.
      ['sreq_l9', 'stay_l_9', P, 'late-checkout', 'Until 6:00 pm', 'Evening departure', 90, 'pending', ago(1, 5)],
      ['sreq_l5', 'stay_l_5', P, 'upgrade', 'Suite', 'Top floor, separate sitting room', 150, 'pending', ago(4, 40)],
      ['sreq_priya', 'stay_priya', P, 'late-checkout', 'Until 2:00 pm', 'On the house', 0, 'pending', ago(0, 50)],
      // Already answered — the queue has a past.
      ['sreq_ingrid', 'stay_ingrid', P, 'late-checkout', 'Until 4:00 pm', 'Half-day rate', 45, 'approved', at(-1, 14, 20)],
      ['sreq_h1', 'stay_hannah', P, 'upgrade', 'Junior suite', 'Corner room, bathtub, harbour view', 90, 'declined', at(-3, 15, 0)],
    ],
  );

// ─── what the night left ─────────────────────────────────────
// The handover Rosa read when she came on at seven. It exists so the surface
// that writes tonight's has a yesterday to sit above — a shift note with no
// previous entry reads like a feature rather than a habit.
const handoversSql = (): string =>
  insert(
    'handovers',
    ['id', 'property_id', 'author_id', 'shift', 'body', 'created_at'],
    [
      [
        'hnd_night',
        P,
        'stf_jonas',
        'night',
        [
          '412 rang down twice about the air conditioning — I logged it but there was nobody to send at two in the morning. She was not happy and I would expect to hear from her again.',
          '415 still out on the compressor, part due Thursday. 312 and 614 unchanged.',
          'Lift 2 stopped between three and four again around 04:30. Third time this week and still nothing dispatched.',
          'Five for the wedding arrive half four — 213 and 214 were only vacated this morning, so housekeeping will be tight.',
          'Mr Chen lands at 21:50; his key is cut and behind the desk.',
        ].join('\n\n'),
        ago(9, 0),
      ],
    ],
  );

export const lumenSql = (): string =>
  [roomsSql(), groupsSql(), peopleSql(), folioSql(), messagesSql(), issuesSql(), tasksSql(), notesSql(), wakeSql(), transfersSql(), requestsSql(), handoversSql()].join('\n');

// The demo-critical ids, exported so a check asserts on a NAME rather than on a
// string it repeats. A dataset this size will be edited; an assertion that
// breaks loudly when `stay_amara` moves is worth more than one that quietly
// asserts on nothing.
export const LUMEN = {
  property: P,
  complaint: { stay: 'stay_amara', guest: 'gst_amara', room: 'rm_l_412', issue: 'iss_amara' },
  moveTo: 'rm_l_613',
  dispute: { stay: 'stay_sofia', line: 'fol_so_3' },
  german: 'stay_jurgen',
  taxi: 'stay_nadia',
  anniversary: 'stay_olav',
  upsell: { stay: 'stay_priya', room: 'rm_l_711' },
  block: 'grp_wedding',
  unattended: ['iss_lift', 'iss_wifi', 'iss_amara'],
} as const;
