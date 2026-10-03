# Releasing to npm

The `@niscorp` packages are published by one workflow,
[`.github/workflows/release.yml`](../.github/workflows/release.yml), and by
nothing else. **A push is not a release.**

## How a release happens

1. **A change carries a changeset.** `pnpm changeset`: pick the packages, pick
   the bump (below 1.0 a minor is breaking), write the line that becomes the
   changelog. CI refuses a pull request that changes a package without one, and
   `pnpm check:changesets` says which dependents must break with a breaking
   release.
2. **The changeset reaches main.** After Verify passes on that commit, the
   Release workflow opens a pull request, *release: version packages*, or
   updates the one already open: every pending changeset turned into version
   bumps and `CHANGELOG.md` entries. Nothing is published. More changesets
   landing just update that pull request.
3. **Merging that pull request is the release.** Its commit carries the new
   versions and no changesets; once Verify passes on it, the workflow publishes
   every package whose version is not on npm yet, tags each one
   (`@niscorp/nova@0.2.0`), and makes a GitHub release.

A push with no changesets and nothing new to publish does nothing.

**How CI logs in:** it doesn't hold a credential. npm's
[trusted publishing](https://docs.npmjs.com/trusted-publishers): GitHub vouches
for this repository, this workflow file and the `npm` environment, and each
package accepts exactly that. Every release carries
[provenance](https://docs.npmjs.com/generating-provenance-statements) — a
verifiable statement of the commit and workflow that built it.

## The first release — once, by hand

**Done: 2026-10-03.** Every `@niscorp` package went out at 0.1.0 this way, and
every release since has been the workflow's. What follows is the record, and
the procedure a new package repeats (below, "A new package").

npm only lets a package trust a workflow once the package exists, so 0.1.0 was
published from a terminal: every package at 0.1.0 with everything in it, and no
pending changesets.

You need: an npm account that is an owner (or admin) of the `niscorp`
organization — that is what publishing `@niscorp/…` takes; two-factor
authentication on it; and npm 11.15 or later (for `npm trust`). npm 12 does not
run on Node 25; `npm install --global npm@11` does.

```bash
npm login
```

```bash
pnpm release:first
```

It checks, in order, and stops at the first thing that is not right with what
to do about it: on `main` with nothing uncommitted; npm new enough; logged in;
a member of `niscorp` allowed to publish; which packages npm does not have yet.
Then it builds the packages, runs `check:packages` (what CI runs), publishes
(`pnpm release` — `changeset publish`, asking for a two-factor code), and makes
each package it published trust the Release workflow (`pnpm npm:trust <package>
…`: `npm trust github <package> --file release.yml --repo moccadroid/niscorp
--env npm --allow-publish`; with no names, every published package). Run it
again after a stop: what is already published is
skipped, and so is a package that already trusts the workflow.

`pnpm release:first --dry-run` runs every check, the build and npm's own dry
run, and publishes nothing.

Then, when you like:

- push the tags the publish made: `git push origin --tags`;
- on npmjs.com, for each package, *Settings* → *Publishing access*: **Require
  two-factor authentication and disallow tokens** — from then on the only way
  to publish is the workflow.

## Turning the workflow on

In the GitHub repository:

- *Settings → Actions → General → Workflow permissions*: allow GitHub Actions to
  **create and approve pull requests** (the version pull request).
- *Settings → Secrets and variables → Actions → Variables*: `NPM_RELEASE` =
  `on`. Until it is, the workflow skips — there is nothing it could publish
  before the steps above.
- *Settings → Environments*: the `npm` environment appears on the first run.
  Add required reviewers there if a person should approve every publish.

## What can go wrong

- **A publish fails with an authentication error in CI.** The package does not
  trust this workflow (a new package — run `pnpm npm:trust` for it after its
  first publish), or the workflow file or the environment was renamed: the
  trust names both.
- **A new package.** Its first version is published by hand like the first
  release, then `pnpm npm:trust`, then tokens disallowed. Until then it is
  `"private": true`, or the Release workflow would try to publish it and fail —
  it cannot, the package does not exist yet. To publish it: release whatever it
  depends on first, then in one commit drop `"private"`, and run
  `pnpm release:first` (it publishes what npm lacks and sets the trust).

## create-nisc

`create-nisc` (`npm create nisc`) pins a new app to the nisc release its
templates were checked against: the versions are written into it when it is
built (`packages/create-nisc/tsup.config.ts`), never looked up. So it has to be
released whenever that set moves — and it is: `create-nisc` and `@niscorp/nisc`
are a **fixed** pair in `.changeset/config.json`, one version, bumped together,
and `@niscorp/nisc` moves whenever any member does.

Two things follow:

- **A template change needs a changeset naming `create-nisc`.** The templates
  are private workspace packages of their own (so CI can build and check them),
  which means Changesets does not notice a change to one as a change to
  `create-nisc`. Without the changeset, the fix is merged and never shipped.
- **It was first published by hand** (`pnpm release:first`), as every new
  package is, at the version of the `@niscorp/nisc` it carried — 0.2.0, on
  2026-10-03.

## Not set up

- **Pre-releases.** Changesets' `pre` mode and snapshot releases (`next`,
  `canary` dist-tags) are not wired.
