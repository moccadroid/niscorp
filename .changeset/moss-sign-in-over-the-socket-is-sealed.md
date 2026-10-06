---
"@niscorp/moss": patch
---

A sign-in made over the socket no longer hands the page its token. It reaches the page sealed, and only that browser can open it.

`session.grant(token)` happens on a socket, and a socket cannot write a cookie — so the token has to travel through the page to the terminal's next upgrade, where the session cookie is written. It used to travel as itself, which for that moment put it where any script in the page could take it. Now it travels encrypted with a key the browser holds in a second cookie no script can read (the *seal*), given by the answer to the browser's first upgrade. The page hands the sealed sign-in back and cannot open it; neither can anybody it is shown to, on this machine or another — without that browser's seal it opens nothing, and after a minute it opens nothing at all.

**The setup this stops working for:** none that worked. What is new for a browser: a terminal on `browserEnv()` now names `sealed=1` in the socket's address, and a browser that opens a socket to its app is given one more cookie — `nisc.seal` (`__Http-nisc.seal` over https): `HttpOnly`, `SameSite=Lax`, sent with the socket's path and no other, kept until the browser closes. It is given whether or not anybody signs in. It is a key, not a name: it is not stored or looked up on the server, and no page request carries it, so a page drawn for nobody stays cacheable for everybody.

- **Any credential, any number of processes.** Nothing is kept on the server between the sign-in and the upgrade that completes it, so it does not matter which process answers either, and the token can be moss's own or an app's provider's.
- **Terminals that keep their own token are handed it as before:** a process on `nodeEnv`, a page served from another origin, a `WireEnv` without `tokens.held`, a transport that cannot answer an upgrade late. `{ type: 'session', token }` is unchanged for them.
- **A browser that does not keep the seal** — it sends none back with the sealed sign-in — is told (`seal_not_kept`); its terminal stops asking, and the next sign-in reaches it as a token. That costs such a browser one failed sign-in.
- **A terminal written by hand** that wants sealed sign-ins: `?sealed=1` on the address from the app's own origin; a `{ type: 'session', sealed }` message is offered back with `offerToken(null, sealed)`.

The seal's name over https is what keeps a script from supplying it: the seal is given after the page's script has started, and a script already running then could otherwise set one of its own first and open the sign-in that follows. `__Http-` is a name a browser lets only an HTTP answer set. Not closed: a browser that does not know that prefix treats it as any other name; and a server on a sibling subdomain can still set one, which with a script in the page as well is the same opening.

**What to change:** nothing.
