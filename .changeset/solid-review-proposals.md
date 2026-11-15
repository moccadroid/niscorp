---
"@niscorp/solid": patch
---

A long reply no longer slows a stream down as it grows: a new key or a closing bracket now finalizes only the direct children of its container, where before it walked every container seen so far. 2,000 streamed rows took tens of seconds and now take tens of milliseconds, with the same events, values and order. DESIGN's "O(events)" for finalization is now true.

A write into a long list copies the list once and rebuilds only the elements it changed: 20,000 streamed numbers take about half the time.

README and DESIGN say that a number is shown as read so far, as a string is: `{"price":19` then `99}` shows 19, then 1999.
