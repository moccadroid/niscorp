---
'@niscorp/prism': patch
---

`$map`, `$filter`, `$reduce`, `$sortBy`, `$groupBy` and `$keyBy` make one scope for the loop, not one for each item.

Each of them built a new context and a new set of variables for every item, to set the loop's variable. They now make that once, as the loop's own copy, and set the variable in it for each item. What a body sees, and what is outside the loop, is as before: a variable of the same name outside is what it was when the loop is done, and a loop inside the body has a scope of its own.

Over 10,000 orders: a total for each, 20.3 ms before and 13.4 ms now; filter, sort and take ten, 2.2 ms and 1.2 ms; a count and a sum by country, 3.6 ms and 2.1 ms; a count, a revenue and twenty rows, 15.6 ms and 9.6 ms.

**What to change:** nothing.
