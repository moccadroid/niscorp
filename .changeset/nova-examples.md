---
"@niscorp/nova": patch
"@niscorp/nisc": patch
---

`@niscorp/nova/examples` — the reference as data, begun. `NOVA_EXAMPLES` is 14 examples (`{ id, group, title, description, action, presses, expected }`): eight of the layout grammar (paths, templates, conditions, loops, directives) and six of actions at work (a counter, a toggle, a list, an input bound with `model`, a mount hook, `reset`). Every example is an action, the smallest thing nova runs; one of the layout grammar is an action with no triggers. `presses` is what a reader does to it, and `expected` is the action's data afterwards and every piece of text the screen then holds. `NOVA_EXAMPLE_GROUPS` names the groups.

The examples name only the plain components every kit has (`Stack`, `Text`, `Button`, `Input`) and no prop about looks, so whoever shows them mounts the action in a shell of its own and draws it with its own kit. The package's tests run each one and hold it to its `expected`. Fragments, shells of several canvases and i18n are not in it yet.

**What to change:** nothing.
