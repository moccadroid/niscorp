---
"@niscorp/nova": patch
"@niscorp/nisc": patch
---

`@niscorp/nova/examples` — the reference as data. `NOVA_EXAMPLES` is 34 examples, in five groups (`NOVA_EXAMPLE_GROUPS`): the layout grammar (12), actions at work (7), endpoints (3), composition with fragments (5) and shells (7).

An example is a small app, what is done to it, and what it must then say: `{ id, group, title, description, action | shell, fragments?, layouts?, replies?, fetches?, presses, expected }`. `action` is one action alone on one canvas (an example of the layout grammar is an action with no triggers); `shell` is several actions on several canvases. `replies` and `fetches` say what its endpoints are answered, so an example comes to the same thing wherever it is run. `presses` is what a reader does, and `expected` is every piece of text the screen then holds, the one action's data, and which actions stand on each canvas.

Every id an example brings begins with its own, so a host can hold all of them in one shell. The examples name only the plain components every kit has (`Stack`, `Text`, `Button`, `Input`) and nova's two slots, with no prop about looks, so whoever shows them draws them with its own kit. The package's tests run each one and hold it to its `expected`.

Not in it: i18n, the adapters' own seams (`slotWrapper`), and the look of nova's default components.

**What to change:** nothing.
