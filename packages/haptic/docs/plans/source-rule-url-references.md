# Source-rule admission and URL references

The engine, HTML reader and published Prism agent stay unchanged. Existing JSON helpers own both corrections.

## Source admission

An HTML proposal with `selector:null`, `links:null` and `result:null` declares no reusable action. Existing discovery admission returns `SOURCE_RULE_EMPTY` to the same source job before captured extraction, schema authoring or mapping. Fields without a selector and permission/task violations retain their existing diagnostics. Inspection history and remaining allowance stay with the job.

This does not require ten records, mandatory fields or nonempty future results. Navigation-only rules remain valid when permitted. A learned selector may produce an empty result during execution under the existing caller contract. No-op rejection applies to discovery, not hand-authored engine programs.

## URL reference projection

Each format entry may declare `urlAttributes`; the shipped HTML entry declares `["href"]`. Omission or `[]` in a custom entry disables projection. There is no hidden native default. This is format configuration, never a list of business field names. The chosen format configuration is already frozen in artifact data.

The existing HTML selection helper keeps the reader's raw attributes and field arrays intact. Ordinary JSON helpers resolve configured URL-valued attributes and structured fields reading those attributes through the existing `url.resolve` operation, using that selection's effective base and encoding.

Selected records gain additive metadata:

```json
{
  "fields": { "arbitraryName": ["/section/item", null] },
  "references": {
    "attributes": {},
    "fields": { "arbitraryName": ["https://example.test/section/item", null] }
  },
  "referenceErrors": []
}
```

Attribute references are scalars; structured-field references preserve their array positions, duplicates and nulls. Invalid references produce null and aligned error metadata without discarding useful text. Cancellation, integrity/resource controls and existing unsupported legacy-query encoding remain terminal. Resolution performs no HTTP and grants no following/fetching permission.

The shared output-source projection carries the enriched records into both discovery's real captured extraction and finished execution. Prism receives actual resolved examples and is told to copy these references for URL output rather than concatenate bases and paths. Its shipped agent definition remains unchanged. JSON/XML native values and reference-following programs retain their current contracts.

## Falsifiable checks

- Saved all-null Spiegel proposal returns feedback before downstream model jobs; a corrected full rule works within the original allowance.
- Navigation-only and resource rules remain admitted; explicit caller false/zero is unchanged; valid selector execution on empty data stays supported.
- Saved Guardian root-relative paths resolve correctly from a base containing `/europe`; directory-relative paths, explicit bases, absolute references, fragments, duplicate/null/multiple field values and invalid references retain their proper behavior.
- Dynamic aliases, raw source values and captured/executed mapping inputs remain aligned. Projection performs zero additional acquisition and contains no model operations.
- Normal offline/type/PDF checks and independent integration reviews precede one frozen fresh Guardian discovery and one frozen fresh Spiegel discovery. Actual returned data, source associations, requests, tokens, time and AI-free execution are reported independently of reviewer verdicts.
