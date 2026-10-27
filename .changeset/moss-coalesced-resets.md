---
'@niscorp/moss': patch
---

Resets of a shell that arrive while another waits for its turn are answered by that one: a burst of `reset` messages costs two builds at most, the one under way and one more. A reset is still never answered by the build already under way.

Before, every `reset` message from any terminal, signed in or not, queued a whole build of its own: 200 messages were 200 builds, each asking who the person is and what they hold, and running the app's `inputs`, `phrases`, `functions` and `seeds`.
