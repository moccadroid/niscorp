# Animafabrik timetable: live demo stopped at acquisition

One fresh Haptic discovery received URL `https://animafabrik.com` and instruction `Give me the timetable of animafabrik.com.` No selectors, schedule URL, business fields or output schema were supplied. Caller options enabled link following, depth two, at most five pages, and disabled resource downloads. The current library/workflow/settings were frozen unchanged.

## Result

**No timetable or artifact.** Task declaration succeeded with `{requiresNavigation:false,resultFlow:null}`. The first HTTP request received Squarespace's 403 Forbidden page (1,454 bytes), so acquisition stopped with `CHECK_FAILED: response-status-accepted`. Source authoring, schema generation, output authoring, review and independent execution were not reached.

One Groq request, HTTP 200 with complete usage: **603 input / 2,183 output tokens**. Discovery took 5.265 s; total experiment 5.610 s. No quota waits. The model received no site content because acquisition failed.

The evidence runner inherited an assertion assuming unsuccessful discovery always returns completed/unresolved. It raised a secondary assertion after the engine's failed outcome had already been saved. That assertion is not the acquisition cause and does not alter the recorded engine error. The frozen driver and first run were preserved.

## HTTP-only diagnosis

No further models were used. Curl fetched the apex page with HTTP 200; www returned a redirect to the apex. Then the unchanged Haptic HTTP operation was tested against the same apex URL:

| Explicit headers          | HTTP | Body bytes |
| ------------------------- | ---: | ---------: |
| None                      |  403 |      1,454 |
| `Accept: */*`             |  403 |      1,454 |
| `User-Agent: curl/8.21.0` |  200 |    121,854 |
| Both                      |  200 |    121,854 |

Our ordinary discovery fetch supplies no User-Agent. The controlled header comparison establishes that an explicit request identity is sufficient for HTTP acquisition here. It does not establish a JavaScript, browser or CAPTCHA requirement. HTTP input already supports explicit headers, but automatic discovery's shared fetch configuration did not supply one. No transport substitution, source change, new discovery attempt or diagnostic-page substitution occurred.

A generic shared JSON request-header configuration is the next issue to address before retrying the exact demo; a site-specific timetable parser is not justified by this failure. Navigation and actual timetable discovery remain untested beyond declaration.

Evidence: `data/runs/live-animafabrik-timetable-2026-11-02/`, including frozen source/build/input/scope, exact provider request/raw response, original failed `discovery.json`, HTTP captures, `http-diagnostics.json`, `analysis.json` and `summary.json`. Diagnostic response bodies are separate from the failed automatic run. All production source/build hashes remain unchanged.
