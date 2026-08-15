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
| [lyra-defects.md](lyra-defects.md) | **In progress (2026-08-14)** | Defects from the 2026-08-13 product review: four member-facing bugs, the i18n coverage gap and the three structural leaks behind it, the unwired walk-in desk, the integration error contract, and a measured per-navigation memory growth in the shell. D1–D3 decided; Part 1, 2.7 and 6.1–6.4 landed; 4.3 dropped (no versioning in v1). |
| [lyra-identity.md](lyra-identity.md) | **Built** | Removing Lyra's in-memory directory, and the moss seam shapes that force one. DONE per its own scorecard: `server/users.ts` deleted, zero row-backed caches outside `dev/`, D1–D5 and D7–D9 ratified, D6 deferred behind a check. |
| [lyra-vex-parameters.md](lyra-vex-parameters.md) | **Built** | Selection as context values instead of fingerprints: the collapse (141 → 112), sorting, and optional context keys in vex. Kept for Part 1's list of collapses that were REFUSED and why, Part 4's design space, and Part 4.6 — four places the built thing departs from the design, including one merge withdrawn because two entries read different tables on purpose. |
| [lyra-mail.md](lyra-mail.md) | **Built** | Making the product able to send: one provider as platform, the magic link and automation mail through one route, consent end to end, bounces, caps and bring-your-own-domain. BYOD has never run against the live provider (send-only key). |
| [lyra-families.md](lyra-families.md) | **Not started** | A parent acting for a child. Carries a decision a human must make first — one option touches vex. |
| [lyra-stripe.md](lyra-stripe.md) | **Partially built** | Payments as an integration. The integration and the trust story ship; invoicing and tax do not. Part 6 lists what a human must supply. |
| [lyra-stripe-review.md](lyra-stripe-review.md) | **Live** | The 2026-08-15 audit of both sides, with what has since been fixed marked. Supersedes lyra-stripe.md where they disagree, and holds the open questions only a human can answer. |
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
