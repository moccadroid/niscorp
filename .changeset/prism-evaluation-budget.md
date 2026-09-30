---
'@niscorp/prism': minor
---

Every evaluation has a budget: nodes evaluated (1M), the length of any one string (1M characters), and the values in a result that can be reused into something bigger — a `$reduce` accumulator, a `$with` binding, the result itself — counted as they would be serialized, shared parts every time they appear (1M). Past one, the evaluation throws `PrismError` `E_BUDGET`. `evaluate`, `evaluateSafe` and `execute` take optional `limits`; `DEFAULT_LIMITS` and `Limits` are exported. Compile-time constant folding is budgeted too. An ordinary 1000-row mapping pays about 8%.
