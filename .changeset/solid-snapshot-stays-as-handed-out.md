---
"@niscorp/solid": patch
---

A value from `current()` or `on()` no longer changes after it was handed out.

When a piece of the reply ended right after a row's `{` or a list's `[`, the snapshot held the parser's own working object for that row or list — the one it goes on writing into. A value a consumer had kept, `{"rows":[{}]}` say, gained the row's keys as later pieces arrived, without `on()` saying so for that value. Fed a reply character by character, 4 of the 20 values delivered to `on()` changed after delivery.

A container the parser has only just opened is now copied into the snapshot. Nothing about sharing moves: across a reply fed character by character, in pieces ending right after an opener, and in one write, the same subtrees keep and change their references at every write as before, and every `on()` listener on the root and on selections is called the same number of times.

**What to change:** nothing.
