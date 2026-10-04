---
"@niscorp/nova": patch
"@niscorp/nisc": patch
---

`@niscorp/nova/examples` — the reference as data. `NOVA_EXAMPLES` is 42 examples, in six groups (`NOVA_EXAMPLE_GROUPS`): the layout grammar (12), actions at work (7), endpoints (5), composition with fragments (5), shells (8) and i18n (5).

An example is a small app, what is done to it, and what it must then say: `{ id, group, title, description, action | shell, fragments?, layouts?, replies?, fetches?, phrases?, phraseKeys?, stage?, presses, expected }`. `action` is one action alone on one canvas (an example of the layout grammar is an action with no triggers); `shell` is several actions on several canvases. `replies` and `fetches` say what its endpoints are answered, so an example comes to the same thing wherever it is run. `presses` is what is done: a press, something typed, or the host changing the language. `expected` is every piece of text the screen then holds (its text, and what stands in props at a prose key), the one action's data, which actions stand on each canvas, and what was sent to each URL.

Every id an example brings begins with its own, so a host can hold all of them in one shell. The examples a host puts on its stage name only the plain components every kit has (`Stack`, `Text`, `Button`, `Input`) and nova's two slots, with no prop about looks, so whoever shows them draws them with its own kit. An example with `stage: false` (the five on i18n) is shown as what it comes to. The package's tests run each one and hold it to its `expected`.

Not in it: the adapters' own seams (`slotWrapper`), the look of nova's default components, and the harvest functions of `@niscorp/nova/i18n`, which are called, not mounted.

**What to change:** nothing.
