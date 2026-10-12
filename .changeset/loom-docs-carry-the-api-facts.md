---
'@niscorp/loom': patch
---

The README and DESIGN.md state twenty-nine facts about the API that were written only in source comments.

README: the compiler options `value`, `id`, `widgets`, `rootKey` and what an `empty` entry is; that `<LoomEditor>` reads `plugins` and `artifact` once; the `schema` option and the artifact shape of the prism, vex and nova plugins, and `layoutSchema`. DESIGN.md: how the array roles nest, the `recursive` mark, the `*` path segment of an array item, what a custom widget receives and `useModelWrite`, `mountView`, `editor.plugin`, `loom:column`, and the `PREVIEW` and `NODE` ids a plugin core exports.

No behaviour changed.

**What to change:** nothing.
