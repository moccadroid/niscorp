---
'@niscorp/prism': patch
---

`execute` hands out a compiled config's constants frozen.

Every `execute` of an IR answers with the IR's own constants — a `$const` list or object, and anything the compiler folded because it did not depend on the source. A caller that wrote to one changed the IR, and so every later answer:

```ts
const ir = await compile({ tags: { $coalesce: [{ $ref: '$.tags' }, { $const: [] }] } });
const first = execute(ir, { tags: null });
first.tags.push('x');
execute(ir, { tags: null });   // { tags: ['x'] } — for the next caller too, whoever it was
```

Where an IR is kept and its answers go to different requests, as vex does with a query's mapping, that carried one request's change into the next. The constants are now frozen all the way down when a config is compiled, and again when an IR read back from storage first runs. `first.tags.push('x')` throws a `TypeError` where it is written.

`evaluate` is as it was: what it answers may be changed. So may everything `execute` builds for the call — a template's object, a `$map`'s list.

**What to change:** code that writes into an answer of `execute` (or of a vex read whose mapping has a constant list or object) now throws at that line, where it used to change later answers. Copy the part before changing it: `[...answer.tags, x]`.
