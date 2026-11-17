---
"@niscorp/prism": patch
"create-nisc": patch
---

**`$localeDate` takes its zone from the source, and Prism's grammar is at version 4.** `options.timeZone` is a node, as `value` and `locale` already were: `{ "timeZone": { "$ref": "$.zone" } }` words a date where its reader is, so one mapping serves every zone instead of one config per zone. A written zone works as before and is still folded at compile time; a config with a bound zone compiles to one fingerprint, and `execute` reads the zone from each source.

A zone written in the program is still text or it is refused as the config is read, as before; what is new is an op there that reads one. A zone `Intl` does not know, written or read — or a bound one that is not text, `null` included — is refused with `E_TYPE` at `$localeDate.options.timeZone`, saying what it got. An unknown written zone used to escape as a bare `RangeError` from `Intl`; it is now a `PrismError`, which is still an `Error`. The zone is looked at after the date, so a bad date is still `E_DATE_INVALID` whatever the zone, and a written zone spends no step of the budget, as before.

**The grammar.** `nisc.prism` goes from 3 to 4 with one migration that rewrites nothing: this is an addition, and a reader at 3 must refuse a config with a bound zone.

**What to change:** an app that keeps Prism configs in its source moves its stamp: `npm run strata upgrade`, then `npm run strata verify`. There is nothing to edit; `strata.lock.json` goes to `nisc.prism 4`. A config written before parses to exactly what it did, so a compiled IR's fingerprint does not move. An app made by `create-nisc` from this release starts at `nisc.prism 4`.
