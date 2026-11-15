---
"@niscorp/prism": patch
---

`$fill` is measured at every level it fills: nested slots that use one slot twice are refused with `E_BUDGET` at the string limit, instead of first building text hundreds of megabytes long.
