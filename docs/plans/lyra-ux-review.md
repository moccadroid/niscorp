# Lyra — a UX review of what is now built

Written 2026-08-15, after a session that closed most of the payments gaps. The
machinery is in good shape. The **arrangement** is not, and this is about that.

**The finding in one line:** every noun in this application has a screen, and
almost no verb has a flow. A studio owner can reach any fact and cannot follow
any errand from beginning to end.

---

## 1 — What is where today

| Hub | Holds | The job it is doing |
|---|---|---|
| **Check in** | Check in · Notices | running today |
| **People** | People · Staff | the roll |
| **Schedule** | Timetable · Classes · Class types | what runs, and when |
| **Money** | Pricing · Reports · Retention · *(Stripe) Money* | **selling AND reporting AND operating** |
| **Settings** | Appearance · Automations · Mail | the studio itself |
| **Add-ons** | the store | extending it |
| **Booking** *(member)* | Book a class · My classes · My membership · *(Stripe) Payment · Buy* | **everything a member does** |

Three of those cells hold more than one job. That is the whole problem.

## 2 — The four things actually wrong

### 2.1 "Money" is three jobs in a coat

`Pricing` is **setup** — deciding what the studio sells. `Reports` and
`Retention` are **analysis**. The Stripe ledger and payouts are **operations**.
They share a hub because they all involve numbers, which is not a reason.

The practical damage: nobody setting up a studio for the first time thinks *"I
will create my membership under Money."* They think Settings, or Products, or
Plans. The single most common setup task is behind the least likely word.

### 2.2 What a studio sells is split across two hubs

Plans, passes and one-offs are under **Money → Pricing**. Course blocks — which
carry their own price and are absolutely a thing a member pays for — are under
**Schedule → Classes**.

The split follows the DATA MODEL (D5: a course is a dated block with a capacity,
not a price-list row) and that decision is still right. But the model is not the
user's problem, and neither screen mentions the other. You have to already know
why a course is different in order to guess which hub to open.

**This one is mine.** I made the D5 call this session on data-modelling grounds
and did not ask what it costs somebody setting up a studio.

### 2.3 "Appearance" now lies about itself

The business identity added this session — legal name, address, VAT number,
company-or-sole-trader — lives on a screen called **Appearance**, whose own Hero
says *"Pick a look."* Those fields decide what a payment provider demands before
money can move. They are not a look.

### 2.4 The lens strip is one control doing three jobs

Nine chips: `Current · Members · Prospects · Passes · On a course · Staff ·
Contacts · Past · Everyone`.

**How it works, since you asked:** it is a fixed list of nine, defined once in
`LENSES` (`app/vex/member.entries.ts`) and used to build BOTH the chips and the
query — so they cannot drift apart, and a lens a caller invents matches no arm
and returns nothing. That part is good engineering. It is **not** dynamic, not
configurable, and not extensible by a studio.

The UX problem is that those nine are on **three different axes** flattened into
one strip:

- **time / status** — Current, Past, Everyone
- **relationship** — Members, Prospects, Staff, Contacts
- **what they hold** — Passes, On a course

So "Current" and "Passes" are not alternatives to each other in any sense a
person can feel, and there is no way to ask the ordinary question *"members who
hold a pass"* — the strip can only ever answer one of the three axes at a time.

---

## 3 — The two connection gaps you spotted

### 3.1 A joining fee cannot be charged

You can create one — **Money → Pricing → Add → A one-off** — name it, price it.
Nothing then charges it. It appears on the member's **Buy** screen as something
they could purchase voluntarily, which nobody will ever do.

What a studio means by "joining fee" is *charged once, when somebody joins*.
That connection does not exist: no offering can be marked as due at signup, and
the subscription checkout has no one-time line.

**It is buildable and not large.** A checkout session in subscription mode takes
mixed line items, so a plan marked *"joining fee: X"* becomes one card form
charging the fee once and the plan on repeat.

### 3.2 There is no signup journey

Every piece exists, in a different place:

1. create the person — **People → Person hinzufügen**
2. put them on a plan — open that person → **Plan** section → choose plan + how it is paid
3. take the joining fee — *nowhere*
4. set up their card — the MEMBER does it, from their own **Payment** screen

Somebody standing at a desk with a new customer in front of them has to visit
three screens and cannot complete the fourth at all. **They become a member at
step 2** — standing is derived from holding an active subscription, so the moment
that row exists they read as a member everywhere. That is a clean model and it is
invisible: nothing on the screen says *"they are a member now."*

---

## 4 — The arrangement I would propose

Same machinery, moved. Nothing here needs a model change except §3.1.

| Hub | Holds | Why |
|---|---|---|
| **Today** | Check in · Notices | unchanged; it is the landing screen and it works |
| **People** | People · Staff | unchanged |
| **Schedule** | Timetable · Classes · Class types | unchanged |
| **Selling** *(new)* | **Offers** · Courses *(linked)* | everything a member can pay for, in one place |
| **Money** | Payments · Payouts · Reports · Retention | what came in, what is owed, what is on its way |
| **Studio** *(was Settings)* | Business · Appearance · Mail · Automations · Add-ons | the studio itself, including who it legally is |

Four moves:

1. **`Pricing` leaves Money and becomes `Selling → Offers`.** Setup is not
   reporting.
2. **Course blocks appear on that list**, as rows that link into
   Schedule → Classes for editing. One list answers "what can somebody pay for",
   and the model stays exactly as it is.
3. **`Business` splits out of `Appearance`** — legal name, address, VAT, entity
   type, currency, country. Appearance keeps the look and the language.
4. **Add-ons moves under Studio.** It is configuration, not a peer of People.

### The lens strip, rebuilt

One primary axis in the strip, the other two as an optional second filter:

```
[ Current  ·  Everyone  ·  Past ]        holding: ( any ▾ )   [ search ]
                                                   membership
                                                   pass
                                                   course place
                                                   staff
                                                   contact
```

That makes "members who hold a pass" expressible, drops nine chips to three, and
keeps the closed-vocabulary property that makes the current one safe — the
second control is still a choice from a fixed list, not a filter somebody writes.

*Cost, stated honestly:* it is two context keys instead of one, so the entry's
guarded-OR grows a second dimension. That is real work in `member.entries.ts` and
it is the only item here that touches the read layer.

### The signup journey

One flow from the desk, reusing every mutation that already exists:

```
Add someone  →  name, email
             →  what are they on?     (plan · pass · nothing yet)
             →  joining fee?          (if the plan carries one)
             →  how is it paid        (card now · at the desk · comp)
             →  "Nina is a member. Her card is set up."
```

Nothing new underneath except §3.1's joining-fee line. It is a composition of
`people/enroll`, `subscriptions/start`, `purchases/record` and the existing
checkout — put in one order, with the ending said out loud.

---

## 5 — What I would do, in order

| # | Work | Size |
|---|---|---|
| 1 | `Business` splits out of `Appearance` | small |
| 2 | `Selling` hub; `Pricing` → `Offers`; label the Add button | small |
| 3 | Courses on the offers list, linked | small |
| 4 | Add-ons under Studio | trivial |
| 5 | Joining fee: an offering marked due-at-signup, charged in the same checkout | medium — touches the integration |
| 6 | The signup journey | medium — composition, no new machinery |
| 7 | Lens strip → one axis + a holding filter | medium — touches the read |

1–4 are arrangement and could land together. 5–7 each deserve their own change.

**Not in this list, deliberately:** anything that changes the data model. D5
stands, standing stays derived, offerings keep their kinds. Every problem above
is an arrangement problem, and the fix for an arrangement problem is not a
migration.
