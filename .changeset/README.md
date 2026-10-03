# Changesets

Every change to a package ships with a changeset: `pnpm changeset`, pick the
packages, write the line that becomes the changelog entry.

Each `@niscorp` package versions on its own line; `@niscorp/nisc` pins the set.
A changeset is not a release: merging the "release: version packages" pull
request that the Release workflow keeps open is (docs/releasing.md).

**The bump is `patch`.** The packages are live on npm, and people we have never
met may be building on them: a release does not break an app that works on the
one before it (`STYLE_GUIDE.md`, "The packages are live").

A breaking bump — below 1.0 that is a **`minor`** — is a last resort, and it is
never yours to decide. The maintainer approves it before the change is written,
and its changeset says so on a line of its own:

```
BREAKING — approved by <who>, <date>: <what an app must change>
```

`pnpm check:changesets` refuses a breaking bump without that line, and CI
refuses the PR. For an approved one it lists the dependents that must move with
it — everything that depends or peers on a broken package breaks too.
