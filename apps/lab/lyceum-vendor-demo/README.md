# lyceum-vendor-demo

Somebody else's integration, for lyceum's talk. It stands in for a third party
("Acme") shipping UI into an app it does not own.

It is not part of lyceum. Nothing in lyceum imports it. It is published as a
static file on GitHub Pages — `https://moccadroid.github.io/niscorp/vendor/bundle`
— and lyceum learns of it the way it would learn of any integration: the
speaker installs it from the controller, moss fetches that URL, intake checks
it, the speaker approves it, and its screen appears on every phone.

What it ships is data only: two screens (`ext.member.acme.*`), written in
lyceum's component vocabulary and calling lyceum's own queries. There is no
Acme server. No Acme code runs anywhere.

`vendor-broken/bundle` is the same bundle with a trigger that re-emits its own
channel — a loop. Intake refuses it, and says where the loop is.

    pnpm publish:to <dir>    # writes <dir>/vendor/bundle and <dir>/vendor-broken/bundle
