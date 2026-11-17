---
"@niscorp/prism": patch
---

**`$localeDate` takes its zone from the source, and Prism's grammar is at version 4.** `options.timeZone` is a node, as `value` and `locale` already were: `{ "timeZone": { "$ref": "$.zone" } }` words a date where its reader is, so one mapping serves every zone instead of one config per zone. A written zone works as before and is still folded at compile time; a config with a bound zone compiles to one fingerprint, and `execute` reads the zone from each source.

A zone `Intl` does not know, written or read — or a bound one that is not text, `null` included — is refused with `E_TYPE` at `$localeDate.options.timeZone`, saying what it got. An unknown written zone used to escape as a bare `RangeError` from `Intl`; it is now a `PrismError`, which is still an `Error`.

**The grammar.** `nisc.prism` goes from 3 to 4 with one migration that rewrites nothing: this is an addition, and a reader at 3 must refuse a config with a bound zone.

**What to change:** an app that keeps Prism configs in its source moves its stamp: `npm run strata upgrade`, then `npm run strata verify`. There is nothing to edit; `strata.lock.json` goes to `nisc.prism 4`. A config written before parses to exactly what it did, so a compiled IR's fingerprint does not move. The exported `IntlDateOptions` type reads `timeZone` as a node (`unknown`), as it reads `locale`.
