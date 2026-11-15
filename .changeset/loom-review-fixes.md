---
"@niscorp/loom": patch
---

Renaming a key to a name another entry has (a prism template field, a vex aggregate or compute alias) is refused instead of deleting the other entry; "Add" in the vex aggregate and compute widgets picks a free alias; a vex compute operand can be typed as a decimal ("1." stays on screen).

The prism node chooser lists every prism op under a category, taken from prism's own example groups, so `$fill`, `$has`, `$walk`, the locale ops and others are no longer missing from it.

Two recursive documents in one plugin each render their own nested levels: a recursive template is named after its action (`loom:tree:<action id>:<n>`) instead of `loom:tree:<n>`.
