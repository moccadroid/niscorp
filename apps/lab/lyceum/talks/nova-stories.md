# Nova — nine stories, fourth round

Three subagents got the same corrected brief, with no direction given:
- the talk is built on nisc and runs on Moss in lyceum;
- the story is about Nova;
- Moss's parts are named as plumbing;
- no foreign stacks and no third-party APIs.

Each found its own three stories. Nothing was changed. "Measured" means the subagent ran it on the installed package or counted it in the worktree. Everything else is their estimate.

## Where the three converged without being told

- **The framework bar: all three built it.** Each phone picks React, Vue, Svelte, Angular, plain DOM or a terminal. Lyceum already switches renderers per surface (`src/ui/target.ts`, `tools.look`), and what comes back to the server is the same event whatever drew the button.
- **"Send me your screen": two of them.** A screen is its stacks plus each action's data. Nova also reads off the document who wrote each key, so only what the person wrote travels. Whatever was loaded is loaded again as whoever opens it.
- **The room translates the app: two of them.** Translation happens in the renderer, so a name typed into the app stays as typed.

---

## 1. Pick your framework (all three wrote a version)
**The sentence a developer repeats:** "Every phone in the room drew the same running screen with the framework its owner picked. What came back to the server from each was the same event, and the framework part of that app is a few hundred lines per framework."

**Tension.** The framework is chosen on day one and paid for for years. A migration rewrites behaviour, not just drawing: handlers, state, effects, router hooks. AngularJS support ended in 2021 and Vue 2's in 2023 (check both dates before the talk). It's told in words, with no foreign app on stage.

**Turn.** Nova's core resolves a screen to a plain tree and takes back plain events. The framework only draws a node and reports a press. State, steps, calls and navigation live in the document.

**Demos:**
- **Pick yours.** The projector itself flips DOM → React → Vue → the line terminal, where the whole slide turns into text with `[n]` markers, and back. A live tally keeps counting through every flip. Phones pick from a card in their list, and their phones redraw in that framework. Lyceum already shows the framework's name in a corner.
- **What comes back.** A poll. The projector lists the presses exactly as Nova's trigger received them, beside the framework that drew each phone. A press from a React phone and one from a Svelte phone are identical lines. Without phones, the speaker presses in Vue, flips the controller to React, and presses again.
- **Switch mid-sentence.** Half a question typed, then a different framework picked: the half sentence is still there. It lives in the action's data through `model`.
- **A folder beside the others.**
  - Nova's adapters, measured with their reference kits: React 1,339 lines, Vue 1,027, DOM 1,001, terminal 351, Ink 459.
  - Lyceum's design system: 26 components under one props schema, drawn by five kits. DOM is 511 lines, React 533, Vue 615.
  - Svelte and Angular written for this talk as sibling folders.
- **The room runs Nova's examples** (in two versions). Each phone runs some of the 42 examples through its own framework, and a grid of example by framework fills in.

**Monday:** mount one Nova screen inside the existing React app, with your design system registered as the kit.

**Needs:**
- Svelte and Angular adapters. They can live inside lyceum as app code, because an adapter imports only Nova's public surface. Putting them in `packages/nova` is a library change, so a case first.
- A renderer row per person, since it's per surface today.
- Kit aliases (Nova's examples say `Button`/`Input`; lyceum's kit says `Action`/`Field`).

## 2. The room's sessions are the test suite
**The sentence a developer repeats:** "He changed one step in a screen and didn't publish it. He replayed every session we had just pressed on our phones, a few hundred in a quarter of a second with no browser, and it named the dozen of us who would now see a different number."

**Tension.** UI tests cost the most and catch the least: slow, flaky, tied to markup, and limited to the paths someone wrote down.

**Turn.** A Nova screen's run has two inputs (presses, and the answers its calls got) and one output (a tree that reads as text). `shellIdle` says when a press's work is done. Nova's own 42 examples are exactly that, and nisc.dev draws each one as a page.

