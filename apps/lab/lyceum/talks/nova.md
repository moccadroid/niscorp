# Nova — the talk: The screen is a document

30 minutes. Talk A's story is the spine: one decision, and everything that follows from it. Talk C supplies how each step is told: the room lives it on their phones first, and the explanation comes after. The nisc map opens the talk and closes it.

Each slide is written the same way as before: what the projector shows, the controller, the phones, and what you say. The strip at the top of the projector shows only the address and the number joined. Numbers on the slides are whatever the demo produces. Nothing is presented as a measurement.

---

### 1. Nova

**Projector:**
- "Nova", and "The screen is a document."
- A terminal pane with `$ pnpm add @niscorp/nova @niscorp/prism @niscorp/strata zod`.
- The join QR and `talk.nisc.dev`.

**Controller:**
- Tools: **The Q&A on phones**.
- Notes:
  - [give everybody the Q&A]
  - you're the demo tonight
  - keep the form open: it will change

**Phones:** the Q&A form.

**You say:**
> Hi. Get your phones out and scan that. I'm serious: tonight, you're the demo.
>
> You'll get a form to ask me things. Use it whenever you like. And keep it open, because that form is going to change a few times while I talk, and every time it does, that's the point I'm making.

---

### 2. Nova is where nisc draws.

**Projector:** the nisc map, four layers stacked, each with its packages by name:
- **Screens:** Nova
- **Data:** Prism, Vex, Strata
- **Models:** Signal, Solid, Cortex
- **Server:** Moss, Charter, Tide

Nova is lit; the rest is dimmed. This same map comes back in the other talks, with that talk's package lit.

**Controller:**
- Notes:
  - nisc: apps built from documents, top to bottom
  - tonight: the top layer
  - everything below gets its own talk

**You say:**
> Quick map first, so you know where we are. nisc is a stack for building apps, and the idea running through all of it is the same: the parts of an app that are usually code — screens, queries, permissions, schedules — are documents instead.
>
> This is all of it. Tonight is the top layer: Nova, the part that draws the screens. Everything underneath gets its own evening.

---

### 3. A screen is code.

**Projector:** "A screen is code." Under it, one line at a time as you say them:
- "Only someone who writes code can write it."
- "It runs where it was built for."
- "To change it, you ship."

**Controller:**
- Notes:
  - who can write it
  - where it runs
  - how it changes

**You say:**
> Here's where every one of us starts. A screen is code.
>
> Which means only someone who writes code gets to write one. You, or your coding agent. Not a model inside your running app. Not a partner who wants a screen in your product. You'd be running their code, and nobody's doing that.
>
> It means a screen runs where it was built for. Your React screen isn't going into a terminal anytime soon.
>
> And it means that to change a screen, you ship.
>
> We've lived with all three for so long that they don't even feel like decisions. Nova makes one decision that changes all three.

---

### 4. This one isn't.

**Projector:**
- Left: the Q&A form as everyone has it.
- Right: its file, `questions/send.action.ts`, whole.
- As you name each part, that part takes the pane on its own, large enough to read: `data`, `layout`, `triggers`, `endpoints`. In the layout, the branches of the line under the button are folded (`{ … }`).

**Controller:**
- Tools: **The document, part by part**.
- Notes:
  - [mark each part as you say it]
  - no handler anywhere
  - steps from a closed list

**Phones:** the same form.

**You say:**
> The form in your hand isn't code. It's this file, and there's nothing behind it.
>
> [Data] Some data to start with: an empty draft.
>
> [Layout] A layout: a field and a button, by name, pointing into that data. Type something, and it lands in the draft.
>
> [Triggers] And what a press does. There's no click handler. A press runs steps, and the steps come from a short list Nova knows: set a value, call something, open a screen, go back. About twenty. None of them runs code.
>
> [Endpoints] What it can call, by name. Anything that actually computes lives behind one of these.
>
> Nova calls this an action. And that's the decision: a screen is a document, not a program. Let me show you what falls out of that, starting with the phone in your hand.

---

### 5. It can read all of it.

