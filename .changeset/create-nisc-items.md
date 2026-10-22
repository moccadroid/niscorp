---
'create-nisc': patch
'@niscorp/nisc': patch
---

`npm create nisc` makes an app from items instead of four whole templates. Each answer is a folder under `templates/` — `moss` or `page`, `react` or `dom`, and the kind of app — with its files, its files for another item (`with/<item>/`), its `package.json` fragment, the keys it asks for and its lines in AGENTS.md and PLAN.md; the questions are `templates/questions.json`. The command names no item, so a new kit, shell or kind of app is a new folder, and its flag follows from it. The four apps it made before come out as they were, but for a sentence: the welcome screen no longer says which kit draws it, PLAN.md's scaffold step says "the files `npm create nisc` wrote", and AGENTS.md's line for `nisc.config.ts` is one sentence for both shells.

An item that needs keys asks for them masked, after the questions, and writes them to `.env` (`.env.example` gets the names); with no terminal they are read from the environment, never from a flag. `--workspace` keeps `workspace:^` ranges, for an app made inside the nisc repository.
