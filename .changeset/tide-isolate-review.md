---
'@niscorp/tide': patch
---

What 0.1.11's notes left out about `isolate` and the zone check.

- **A load that includes a clock zone `Intl` does not know now refuses whole**, with `invalid_reflex`, unless it passes `isolate: true`. On 0.1.10 such a load went through, and then every `advance` threw, so every automation stopped while the app kept serving. An app that loads its reflexes at boot from its own rows and does not catch the error now stops at boot instead.
- **`refused` has one entry for each reason a reflex was left out**, not one per reflex: a reflex that names an unregistered effect and watches the run of one that is not loaded is in it twice.
- **`LoadReport.refused` and `GraphRefusal.reflexIds` are required fields.** An app that builds a `LoadReport` or a `GraphReport` itself, such as a test fake, adds them, and an exact `toEqual` on a load report or on a load error's `details.refusals` sees them.

**What to change:** where a reflex's zone comes from a row, correct the zone, or load with `isolate: true` and log `refused`. Count reflexes left out by their distinct `reflexId`, not by the length of `refused`.
