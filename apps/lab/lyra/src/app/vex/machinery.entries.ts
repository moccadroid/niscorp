import type { CacheEntry, MutationEntry } from './index';

// ═══════════════════════════════════════════════════════════════
// THE NO-PRINCIPAL SURFACES, AS ENTRIES.
//
// Four surfaces in this application act before or without a session: the
// sign-in credential (a session does not exist yet), a mail provider's
// callback (a vendor has no principal), the lab's login picker (its caller is
// anonymity itself), and the automations engine loading its reflex rows. They
// used to be raw SQL behind justifications. Now each is a seeded entry
// executed by `server.executeAs` under a DECLARED charter role — `credential`,
// `mailer`, `transport`, `scheduler` — each holding exactly the verbs its
// surface needs, each impossible to wear, each scoped by a named reach in
// behaviors.ts. Widening any of them is a charter diff somebody reviews.
//
// The one thing that stays raw is the roles read in `server/identity.ts`,
// because a policy cannot authorise the read it compiles from. Everything in
// this file runs UNDER a policy. That is the whole line, and
// `reads-are-vex-check` holds it at exactly one statement.
// ═══════════════════════════════════════════════════════════════

// ─── credential: how a session comes to exist ────────────────

// Exact-match on the address, the same posture as the served `people/byEmail`
// the desk already holds: input is lowercased by the caller, addresses are
// stored lowercase.
export const credentialPrincipalByEmail: CacheEntry = {
  fingerprint: 'credential/principal-by-email',
  intent: 'The principal behind the address somebody signs in with — resolved to mint a link, never to answer a screen',
  shape: { person_id: '' },
  dsl: {
    from: ['people'],
    fields: [{ field: 'people.id', as: 'person_id' }],
    filter: { eq: ['people.email', { $context: 'email' }] },
    limit: 1,
  },
  mapping: { person_id: { $get: { from: { $ref: '$.result' }, path: ['person_id'], fallback: { $const: '' } } } },
};

// Yesterday's dead links go while we are already writing to the table —
// cheaper than a janitor, and there is no window in which it matters.
export const credentialSweepLinks: MutationEntry = {
  fingerprint: 'credential/sweep-links',
  intent: 'Drop expired sign-in links',
  mutation: {
    op: 'delete',
    table: 'login_links',
    where: { lt: ['login_links.expires_at', { $context: 'now' }] },
  },
};

export const credentialMintLink: MutationEntry = {
  fingerprint: 'credential/mint-link',
  intent: 'Write one sign-in link: a nonce naming a person, dead in fifteen minutes',
  mutation: {
    op: 'insert',
    table: 'login_links',
    values: {
      nonce: { $context: 'nonce' },
      person_id: { $context: 'personId' },
      expires_at: { $context: 'expiresAt' },
    },
  },
};

// DELETE ... RETURNING, engine-compiled: reading the link and using it up are
// one statement, which is what makes single-use hold when somebody
// double-clicks. The rows answered carry the person; none answered is a
// refusal — spent, expired and never-existed alike.
export const credentialRedeemLink: MutationEntry = {
  fingerprint: 'credential/redeem-link',
  intent: 'Spend a sign-in link, or refuse — one statement, one use',
  mutation: {
    op: 'delete',
    table: 'login_links',
    where: { and: [{ eq: ['login_links.nonce', { $context: 'nonce' }] }, { gt: ['login_links.expires_at', { $context: 'now' }] }] },
  },
};

// ─── mailer: what the provider tells us afterwards ───────────

export const mailerRecordDelivered: MutationEntry = {
  fingerprint: 'mailer/record-delivered',
  intent: 'The provider says a message landed — stamp its row',
  mutation: {
    op: 'update',
    table: 'outbox',
    set: { delivered_at: { $context: 'at' } },
    where: { eq: ['outbox.provider_message_id', { $context: 'providerMessageId' }] },
  },
};

export const mailerRecordFailed: MutationEntry = {
  fingerprint: 'mailer/record-failed',
  intent: 'The provider says a message did not land — the row says so, with the reason',
  mutation: {
    op: 'update',
    table: 'outbox',
    set: { state: 'failed', failed_reason: { $context: 'reason' } },
    where: { eq: ['outbox.provider_message_id', { $context: 'providerMessageId' }] },
  },
};

// Which studio a provider message belonged to — a bounce suppresses the
// address everywhere, a complaint suppresses it at the studio complained
// about, and the provider's id is the only key it gives back.
export const mailerOutboxOrigin: CacheEntry = {
  fingerprint: 'mailer/outbox-origin',
  intent: 'The studio and person behind a provider message id — a bounce suppresses everywhere, a complaint at the studio complained about',
  shape: { studio_id: '', person_id: '' },
  dsl: {
    from: ['outbox'],
    fields: ['outbox.studio_id', 'outbox.person_id'],
    filter: { eq: ['outbox.provider_message_id', { $context: 'providerMessageId' }] },
    limit: 1,
  },
  mapping: {
    studio_id: { $get: { from: { $ref: '$.result' }, path: ['studio_id'], fallback: { $const: '' } } },
    person_id: { $get: { from: { $ref: '$.result' }, path: ['person_id'], fallback: { $const: '' } } },
  },
};

