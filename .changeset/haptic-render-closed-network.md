---
'@niscorp/haptic': minor
'@niscorp/nisc': minor
---

**Haptic renders a page only where Node closes the network to the page's scripts: Node 25 or later.** jsdom is not a sandbox. A page's inline script reaches Node itself in the render process, and on Node 24 and earlier that process could open connections to any address (private and cloud-metadata addresses too, past the transport the app hands Haptic). It could also signal any process of the same user, or open the app's own inspector and run code in the app. Discovery renders any level where 3 or more links share one address with different texts, which the page's author decides. A run renders when the artifact says `render: true`.

Now the render process starts under Node's permission model with no network, which Node enforces from version 25, and `process.kill` and `process._debugProcess` are removed before the page runs. On Node 24 and earlier nothing is rendered: the page is read as fetched, as a page that cannot be rendered always was.

BREAKING — approved by moccadroid, 2026-11-17: run on Node 25 or later (26 is the LTS) to keep rendering pages. On Node 24 and earlier, an artifact with `render: true` and discovery on a page whose links a script writes read the page as fetched.

`@niscorp/nisc` installs Haptic, so it moves with it.
