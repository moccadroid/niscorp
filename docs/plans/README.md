# Development plans

Build briefs: documents written **to** an agent, each with a build order, the
decisions a human has to make, and what "done" looks like. One shelf, so a plan
is never discovered by accident three directories down.

**Every file here opens with a status line.** That is the rule this shelf
exists to enforce — a plan whose status is stale is worse than no plan, because
somebody will act on it. `tide-refactor.md` spent a session claiming nothing
had been implemented while most of it was running in production code.

| Plan | Status | What it is |
|---|---|---|
| [lyra-defects.md](lyra-defects.md) | **Not started** | Defects from the 2026-08-13 product review: four member-facing bugs, the i18n coverage gap and the three structural leaks behind it, the unwired walk-in desk, the pack error contract, and a measured per-navigation memory growth in the shell. Every item cited to a line and reproducible; carries three decisions (D1–D3) that gate parts of it. |
| [lyra-identity.md](lyra-identity.md) | **Not started** | Removing Lyra's in-memory directory, and the moss seam shapes that force one. Six standalone defects can land first; the rest carries eight decisions a human must make, one of which (session lifetime) gates everything. |
| [lyra-vex-parameters.md](lyra-vex-parameters.md) | **Built** | Selection as context values instead of fingerprints: the collapse (141 → 112), sorting, and optional context keys in vex. Kept for Part 1's list of collapses that were REFUSED and why, Part 4's design space, and Part 4.6 — four places the built thing departs from the design, including one merge withdrawn because two entries read different tables on purpose. |
| [lyra-mail.md](lyra-mail.md) | **Not started** | Making the product able to send: one provider, a `mail` pack, the magic link and automation mail through one route. Includes the consent work that becomes mandatory the moment anything sends. |
| [lyra-families.md](lyra-families.md) | **Not started** | A parent acting for a child. Carries a decision a human must make first — one option touches vex. |
| [lyra-stripe.md](lyra-stripe.md) | **Partially built** | Payments as an integration. The pack and the trust story ship; invoicing, receipts and tax do not. Part 6 lists what a human must supply. |
| [tide-refactor.md](tide-refactor.md) | **Largely built** | Kept for its verified-defect list and the two Part 6 items still open. [`packages/tide/DESIGN.md`](../../packages/tide/DESIGN.md) is what tide *is*. |
| [lyra-model-overhaul.md](lyra-model-overhaul.md) | **Built** | The person/relationship remodel. Kept because it records decisions D2–D5, which are load-bearing and written down nowhere else. |

## What does not live here

- **[`apps/lab/lyra/PLAN.md`](../../apps/lab/lyra/PLAN.md)** — what Lyra *is*,
  not a thing to go and build. It stays beside the app.
- **Design records** — [`I18N.md`](../I18N.md) and each package's `DESIGN.md`
  describe what was built and why, after the fact. A finished plan is history;
  a design record is current.
- **[`../archive/`](../archive)** — strategy and superseded requirements,
  including `automation-requirements.md`, the wishlist that produced tide.

## Finishing a plan

Do not delete it. Set the status to **Built**, and keep whatever it records
that nothing else does — usually the decisions and the reasoning, which is the
part that gets re-litigated. If it is fully superseded, say so in the status
line and point at what replaced it.
