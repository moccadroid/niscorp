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

npm only lets a package trust a workflow once the package exists, so 0.1.0 is
published from a terminal. Every package starts at 0.1.0 with everything in it;
there are no pending changesets.

You need: publish rights on the `niscorp` npm organization, two-factor
authentication on that account, and npm 11.15 or later (for `npm trust`).

```bash
npm install --global npm@latest
```

```bash
npm login
```

```bash
pnpm install && pnpm turbo build --filter="./packages/*"
```

```bash
pnpm release
```

`pnpm release` is `changeset publish`: it publishes each package whose version
is not on npm yet — all thirteen, the first time — asking for a two-factor code
as it goes, and tags each one locally. If it stops halfway (a code timed out,
the network), run it again: what is already published is skipped.

```bash
git push origin --tags
```

Then tell every package to trust the Release workflow:

```bash
pnpm npm:trust
```

It runs `npm trust github <package> --file .github/workflows/release.yml --repo
moccadroid/niscorp --env npm --allow-publish` for each published package and
prints one `[pass]`/`[fail]` line per package.

Then, for each package on npmjs.com → *Settings* → *Publishing access*:
**Require two-factor authentication and disallow tokens.** From then on the
only way to publish is the workflow.

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
  release, then `pnpm npm:trust`, then tokens disallowed.
- **Half a release.** `changeset publish` skips what is already on npm, so
  re-running the workflow (*Actions → Release → Run workflow*) publishes the
  rest.
- **The version pull request shows no checks.** GitHub runs no workflows for a
  pull request opened by the workflow's own token. Its contents are versions and
  changelogs; Verify runs on the commit that merging it makes, and the release
  waits for that.

## Not set up

- **`create-nisc`.** `npm create nisc` needs a package of that name. Claim it
  before somebody else does — even as a placeholder — when `nisc create` is
  built.
- **Pre-releases.** Changesets' `pre` mode and snapshot releases (`next`,
  `canary` dist-tags) are not wired.
