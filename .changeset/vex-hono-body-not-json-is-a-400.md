---
"@niscorp/vex": patch
---

The Hono adapter answers a body that is not JSON with 400 `invalid_request`, not 500.

`POST`, `PATCH` and `DELETE` parsed the body unguarded, so a parse failure threw out of the route: text, a multipart or urlencoded form, truncated JSON, or no body at all was answered `500 Internal Server Error` in plain text, with the `SyntaxError` on the server's log — a server fault for what is the request's mistake, and the one failure on this surface without the `{ error, message }` shape. It is now `400 { "error": "invalid_request", "message": "Body must be JSON" }`, on a locked endpoint as well. A moss app's vex surfaces (`/api/vex`, `/api/<resource>/vex`) are this adapter, so they answer the same.

Nothing else moves. Every request that was answered before is answered the same, byte for byte: JSON of the wrong shape keeps its own 400; JSON sent as `text/plain` or with no content type is still read (the content type is never looked at); `getScope` still runs before the body is read; `onExecute` hears nothing for a body that was never a request, as before. The body is still read through hono's own `c.req.json()`, so a middleware that read it first shares hono's cache with the adapter exactly as before, on every hono 4. Only the parse failing is caught — a body that cannot be read at all, or a stream that broke, still throws. The Express adapter was not affected: it is handed `req.body` and already answered 400.

**What to change:** nothing, unless something of yours was built on the 500. A host's own `onError` (or a middleware reading `c.error`) no longer sees a `SyntaxError` for these requests — the response is the 400 above, not the one the handler made. A client that retried on 5xx stops retrying them. A nova endpoint aimed at a vex url with no `request` declared now fails with `@error.status` 400 and the message `Body must be JSON`, where it had 500 and `HTTP 500`.
