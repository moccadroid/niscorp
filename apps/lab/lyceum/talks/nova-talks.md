# Three Nova talks, each the whole picture

Each talk covers everything Nova makes possible. The three only differ in how they tell it. Evidence comes from the apps built on nisc. Their own DESIGN and PLAN files are marked "check" where I haven't seen the running app.

## The whole picture: what every talk covers

1. **A screen is a document.** An action is its data, a layout over that data, the steps a press runs (a closed list), and its named calls. Your own components draw it.
2. **So a model can write it.** A model fills in a document in a closed grammar instead of writing code. That's small enough for a small, fast model: gpt-oss-120b, about 1–2.6 s measured in lyceum. What it hands back is parsed and audited before anyone sees it, and it cannot run code.
   - Encore puts a room together from a sentence.
   - Relay's screen builder writes screens with an agent.
   - nisc.dev's hero draws a screen while a model streams it (Solid).
   - lyceum's timers are written by a model and run as a role that can reach nothing else.
3. **So a program can work with it.** Every button is listed with what it does.
   - lyceum's assistant prepares and a person presses.
   - The X-ray shows any screen's document on the phone.
   - Encore's model picks among real rows and never invents.
   - Tests run with no browser, and the devtools are written in Nova.
4. **So it ships as data.** A new screen, a customer's own layout, or another company's screens are a write, not a deploy.
   - Lyra: every studio a different app on one deployment.
   - Atrium: a feature per hotel and per audience.
   - lyceum: another company's screens installed live from a static file.
5. **So it draws anywhere.** One tree, the same events back.
   - Relay in a browser, a Chrome extension and two terminals.
   - nisc.dev with no React.
   - Mythos and Fable running entirely in the browser.
   - lyceum on projector, phones and ssh, with the room picking its framework.
6. **And it can be trusted from strangers.** No code anywhere in a document. The head refuses scripts. Intake checks every screen from outside.

Nova's part is the document, the grammar, the audit, the adapters and reflection. Moss carries screens to each person and stores what's published. Cortex and Signal run the models. Charter and Vex decide what anyone, person or agent, can reach. Each is named as such.

---

## Talk A: One decision, everything after it

**The line:** "Nova makes one decision, that a screen is a document and not code, and every app on nisc is what follows from it: screens a small model writes in a second, apps that change per customer without a deploy, the same app in a browser and a terminal, and assistants that prepare while you press."

**The arc** (each part is one consequence, shown by the app where it matters most):
1. **The decision (4 min).** Today a screen is code. Only a person or a coding agent writes it, it runs on one surface, and to change it you ship. Then one real lyceum action, whole.
2. **A model writes it (6 min).** Live: a model writes a layout from a sentence in about a second, and every phone redraws. Then Encore's ops room, put together from "storm at 9 move headliner to the tent" (check). Why a small model is enough: the grammar is closed, and every answer is checked.
3. **It can't do anything new (3 min).** Steps from a closed list, no code anywhere. A broken screen is refused with the sentence that refused it. Another company's screens are installed live and pass intake first.
4. **It ships as data (5 min).** Lyra's studios as different apps from row writes. Atrium's per-hotel features (check).
5. **It draws anywhere (6 min).** The room picks its framework. Relay in a Chrome extension and a terminal. nisc.dev with no React. ssh into the talk.
6. **A program sees what you see (4 min).** The X-ray on phones. The assistant prepares, and a person presses.
7. **Close (2 min).** What you'd write on Monday: your components, and actions.

---

## Talk B: Who writes the screen

**The line:** "In five years most screens won't be written by a person. In Nova it doesn't matter who writes one — you, your coding agent, a model in the running app, another company or your customer — because what they hand you is a document Nova checks, and that any surface can draw."

**The arc** (the authors, one after another, each needing more of Nova):
1. **A person (3 min).** One action, whole: data, layout, steps, calls, drawn by your components.
2. **Your coding agent (4 min).** Lyceum's own screens were written by Claude Opus 5.5. A document in a closed grammar is easy to write and easy to review: a few lines, nothing hidden in a handler.
3. **A model in the running app (8 min).**
   - Live: gpt-oss-120b writes a layout from a sentence, checked by the audit, refused with a sentence when it's wrong, then redrawn on every phone.
   - Encore: the room assembles from what the operator types, and the model only picks (check).
   - Relay's screen builder (check).
   - nisc.dev's screen drawn while it streams.
4. **Another company (5 min).** Live: install the vendor's screens from a static file. They pass intake, the speaker approves them, and they're on every phone. Atrium's integration vendors ship their surfaces the same way (check).
5. **Your customer (4 min).** Lyra: a studio's theme replaces layouts by action id, as a row write (check).
6. **Whoever reads it (4 min).** The X-ray; the assistant preparing while a person presses; the terminal listing every button by number; the room picking its framework, and the same events coming back.
7. **Close (2 min).**

---

## Talk C: Built in this room

**The line:** "The app we used for the talk was built on Nova, and everything we did on our phones was Nova: the screens arrived as data, a model rewrote one while we watched, another company's screens appeared, we picked our own framework, and nothing that came in could run code."

**The arc** (lyceum is the spine; every other app is shown once, where it proves something lyceum can't):
1. **Join (2 min).** The phones get the Q&A. "This is a Nova screen."
2. **What a screen is (4 min).** The X-ray on phones: each person opens their own screen's document.
3. **A model changes it (6 min).** Live: the speaker asks for a layout in a sentence, gpt-oss-120b writes it in about a second, and every phone redraws. Then a broken one, refused. Then Encore's ops room, as the same idea at full size (check).
4. **Another company's screens (5 min).** Installed live, checked at intake, approved, on every phone.
5. **Pick your framework (6 min).** Phones pick React, Vue, Svelte, Angular, DOM or a terminal. The projector flips with the tally running, and laptops ssh in. Relay's Chrome extension and nisc.dev show the same idea outside this room.
6. **Software works with it (4 min).** The assistant prepares and a person presses. Tests run without a browser.
7. **Ships as data (2 min).** Lyra and Atrium, as what this becomes for a product with many customers (check).
8. **Close (1 min).**

---

## Which one

- **Talk A** is the clearest argument.
- **Talk B** has the strongest story: the authors change over the talk, and the model thread runs through it naturally.
- **Talk C** is the most live: the room lives every claim.

All three cover the same six things.
