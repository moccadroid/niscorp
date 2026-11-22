---
"@niscorp/cli": patch
---

BREAKING (pending consolidation): nothing, unless an export on Windows relied on a path such as `/a\..\..\x` writing its file outside the export's folder.

`nisc export` writes every file into a fresh folder first (`.nisc-export-<process>-<id>`, beside `out/` or inside a folder named with `--out`), and touches the export's folder only when every file was made. A path whose file the system will not make (on Windows, `/a:b`) or whose file would land outside the export's folder (on Windows, `/a\..\..\x`) is now said — `nisc: the path "/a:b" cannot be written here (ENOENT). Nothing was written.` — with exit code 1 and the folder as it was. Before, `/a:b` emptied `out/`, wrote part of the site and ended on a raw stack; `/a\..\..\x` wrote outside the folder and exited 0. The default `out/` is still emptied and written as before (same files, same modes); a `.nisc-export-…` folder a killed export leaves beside it is removed by the next export.
