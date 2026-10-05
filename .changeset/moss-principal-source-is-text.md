---
"@niscorp/moss": patch
---

`src/principal.ts` is text again. One separator in `wearableOf` was written as a raw NUL byte where the same file writes the escape `'\0'` two functions down, so git treated the whole file as binary: its diffs showed `Bin`, and a text search (`git grep -I`) skipped the file that defines `wearableOf`, `resolveFor` and `verifyCharter`.

The byte is now the escape. The string it produces is the same one, and the built package is the same code: every built file is identical apart from the names of two chunks, which are hashes that take the embedded source text in.

**What to change:** nothing.
