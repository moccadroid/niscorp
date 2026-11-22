---
"@niscorp/cortex": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on `run.approve` or `run.deny` on a parent run's handle doing nothing for an approval its delegated agent asked.

An approval asked inside a delegated agent (`asTool`, `manifold.asTool`) is now answered through the parent run's handle: `run.approve(id)` or `run.deny(id)` with the id of the nested `approval-required` event reaches the child, at any depth. Before, it was ignored, and the child waited until the delegation's time limit. An answer through the child's own handle (the manifold's `onRun`) works as before; the first answer counts.

`ToolContext` has a new optional member, `forwardApprovals(handle)`, for a tool that runs an agent itself: it passes the parent's answers on to that run and returns a function that stops it. The README shows the three lines. The parent's snapshot carries no nested approval, so a nested approval does not survive a reload; a delegated agent runs under its own policy and gates, not the parent run's `gates`. The README now says both.
