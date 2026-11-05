# Shared HTTP request defaults and timetable rerun

The generic request-header fix works. The automatic timetable discovery then reached the right page but failed final data review. **No artifact or usable timetable was returned.**

## Implemented setting

`src/operations/default-profile.json` supplies `requestHeaders: {"user-agent":"Haptic/0.0.0"}`. The web profile owns configurable defaults. The existing HTTP operation merges explicit request headers by case-insensitive name, using standard Headers mechanics. Unrelated defaults remain; `{requestHeaders:{}}` disables them. No website rule, retry loop, new dependency or engine change was added.

Both discovery and AI-free artifact execution use that operation. Custom host profiles remain host-owned; they are not silently embedded as credentials or model context in artifacts. Default website headers do not affect provider requests.

Verification passed: `pnpm typecheck`, complete `pnpm check`, four HTTP-header behavior groups on a local server and the required live HTTP-only RFC/PDF regression. Tests cover an anonymous-request rejection versus default success, case-insensitive overrides, unrelated-header retention, owned mutable factory settings, independent profiles, disabling defaults, malformed-header refusal before HTTP, and shared JSON fetch/redirect execution through discovery and mechanical registries. The live PDF regression returned 116,547 bytes with the unchanged PDF hash.

Before the paid rerun, Haptic's default operation fetched `https://animafabrik.com` with HTTP 200 and 121,854 bytes. That probe was not substituted into discovery.

## Unchanged demo request

The input is byte-identical to the first attempt:

```json
{
  "url": "https://animafabrik.com",
  "instruction": "Give me the timetable of animafabrik.com.",
  "allowLinkFollowing": true,
  "linkDepth": 2,
  "maxPages": 5,
  "allowResourceFetching": false,
  "maxResources": 0
}
```

No timetable URL, selector, field names or output schema was supplied. Engine, discovery workflow/prompts, model settings/transport and dependency lock remain unchanged. The evidence driver was corrected to preserve/report an engine failed outcome directly rather than assert that every unsuccessful run must be completed/unresolved. Its mechanical data-presence checks are not an independent semantic timetable oracle.

## Actual outcome

The homepage was fetched live. The source author chose `a[href="/trainings"]` and Haptic fetched `/trainings` itself. It selected `.menu-section` records with dynamic day/title/description/level/options fields. A repeated result selector used as a precondition was rejected; the same source job corrected only its conditions. The separate schema author generated a day/classes result contract automatically.

The native input contained six weekday sections and one footer contact section. Day names and the main per-class title/instructor/duration/level arrays were present. Options were flattened within each day rather than associated with individual classes.

Output authoring made five provider calls. Early mechanical failures included same-block `$with.let` dependencies (`classDescs`, then `parts`) unavailable in that scope. The final mechanically executable candidate still had semantic defects:

- Day access used the string path segment `"0"` rather than numeric array index `0`, falling back to an empty string. Every returned day was empty despite selected `MONDAY` through `SATURDAY` values.
- It selected description and level at index zero for every class in each day. For example, Monday Flexibility's source says `w/ Andrea Rachele / 60min`; the candidate reused `w/ Vito / 90min` from Monday's first class.
- The broad source selector included the footer's email/address records as classes. The candidate contained 21 class-like records: 19 timetable entries plus two footer contact entries.
- Options also reused the first day-level option across classes, losing associations.

The final reviewer rejected the candidate for missing day names and inaccurate instructor/duration/level/options values. Public status is unresolved, artifact null. The schema-matched captured partial trial remains diagnostic data; it was not published or manually corrected. Fresh independent execution was not reached.

## Numbers

| Measure                          |             Result |
| -------------------------------- | -----------------: |
| Fresh paid discoveries           |                  1 |
| Provider requests                |                 11 |
| Reported input tokens            |            146,493 |
| Reported output tokens           |             65,103 |
| Discovery                        |          167.210 s |
| Total experiment                 |          167.589 s |
| Live source HTTP requests        |        2, both 200 |
| Actual rate-limit waits          |                  0 |
| Artifact / independent execution | None / not reached |

All eleven provider responses returned HTTP 200 and reported usage. No saved-page substitution, supplied model answer or manual correction occurred. Provider intervals total 145.860 s; remaining time includes preparation, local trials/validation, source transport and evidence recording, and is not isolated engine overhead.

| Phase                                                  | Requests |  Input | Output | Provider interval |
| ------------------------------------------------------ | -------: | -----: | -----: | ----------------: |
| Task                                                   |        1 |    603 |  1,037 |           2.389 s |
| HTML source, including navigation and condition repair |        3 | 53,056 |  6,960 |          17.763 s |
| Automatic result schema                                |        1 |  4,100 |  2,416 |           6.016 s |
| Output mapping                                         |        5 | 56,486 | 52,394 |         112.946 s |
| Final review                                           |        1 | 32,248 |  2,296 |           6.746 s |

The header fix establishes acquisition, not successful timetable extraction. The discovered navigation was correct. The saved input/output makes source scoping, class association and generated mapping defects concrete; this run does not justify an automatic new prompt fix or paid retry. No further model run followed.

## Evidence

- `data/runs/http-request-defaults-check-2026-11-02.log`: full offline checks.
- `data/runs/http-request-defaults-pdf-2026-11-02.log`: HTTP-only PDF regression.
- `data/runs/animafabrik-haptic-user-agent-2026-11-02.json`: separate default-header acquisition probe.
- `data/runs/live-animafabrik-user-agent-2026-11-02/`: frozen source/build/input, exact provider requests and raw responses, actual accepted Cortex decisions, source captures, generated-schema diagnostics, all failed trials, rejected final data and `analysis.json`/`summary.json`.

The original 403 attempt remains unchanged under `data/runs/live-animafabrik-timetable-2026-11-02`. All 11 engine files match it, and the new run's frozen source/build stayed unchanged throughout.
