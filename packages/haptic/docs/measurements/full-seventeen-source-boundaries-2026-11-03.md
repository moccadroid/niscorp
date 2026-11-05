# Full 17-task live verification — 2026-11-03

## Outcome

All 17 original request + URL tasks ran twice with the current frozen shipped profile, generated schemas except the unchanged caller-supplied Django schema, live HTTP only, and no manual corrections or extra environment reruns. Every published artifact ran again against fresh HTTP with model calls forbidden. No production code changed.

Final assessment: **25 complete answers, one useful partial answer, two unusable outputs and six attempts without an artifact.** Twenty-eight artifacts were published and all twenty-eight completed independent execution. Completeness here means requested source-supported final values/associations, not the reviewer verdict, selected DOM path, universal importance or future-reuse certification.

## Per-task results

The numbers below are aggregated over each task's two attempts. Times include discovery and independent fresh execution; concurrent task times cannot be added to obtain batch wall time.

| Task                  | Run 1       | Run 2       | Requests | Input tokens | Output tokens | Combined seconds |
| --------------------- | ----------- | ----------- | -------: | -----------: | ------------: | ---------------: |
| sqlite                | unusable    | unusable    |       14 |       76,688 |        35,955 |            96.19 |
| debian                | no artifact | complete    |        6 |       26,396 |        11,162 |            63.61 |
| lua                   | complete    | no artifact |       13 |       45,552 |        33,985 |           122.89 |
| rust                  | complete    | complete    |       12 |       54,516 |        20,214 |            60.23 |
| python-release        | complete    | complete    |       16 |      118,478 |        27,213 |            78.55 |
| gutenberg-search      | complete    | complete    |       13 |       77,091 |        22,535 |            72.08 |
| zlib                  | complete    | complete    |       15 |       99,069 |        48,551 |           140.64 |
| ruby                  | no artifact | partial     |       19 |      156,600 |        45,820 |           134.07 |
| perl                  | complete    | no artifact |       18 |      144,531 |        66,135 |           192.44 |
| 7zip                  | complete    | complete    |       14 |       72,479 |        39,052 |           117.74 |
| adafruit-price        | complete    | complete    |       13 |      143,527 |        16,808 |            65.70 |
| pythonanywhere-prices | complete    | complete    |       14 |       75,683 |        27,055 |            81.26 |
| django-news           | no artifact | complete    |       13 |      124,325 |        28,031 |            82.43 |
| github-service-status | complete    | complete    |       15 |      166,905 |        28,594 |            87.14 |
| curl-release-dates    | complete    | complete    |       14 |      354,842 |        19,216 |            70.81 |
| django-linked-posts   | no artifact | complete    |       15 |      195,351 |        36,717 |           116.13 |
| sqlite-release-notes  | complete    | complete    |       20 |      352,124 |        63,705 |           204.20 |

## Requests, tokens and time

- 244 actual provider requests: 237 non-429 responses all report usage, plus seven HTTP429 rejections without usage.
- Reported tokens: 2,284,157 input and 570,748 output.
- Wall time: 962.375 seconds (16 minutes 2 seconds), two concurrent jobs.
- Transport waits following actual HTTP429 responses: 17.065 seconds summed across affected jobs. There were no preemptive token reservations.
- Independent artifact execution median: 73.216 ms including HTTP, excluding preparation; range 21.091–1060.863 ms. Execution model calls: zero.

## Remaining failures and partial data

1. Debian run 1: initial HTTP acquisition timeout.
2. Lua run 2: correct captured URL result, but required fresh URL-artifact verification times out. No artifact is published.
3. Ruby run 1: the published Prism agent repeats an invalid `$with` mapping shape through its configured schema recovery.
4. Django news run 1: the published Prism agent emits malformed JSON three times; no mapping is admitted.
5. Perl run 2: repeated inspection requests consume the source-author allowance without proposing a rule.
6. Django linked-posts run 1: actual HTTP429 replies exhaust transport retries. Other affected navigation runs recover after waits.
7. Ruby run 2: mechanically working artifact returns one of the three official documentation URLs; the reviewer falsely accepts it.
8. SQLite download runs 1 and 2: both return `hp1.html`, not the archive. The matching anchor has the right download label, but original JavaScript later replaces its href with the actual archive target. Current discovery does not execute that JavaScript; prepared model HTML clears its body. No JavaScript evaluation, browser or site-specific workaround was added.

## Grading correction and comparison

The frozen value-coverage checker initially marked both SQLite outputs complete because it used the expected anchor's current href. Manual inspection caught the placeholder before the final report. Both are explicitly unusable in `final-report.json`; raw checker results remain unchanged. My early commentary calling SQLite complete was wrong. The preceding batch's saved SQLite output also returns `hp1.html`; its apparent pass is rejected in the offline comparison too.

Under the same final-value assessment plus this semantic correction, the previous original 34 attempts yield 20 complete, one partial, two unusable and eleven without an artifact. This batch yields 25 complete, one partial, two unusable and six without an artifact. The previous six extra environment reruns are excluded from that comparison. Their later outcomes remain separate historical evidence; this is not a claim of improved accuracy against a selectively recovered baseline or a release certificate.

The preserved evaluator checks final requested values and structured associations, not discovered DOM paths. Original expected selectors are grading-only and never sent to models. Correct labels alone proved insufficient for SQLite: this batch documents that limit rather than changing a frozen expectation to fit the returned answer. No inference about future changed-page correctness is established by these fresh unchanged-page runs.

## Evidence

`data/runs/full-seventeen-source-boundaries-2026-11-03/` contains frozen source/build/inputs/profile/grading contracts, exact provider exchanges, HTTP captures, artifacts, generated schemas, fresh outputs, raw classifications, explicit final semantic corrections and per-slot historical comparisons. All original evidence remains. No new production machinery, prompt tweaks, dependency changes or engine changes were made for this run.
