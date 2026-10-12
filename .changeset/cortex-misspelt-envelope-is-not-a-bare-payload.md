---
'@niscorp/cortex': patch
---

An envelope with a misspelt key is no longer accepted as the agent's data.

A model may send the payload alone, without `{ response, data, reasoning }` around it, and cortex reads it as the data when it passes the agent's schema. A schema that takes any object passed everything: under `z.record(z.string(), z.unknown())` the answer `{ respnse: 'Done.', data: { id: 7 } }` came back as the data, whole, and under an object schema whose fields are all optional it came back as `{}`. The run finished with the wrong data and no correction.

The payload alone is now read only when the schema can tell it from an envelope, which is when the schema refuses an object that holds one unknown key. Under any other schema an unknown key is reported to the model, as it is for an agent with no data schema.

**What to change:** nothing. An agent whose data schema takes any object (a record, or an object with only optional fields) and whose model sends the payload alone now spends one correction round on it. A required field in the schema, or `z.strictObject`, keeps the payload-alone reading.
