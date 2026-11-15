---
"create-nisc": patch
---

Its source is made of modules (`command`, `generate`, `catalog`); the command, its exports and the apps it makes are the same.
The question asked about a folder that is not empty says it `already has` that many things in it; the README and the templates' comments and words are reworded to match.
A new app behind moss (classic or model-first) checks that its charter reads every key it is given: `npm run check` fails on a misspelt key such as `denny`. Apps made before are not changed.