**Demos:**
1. **All 42 examples,** run on the server with no browser. Measured: 42 of 42 match, in 2.46 s one after another or 164 ms in parallel.
2. **Phones press Nova's `set-from` example** ("Seats: 1 · One more · Undo"). Sessions arrive in Nova's own example shape: "214 sessions; Nova's file has 42."
3. **A change nobody would stop in review:** Undo's `set … from` becomes `decrement`, unpublished. Every session is replayed against both versions, and the differing ones are listed by person.
   - Measured: `undo` alone gives "Seats: 1" before and "Seats: 0" now.
   - Measured: 300 sessions of 6 presses replayed in 240 ms.
   - A second change only reorders the layout: the data is identical and only the reading order moves.
4. **A session becomes an example** that the 78-line runner runs in CI.

**Needs:** recording presses. Moss has no event hook, so lyceum's own target wraps `dispatch`. Also the replay function, and hosting the examples on phones.

**Risk:** this edges toward "recording everyone's state", which was rejected before. Keep the recording minor and the replay central.

## 3. Send me your screen (two versions)
**The sentence a developer repeats:** "He sent us his screen as a QR code. It opened on my phone with his half-typed question and his open dialog, and the list under it was loaded again as me, because Nova can tell from the document which data a person typed and which a call loaded."

**Turn.** A screen is the shell's stacks plus each action's data. Nova reads who wrote each key from the document: `gesturedKeys` (presses and `model`), `loadedKeys` (endpoint targets) and `lifecycleKeys`. So only what the person wrote travels, and opening it re-runs each `mount` as whoever opens it.

**Demos:**
- `describeShell` of the speaker's Q&A screen, live, with each key marked typed, pressed or loaded.
- The screen opened on the projector, signed in as someone else: the draft is there, and "your questions" is empty.
- A QR of the screen: phones open the speaker's draft, each with their own question list, each in their own framework.
- "Send my screen to the speaker", turned into a bug report. One version opens a stranger's screen in the speaker's terminal, presses through it, and saves it as a test. Measured: a half-typed dialog's whole screen is 130–152 bytes.

**Needs:** Nova doesn't expose which fragments an instance was opened with (`births` in `shell.ts`). Either the app knows its overlay always uses `sheet`, or a Nova case.

**Risk:** opening a screen on the projector looks like "dispatching into someone's screen". Frame it as the speaker's own display.

## 4. The room translates the app (two versions)
**The sentence a developer repeats:** "We translated the app we were all using into the room's languages in five minutes. No layout changed, every open screen switched, and the guy who joined as 'Close' kept his name while the dialog's Close turned German."

- **The harvest:** measured on lyceum, 384 phrases from 90 actions in 519 places, 35 of them on the phone's screens. Each comes with the place it appears.
- **The room translates its phone's phrases.** A coverage count runs down to 0, and every phone switches mid-question, with the terminals over ssh too.
- **What it can't do:**
  - 22 of lyceum's sentences are `{{…}}` templates, so they stay English until rewritten as patterns;
  - money and dates are formatted per region by Prism, not by a book.

## 5. Where Back goes
"Nova has no router. Back is a log of where you've been, one pane at a time."
- On the phone, a sheet's own Close and the phone's back button spend the same entry.
- Two panes walk back newest first.
- `push` keeps the half-filled form underneath; `replace` reopens it empty.
- Deliveries pushed with `history: false` aren't navigation.
- Escape in an ssh terminal signed in as the same person sends the phone back. That last one needs Escape wired to Back, and ssh signed in as the person.

---

## A lyceum bug one subagent found
`questions.send` keeps `sent: true` after a send. Type a second question and the form still says "Sent. The speaker has it." The fix is one trigger in the document. It's a real bug in lyceum, not part of any talk.

## My recommendation
**Story 1, with Story 2 as its second half.** Both prove one claim:
1. The framework only draws: everyone picks theirs, the projector flips, and the presses that come back are identical.
2. Since the presses are framework-free, the room's own sessions can be replayed with no framework at all.
3. A one-step change is tested against everything the room just did, in a quarter of a second.

It starts from your framework bar, builds through what comes back, and ends on something developers will want on Monday.

**Second choice:** Story 3, "Send me your screen", the deepest single idea.

**Decisions it needs:**
- Svelte and Angular: inside lyceum as app code, or in `packages/nova` with a case.
- Recording presses: lyceum's target wraps `dispatch`, since Moss has no hook.
