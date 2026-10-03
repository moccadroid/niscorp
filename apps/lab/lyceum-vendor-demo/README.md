# lyceum-vendor-demo

Somebody else's integration, for lyceum's talk. It stands in for a third party
("The QA Company") shipping UI into an app it does not own.

It is not part of lyceum. Nothing lyceum runs imports it — only its
`integration-check`, which serves this bundle from a local server to stand in
for the other domain. It is published as a
static file on GitHub Pages — `https://moccadroid.github.io/niscorp/vendor/bundle`
— and lyceum learns of it the way it would learn of any integration: the
speaker installs it from the controller, moss fetches that URL, intake checks
it, the speaker approves it, and its screens appear where it said they go.

What it ships is data only: three actions, written in lyceum's component
vocabulary and calling lyceum's own queries, each attached to a seat lyceum
offers — `ext.member.qa.ask` on every phone (ask a question),
`ext.speaker.qa.questions` on the controller (every question, and whether
lyceum's moderator found it fit to show), `ext.stage.qa.questions` on the
last slide (only the fit ones). There is no the QA Company server. No the QA Company code runs
anywhere.

`vendor-broken/bundle` is the same bundle with a trigger that re-emits its own
channel — a loop. Intake refuses it, and says where the loop is.

    pnpm publish:to <dir>    # writes <dir>/vendor/bundle and <dir>/vendor-broken/bundle
