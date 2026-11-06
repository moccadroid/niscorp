---
'@niscorp/prism': patch
---

An error says what the op got, where in the program, and the op's form, in its message. The message is what a caller passes on to a program's author, often a model that sees nothing else, and it said too little to fix anything: `Expected string for $trim`, `Path not found`, `Invalid config`.

- **A wrong type** names the value and where: `$trim needs text, but got an object: {"value":"Quarterly contributor outreach"}. … At $map.body.title.$trim. Form: {"$trim": <node>}`. Where the field was written as an object without a `$` key, it says such an object builds an object. The form is printed from the schema.
- **A path that found nothing** says where it stopped and what is there: `$ref "$.rows.name" stopped at "name": the value at $.rows is a list of 1 item: […], and a list is read by index, a number`. A missing key lists the keys there; a `$var` that is not there lists the variables in scope.
- **Inside a sugar op** the position is the author's: `At s.$sum, in the $add that $sum runs as.`
- **A refused config** puts its issues in `evaluate`'s message, as `compile` did, each with the form of the op it is on: `Invalid config: x: Unrecognized key: "fallback". Form: {"$trim": <node>}`. `validate`'s issue messages carry the same form.
- **An object whose only key names an op is checked as that op alone.** A reader of `ConfigSchema`'s issues that picks among a union's branches, as cortex's `flattenSchemaIssues` does, now gets the op's own issues (`$map/over: Unrecognized keys: "as", "body"`) instead of `$map: Invalid key in record`, and an op name that does not exist reads `Not a Prism op…`. Which configs are accepted is unchanged.
- The budget says where evaluation stopped; `E_NODE_SHAPE` puts the node in its message; `check: 'always'` names the first value of a source that is not plain JSON (`source.d is a Date`).

Codes, `PrismError`, `.context` (`op`, `path`, `details`) and every export are unchanged. `$assert`'s message is the program's own and is unchanged.

**What to change:** nothing. Code that compared a message's exact text gets the new text.
