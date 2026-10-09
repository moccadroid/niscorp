---
'@niscorp/prism': patch
---

Two things Prism answered wrongly without a word are now refused.

**A path it does not read.** A `$ref` path is keys and indexes, as DOCS.md says: `$.rows[0].sku`. The rest of JSONPath — a wildcard `[*]`, a filter `[?(…)]`, a slice `[0:2]`, a negative index, a quoted key `['name']`, empty brackets, `..` — was accepted by the schema, and the parser gave up on it with no segments, which reads as `$`. So `{ "$ref": "$.rows[*].sku" }` answered the whole source, and `$..sku` was read as `$.sku`. Such a path is now refused when the config is checked: `validate`, `evaluate` and `compile` give `E_SCHEMA` at the `$ref`, "Not a path Prism reads: … A path is keys and indexes only …; for every item of a list use $map or $pluck." An IR that already holds one is refused when it runs.

**A sort key that is a list or an object.** `$sortBy` compares numbers and strings. For any other key it compared nothing, so `by: [a, b]` handed the list back in the order it came. It now throws `E_TYPE` and says what to write: sort by the second key, then by the first; the sort keeps the order of equal items.

`getConfigJsonSchema` and the grammar snapshot are unchanged: the path rule is the parser's, beside the published pattern, not in it.

**What to change:** a config with such a path or such a key was already answering wrongly; it now says so. Write the path with `$map` or `$pluck`, and the two-key sort as two sorts. Nothing in this repository, nisc-website, moccadroid-website or midas had one. Still as it was: a sort key that is `null`, a boolean, or a number beside a string compares as equal to everything, so such items keep no defined place.
