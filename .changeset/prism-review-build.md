---
"@niscorp/prism": patch
---

`$fill` is measured at every level it fills: nested slots that use one slot twice are refused with `E_BUDGET` at the string limit, instead of first building text hundreds of megabytes long.

`__optional` leaves out a field whose `$get` runs into `null` or a missing key, as it already left out a `$ref` to a missing path. The error without `__optional` is unchanged (`E_TYPE`); it now carries `details.absent: true`.
