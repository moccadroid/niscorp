---
'@niscorp/tide': patch
---

Tide has a grammar, a weekly clock may name several weekdays, and the reflex agent drafts a bare timer instead of refusing it and never asks what to call an automation.

- **`@niscorp/tide/migrations`, a new entry point:** `TIDE_GRAMMAR`, the strata sequence `nisc.tide` with the documents `reflex` and `draft`, and `TIDE_SCHEMAS`. A host that keeps reflexes or drafts as documents keeps each with the grammar it was written at and upgrades it where it reads it. Version 1 is the weekday list below: it rewrites no stored document, and a reader at 0 refuses one that uses it.
- **A weekly clock on several weekdays:** `on` takes a list of different weekdays — `{ every: 'week', on: ['mon','tue','wed','thu','fri'], at: '07:30', tz }` is every weekday. Each named day is its own occurrence, keyed by its local date, as every weekly occurrence is. A list on any other clock, an empty list and a day named twice are refused.
- **The reflex agent drafts a bare timer.** A request that names only a time — a timer, or a reminder with nothing else to do — now drafts the offered effect that tells the person, when there is one. Measured in Mira: without a host line saying so, 3 of 8 "start a 10 minute timer" were refused.
- **A draft's `id` is a name the agent makes up and never asks for,** its description now says: it asked the person "what short name should I use" in 2 of about 56 runs. A host may store the reflex under an id of its own, as before.
- **A correction is drafted, not asked about.** Handed a draft it wrote and a correction to it ("make it 10 instead"), the agent writes the corrected draft; it asked whether to make the change in 2 of 8 runs in Mira, where nothing is saved until the person saves it anyway.
- **A day named without its year is the next one to come.** "The last Saturday of September", asked in October, was drafted for the September just gone in 8 of 8 runs; the instructions now say a day with no year is next year's when this year's has passed.
- **31 is the last day of every month,** the `on` description now says; the agent refused "the last day of every month" as impossible.

**What to change:** nothing.
