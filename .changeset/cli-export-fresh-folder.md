---
"@niscorp/cli": patch
---

BREAKING (pending consolidation): nothing, unless an export on Windows relied on a path such as `/a\..\..\x` writing its file outside the export's folder.

`nisc export` writes every file into a fresh folder first (`.nisc-export-<process>-<id>`: for `out/`, in `node_modules/.cache/nisc/`, where git does not look; for a folder named with `--out`, inside it), and touches the export's folder only when every file was made. A path whose file the system will not make (on Windows, `/a:b`) or whose file would land outside the export's folder (on Windows, `/a\..\..\x`) is now said — `nisc: the path "/a:b" cannot be written here (ENOENT). Nothing was written.` — with exit code 1 and the folder as it was. Before, `/a:b` emptied `out/`, wrote part of the site and ended on a raw stack; `/a\..\..\x` wrote outside the folder (with the default `out/`, into the app's own folder) and exited 0. A write that fails for another reason, such as a full disk, says `nisc: the export could not be written into <out> (ENOSPC on <file>). Nothing already in it was changed.` The default `out/` is then emptied and copied from the build, with the same files and modes; a `.nisc-export-…` folder a killed export leaves is removed by the next export.
