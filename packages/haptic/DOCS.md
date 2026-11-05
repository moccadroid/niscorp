# Haptic public contracts

The [public API](docs/development/public-api.md) documents every runtime entry and the request/result contracts. [Artifact execution](docs/development/artifact-execution.md) describes the mechanical grammar. [Discovery](docs/development/discovery-builder.md) documents ownership and policy. [Search](docs/development/search.md) describes search and optional recovery.

## @niscorp/haptic/migrations

ENGINE_SEQUENCE is the existing eden.engine grammar sequence. ENGINE_SCHEMAS maps eden.engine/artifact, eden.engine/flow and eden.engine/step to their strict Zod schemas. Register this sequence alongside Prism's PRISM_SEQUENCE when composing a Strata upgrader or grammar gate. artifactStamp and prepareArtifact remain on the main entry; preparation upgrades before validation and effects. Newer stamps are refused. Literal artifact data is not executable Prism.

There are no Haptic tables or database migrations. Nisc's check:grammars snapshots this grammar and upgrades captured artifacts. Applications storing Haptic artifacts retain their stamps and register these grammars; source locks belong to the application using Strata's source-upgrade workflow.
