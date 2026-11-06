---
'@niscorp/signal': patch
---

`decide()` can ask about images: `images` maps a uuid to an `ImageSource`, and a string in `state` equal to a uuid points at that image.

On `typesafe` the images go as the request's `assets` with the `TypeSafe-Danger-Zone-Images: true` header, so Jev answers about them with calibrated probabilities. TypeSafe takes PNG or JPEG data; a `url` image or another `mediaType` fails with `E_VALIDATION_FAILED` before the request. On a chat provider each image follows the state in the emulation message, after a label with its uuid; a model whose registry row says `multimodal: false` is refused before the request. A key that is not a uuid is refused on every provider.

A request without `images`, or with `images: {}`, is unchanged: TypeSafe gets the same body and headers, and a chat provider the same single text message.

**What to change:** nothing. A caller that posts images to TypeSafe itself can pass them to `decide()` instead.
