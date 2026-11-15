---
"create-nisc": patch
---

A folder that is a file, inside a file, or with a file where the app needs a folder (a file named `src`) is refused with a sentence that names it, and nothing is written; before, it failed with Node's own ENOTDIR, sometimes after writing part of the app.
An `item.json` of the wrong shape is refused when the templates are read, with the file and the field named.