export const mailerSuppress: MutationEntry = {
  fingerprint: 'mailer/suppress',
  intent: 'Stop writing to an address — the provider already told us it bounced or reported us',
  mutation: {
    op: 'insert',
    table: 'mail_suppressions',
    values: {
      address: { $context: 'address' },
      studio_id: { $context: 'studioId' },
      kind: { $context: 'kind' },
      reason: { $context: 'reason' },
    },
    // The newest word from the provider wins: a bounce that becomes a
    // complaint updates in place.
    onConflict: { target: ['address', 'studio_id'], set: { kind: { $context: 'kind' }, reason: { $context: 'reason' } } },
  },
};

// Pinned twice: the WHERE names the verified pair, and the `mailer` reach in
// behaviors.ts pins the write to the same pair from scope — values that came
// from the token's own HMAC, never from a request body.
export const mailerOptOut: MutationEntry = {
  fingerprint: 'mailer/opt-out',
  intent: 'One person, one studio, no more marketing — the unsubscribe link, spent',
  mutation: {
    op: 'update',
    table: 'studio_people',
    set: { marketing_ok: false },
    where: { and: [{ eq: ['studio_people.studio_id', { $context: 'studioId' }] }, { eq: ['studio_people.person_id', { $context: 'personId' }] }] },
  },
};

// ─── transport: the lab's login picker ───────────────────────
//
// Two entries because the resolver's reverse joins are INNER: one walks the
// staff, one walks the anchors, and the caller merges (staff word wins).
// Served replays are tenant-pinned by each caller's own reach; the full
// cross-studio roster exists only for the `transport` role the lab executes as
// — and the LYRA_DEV_LOGIN gate in front of it stays.
export const transportStaffRoster: CacheEntry = {
  fingerprint: 'transport/staff-roster',
  intent: 'Everybody a studio employs, for the lab picker',
  shape: [{ person_id: '', name: '', email: '', studio: '', role: '' }],
  dsl: {
    from: ['staff', 'people', 'studios'],
    fields: [
      { field: 'people.id', as: 'person_id' },
      'people.name',
      'people.email',
      { field: 'studios.name', as: 'studio' },
      { field: 'staff.role', as: 'role' },
    ],
    filter: { eq: ['staff.active', true] },
    limit: 10000,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        person_id: { $get: { from: { $var: 'r' }, path: ['person_id'] } },
        name: { $get: { from: { $var: 'r' }, path: ['name'] } },
        email: { $get: { from: { $var: 'r' }, path: ['email'] } },
        studio: { $get: { from: { $var: 'r' }, path: ['studio'] } },
        role: { $get: { from: { $var: 'r' }, path: ['role'] } },
      },
    },
  },
};

export const transportMemberRoster: CacheEntry = {
  fingerprint: 'transport/member-roster',
  intent: 'Everybody a studio knows, for the lab picker',
  shape: [{ person_id: '', name: '', email: '', studio: '' }],
  dsl: {
    from: ['studio_people', 'people', 'studios'],
    fields: [
      { field: 'people.id', as: 'person_id' },
      'people.name',
      'people.email',
      { field: 'studios.name', as: 'studio' },
    ],
    limit: 10000,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        person_id: { $get: { from: { $var: 'r' }, path: ['person_id'] } },
        name: { $get: { from: { $var: 'r' }, path: ['name'] } },
        email: { $get: { from: { $var: 'r' }, path: ['email'] } },
        studio: { $get: { from: { $var: 'r' }, path: ['studio'] } },
      },
    },
  },
};

// ─── scheduler: the automations engine's own rows ────────────

export const schedulerReflexRows: CacheEntry = {
  fingerprint: 'scheduler/reflex-rows',
  intent: 'Every studio’s automation rows, for loading the reflex set',
  shape: [{ id: '', studio_id: '', moment: '', effect: '', enabled: false, run_at: '', days: 0, subject: '', body: '' }],
  dsl: {
    from: ['automations'],
    fields: ['automations.id', 'automations.studio_id', 'automations.moment', 'automations.effect', 'automations.enabled', 'automations.run_at', 'automations.days', 'automations.subject', 'automations.body'],
    limit: 10000,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        id: { $get: { from: { $var: 'r' }, path: ['id'] } },
        studio_id: { $get: { from: { $var: 'r' }, path: ['studio_id'] } },
        moment: { $get: { from: { $var: 'r' }, path: ['moment'] } },
        effect: { $get: { from: { $var: 'r' }, path: ['effect'] } },
        enabled: { $get: { from: { $var: 'r' }, path: ['enabled'] } },
        run_at: { $get: { from: { $var: 'r' }, path: ['run_at'], fallback: { $const: '' } } },
        days: { $get: { from: { $var: 'r' }, path: ['days'], fallback: { $const: 0 } } },
        subject: { $get: { from: { $var: 'r' }, path: ['subject'], fallback: { $const: '' } } },
        body: { $get: { from: { $var: 'r' }, path: ['body'], fallback: { $const: '' } } },
      },
    },
  },
};

export const schedulerStudioZones: CacheEntry = {
  fingerprint: 'scheduler/studio-zones',
  intent: 'Every studio and its clock zone, for composing the reflex set',
  shape: [{ id: '', timezone: '' }],
  dsl: {
    from: ['studios'],
    fields: ['studios.id', 'studios.timezone'],
    sort: [{ field: 'studios.id', dir: 'asc' }],
    limit: 10000,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        id: { $get: { from: { $var: 'r' }, path: ['id'] } },
        timezone: { $get: { from: { $var: 'r' }, path: ['timezone'] } },
      },
    },
  },
};
