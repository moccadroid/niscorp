# Parsed HTML: focused 120b rerun — 30 October 2026

> Tooling retirement, 2026-11-01: commands and runner paths below describe this historical experiment. The one-off saved-authoring/navigation/CAPTCHA research drivers were removed during handoff cleanup; original captures, failed results and archived tool snapshots remain in ignored evidence. Current offline contracts are tested through the maintained `tests` suite. Optional codec use is documented in the current image-choice contract; historical Sharp instructions are not current setup instructions.

All three saved Meetup candidates now pass mechanical author validation and stage trials, versus zero before. One passes fresh review and saved-source AI-free replay. Two remain unpublished after review rejection. The broad candidate containing Comic Con remains rejected, and both positive controls remain accepted with identical output.

Evidence: `data/runs/author-repair-models-2026-10-30T10-50-43-245Z`.
Runner: unchanged `scripts/check-saved-authoring-models.mjs`.
Baseline: `data/runs/author-repair-models-2026-10-30T09-49-57-142Z`.

## Frozen scope

Same three saved bad Meetup answers, same broad Comic Con candidate and same two controls. Each run starts with its unchanged recorded author response; only subsequent repair/review calls are fresh. The production `attempt` JSON flow supplies actual validation feedback, executes stage trials and requests a verdict. There are no manual selector/value corrections, freshly acquired pages, wider discovery or extra repair allowances.

The current parsed HTML preparation is enabled. The actual first repair request closes the picture anchor before the heading, unlike the baseline request. Meetup model HTML is 130170 UTF-8 bytes versus 129492 previously; it is still HTML, not a document tree encoded as JSON. Settings remain `openai/gpt-oss-120b`, high reasoning, temperature 1, top-p 1, `emit`, three author steps including the saved seed. Engine and all library source stayed unchanged; source hashes match the pre-run freeze.

## Results

| Saved case | Final outcome | Fresh requests | Input tokens | Output tokens | Wall seconds including pacing |
|---|---|---:|---:|---:|---:|
| Meetup failure 1 | Mechanically repaired; review accepted; AI-free replay completed | 3 | 137,762 | 12,497 | 139.04 |
| Meetup failure 2 | Mechanically repaired; review rejected missing onward navigation | 3 | 139,043 | 10,795 | 87.16 |
| Meetup failure 3 | Mechanically repaired; review rejected null authored date values | 2 | 90,816 | 7,719 | 67.87 |
| Broad candidate containing Comic Con | Rejected | 1 | 11,780 | 1,762 | 4.75 |
| AIEventlist control | Accepted; exact original 3 records; AI-free replay completed | 1 | 52,579 | 2,622 | 51.06 |
| AI What's On control | Accepted; exact original 1 record; AI-free replay completed | 1 | 16,725 | 1,397 | 4.11 |
| **Total** | **4/6 target qualification outcomes** | **11** | **448,705** | **36,792** | **354.49 whole batch** |

Original mechanical author failures corrected: **3/3**, baseline **0/3**. Usable reviewed Meetup stage artifacts: **1/3**, baseline **0/3**. Negative candidate blocked **1/1** and controls retained **2/2**, unchanged from baseline. The combined 4/6 measures these target outcomes, not general semantic accuracy, freshness, completeness or arbitrary reuse.

Five fresh repair requests and six fresh reviews returned HTTP 200; all eleven reported usage. Six recorded seeds are excluded from new requests/tokens. Output counts include reasoning. Quota errors: zero. Jev calls: zero. Execution model calls: zero.

Total wall time: **354.488 seconds**, including **246.211 seconds of pacing**, **100.116 seconds of provider/network time** and **8.162 seconds of local work**. Baseline totals were nine requests, 361326 input / 26932 output tokens and 285.823 seconds. The new run uses one fewer repair call and three additional Meetup reviews because all three candidates now reach the review stage. This explains the two extra requests and most of the higher input usage; it is not an oversized new HTML payload.

## Actual candidate and review outcomes

1. **Meetup 1:** after two fresh repairs, selected title-containing anchors rather than picture anchors and used lowercase `datetime`. Two upcoming events returned title/date/location/URL. Review accepted; the reviewed stage replay completed with no models. Both events are marked Online in the saved page. This does not establish physical Vienna attendance or exhaustive coverage of all past and future events.
2. **Meetup 2:** after two fresh repairs, selected four complete event containers and extracted title/date/location/URL without the original missing-title failure. Review acknowledged the extracted cards but demanded the visible “See all upcoming events” and “See all past events” navigation links, citing `canFollow:true`. The candidate remained unresolved and was not counted as a usable artifact. No human override or additional repair was applied. This verdict should not be presented as a mechanical extraction failure.
3. **Meetup 3:** one fresh repair selected title-containing anchors, removing the original picture-link/title mismatch. It retained `attribute:"dateTime"`; the parser exposes `datetime`, so its authored date arrays were `[null]` for both records. Mechanical match-count validation passed because the time elements exist. Review rejected the null values. The user had not explicitly required separate date metadata; “required date values” is the reviewer's wording, not a new user requirement or native mandatory field. No extra repair was applied.
4. **Broad candidate:** all fifteen original trial records remained unchanged. Review again rejected conferences, workshops and other entries lacking evidence of being meetups. It rejected the whole candidate; this does not prove individual Comic Con classification or produce a corrected replacement selector.
5. **Controls:** both unchanged candidates passed fresh review and exact-output assertions, then saved-source AI-free execution. The original three and one records remain identical.

The parsed representation demonstrably helped the concrete record-boundary failure, but the full repair path is not solved. Review scope and an incorrect authored attribute remain material limitations. No policy changes were made during or after this batch.

## Evidence retained

`frozen.json` records source hashes, workflow, profile, suite and pacing. Exact operation inputs, seeded historical responses, fresh provider request bodies and raw response bodies, Cortex events, all six outcomes and three AI-free replay outputs are retained. Provider bodies were saved before parsing. The console log is `data/runs/parsed-html-model-rerun-2026-10-30.txt`. The committed implementation was built before the batch; no implementation changes or reviewer reruns were needed for this measurement-only turn.
