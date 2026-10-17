---
'@niscorp/moss': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

`server.defaults(publisher)` publishes every kind a person saves: an action, a fragment and a read, beside a layout.

- **An action or a fragment is given its id by whoever publishes it**, as a shipped one has one: `server.defaults(who).save([{ kind: 'action', id: 'promo', body }])`. One without an id is refused (`moss: a published action is given its id by whoever publishes it: name it.`), and so is one under `generated.`. The charter grants it by that id: a new id needs a grant, and one that is a shipped action's or fragment's replaces the build's for everybody until it is reset.
- **A read vex wrote is published under its fingerprint**, `save([{ kind: 'read', id: '<fingerprint>' }])`, and is answered to everybody, nobody signed in included, after what the caller saved themselves. One under the fingerprint of a shipped entry is refused. A generated action anybody saves may replay it.
- **Checked as a person's save is, as the publisher, and then as a manifest.** An action's `fn:` calls are ones the publisher's roles grant and its reads ones they may replay; then the whole set in force is verified as a set handed over is, and a holder whose roles do not grant a call refuses the publish: `Publish refused — actions call functions the app does not have, or that their holders’ charter does not grant:`.
- **A default that no longer passes under a new build is left out, and the build's copies stand**, with a line said once per read of the rows: `[moss] what is published for everybody is left out, and the build’s copies stand: …`.
- `publishedArtifacts(saved, publisher)` of the running manifest takes who publishes, for the roles and reads a publish is held to; `server.defaults` resolves them from the publisher's principal.
