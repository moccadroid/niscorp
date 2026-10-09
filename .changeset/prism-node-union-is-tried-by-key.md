---
'@niscorp/prism': patch
---

A valid config is checked in microseconds: the node schema tries the one member a value can be before it walks its union.

`NodeSchema` is a union of 76 members that zod tries in order, and a plain object is the last. Each plain object in a config cost about a quarter of a millisecond to accept, so `evaluate`, `validate` and `compile` each spent about half a millisecond on a config of three operators before doing anything. A value's keys decide what it can be: one `$` key and nothing else is that op, no `$` key is a template. That member is now tried first.

On a config of three operators (Node 24, zod 4.6.5; the same on zod 4.2.0):

| | before | now |
|---|---|---|
| `ConfigSchema.safeParse` | 505 µs | 1.9 µs |
| `evaluate` | 517 µs | 5.7 µs |
| `compile` | 652 µs | 79 µs |

A config that is refused is then walked as before, so what is refused, and every issue and path of the refusal, is unchanged; a refusal takes a few percent longer than it did (1.27 ms to 1.30–1.38 ms for one small refused config). `getConfigJsonSchema`, `getNodeJsonSchema` and `getProfileJsonSchema` return what they returned, and `NodeSchema` is still a zod union. `safeParseAsync` takes the walk alone and is as fast as it was.

The README, DOCS.md and DESIGN.md no longer say `execute` is "2-5x faster" than `evaluate`: it was 6 to 960 times before this change and is 1.7 to 65 times after it, by config.

**What to change:** nothing.
