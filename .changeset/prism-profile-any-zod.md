---
"@niscorp/prism": patch
"@niscorp/nisc": patch
---

`getProfileJsonSchema` reads a described reference in either spelling. For drafts 4–7, zod writes `allOf: [{ $ref }]` in every version but 4.3, so on any other zod in the peer range the draft-7 profile threw — and `@niscorp/prism/agent` and `@niscorp/vex/agent`, which build it when they load, failed to import.
