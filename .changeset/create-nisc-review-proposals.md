---
"create-nisc": patch
---

Its source is made of modules (`command`, `generate`, `catalog`); the command, its exports and the apps it makes are the same.
The question asked about a folder that is not empty says it `already has` that many things in it; the README and the templates' comments and words are reworded to match.
A new app behind moss (classic or model-first) checks that its charter reads every key it is given: `npm run check` fails on a misspelt key such as `denny`. Apps made before are not changed.
A `.gitignore` that is a folder, or an `.env` that is a folder when the app asks for keys, is refused with the sentence that names what is in the way, and nothing is written; before, it failed with Node's own EISDIR.
An `.env` that already sets a key as `NAME = value` or `export NAME=value` no longer gains an empty `NAME=` after it when the key is left empty, which hid the key from Node. A key that is given is added as before.
The "Next" lines quote a folder whose path has a space or a shell character: `cd "with space\app"`.
The README's `env` row names an option's `hint`, which the question shows.
A new model-first app reads its own `.env` wherever the command is run from (`nisc build --root app` from the folder above found no key before).
A new model-first app's words match its code: the `ask` function's description says it is sent `{ asked }`, and its AGENTS.md names `begin` and `said` and counts the tour's places right.
