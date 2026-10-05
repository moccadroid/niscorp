---
"@niscorp/loom": patch
---

README and DESIGN say what `_errors` and `validations` hold, and what the built-in select displays. They hold the messages a form shows, not the verdict on a document:

- They are written after a change. A new document, or a stored one just opened, has an empty `validations` until its first edit.
- A problem with no path is written nowhere: a `.refine()` on the whole object leaves `_errors` empty while the schema refuses the document. Given a `path`, its message lands at that field.
- A message on a container is dropped when a field inside it has one too.
- A field inside a list item or a recursive template binds no error slot: its message is in the tree and is not drawn at the field.

To decide whether a document may be kept, parse it: `schema.safeParse(editor.documents.<name>)`.

An enum with no `.default()` starts with no value in the document, and the built-in select displays its first option all the same; a `.default()` starts the two agreeing. The doc comment on `validations` says what it is, and tests hold each of these. No code changed.

**What to change:** nothing. A host that enables Save when `validations` is empty is not asking whether the document is valid.
