---
"@niscorp/cortex": patch
---

The README and DESIGN say which approval id a resumed run answers to. No code changed.

`resumeRun` re-asks a pending approval: the resumed run's gates run again for the pending call, and `approval-required` fires again with a new id. DESIGN called the id "stable" and the README said approvals survive restarts, which read as if the id in the snapshot could be answered on the resumed run. It cannot: `resumed.approve(snapshot.pending.approvalId)` does nothing — an id a handle did not ask under is ignored — and with no `policy.approvalTimeoutMs` the run then waits.

Both documents now say so: answer with the id of the resumed run's own `approval-required` event, as the README's example already does; `snapshot.pending.approvalId` names the ask of the run the snapshot was taken from. DESIGN also says that when the gates no longer ask on resume, the pending call simply runs. A test holds the re-ask and its new id.

**What to change:** nothing if you answer from the `approval-required` event. If you kept `snapshot.pending.approvalId` to answer with after `resumeRun`, answer with the id of the resumed run's event instead.
