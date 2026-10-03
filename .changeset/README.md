# Changesets

Every change to a package ships with a changeset: `pnpm changeset`, pick the
packages, pick the bump, write the line that becomes the changelog entry.

Each `@niscorp` package versions on its own line; `@niscorp/nisc` pins the set.
A changeset is not a release: merging the "release: version packages" pull
request that the Release workflow keeps open is (docs/releasing.md).
Below 1.0 a **minor is breaking**. When you break a package, everything that
depends or peers on it breaks with it — `pnpm check:changesets` lists which
lines to add, and CI refuses the PR until they are there.
