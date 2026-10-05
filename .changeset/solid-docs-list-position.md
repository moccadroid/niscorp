---
"@niscorp/solid": patch
---

README says what a rejected list element leaves behind. "Keep the prior valid one" holds where the list held a value at that position. Where it held nothing there, a rejected element that is followed by an accepted one leaves `undefined` at its position: `{"seats":["C4",5,"C6"]}` against `z.array(z.string())` with an empty initial list gives `['C4', undefined, 'C6']`, which the schema itself refuses. `onError` names the position, and `constraints: 'finalize'` reports the list again when it closes. A rejected element in last place leaves the list one short. Two tests now hold this. No code changed.

**What to change:** nothing. Code that maps over a streamed list in `recover` mode can meet `undefined` in it after an `onError` for that list.
