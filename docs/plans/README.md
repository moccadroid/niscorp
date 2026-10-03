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
| [server-drawn-pages.md](server-drawn-pages.md) | **Built (2026-10-02)** | The first screen arriving with the page request, and pages. **Built:** moss draws a caller's shell into the app's `index.html` and the terminal adopts it; `app.pages` — a manifest at a path, drawn for whoever asks and kept by nothing; the needs-a-shell verdict (`livenessOf` in nova, `shellNeedOf` in moss), so a finished page opens no socket; pages as files; server-side React, Vue and DOM targets; the `nisc` command (`@niscorp/cli`); atrium and lyra wired. **Added 2026-10-03:** an app with its own shell — no moss — drawn ahead of time and adopted by its page (mythos wired); the shared dev plugin (`@niscorp/moss/vite`, what `nisc dev` runs). **Not built:** deep links into the app, an HttpOnly cookie, offline, the other apps. Keep §3 (whose decisions these were) and §5 — eight things that were wrong on the way, each a trap. |
| [versioning.md](versioning.md) | **Built (2026-09-26)** | Versioning the packages and the data. **Built:** Apache-2.0, consumable manifests with a pack smoke test, zod as a peer (floor 4.2.0) with a cross-copy check, nisc packages as peers, changesets + `@niscorp/nisc` + the breaking-dependents gate, the moss wire protocol version, golden credential hashes. **strata S0–S2 built:** one ledgered path for every table nisc owns (baselines adopt old databases); documents stamped and upgraded through grammar sequences with embeddings, at boot, intake and read. **S3–S6 built:** Prism's transform ops; the grammar gate with a 131-document corpus; `strata upgrade` for app source with committed locks; AGENTS.md rules 17–20. **npm publishing** (D12, which waited for strata S1–S4) ran on 2026-10-03: every package is on npm and releases go through CI — [`../releasing.md`](../releasing.md). |
| [lyra-campaigns.md](lyra-campaigns.md) | **Stage 0 built (2026-08-16)** | The studio writes to its people. **Built:** pick one of eight questions about your own roll, untick anyone, send — one campaign row, and machinery turns it into one outbox message per person who can honestly be written to, through the mail door that already existed. `campaigns-check` is the gate. **Not started:** the nova email adapter and its ten-block closed vocabulary, house templates wearing the studio's theme, the Book button, the block form, the asset pipeline, and the five-number report. D1, D4, D6, D7, D8 answered; D2 (where uploaded files live) and D5 (a real provider key) remain and gate Stage 2 and volume respectively. Keep G4–G7: four mechanisms the first draft got wrong, each falsified by the code it cited. Two named traps. |
| [lyra-defects.md](lyra-defects.md) | **In progress (2026-08-14)** | Defects from the 2026-08-13 product review: four member-facing bugs, the i18n coverage gap and the three structural leaks behind it, the unwired walk-in desk, the integration error contract, and a measured per-navigation memory growth in the shell. D1–D3 decided; Part 1, 2.7 and 6.1–6.4 landed; 4.3 dropped (no versioning in v1). |
| [lyra-identity.md](lyra-identity.md) | **Built** | Removing Lyra's in-memory directory, and the moss seam shapes that force one. DONE per its own scorecard: `server/users.ts` deleted, zero row-backed caches outside `dev/`, D1–D5 and D7–D9 ratified, D6 deferred behind a check. |
| [lyra-vex-parameters.md](lyra-vex-parameters.md) | **Built** | Selection as context values instead of fingerprints: the collapse (141 → 112), sorting, and optional context keys in vex. Kept for Part 1's list of collapses that were REFUSED and why, Part 4's design space, and Part 4.6 — four places the built thing departs from the design, including one merge withdrawn because two entries read different tables on purpose. |
| [lyra-mail.md](lyra-mail.md) | **Built** | Making the product able to send: one provider as platform, the magic link and automation mail through one route, consent end to end, bounces, caps and bring-your-own-domain. BYOD has never run against the live provider (send-only key). |
| [lyra-families.md](lyra-families.md) | **Built (2026-08-16)** | A parent acting for a child. §8 is the answer to Part R's research and the record of how it was built: the set-valued reach for reads, the write subject pinned by an engine-applied `$lookup` so a member write stays an overwrite rather than a check. Kept for §8.2's six findings — reach is per-entry, a new profile name is fail-OPEN per table, option D never did bend the identity law — and for the two places the built thing departs from the design (the status block names both).
| [lyra-stripe.md](lyra-stripe.md) | **Partially built** | Payments as an integration. The integration and the trust story ship; invoicing and tax do not. Part 6 lists what a human must supply. |
| [lyra-ux-review.md](lyra-ux-review.md) | **Acted on (2026-08-16)** — the file carries no status line | A review of Lyra's arrangement, not a build brief: every noun has a screen and almost no verb has a flow. §5 lists seven changes in order; the commits of 2026-08-16 carry them — the Selling hub, Business and Studio (`213617c`), the joining fee (`63a6c3e`), the signup journey (`91b6167`), the roll's lens strip (`f6136e1`). Kept for §2, the four things that were wrong and why. |
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
