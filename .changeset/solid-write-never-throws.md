---
"@niscorp/solid": patch
---

`write()` no longer throws on a string that begins outside any container.

Two ways led there. In `mode: 'trust'`, a quoted word in the text around the reply — `write('Here is the "best" option:\n')` — threw `TypeError: Cannot read properties of undefined (reading '0')`, and the reply after it was never read. And a stream whose schema is a bare `z.string()` threw the same error on `write('"hello"')`, in every mode.

Neither throws now. In `trust` the quoted word is passed over and the reply that follows is read as usual. A string root still receives nothing: its value stays the initial one, as a number or boolean root's already does, and nothing is reported — a stream reads a reply that is an object or an array.

What `recover` and `strict` do with text around the reply is unchanged.

**What to change:** nothing.
