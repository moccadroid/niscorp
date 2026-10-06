---
"@niscorp/moss": patch
---

A terminal's session token no longer rides the socket's address. It is offered in a header of the same request, and a token in the address is not read.

**The setup this stops working for:** a terminal and a server that are not the same version. The wire protocol is now 2 and the server speaks nothing older, so a terminal built before this is refused with `client_too_old` and a `4426` close — the existing "reload to get the current build" path — and a terminal built after it is refused by an older server with `server_too_old`. An app's terminal and server are one package and deploy together, so in practice this is a tab left open across the deploy: it reloads once. Three things written by hand also change:

- **A terminal written by hand** (`new WebSocket(`…/socket?token=…`)`, as a check or a script does) names the protocol and offers the token: `new WebSocket(`${base}/socket?protocol=${PROTOCOL}`, offerToken(token))`. `PROTOCOL` and `offerToken` are exported from `@niscorp/moss`; `offerToken(null)` is a terminal that is nobody.
- **A `WireEnv` of your own**: `socket` takes `{ url, offered }` where it took `url`, and constructs `new WebSocket(url, offered)`. One argument on purpose — an env that kept the old shape would have gone on compiling and connected everybody as nobody; this way it does not compile.
- **A transport of your own** (anything that is not `attachSocket`) hands over what the request offered: `connection.upgrade = { offered }`, the `Sec-WebSocket-Protocol` header split on commas, and answers the subprotocol `nisc`. Without it every terminal is served as nobody.

Why. The token rode the upgrade's query string, and an address is what every proxy, load balancer and access log between a browser and the app writes down. The request has one header every host lets a terminal set, a browser included: the subprotocols it offers. So the terminal offers `nisc`, and beside it its token, base64url (a subprotocol is an HTTP token; a session token need not be); the server answers `nisc` and never the other. Who a terminal is is still decided on the upgrade request, before anything is served, so there is no connection that is open and waiting to be told. A server that kept reading `?token=` for older terminals would have kept the address open for as long as anything used it, which is why protocol 1 is refused rather than served.

**What to change:** nothing in an app that uses `createWire` with `browserEnv()` or `nodeEnv()` and serves with `serve`, `nisc start`, the vite plugin or `attachSocket`. Otherwise one of the three above. Anything that read `?token=` off the socket's address — a proxy rule, a check — no longer finds it there.
