# Shipped Prism mapping agent: saved timetable comparison

The published `@niscorp/prism/agent` mapping agent did not produce a correct timetable. It is not adopted. No production implementation, engine, extraction, model settings or dependency changed.

## Frozen comparison

Evidence: `data/runs/prism-shipped-timetable-2026-11-02/`. Original comparison source: `data/runs/live-animafabrik-user-agent-2026-11-02/`.

The agent received exactly the original first output-author execution scope, including the seven extracted section records and their native text/fields. It received the unchanged original instruction and generated final JSON Schema. It did not receive HTML, the original incorrect mapping, the independent expected timetable, correction hints, or original author/reviewer conversations.

The shipped agent requires `targetShape`, an output example rather than a JSON Schema. The test harness mechanically illustrated the saved schema with empty strings, one array member and all offered properties. This illustration supplied no timetable facts. It is a test-only adapter, not a new automatic schema-to-example capability in Haptic. The shipped instructions and output documentation were reused directly through `mappingAgent.config`; only emit and bounded stop settings were configured. No dependency was patched.

Settings were Groq `openai/gpt-oss-120b`, high reasoning, temperature 1, top-p 1 and max output 16,384. The test allowed at most five Cortex steps, three output-schema attempts and 180 seconds. Only mechanical failures could produce mapping feedback. A mechanically successful but semantically incorrect mapping stopped the test, matching the current absence of semantic repair. One request was made; no feedback or schema recovery was needed.

## Results

| Saved timetable shaping | Existing custom author, historical run | Shipped agent, new run |
| --- | ---: | ---: |
| Completely correct weekday/time/title/description rows | 0/19 | 1/19 |
| Unrelated contact rows retained | 2 | 2 |
| Provider requests | 5 | 1 |
| Input tokens | 56,486 | 10,916 |
| Output tokens, including provider reasoning | 52,394 | 13,936 |
| Sum of provider request times | 112.946 s | 29.874 s |

New run total: 36.124 s, including Cortex and trial work. The generated mapping's preparation and mechanical execution took 25.035 ms. One of one responses reported usage. No 429, rate-limit wait, website request, execution model call or manual mapping correction occurred. Frozen files were unchanged. The historical custom-author timings exclude other discovery jobs; this is not a fresh end-to-end speed comparison.

The new mapping gets weekday, time and title right for all 19 actual classes, but joins the entire day's description array into every class description. Thus only the single-class Friday has the correct description. It retains both contact entries as classes and omits levels and optional notes. It reads only `pages[0]`; cross-page reuse is not established.

For example, Monday 18:00 Flexibility should have `w/ Andrea Rachele / 60min`. It instead receives the descriptions of all four Monday classes joined together. The final schema permits that string, so schema validation passes while semantic grading fails. Independent grading reads the original captured DOM and compares 19 classes in six day sections; the grader and its selectors are never supplied to the model. This is a saved-extraction shaping test, not fresh discovery, final semantic model review, publication or live URL-artifact execution.

## Conclusion

The shipped agent removes neither the association problem nor irrelevant source records. A valid Prism program and a schema-valid result do not establish correct data. No replacement or new production machinery is justified by this result.

The native title/description arrays still align by position: the test does not prove correct core shaping is impossible with the current extraction. Optional class notes have weaker association after extraction. Before another model experiment, evaluate how source selection can preserve each requested record and its surrounding context, so the mapping job has less reconstruction to perform. Any grammar change needs its own generic contract and approval; this experiment does not implement one.
