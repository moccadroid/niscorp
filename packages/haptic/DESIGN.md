# Haptic design

Request plus URL → discovery → reusable JSON artifact → in-memory execution → data.

Discovery is the fixed JSON pipeline described in [the builder](docs/development/discovery-builder.md). JSON owns prompts, model settings, decisions, budgets, traversal and repair policy. TypeScript implements generic interpreters, validation and effects. Finished execution has no models, credentials, database or mandatory persistence.

## Ownership

| Module              | Question it owns                                                              |
| ------------------- | ----------------------------------------------------------------------------- |
| engine              | How is a stamped artifact admitted, prepared and executed?                    |
| operations          | How are HTTP, URL and format operations exposed to artifacts?                 |
| connector           | How are bounded HTTP transport, redirects and response bytes acquired?        |
| readers             | How are original response bytes read and selected mechanically?               |
| discovery           | How does the fixed JSON authoring pipeline produce and verify an artifact?    |
| search              | How does first-page search feed the existing destination discovery pipeline?  |
| search/image-choice | How can a host optionally recover an image-choice challenge during discovery? |
| migrations          | Which sequence and schemas describe stored artifacts?                         |

Prism owns transformations. Published Prism mappingAgent owns mapping authoring. Strata owns embedded document upgrades. Cortex and Signal own model response recovery. Hosts own optional transports, codecs, credentials and their lifetimes. Scheduling, notifications, storage, browser interaction and downloaded-content extraction are outside this package.

See [public contracts](DOCS.md), [limitations](docs/development/limitations.md) and [integration](docs/development/nisc-integration.md). Existing artifact grammar identity remains eden.engine; the package rename never changes stored stamps.
