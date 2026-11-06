---
'@niscorp/cortex': patch
---

A tool call whose arguments fail their schema is told which field is wrong, as an output is. The loop printed zod's top-level issues as they were, so a union in a tool's input came back as `: Invalid input`; it now goes through `flattenSchemaIssues`, as output does (`view.title: Invalid input: expected string, received undefined`).

`flattenSchemaIssues` reports a record key that breaks its rule with the rule's own message (`scores.Bad: keys are lower-case letters`) instead of zod's outer `Invalid key in record`. `SchemaIssue` gains two optional fields, `issues` and `origin`, which zod's issues already carry.

How a branch of a failed union is chosen is unchanged.

**What to change:** nothing.
