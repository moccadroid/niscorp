---
"@niscorp/cli": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing, unless something relied on a repeated `immutable` answer from `nisc start` being the first answer's bytes, sent with a `content-length`.

`nisc start` no longer remembers compressed answers. It used to keep every compressed answer marked `immutable` by path and `last-modified` — not by query — so an app route answering `immutable` by `?user=` gave the second person the first person's body (`/thumb?user=bob` got Alice's thumbnail). Every answer is now compressed as it streams, as every other answer already was: the bytes a browser decodes are the same, a repeated asset answer comes without `content-length`, and it costs the compression again: about 9–11 ms for a 0.5–0.6 MB bundle and 19 ms for 2.3 MB, where answering from the remembered bytes took 0.4–0.7 ms — once per new browser, since `/assets/` files are kept a year.
