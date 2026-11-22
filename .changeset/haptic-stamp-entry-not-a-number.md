---
"@niscorp/haptic": patch
---

BREAKING (pending consolidation): nothing unless an app passes `prepareArtifact` an artifact whose `stamp` has an entry that is not a number of migrations (`{ "nisc.haptic": "v0" }`); it now throws `ArtifactError` with code `UPGRADE`, where it accepted the artifact unmigrated.

`prepareArtifact` refuses an artifact whose `stamp` entry for `nisc.haptic` or `nisc.prism` reads as no number, with `ArtifactError('UPGRADE')` and strata's sentence ("The stamp's entry for nisc.haptic is \"v0\": not a number of migrations."). It read such an entry as current and ran no migration. Stamps haptic writes are always numbers.
