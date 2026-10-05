---
"@niscorp/loom": patch
---

The kit's select writes the chosen option's own value, so an enum whose values are numbers can be set.

`LoomSelect` wrote the `<select>`'s text. For `z.enum({ stalls: 1, circle: 2 })` the options are offered as `"1"` and `"2"`, and choosing one wrote the string `"2"` — which the schema refuses (`Invalid option: expected one of 1|2`), so a document that was valid became invalid by picking a listed option, and no choice in the list could make it valid again.

It now writes the value of the option that was chosen: `2`. An enum of strings is written exactly as before, an enum of digit strings (`z.enum(['1', '2'])`) stays strings, and a mixed one (`{ a: 'x', b: 2 }`) writes each as it is.

**What to change:** nothing.
