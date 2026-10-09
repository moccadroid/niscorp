---
'@niscorp/prism': patch
---

`$eq` and `$neq` no longer write both values out as JSON to compare two scalars.

Two values are equal when their JSON text is, and Prism compared that text for every pair, `'paid'` against `'paid'` included. The text is now only made for two different objects or arrays: the same value is equal, and a scalar is equal to nothing but itself. Every pair is answered as before, keys in another order included.

A filter on two fields over 10,000 rows, then a sort and a take: 3.7 ms before, 2.2 ms now. A rule of three comparisons on one row: 361 ns before, 207 ns now.

**What to change:** nothing.
