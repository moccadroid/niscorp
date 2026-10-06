---
"@niscorp/moss": patch
---

With `shellFrameDelta` on, a canvas whose frame is over 64 KB is sent whole, and no longer compared.

Encoding a delta costs the server in proportion to the size of the two frames, not of the change, and it does the work on the thread every session shares. Nothing bounded it. Measured on the encoder alone: a 0.3 MB frame held the thread 65 ms for one changed letter, a 2.7 MB frame over a second, and at 20 MB it ran for eight seconds, took a gigabyte and failed — after which the frame was sent whole anyway. Every session on the process waited each time. A large frame needs nothing unusual: a long table, or one long value in a bound field, which any terminal can send. Now a change is sent whole, with no encode, when the frame the terminals hold or the frame replacing it is longer than 64 KB — where an in-place change measured about 7 ms.

Nothing moves with `shellFrameDelta` off (the default), for a terminal that did not ask for deltas, or on a canvas whose frames are at most 64 KB: those are byte for byte what they were. The rendered tree is the same in every case.

**What to change:** nothing. With deltas on, a change to a canvas over 64 KB now costs that canvas's whole frame on the wire — what a terminal that never asked for deltas is sent — where it had cost a delta, after the encode.
