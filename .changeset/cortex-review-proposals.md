---
"@niscorp/cortex": patch
---

An agent whose `output.schema` takes a string now gets a `data` that reads as JSON as the model wrote it (`"[1,2,3]"`); before, the run ended `stopped` after its output retries. A payload decoded and accepted today is unchanged.
