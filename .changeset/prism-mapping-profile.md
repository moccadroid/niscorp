---
"@niscorp/prism": patch
"@niscorp/nisc": patch
---

Profiles: `getProfileJsonSchema(ops, target?)` derives the config JSON Schema documenting only some ops, and `MAPPING_OPS` names the ones a mapping uses — every op the repo's authored mappings use, and the shaping ops beside them. Documentation only: nothing about what Prism accepts changes, `getConfigJsonSchema` is unchanged, and the grammar snapshot is untouched. The mapping agent is documented with the mapping profile and still validated against the full grammar — about 25% fewer tokens a mapping, and on gpt-oss-120b 21/24 test mappings against 18/24 with the whole grammar.
