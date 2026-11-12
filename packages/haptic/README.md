# Haptic

An instruction and a web address in, a reusable **artifact** out: JSON data that reads current values from that page later, with no model. Search finds the pages first when you have only the instruction.

```text
discover({ url, instruction })  →  artifact (data)  →  prepareArtifact(artifact).run({ url })  →  current data
search({ instruction })         →  one artifact per useful source
```

Scheduling, storage and what happens with the data belong to the caller. The package is private until its first release.

## Run an artifact (no model)

```ts
import { createWebTransport, prepareArtifact } from '@niscorp/haptic';

const web = createWebTransport();
try {
  const prepared = prepareArtifact(artifact); // upgraded to the current grammar, then checked once
  const { data, visited, limited, redirects, resources } = await prepared.run(
    { url: 'https://www.debian.org/releases/' },
    { web, signal: AbortSignal.timeout(60_000) },
  );
} finally {
  web.close();
}
```

`prepareArtifact` refuses an artifact whose shape, Prism programs or output schema are wrong. A run fetches the pages, runs a page's own scripts first when the artifact says so, follows its link stages, reads its records, runs its Prism program and checks the result against its output schema. This entry point never loads a model package.

## Discover

```ts
import { discover } from '@niscorp/haptic/discovery';

const result = await discover(
  {
    url: 'https://www.perl.org/books/library.html',
    instruction:
      'Select the primary Read the entire book free online link for each book that offers one.',
  },
  { groqKey, typesafeKey },
);
// result.status: 'ready' | 'unresolved' | 'blocked'; result.artifact; result.data (from the artifact's own run);
// result.findings; result.attempts; result.usage
```

- `groqKey` runs the reader (gpt-oss-120b through Groq). `typesafeKey` runs Jev, which decides which extracted records answer the instruction and which section of a very long page to read. Without it, discovery still works, with no record labels and long pages cut at the budget.
- Optional request fields: `outputSchema` (JSON Schema of the result; without it the result has one property per field the reader cited), `allowLinkFollowing` and `linkDepth`.
- `profile` changes the model, efforts, caps and timers (`DiscoveryProfileSchema`); `web` or `pages` say where pages come from.

## Search

```ts
import { search } from '@niscorp/haptic/search';

const result = await search(
  { instruction: 'Show me a list of ai meetups in Vienna!' },
  { groqKey, typesafeKey },
);
// result.destinations: one per visited source, each with its artifact, status, data and findings
```

DuckDuckGo is the shipped provider (`duckduckgo`, a `SearchProvider` value; pass your own with `provider`). DuckDuckGo often answers with an image challenge; Haptic solves it with Jev, so search needs `typesafeKey`.

## Peers

`zod`, `@niscorp/prism` and `@niscorp/strata` are required. Discovery and search also need `@niscorp/cortex`, `@niscorp/signal` and `openai`; solving an image challenge needs `imagescript`. Running an artifact needs none of the optional ones.

## More

- [DESIGN.md](DESIGN.md): the artifact grammar, the discovery steps, search, rendering, the modules.
- [STATUS.md](STATUS.md): measured results, known limits, what is not built, how to check a change.
