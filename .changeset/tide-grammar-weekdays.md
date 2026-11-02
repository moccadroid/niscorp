---
'@niscorp/tide': patch
---

Tide has a grammar, a weekly clock may name several weekdays, and the reflex agent asks about any date or time that could mean more than one moment and never asks what to call an automation.

- **`@niscorp/tide/migrations`, a new entry point:** `TIDE_GRAMMAR`, the strata sequence `nisc.tide` with the documents `reflex` and `draft`, and `TIDE_SCHEMAS`. A host that keeps reflexes or drafts as documents keeps each with the grammar it was written at and upgrades it where it reads it. Version 1 is the weekday list below: it rewrites no stored document, and a reader at 0 refuses one that uses it.
- **A weekly clock on several weekdays:** `on` takes a list of different weekdays — `{ every: 'week', on: ['mon','tue','wed','thu','fri'], at: '07:30', tz }` is every weekday. Each named day is its own occurrence, keyed by its local date, as every weekly occurrence is. A list on any other clock, an empty list and a day named twice are refused.
- **Any date or time that could mean more than one moment is asked about, never guessed:** a day without its year, a time of day without morning or evening, a weekday whose week is not said. It was asked only about morning or evening.
- **A draft's `id` is a name the agent makes up and never asks for,** its description now says: it asked the person "what short name should I use" in 2 of about 56 runs. A host may store the reflex under an id of its own, as before.
- **31 is the last day of every month,** the `on` description now says; the agent refused "the last day of every month" as impossible.

**What to change:** nothing.
