---
'@niscorp/prism': patch
---

Three things `execute` did on every call, or for every node, that it did not need to.

- An op's handler in a compiled tree was a function around the op, so every node was two calls. It is the op.
- A template built a set of its optional field names and caught errors for each field, whether or not it had a `__optional`. One without it, which is nearly every template, now just evaluates its fields.
- `execute` primed the path cache from the IR's path table on every call. It does so once for each IR, when it restores the IR's annotations.

Four fields picked and renamed: 305 ns before, 232 ns now. A nested shape with mapped lines: 1.56 µs and 1.29 µs. A total for each of 10,000 orders: 13.4 ms and 12.6 ms. Answers are as they were.

**What to change:** nothing.
