---
"@niscorp/prism": patch
---

`prismTransform` is exported from the main entry: Prism in the shape a host's transform seam takes, `(config: unknown, source: unknown) => unknown` — what nova's shell, tide's engine and strata's upgrader are handed.

```ts
import { prismTransform } from '@niscorp/prism';

createTide({ store, transform: prismTransform, effects });
```

`evaluate` is typed for a `JsonValue` source, so a host could not hand it to a seam without a cast, a JSON round trip or a parse of its own. `prismTransform` parses the config against `ConfigSchema` and refuses a source that is not plain JSON. It is the function `@niscorp/prism/migrations` has exported all along, and that export stays. Its refusal now reads `The source of a transform must be plain JSON.`; it said `A document to migrate must be plain JSON.`

**What to change:** nothing. A host that wrote the join itself can pass `prismTransform` instead.
