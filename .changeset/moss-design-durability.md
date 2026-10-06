---
"@niscorp/moss": patch
---

DESIGN says what a rebuilt shell holds. "Durability" named a projection as the durable thing, and moss has built none ("Deliberately unbuilt" lists it). It now says the database is the durable thing: a shell is rebuilt on the next connection from definitions and whatever the app reads from rows as it builds, and evicting an idle shell, restarting the process and `reset` each cost what was only in the shell — the screens someone had opened, and what they had typed. Two source comments now say the same. No code changed.

**What to change:** nothing.
