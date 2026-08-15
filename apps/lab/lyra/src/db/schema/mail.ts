// Mail: what is queued to go out, and who we must not write to again.
export const MAIL_DDL = /* sql */ `
  CREATE TABLE outbox (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    studio_id   TEXT NOT NULL REFERENCES studios(id),
    person_id   TEXT REFERENCES people(id),
    channel     TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
    to_address  TEXT NOT NULL DEFAULT '',
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    -- FOUR STATES, AND 'sending' IS THE LOAD-BEARING ONE. Tide retries a failed
    -- task, and the case that bites is not a failure: the provider accepted the
    -- message and the acknowledgement never came back inside the timeout. A
    -- retry then sends it a second time. So the effect CLAIMS the row before it
    -- sends — 'queued' → 'sending', and it sends only if it won that update —
    -- and a retry finds 'sending' and stops. The provider's idempotency key is
    -- the second line of defence, never the only one.
    state       TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'sending', 'sent', 'failed')),
    -- WHAT HAPPENED, in enough detail to answer the only question anybody ever
    -- asks about mail. The provider's id is what support is quoted; the reason
    -- is in the provider's own words, because a studio that cannot see why
    -- nothing arrived asks us instead, every time.
    provider_message_id TEXT NOT NULL DEFAULT '',
    failed_reason       TEXT NOT NULL DEFAULT '',
    sent_at             TIMESTAMPTZ,
    -- WHEN THE CLAIM WAS TAKEN, which is the only thing that can ever free a
    -- row stuck in 'sending'. The effect claims, sends, and records; a process
    -- that dies between the first and the third leaves a row nobody will look
    -- at again and no state can distinguish from one that is simply mid-flight.
    -- A sweep needs an age to act on, and an age needs a timestamp somebody
    -- wrote down BEFORE the thing that might not come back.
    claimed_at          TIMESTAMPTZ,
    -- WHEN IT ACTUALLY ARRIVED, which is a different fact from when the
    -- provider accepted it. A state of 'sent' means "they took it"; this column
    -- is the only thing that can say more, and it is filled by the webhook.
    -- Deliberately a column and not a fifth state: the screen's vocabulary
    -- stays as it is until somebody decides what a studio should read.
    delivered_at        TIMESTAMPTZ,
    -- IS THIS MARKETING? Carried on the ROW because the thing that sends is a
    -- reflex woken by the row, and by then the moment that queued it is out of
    -- reach. It decides two things at the wire: an unsubscribe footer, and the
    -- List-Unsubscribe headers the large mailbox providers now expect. A class
    -- reminder is not marketing and gets neither.
    marketing   BOOLEAN NOT NULL DEFAULT false,
    source      TEXT NOT NULL DEFAULT '',
    created_on  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX outbox_studio ON outbox (studio_id, created_on);

  -- ── WHO WE MUST NOT WRITE TO AGAIN ──────────────────────────
  --
  -- A shared sending domain is a shared reputation: one studio mailing dead
  -- addresses or collecting spam complaints degrades delivery for every other
  -- studio sending from it. This is the list that stops that, written by the
  -- provider's own webhook rather than by anybody's opinion.
  --
  -- An EMPTY studio_id means everybody. A hard bounce is a fact about the
  -- ADDRESS — it does not exist — so it holds across studios. A complaint is a
  -- fact about a RELATIONSHIP: this person does not want this studio's mail,
  -- and suppressing them everywhere would punish a studio they never
  -- complained about.
  CREATE TABLE mail_suppressions (
    address    TEXT NOT NULL,
    studio_id  TEXT NOT NULL DEFAULT '',
    kind       TEXT NOT NULL CHECK (kind IN ('bounced', 'complained')),
    reason     TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (address, studio_id)
  );
`;
