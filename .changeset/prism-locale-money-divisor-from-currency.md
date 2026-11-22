---
"@niscorp/prism": patch
---

BREAKING (pending consolidation): nothing unless a config handed `$localeMoney` or `$localeNumber` a list, a boolean, hex text or blank text as the amount (now `E_TYPE`), or relied on `$localeMoney` dividing by 100 for a locale `Intl` cannot read.

`$localeMoney` takes the minor-unit divisor from the currency alone, so a locale tag `Intl` cannot read no longer changes the amount: 1500 JPY with locale `en_US` prints `JPY 1500` (was `JPY 15.00`). `$localeMoney` and `$localeNumber` read `value` as `$toNumber` reads text: a number, or digits with spaces around them (`" 1999 "`). `[1999]`, `true`, `"0x10"` and `"   "` are refused with `E_TYPE`; they used to print `19,99 €`, `0,01 €`, `0,16 €` and `0,00 €`.
