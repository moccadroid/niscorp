---
"@niscorp/tide": patch
---

BREAKING (pending consolidation): nothing unless an app relied on the reflex agent answering a draft whose one-shot clock names a date that does not exist; such a draft now goes back to the model in the same run, which costs one more model call.

The reflex agent (`@niscorp/tide/agent`) sends back a draft whose one-shot clock names a date that does not exist (`{ clock: { at: '2026-02-30T10:00' } }`, which would fire on 2 March), for the model to correct in the same run, whatever its reasoning says. It accepted such a draft.
