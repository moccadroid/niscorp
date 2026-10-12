---
'@niscorp/vex': patch
---

A read with more than one parameterised subquery compiles, and each subquery binds its own values.

A subquery was compiled apart from its parent, so its parameters were numbered from `$1` again while its values were appended to the parent's list. One parameterised subquery in first place worked. Two of them, or a parameter of the parent ahead of one, produced a statement Postgres refuses (`bind message supplies 2 parameters, but prepared statement requires 1`). A scope rule on a table inside a subquery is such a parameter, so two subqueries over scoped tables were refused as well.

A subquery now compiles into its parent's parameter list, as an `exists` already did. A read that compiled before compiles to the same SQL.

**What to change:** nothing. A read that was rewritten to avoid two parameterised subqueries (conditional sums over one source, say) can be written with the subqueries again; it does not have to be.
