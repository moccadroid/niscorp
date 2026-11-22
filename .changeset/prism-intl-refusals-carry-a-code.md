---
"@niscorp/prism": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app caught a `RangeError` or `TypeError` by its class from `$localeDate` or `$localeNumber`; such a config always failed, and now fails with a `PrismError`.

`$localeDate` and `$localeNumber` options that pass the schema but that `Intl` refuses — `dateStyle` beside `weekday`, `minDigits` above `digits` — are a `PrismError` with code `E_SCHEMA`, the op and its place in the config ("$localeDate: Intl refused its options: …"), instead of a bare `TypeError` or `RangeError`. A zone or a locale `Intl` cannot read is still `E_TYPE`, as before.
