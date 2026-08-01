// Atrium's Postgres schema, run once against PGlite at boot.
//
// Read it as three layers, because that is the whole architecture:
//
//   MIRRORED  — guests, stays, rooms, folio_lines. A PMS owns the truth; we keep
//               a projection so a shell renders without calling Opera, and so one
//               layout serves every backend. Each carries external_id + synced_at.
//
//   OURS      — properties, connectors, capabilities, surface_slots, issues,
//               tasks, messages, staff. None of this exists in a PMS.
//
//   RESOLVED  — live_capabilities and property_slots. Neither is authored and
//               neither is edited by hand: the connector sync recomputes both
//               from (connector live_version × property enablement). They are the
//               rows a shell actually reads, which is why shipping is a write.
//
// Vex introspects this DDL to compile the authored queries, so the foreign keys
// are load-bearing, not decoration.

export const DDL = /* sql */ `
  -- ─── ours: the integrator's own vocabulary ──────────────────

  -- OUR capability verbs, not a PMS's. "key.issue" — never "Opera mobile key".
  -- Connectors map into this list; that mapping is the entire integrator job,
  -- and it is why one guest layout serves two backends.
  -- The core flag marks a capability the APP implements itself, over its own
  -- tables, with no vendor behind it: reading a stay, messaging the desk,
  -- working the issue board, moving a room between states. Those are our
  -- product, and they must be live at a property whether or not any
  -- integration is reachable.
  --
  -- Without this column the app booted BLANK whenever the integrations service
  -- was down — not "with only its own surfaces", as the docs claimed, but with
  -- nothing at all, because every slot gates on a capability and the entire
  -- capability matrix arrived over the wire. A front desk staring at an empty
  -- page because a vendor process is restarting is not degrading honestly.
  --
  -- A capability that genuinely needs a vendor (a door credential, a spa
  -- diary, express checkout) stays false and stays dark until its connector
  -- reports it, which is the behaviour that was always intended.
  CREATE TABLE capabilities (
    id     TEXT PRIMARY KEY,
    label  TEXT NOT NULL,
    blurb  TEXT NOT NULL,
    core   BOOLEAN NOT NULL DEFAULT false
  );

  -- One row per integration we run. live_version is an audit figure (the build
  -- of our integration currently deployed); what a connector OFFERS is the set
  -- of enabled connector_capabilities rows — the vendor console edits those.
  --
  -- The kind column distinguishes the PMS (owns reservations) from a ticketing
  -- (owns issue categories) and any other class a hotel runs. A property binds
  -- to one connector per kind — hotels genuinely run a PMS AND a separate
  -- ticketing tool, and they never agree on which.
  CREATE TABLE connectors (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    vendor        TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'pms',
    live_version  INTEGER NOT NULL DEFAULT 1,
    service_url   TEXT NOT NULL,
    notes         TEXT NOT NULL DEFAULT ''
  );

  -- What each connector provides, and whether WE have switched it on. The
  -- vendor console toggles enabled and goes live — that is the deployment.
  -- version is provenance (which build of our integration introduced it),
  -- not a pointer anything resolves against.
  CREATE TABLE connector_capabilities (
    id             TEXT PRIMARY KEY,
    connector_id   TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    version        INTEGER NOT NULL DEFAULT 1,
    capability_id  TEXT NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
    enabled        BOOLEAN NOT NULL DEFAULT true
  );

  CREATE TABLE properties (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    city          TEXT NOT NULL,
    accent        TEXT NOT NULL DEFAULT 'sage',
    -- The PMS of record: where the reservation actually lives. A property runs
    -- more integrations than this (see property_connectors) — this one is the
    -- reservation source, kept here for the guest's "mirrored from …" line.
    connector_id  TEXT NOT NULL REFERENCES connectors(id),
    external_id   TEXT NOT NULL,
    synced_at     TIMESTAMPTZ
  );

  -- Every integration a property runs — its PMS and its ticketing tool and
  -- whatever else. This is what the resolver unions over: a capability is live
  -- if ANY of the property's connectors implements it at its live version and
  -- the property enabled it. Shipping the ticketing connector lights up report
  -- categories without touching the PMS.
  CREATE TABLE property_connectors (
    id            TEXT PRIMARY KEY,
    property_id   TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    connector_id  TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE
  );

  -- The menu a request action shows — spa treatments, housekeeping items, the
  -- categories a ticket can have. NOT authored in the app: each connector
  -- version ships its own, exactly like connector_capabilities, and a property
  -- gets whichever its live connectors provide. The kind column is the issue
  -- kind the option maps to, so a report category (climate) and a spa treatment
  -- (spa) land on the board correctly.
  CREATE TABLE request_options (
    id             TEXT PRIMARY KEY,
    connector_id   TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    version        INTEGER NOT NULL,
    capability_id  TEXT NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
    label          TEXT NOT NULL,
    detail         TEXT NOT NULL DEFAULT '',
    icon           TEXT NOT NULL DEFAULT 'dot',
    kind           TEXT NOT NULL DEFAULT 'other',
    -- Priced options (a minibar item, a paid late checkout) carry their charge
    -- here — shipped by the integration, posted by the action, never authored
    -- in a layout. Zero means free.
    amount         NUMERIC NOT NULL DEFAULT 0,
    position       INTEGER NOT NULL DEFAULT 0
  );

  -- What a property has turned on, out of what its connector can do. The
  -- intersection is the point: enabling something the connector cannot do is
  -- allowed and simply stays dark.
  CREATE TABLE property_capabilities (
    id             TEXT PRIMARY KEY,
    property_id    TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    capability_id  TEXT NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
    enabled        BOOLEAN NOT NULL DEFAULT true
  );

  -- The shipped catalog: every action that can ever be placed on a shell, what
  -- audience it belongs to, what capability it needs, and which stay states it
  -- applies to ('any' when it does not care). Authored by us, shipped as data.
  -- The concierge picks from here and can therefore never invent a service the
  -- hotel does not run.
  CREATE TABLE surface_slots (
    id             TEXT PRIMARY KEY,
    audience       TEXT NOT NULL,
    action_id      TEXT NOT NULL,
    title          TEXT NOT NULL,
    blurb          TEXT NOT NULL,
    icon           TEXT NOT NULL DEFAULT 'dot',
    capability_id  TEXT REFERENCES capabilities(id) ON DELETE CASCADE,
    stay_state     TEXT NOT NULL DEFAULT 'any',
    keywords       TEXT NOT NULL DEFAULT '',
    -- Who shipped this slot: 'core' for the app's own, a connector id for
    -- slots that arrived with an integration's bundle. Ownership is what lets
    -- a re-sync REPLACE one integration's slots without touching anyone
    -- else's.
    source         TEXT NOT NULL DEFAULT 'core',
    -- THE OPERATOR'S SWITCH — ours, estate-wide, and the only field in this
    -- table a running system writes. False takes the slot off every property
    -- at once, resolving as reason 'disabled', without touching what the
    -- connector offers or what a hotel enabled. It is how we retire a surface
    -- we shipped, and it is deliberately not a per-property control: a hotel
    -- switching a service off is property_capabilities, a vendor withdrawing
    -- one is connector_capabilities, and this is neither.
    enabled        BOOLEAN NOT NULL DEFAULT true,
    -- WHICH CANVAS this surface belongs on. A canvas is a stack; the shell
    -- layout arranges several of them, so a crew screen is a work column, a
    -- record column and an aside rather than one endless list. The same class
    -- of information as the position column — the shipper describes the
    -- surface, the shell decides where the canvases sit. Validated at intake
    -- against the shell's real canvas ids; anything unnamed is ordinary work.
    canvas         TEXT NOT NULL DEFAULT 'work',
    position       INTEGER NOT NULL DEFAULT 0
  );

  -- The integration BUNDLES: a capability arrives with the actions that make
  -- it usable — guest side and staff side, layouts inline, as rows. Loaded at
  -- boot into the manifest's action set; ring 1 covers them through audience
  -- namespace globs (ext.guest.*, ext.desk.*, ...). Shipping an action is
  -- writing a row; the server's refresh() lets living shells adopt it.
  CREATE TABLE bundle_actions (
    id            TEXT PRIMARY KEY,
    connector_id  TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    audience      TEXT NOT NULL,
    definition    JSONB NOT NULL
  );

  -- The bundles' QUERIES, same posture: pulled from the integrations service
  -- at sync, validated at intake, loaded at boot (into the manifest's entries,
  -- so vex_cache seeding covers them) and re-seeded live after a sync. The
  -- definition is the full SeedEntry/SeedMutation.
  CREATE TABLE bundle_entries (
    fingerprint   TEXT PRIMARY KEY,
    connector_id  TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    definition    JSONB NOT NULL
  );

  -- ─── resolved: written by the connector sync, read by every shell ──

  -- (property × capability) that is actually live right now — the connector's
  -- live version implements it AND the property enabled it.
  CREATE TABLE live_capabilities (
    id             TEXT PRIMARY KEY,
    property_id    TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    capability_id  TEXT NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
    version        INTEGER NOT NULL,
    resolved_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- The resolved surface: which slots are live at which property. This is the
  -- table a shell reads to know what to place. Nothing else decides.
  --
  -- The reason column records WHY a slot is dark, because the resolver is the only thing
  -- that knows: 'live', 'connector' (the live version does not implement it), or
  -- 'property' (implemented, but this property switched it off). Resolving it
  -- here is what keeps every layout free of capability arithmetic.
  CREATE TABLE property_slots (
    id           TEXT PRIMARY KEY,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    slot_id      TEXT NOT NULL REFERENCES surface_slots(id) ON DELETE CASCADE,
    live         BOOLEAN NOT NULL DEFAULT false,
    reason       TEXT NOT NULL DEFAULT 'live',
    resolved_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ─── mirrored: a PMS owns the truth ─────────────────────────

  -- status is the ONE room state, and it subsumes the out-of-order flag it
  -- replaced. A front desk lives on this column: a room is 'dirty' after a
  -- departure, 'clean' when housekeeping is done, 'inspected' when a supervisor
  -- has signed it off and it may be sold, 'out_of_order' when it may not be.
  -- Two columns for one state meant "out of order" and "not ready" were
  -- different questions with no way to ask the second — and releasing a room to
  -- an arriving guest, which is most of what a clerk does at four in the
  -- afternoon, had nowhere to be expressed.
  CREATE TABLE rooms (
    id            TEXT PRIMARY KEY,
    property_id   TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    number        TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'Double',
    floor         INTEGER NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'clean',
    external_id   TEXT NOT NULL,
    synced_at     TIMESTAMPTZ
  );

  -- language is the guest's own, mirrored from the PMS profile. Data only: a
  -- thread written in German is answered in German because the thread is in
  -- German, not because a field said so. It earns its column by being on the
  -- brief, where a clerk reads it before picking up the phone.
  CREATE TABLE guests (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    tier         TEXT NOT NULL DEFAULT 'none',
    language     TEXT NOT NULL DEFAULT 'en',
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    external_id  TEXT NOT NULL,
    synced_at    TIMESTAMPTZ
  );

  -- A block: a wedding party, a conference allocation, a tour. Groups arrive
  -- together and are the front desk's worst hour, which is exactly why they are
  -- worth naming — six stays that check in as one gesture rather than six.
  CREATE TABLE stay_groups (
    id           TEXT PRIMARY KEY,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    label        TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'group',
    note         TEXT NOT NULL DEFAULT ''
  );

  -- state: booked | arriving | in_house | departed. It gates which slots apply
  -- (express checkout does not exist before you have arrived).
  --
  -- eta is the arrival time the guest gave, as text ('16:30'), '' when they gave
  -- none — the same posture as wake_calls.call_at, and for the same reason: it
  -- is a time of day a person said, not an instant to do arithmetic on. It is
  -- what makes "arriving in twenty minutes" a fact rather than a guess.
  CREATE TABLE stays (
    id           TEXT PRIMARY KEY,
    guest_id     TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    room_id      TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    group_id     TEXT REFERENCES stay_groups(id) ON DELETE SET NULL,
    arrival      DATE NOT NULL,
    departure    DATE NOT NULL,
    eta          TEXT NOT NULL DEFAULT '',
    state        TEXT NOT NULL DEFAULT 'booked',
    adults       INTEGER NOT NULL DEFAULT 1,
    rate         NUMERIC NOT NULL DEFAULT 0,
    key_issued   BOOLEAN NOT NULL DEFAULT false,
    checked_in   BOOLEAN NOT NULL DEFAULT false,
    external_id  TEXT NOT NULL,
    synced_at    TIMESTAMPTZ
  );

  -- property_id is denormalised onto folio_lines and messages so tenant scope
  -- can filter them by the same rule as every other table — a row rule can only
  -- match a column the row actually carries, and a folio line reached only
  -- through its stay would otherwise have no property to match on.
  CREATE TABLE folio_lines (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    stay_id      TEXT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    description  TEXT NOT NULL,
    amount       NUMERIC NOT NULL DEFAULT 0,
    posted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A reversed charge, not a deleted one. Correcting a bill is a PMS
    -- feature (an integration ships the surface for it); the row stays so the
    -- folio remembers what was posted and taken off, which is how a bill
    -- works everywhere. Reads that total a stay exclude voided lines.
    voided_at    TIMESTAMPTZ,
    voided_by    TEXT
  );

  -- ─── ours: what happens in our system and nowhere else ───────

  CREATE TABLE staff (
    id           TEXT PRIMARY KEY,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    job          TEXT NOT NULL,
    -- How much of this person's screen the assistant is allowed to place:
    -- 'authored' (none — the app decides everything), 'mixed' (the assistant
    -- column only), 'full' (every working column). A ROW, so our own tool can
    -- move one clerk to 'full' for a demo without a deploy, and so the answer
    -- to "who let the AI do that" is a value somebody set rather than a build.
    layout_control TEXT NOT NULL DEFAULT 'mixed',
    -- Which model this person's assistant runs on: a KEY from MODELS
    -- (server/assistant/profiles.ts), never a model id. Provider and model have
    -- to move together, so one value names the pair. Empty means the persona
    -- row decides, which is the house default and what everybody starts on.
    --
    -- This is a BENCH DIAL, not a product feature. It is per-person so two
    -- people can run different models against the same house at the same time
    -- and the comparison means something; a real deployment would not offer a
    -- model picker to the front desk at all.
    assistant_model TEXT NOT NULL DEFAULT ''
  );

  -- Raised from a guest conversation or by staff. This is the row that ties the
  -- four audiences into one causal thread.
  CREATE TABLE issues (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    stay_id      TEXT REFERENCES stays(id) ON DELETE SET NULL,
    room_id      TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    kind         TEXT NOT NULL DEFAULT 'other',
    summary      TEXT NOT NULL,
    detail       TEXT NOT NULL DEFAULT '',
    severity     TEXT NOT NULL DEFAULT 'normal',
    status       TEXT NOT NULL DEFAULT 'open',
    raised_by    TEXT NOT NULL DEFAULT 'guest',
    raised_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at  TIMESTAMPTZ
  );

  -- detail is the words that travel with the job. A title fits on a docket; an
  -- escalation to a duty manager, or a room move that needs saying why, does
  -- not. Without it the only place to put a sentence was the title, which is
  -- how dockets end up unreadable on a phone.
  CREATE TABLE tasks (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    room_id      TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    issue_id     TEXT REFERENCES issues(id) ON DELETE CASCADE,
    stay_id      TEXT REFERENCES stays(id) ON DELETE SET NULL,
    title        TEXT NOT NULL,
    detail       TEXT NOT NULL DEFAULT '',
    kind         TEXT NOT NULL DEFAULT 'maintenance',
    status       TEXT NOT NULL DEFAULT 'open',
    assignee_id  TEXT REFERENCES staff(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE messages (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    stay_id      TEXT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    sender       TEXT NOT NULL DEFAULT 'guest',
    body         TEXT NOT NULL,
    sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- What the desk knows about a guest that no PMS field holds: wants a quiet
  -- floor, celebrating an anniversary, do not offer an upgrade — they complained
  -- about the last one. The oldest artefact in hotel-keeping and the one thing
  -- every front office actually runs on.
  --
  -- STAFF ONLY, and that is the point of it being its own table rather than a
  -- column on the stay: the charter grants it to the staff floor and to nobody
  -- else, so a note reading "difficult, watch the bill" can never resolve onto
  -- the shell of the person it is about. A guest-readable preference is a
  -- different thing and would be a different table.
  CREATE TABLE stay_notes (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    stay_id      TEXT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL DEFAULT 'note',
    body         TEXT NOT NULL,
    author       TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- The shift handover: what the outgoing clerk leaves the incoming one. Ours,
  -- property-scoped, and deliberately not per-person — a handover is addressed
  -- to whoever walks in next.
  CREATE TABLE handovers (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    author_id    TEXT REFERENCES staff(id) ON DELETE SET NULL,
    shift        TEXT NOT NULL DEFAULT 'day',
    body         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ─── mirrors the bundles work against (ours, tenant-scoped) ──

  -- Spa bookings — booked THROUGH the connector (it owns availability), then
  -- mirrored here so the diary, the guest's visits and the agent read rows.
  CREATE TABLE spa_bookings (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    stay_id      TEXT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    treatment    TEXT NOT NULL,
    slot_at      TIMESTAMPTZ NOT NULL,
    confirmation TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'booked',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Wake-up calls — the classic front-office morning sheet. A call set today is
  -- for tomorrow morning (hotel reality: you ask tonight); the DEFAULT computes
  -- that at insert time, so no fingerprint ever does date math.
  CREATE TABLE wake_calls (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    stay_id      TEXT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    call_on      DATE NOT NULL DEFAULT (now() + interval '1 day')::date,
    call_at      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'scheduled',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Airport transfers — booked THROUGH the connector (it holds the car
  -- contract), then mirrored here so the morning sheet, the guest's own card and
  -- the brief all read rows. Direction is 'arrival' or 'departure': the same
  -- table serves the car that meets a flight and the one that catches it.
  CREATE TABLE transfers (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    stay_id      TEXT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    direction    TEXT NOT NULL DEFAULT 'departure',
    pickup_on    DATE NOT NULL DEFAULT CURRENT_DATE,
    pickup_at    TEXT NOT NULL,
    destination  TEXT NOT NULL DEFAULT '',
    vehicle      TEXT NOT NULL DEFAULT '',
    confirmation TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'booked',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Guest requests that need a HUMAN yes: late checkout, upgrades. One table,
  -- kind + label + status — the desk approves or declines, the guest reads the
  -- answer back on their next look.
  CREATE TABLE stay_requests (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    stay_id      TEXT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL,
    label        TEXT NOT NULL,
    detail       TEXT NOT NULL DEFAULT '',
    -- The price the option carried when the guest asked. Approving a priced
    -- request posts this to the folio; zero posts a zero-rate line, which is
    -- how real folios record a comp.
    amount       NUMERIC NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- The assistants: one persona per audience — character, model, provider. Rows,
  -- like everything else that ships: retune a persona or move it to a different
  -- model by editing its row.
  CREATE TABLE assistants (
    id         TEXT PRIMARY KEY,
    audience   TEXT NOT NULL,
    name       TEXT NOT NULL,
    character  TEXT NOT NULL,
    model      TEXT NOT NULL,
    provider   TEXT NOT NULL DEFAULT 'groq'
  );

  -- When someone last LOOKED at something — append-only; the latest row per
  -- (user, topic) is the mark, and "unread" is anything newer. Personal by
  -- scope: your marks are yours. This is how a badge exists without any push:
  -- a login mounts, a mount reads, the read compares timestamps.
  CREATE TABLE seen_marks (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id      TEXT NOT NULL,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    topic        TEXT NOT NULL DEFAULT 'messages',
    seen_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- The assistant's memory — every turn a row, so a conversation survives
  -- logout, relogin, and being resumed as the same person a week later. The
  -- first genuinely PERSONAL table: user-scoped by behavior (your turns are
  -- yours, engine-enforced), property-stamped for tenancy.
  CREATE TABLE assistant_turns (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id      TEXT NOT NULL,
    property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'user',
    body         TEXT NOT NULL,
    -- Which way in produced this turn: 'chat' when a person asked, 'watch' when
    -- nobody did. The conversation is the chat rows alone — a watch line is a
    -- record of something the assistant DID, not something it said to anyone,
    -- and feeding those back as prior turns tells the chat agent it had a
    -- conversation it never had.
    origin       TEXT NOT NULL DEFAULT 'chat',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- One model run, as a row. Written through the governed wire like everything
  -- else, so it is pinned to the caller by the same personal scope behavior the
  -- conversation uses. Read cross-principal only through the operator seam,
  -- which is ours and key-gated.
  CREATE TABLE assistant_runs (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id       TEXT NOT NULL,
    property_id   TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    agent_id      TEXT NOT NULL,
    agent_path    TEXT NOT NULL DEFAULT '',
    label         TEXT NOT NULL,
    provider      TEXT NOT NULL,
    model         TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens  INTEGER NOT NULL DEFAULT 0,
    -- False when signal counted the call itself because the provider's streamed
    -- usage frame never arrived. The number is then an estimate, and a sum over
    -- mixed rows should say so.
    reported      BOOLEAN NOT NULL DEFAULT true,
    steps         INTEGER NOT NULL DEFAULT 0,
    elapsed_ms    INTEGER NOT NULL DEFAULT 0,
    outcome       TEXT NOT NULL DEFAULT 'ok',
    -- THE WHOLE EXCHANGE, as a JSON array of turns: every message that went out,
    -- every tool the model called with its arguments, every result that came
    -- back. One column because it is read by one pane and never queried across;
    -- a table of turns would be a schema serving nobody.
    --
    -- Large, and it carries whatever was on the person's screen — which is why
    -- the row is scoped to them like the conversation.
    turns         TEXT NOT NULL DEFAULT '[]',
    response      TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_stays_guest        ON stays(guest_id);
  CREATE INDEX idx_stays_property     ON stays(property_id);
  CREATE INDEX idx_stays_state        ON stays(state);
  CREATE INDEX idx_issues_property    ON issues(property_id);
  CREATE INDEX idx_issues_status      ON issues(status);
  CREATE INDEX idx_issues_stay        ON issues(stay_id);
  CREATE INDEX idx_tasks_property     ON tasks(property_id);
  CREATE INDEX idx_tasks_status       ON tasks(status);
  CREATE INDEX idx_slots_audience     ON surface_slots(audience);
  CREATE INDEX idx_pslots_property    ON property_slots(property_id);
  CREATE INDEX idx_livecaps_property  ON live_capabilities(property_id);
  CREATE INDEX idx_folio_stay         ON folio_lines(stay_id);
  CREATE INDEX idx_messages_stay      ON messages(stay_id);
  -- Tenant-scope filters land on property_id everywhere; index the columns the
  -- scope match adds to every read so the boundary is free, not a table scan.
  CREATE INDEX idx_guests_property    ON guests(property_id);
  CREATE INDEX idx_rooms_property     ON rooms(property_id);
  CREATE INDEX idx_staff_property     ON staff(property_id);
  CREATE INDEX idx_folio_property     ON folio_lines(property_id);
  CREATE INDEX idx_messages_property  ON messages(property_id);
  CREATE INDEX idx_propcon_property   ON property_connectors(property_id);
  CREATE INDEX idx_propcon_connector  ON property_connectors(connector_id);
  CREATE INDEX idx_reqopts_lookup     ON request_options(connector_id, capability_id);
  CREATE INDEX idx_turns_user         ON assistant_turns(user_id, created_at);
  CREATE INDEX idx_runs_user          ON assistant_runs(user_id, created_at);
  CREATE INDEX idx_seen_user          ON seen_marks(user_id, topic, seen_at);
  CREATE INDEX idx_spa_property       ON spa_bookings(property_id, slot_at);
  CREATE INDEX idx_wake_property      ON wake_calls(property_id, call_at);
  CREATE INDEX idx_sreq_property      ON stay_requests(property_id, status);
  CREATE INDEX idx_transfers_property ON transfers(property_id, pickup_on, pickup_at);
  CREATE INDEX idx_transfers_stay     ON transfers(stay_id);
  CREATE INDEX idx_notes_stay         ON stay_notes(stay_id, created_at);
  CREATE INDEX idx_notes_property     ON stay_notes(property_id);
  CREATE INDEX idx_handovers_property ON handovers(property_id, created_at);
  CREATE INDEX idx_stays_group        ON stays(group_id);
  CREATE INDEX idx_groups_property    ON stay_groups(property_id);
  CREATE INDEX idx_rooms_status       ON rooms(property_id, status);
  CREATE INDEX idx_tasks_stay         ON tasks(stay_id);
`;

// The tables the schema defines — the `data` universe is TABLES × verbs, which
// is what the charter's `data` section resolves against.
export const TABLES = [
  'capabilities',
  'connectors',
  'connector_capabilities',
  'properties',
  'property_connectors',
  'property_capabilities',
  'request_options',
  'surface_slots',
  'live_capabilities',
  'property_slots',
  'rooms',
  'guests',
  'stay_groups',
  'stays',
  'folio_lines',
  'staff',
  'issues',
  'tasks',
  'messages',
  'stay_notes',
  'handovers',
  'assistants',
  'assistant_turns',
  'seen_marks',
  'bundle_actions',
  'bundle_entries',
  'spa_bookings',
  'wake_calls',
  'transfers',
  'stay_requests',
] as const;
