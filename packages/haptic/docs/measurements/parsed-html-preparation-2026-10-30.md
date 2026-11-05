# Parsed HTML preparation — 30 October 2026

> Tooling retirement, 2026-11-01: commands and runner paths below describe this historical experiment. The one-off saved-authoring/navigation/CAPTCHA research drivers were removed during handoff cleanup; original captures, failed results and archived tool snapshots remain in ignored evidence. Current offline contracts are tested through the maintained `tests` suite. Optional codec use is documented in the current image-choice contract; historical Sharp instructions are not current setup instructions.

The existing preparation step now sends cleaned, serialized parsed HTML to authoring and review. This removes the misleading raw nesting that placed Meetup titles inside picture links in model context even though extraction's parser split those links. It does not repair previously authored selectors.

## Change and ownership

`src/discovery/html-context.ts` uses the same Cheerio `load` defaults as HTML extraction. JSON policy now explicitly declares `representation:"parsed-html"`; configured text/attribute clearing remains JSON data. Preparation clears a private parsed document and serializes it. The source-range edit implementation, duplicate-attribute rescanning and regex token handling were removed directly. No old serialization mode or compatibility alias remains. The existing enabled flag still bypasses preparation, and registry composition can still replace the operation.

The original HTTP capture, hash, decoded source and extraction inputs remain unchanged. Only the model view changes. Both author and reviewer receive that same prepared HTML; no JSON document tree, model call, extra agent or execution operation is added. The engine and field semantics are untouched.

Some malformed HTML cannot represent its parsed tree faithfully after serialization. Within preparation, a generic comparison checks the cleaned private DOM against reparsed output: element names/namespaces, attribute values and namespace metadata, parent/child ordering and remaining text/comments. Empty cleared text nodes may disappear. Non-round-trippable structures fail explicitly with `HTML_CONTEXT_STRUCTURE_CHANGED`; no tag/site repair is attempted. Serialized output must fit the existing decoded-source `maxIndexBytes` allowance, otherwise `HTML_CONTEXT_OUTPUT_BYTE_BUDGET` fails before reparsing. Model request byte admission remains separate and unchanged.

Preparation reports retain original source identity and exact input/output UTF-8 sizes. Clearing counters now count parsed nodes/attributes, including reconstructed formatting nodes, rather than source-edit occurrences. This is a model context operation, not browser security sanitization.

## Saved checks — offline only

Evidence: `data/runs/author-repair-offline-2026-10-30T10-24-28-161Z`.
Runner: `scripts/check-saved-authoring-repairs.mjs`.

The same six candidates cover four distinct saved pages. The benchmark definitions now include both controls' original review requests, so all three mechanically valid candidates have review-protocol captures. No expected answers or labels enter model messages.

| Saved case | Model/extraction structure | Unchanged candidate result |
|---|---|---|
| Meetup failure 1 | Agrees; 884 elements | Still rejected: zero selected matches |
| Meetup failure 2 | Agrees; 884 elements | Still rejected: zero selected matches |
| Meetup failure 3 | Agrees; 884 elements | Still rejected: required title missing from selected image link |
| Broad candidate containing Comic Con | Agrees; 458 elements | Still mechanically valid; exact original 15 records |
| AIEventlist control | Agrees; 1,908 elements | Exact original 3 records |
| AI What's On control | Agrees; 375 elements | Exact original 1 record |

The comparison checks every parsed element's name, namespace, path and non-cleared attributes, plus visible document text. All six original sources remain unchanged. The failed field's zero matches are also observed in the model-visible parsed record, matching extraction. A nested-link regression confirms the prepared HTML closes the picture link before the title, while the original invalid markup does not.

**6/6** author-input protocol captures contain the exact prepared document. **3/3** review-input protocol captures contain that same prepared document and unchanged actual trial records. These intercept the operation boundary and deliberately return `OFFLINE_CAPTURE_ONLY`; they are not provider requests or semantic verdicts.

**2/2** positive controls preserve original output. All **3/3** saved bad rules remain rejected. **Zero model calls, zero paid tokens and zero network requests** occur in these saved checks. No manual candidate correction is made. The previously recorded paid review result is unchanged historical evidence; no new Comic Con semantic review or successful Meetup repair is claimed.

## Verification

Twelve HTML preparation groups cover configured clearing, original input immutability, structural positions, normalization, non-ASCII values, foreign/template content, duplicate/reconstructed attributes, invalid nested links, non-round-trippable forms and structure-sensitive attributes, output amplification, cancellation and resource limits. The reconstructed-formatting fixture expands roughly 3 KB of input beyond 200 KB when serialized and is rejected under a 60 KB existing allowance.

The offline discovery integration compares actual preparation output with the exact author and review messages, then verifies unchanged original-source execution. Bypass and replacement remain tested. Four independent checkpoint roles reviewed Nisc alignment, generic grammar, correctness and code quality; the round-trip and amplification findings were fixed and verified.

Logs: `data/runs/parsed-html-saved-checks-final-2026-10-30.txt`, `data/runs/parsed-html-normal-checks-final-2026-10-30.txt`. The earlier failed normal-check log is retained: it asserted exact original markup in model context, an expectation superseded by the approved parsed-HTML contract. The corrected check binds messages to the actual preparation output.

`pnpm typecheck` and the complete offline `pnpm check` pass. After the offline checks, the unchanged HTTP-only live PDF regression passed at `data/runs/live-pdf-2026-10-30T10-26-39-782Z`: 116547 original PDF bytes, SHA-256 `f09ffbee2a526425f2ee43a7cef12577dcaf9258a5a7f317081279baacd43058`. That separate HTTP regression has no models; it is not part of the six fully offline saved checks.

The subsequently authorized [focused 120b rerun](parsed-html-model-repairs-2026-10-30.md) is separate paid evidence: all three Meetup candidates reached completed mechanical trials, but only one passed fresh review; the broad negative candidate remained rejected and both controls passed. The offline results above remain unchanged.
