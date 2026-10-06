---
"@niscorp/nisc": patch
---

AGENTS.md: every list states its `limit`, and a parent and its children are one batch.

The worked `todos/open` entry stated no `limit`, so the guide's own example was a list the engine would stop at 100 rows. It states one now, and "Using Vex" says why: a seeded entry reads at most the `limit` it states, and a list without one gets the default.

"Using Vex" also gains the batch form for a write that creates a parent and its children: `{ $returned: 'table.column' }` reads the row an earlier statement of the same batch wrote, and the bullet says what the reply of such a batch looks like.

**What to change:** nothing.
