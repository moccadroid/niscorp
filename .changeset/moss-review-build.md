---
"@niscorp/moss": patch
---

A webhook sent chunked, or with `Expect`, `Keep-Alive` or `Upgrade`, now reaches the integration's service instead of answering `502`: the door leaves those four headers behind.

A dev sign-in (`/dev/as/<who>`) that a proxy on this machine, such as a tunnel, carried for an address elsewhere is said in the dev log. It is answered as before.

A `Host` that writes out the scheme's own port (`app.example.com:443` for a page on `https://app.example.com`) no longer turns off cookie sign-in on the socket.

A server shell's endpoint that declares its own lower-case `authorization` header is now called as the session, as one spelt `Authorization` already was, instead of carrying both tokens and answering `401`.

`Authorization: bearer <token>` is read in any case of the scheme, as HTTP defines it, instead of being refused with `401`.
