# Haptic

A headless TypeScript library: **request + URL → discovery → reusable JSON artifact → mechanical result data**.

Discovery uses AI to author rules and Prism programs. Finished artifacts execute through the in-memory engine without models, credentials, a database or mandatory persistence. Fields and result schemas are dynamic.

The implementation uses a fixed JSON pipeline with small model jobs. See [current status](docs/development/current-status.md) for the latest engineering verification, semantic evidence and scope limits. Historical comparisons do not establish current accuracy.

## Discover

The package is `@niscorp/haptic`. It is integrated into the Nisc workspace and remains private until its separately authorized first npm release.

```ts
import { prepareArtifact } from '@niscorp/haptic';
import { createDiscoveryOperations, discoveryWorkflow } from '@niscorp/haptic/discovery';

const discovery = createDiscoveryOperations({ author: { apiKey } });
try {
  const prepared = await prepareArtifact(discoveryWorkflow, discovery.operations, discovery.limits);
  const result = await prepared.run({
    url: 'https://example.org/releases',
    instruction: 'Return the release titles listed on this page.',
    outputSchema: { type: 'array', items: { type: 'string' } },
  });
  // A completed workflow can return 'unresolved' or provider-'blocked' with artifact: null.
} finally {
  discovery.close();
}
```

Supply the output schema when known. Otherwise a separate schema author declares it after source extraction. Caller contracts remain unchanged; automatic contracts are admitted for each author pass. All formats use Prism shaping and final-data review. Review feedback gets a bounded correction pass by default. A mechanically working artifact is returned as `ready`, with its review verdict separately available to the caller.

HTML uses CSS and dynamic record-scoped fields; JSON remains native; XML uses XPath with namespace URI bindings. Navigation and downloads require separate caller permission. Their depth/count limits become artifact policy. Resource output contains bounded bytes and response metadata; downloaded-content extraction is separate work.

## Execute

```ts
import { prepareArtifact } from '@niscorp/haptic';
import { createWebOperations } from '@niscorp/haptic/operations';

const web = createWebOperations();
try {
  const prepared = await prepareArtifact(artifactJson, web.operations);
  const result = await prepared.run({ url: 'https://example.org/releases' });
} finally {
  web.close();
}
```

Preparation admits the artifact, schemas and Prism programs once. Repeated execution reads current values/links and returns `{data,visited,limited,redirects}`; declared downloads add `resources` outside `data`. No AI runs during execution or repairs a failed artifact.

## Search and optional recovery

The [search entry](docs/development/search.md) acquires the first DuckDuckGo HTML page, orders sources with 120b, and runs ordinary discovery separately for each chosen destination. Its follow count is configurable. Search acquisition consumes none of a destination's depth/page allowance. Search returns source artifacts/results and explicit failures; it does not write a synthesized answer.

The optional [image-choice adapter](docs/development/search-image-choice.md) uses host-provided image, Jev and form effects through the existing recovery hook. The explicit ImageScript entry requires the optional codec peer. Ordinary execution/search installs no browser or codec.

## Contracts and verification

- [Public API and failures](docs/development/public-api.md)
- [JSON pipeline and ownership](docs/development/discovery-builder.md)
- [Schemas and Prism shaping](docs/development/output-shaping.md)
- [Supported scope and remaining work](docs/development/remaining-work.md)
- [Nisc handoff](docs/development/nisc-handoff.md)
- [Final engineering handoff record](docs/measurements/haptic-handoff-2026-11-05.md)

Prism, Strata and Zod are required peers. Discovery additionally uses optional Cortex, Signal and provider-SDK peers. Prism owns transformations; Strata owns grammar stamps. The engine remains independent of model packages.

Run `pnpm typecheck`, `pnpm check`, `pnpm run check:package` and `node scripts/check-live-pdf.mjs` after changes. The package check uses repository fixtures; the PDF check is live HTTP-only. Distinguish those engineering checks from model accuracy, same-source replay and changed-source reuse. Schemas, preconditions and the fallible reviewer cannot detect every wrong or missing result; the saved Steam unrelated-offer and 7-Zip frozen-version counterexamples remain.
