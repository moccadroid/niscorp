---
"@niscorp/solid": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on solid reading `Infinity`, hex (`0x1F`), a leading `+` or a leading `.` as numbers.

Only JSON numbers are read. `{"a":Infinity,"b":0x1F,"c":+5,"d":.5}` put `Infinity`, 1, 5 and 0.5 into `current()`; such text is now dropped, with no error, and each field keeps what it had. Valid JSON reads as before at every chunk boundary: `{"price":19.` then `99}` still shows 0, 19, 19.99.