**Projector:**
- Left: the form, as everyone has it, with the X-ray on: the form outlined, `questions.send` on its tag.
- Right, top, large: what was typed, as the model reads it: `{ "data": { "draft": "How does Back work", … } }`. It changes as you type into the projector's form from the controller.
- Right, below, small: the rest of the screen's document: what each part is and what it does.

**Controller:**
- Tools: **X-ray, everybody's own screen**, **Type into the projector's form**.
- Notes:
  - not pixels: the screen itself
  - [give everybody the X-ray] switch it on, tap the tag
  - that's what it reads, what you typed included
  - [type half a question into the projector's form]

**Phones:** the X-ray switch arrives under the form; whatever was half-typed stays. Switched on, a tag on every screen; tapping it opens that screen's document, with what they typed in it.

**You say:**
> A model doesn't have to guess what's on your screen from a screenshot. It reads the screen itself. All of it.
>
> [give everybody the X-ray]
>
> There's a new switch under your form. Switch it on, and tap the tag.
>
> That's your screen as a model reads it. If you typed half a question, it's in there.
>
> [type into the projector's form]
>
> Same here: as I type, it's in the data. Every part of the screen, what it shows, and what each button does. That's what an assistant reads before it fills a form in for you.

---

### 6. A model can write it.

**Projector:**
- Left: the form, live, as it is on every phone.
- Right, top: before you ask, "Say how the form should look." While the model writes: the request on yellow, "Writing a layout", and a moving striped bar under it. After: the request.
- Right, below, once a layout is up: the layout's changed lines, marked, with the line before and after each.

**Controller:**
- Tools: **Ask the model for a layout**.
- Notes:
  - keep typing
  - [press "Put the button above the field"]
  - look at your phone
  - somebody shout one → [type it, send]
- After a press, the tool says whether the model's layout went up, or the prepared one.

**Phones:** the form redraws in the new layout. What they typed is still there.

**For the three requests on the controller, a layout is prepared.** The model gets 6 seconds. If its layout hasn't been taken by then, or it fails, the prepared layout goes up instead and anything the model sends later is ignored. A request typed from the room has no prepared layout. A layout that leaves out the field or the button, or puts something in a grid area the grid doesn't have, is sent back to the model with what's wrong.

**You say:**
> Keep typing. I'm going to change your screen.
>
> [press "Put the button above the field"]
>
> That was a model. It rewrote the screen in your hand, and if you were mid-sentence, your sentence is still there.
>
> It can do that because it isn't writing code. It's filling in a document with a dozen shapes, from the components we gave it and an example of the data. A grammar that small doesn't need a huge model. This is gpt-oss-120b, small and fast.
>
> Somebody shout one.
>
> [type what someone calls out, send]

---

### 7. It can't break it.

**Projector:**
- Left: a layout with two mistakes: only the lines that differ from the form's own layout, marked.
- Right, after the press: "Refused. Nobody's form changed.", and the sentences that refused it.

**Controller:**
- Tools: **Hand over a broken layout**.
- Notes:
  - it only writes the layout: a press does what we wrote
  - [hand over the broken one]
  - your phone didn't move
  - the sentence goes back to the model

**Phones:** nothing changes, and that's the point.

**You say:**
> You might be thinking: a model is writing screens in production, what could go wrong.
>
> Two things. First, it only writes the layout. What a press does stays what we wrote, so a model can rearrange your screen but it can't give it a new behaviour.
>
> Second, if it gets the layout wrong — here's one with a button nothing answers, and a line reading data that doesn't exist —
>
> [hand it over]
>
> — your phone didn't move. It was refused, one sentence per mistake. When it's the model's own layout, that sentence goes straight back to the model, and it tries again. You only ever see one that passed.

---

### 8. Someone else can write it.

**Projector:**
- Left: the checks Applause's file passed before it could be approved, with ✓s.
- Right: Applause's file address; then "Passed. Waiting for approval."; once approved, Applause's own screen for the projector: "Claps from the room" and the count.

**Controller:**
- Tools: **Applause**.
- Notes:
  - Applause: a made-up company, the file is real
  - [install]
  - checked before I can approve it
  - [approve] → check your phone, and clap

**Phones:** an Applause card arrives at the bottom of the list with one big Clap button. Whatever was half-typed in the form stays.

**You say:**
> If a model can write a screen safely, so can a stranger.
>
> This is Applause. They don't exist; I made them up. But their file does, and it's nowhere near my server.
>
> [install]
>
> It's two screens, as data: a button for your phone, and a counter for this screen. They use our components and call our queries, and they're checked before I'm even allowed to approve them.
>
> [approve]
>
> Check your phone. Go on, clap.
>
> A company that has never seen this code just put a button on your phone and a counter on my screen. Nobody deployed anything, and neither can do one thing ours couldn't.

---

### 9. Anything can draw it.

**Projector:**
- The projector itself flips: plain DOM → React → Vue → the terminal renderer, where the whole slide turns into text with numbered buttons → back.
- A tally of the room's picks keeps counting through every flip.
- The ssh line at the bottom.

**Controller:**
- Tools: **Which renderer draws**.
- Notes:
  - [flip the projector]
  - everyone: pick yours
  - laptops: ssh in

**Phones:** the framework bar arrives at the bottom of the list: React, Vue, Svelte, Angular, plain DOM, Terminal. They pick, and the phone redraws in that framework with its name in a corner. A half-typed question survives both: the bar arriving, and the switch.

**You say:**
> Last one, and you get to pick. There's a bar on your phone: React, Vue, Svelte, Angular, plain DOM, or a terminal. Pick the one you'd defend in a code review.
>
> [flip the projector through all of them]
>
> This slide just went through three frameworks and plain text, and that counter never stopped. Your phone is now drawn by whatever you picked. Half a question typed? Still there.
>
> Nova doesn't hand a framework your screen. It hands it a plain tree, and gets the same press back no matter who drew the button. That's why your neighbour on Svelte and you on React are using the same app, and the server can't tell you apart. A renderer for another framework is a walker and about fifteen components. Svelte and Angular were written exactly like that, for tonight.
>
> Got a laptop? That line at the bottom. ssh in, and you're in this talk from your terminal.

---

### 10. What you still write.

**Projector:**
- Left: the components this talk's screens use, as tiles in the code font.
- Right: the kit's button, `src/ui/kit.ts`, twelve lines.

**Controller:**
- Notes:
  - your components
  - your functions
  - the rest: documents

**You say:**
> So what's left for you to write? Your components — this is our button, twelve lines — because Nova has no look of its own. Your app looks like your app. And your functions, behind the calls, where the real work happens.
>
> Everything in between is documents. Tonight a model wrote some, a company you've never heard of wrote some, and five different renderers drew them. Oh, and the rest? A coding agent wrote them. I read them. Documents are very easy to read.

---

### 11. That was one layer.

**Projector:** the nisc map again. Nova is lit, and the layers below are brighter than on slide 2, each with one line of what it does:
- **Data:** queries, transforms and migrations, as documents.
- **Models:** typed answers, streams and agents.
- **Server:** each person's app on the server, permissions, and schedules.

**Controller:**
- Notes:
  - everything tonight: the top layer
  - the same idea, all the way down
  - more talks to come

**You say:**
> Everything you did tonight was one layer: the screen. Underneath it, the same idea goes all the way down. The queries are documents, the permissions are documents, the schedules are documents. That's for the next few evenings.

---

### 12. nisc.dev/nova

**Projector:** `nisc.dev/nova`, large. "The guides, the reference, and forty-two examples you can press."

**You say:**
> Everything about Nova is at nisc.dev/nova: the guides, the reference, and forty-two examples you can press. Thanks. Questions.

---

### 13. Your questions.

**Projector:**
- The question you put up, large.
- Before any: "Ask on your phone."

**Controller:**
- Tools: **Put a question on the screen**: every question the moderator let through; one press puts it up.

**Phones:** whoever asked the question on the screen sees "Your question is on the screen."

**You say:** *(answers)*

---

## What changed from A and C

**Kept from A:**
- the spine: a screen is code, one decision, then what follows;
- the order, which escalates: read it, a model writes it, it can't do anything new, a stranger writes it, anything draws it.

**Kept from C:**
- every step happens in the room's hands first, then gets explained;
- "you're the demo".

**From B:** the interactive moments that keep the room involved:
- the room calls out a layout request;
- the room picks their framework.

**New:**
- the nisc map, at the start and again at the end;
- the coding-agent point, moved to a light line at the close instead of a slide;
- no numbers presented as measurements.

**What has to exist before this can be built:**
- the layout tool and the broken layout, pointed at the Q&A form;
- a framework choice per person on the phones;
- Svelte and Angular kit adapters;
- the terminal renderer as a projector look;
- the nisc map slide, made once and used in every talk.

---

## Found while building (2026-11-02)

- **Giving something to the room keeps what people typed.** It used to throw away every phone's server shell and build a new one. Now the members' access is read again (`invalidateTag`), Moss brings each live shell level in place, and the phone's list is placed again with Nova's `reconcile`, which adds the new screen at the end and leaves the rest alone (`server/placement.ts`). The same holds when The QA Company is approved.
- **The model needed `Sheet` and `Cell` explained.** Where a field sits comes from the Sheet's `areas`, not from the order of its children. Without that line in the palette, the model reordered the children and every phone looked the same.
- **The code panes show what can be read from the room.** The form's whole file is about sixty lines. Slide 4 shows it whole first, then each part on its own; slides 6 and 7 show only the changed lines. Before comparing, keys are put in one order and a single child is written as a list of one, so a model writing `props` before `ref` marks nothing.
- **Svelte and Angular are this talk's own code** (`src/ui/svelte/`, `src/ui/angular/`), not packages. Angular needs `experimentalDecorators` in lyceum's tsconfig, and runs in dev mode.
- **The terminal look on the projector** is drawn at projector size (1.5vw); on a phone it is unchanged.
- **The projector's form is X-rayed by a Cell prop**, `xray`, so only the form is outlined, not the whole slide (grammar marker 20, in every kit).
- **Slide 5's typing is the speaker's**, from the controller (`tools.form-type`). The room's own drafts stay on their phones: the stage reading a member's draft would go around the charter.
- **A model's layout is checked before Moss sees it.** It must keep every button and bound field the form had, and put nothing in a grid area its Sheet doesn't have. In one run, the model's first two tries for "Put the button above the field" were sent back this way, and the third was taken. The "Ask me anything" form that lost its field would have been caught here.
- **Applause has its own table, `claps`**, not the press button's. Clapping with `presses` would mean every member may press the button, and the nisc talk's button slide depends on only some people having it. A clap deletes with its member. Slide 8 is a seat integrations can attach to (`slide.nova-stranger`), as the last slide is.
- **Applause's file is not live yet.** It's built by `apps/lab/lyceum-vendor-demo` (`applause/bundle`) and goes to GitHub Pages with the showroom deploy. Until that runs, `LYCEUM_APPLAUSE_URL` points the talk at a copy served from this machine.

**Run (2026-11-02):** the whole talk, live, with two phones, every slide photographed at 1920×1080. A question half-typed on one phone before slide 5 was still there after the X-ray arrived, after gpt-oss-120b moved the button above the field, and after that phone switched to Svelte. A second phone kept its half question through The QA Company's approval and through the framework bar arriving. The broken layout was refused with both mistakes named. One phone picked Svelte and one Angular, and the tally on the projector counted them in DOM and in the terminal look. A question sent from a phone went up on the last slide. 17 checks pass, and the X-ray check now also asserts that a half-typed message survives the give. Nothing is committed.

**Run after the fine-tuning (2026-11-02):** the whole talk again, live, every slide photographed.
- **Slide 5:** what the speaker typed showed on the X-rayed form and, large, in the data beside it.
- **Slide 6:** the striped "Writing a layout" state showed while the model worked. Both prepared requests went up through the model, on tries 3 and 1. In a separate run with the model made to fail, the prepared "side by side" layout went up instead, and the phone kept its half-typed question.
- **Slide 8:** Applause installed from a local copy, passed its checks and was approved. Both phones got the Clap button with their drafts kept, and the projector counted 4 claps.
