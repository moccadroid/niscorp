# The screen is a document — A and C merged

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
- As you name each part, it is marked: `data`, `layout`, `triggers`, `endpoints`.

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

### 5. You can read it.

**Projector:** a phone's screen as the terminal renderer prints it, every button numbered. Beside it: that screen's data, and what each button does.

**Controller:**
- Tools: **X-ray, everybody's own screen**.
- Notes:
  - [give everybody the X-ray]
  - tap the tag
  - that's what a program sees

**Phones:** a small tag on every screen. Tapping it opens that screen's document, with whatever they typed in it.

**You say:**
> [give everybody the X-ray]
>
> You've got a little tag on your screen now. Tap it.
>
> That's your screen's document. If you typed half a question, it's in there. You can read your own screen like a file, because it is one.
>
> And that's exactly what a program sees. No screenshots, no guessing from pixels. Every button, and what it does. That's what a test reads. That's what an assistant reads before it fills a form in for you — and then it leaves the pressing to you.

---

### 6. A model can write it.

**Projector:**
- Before you ask: "Say how the form should look."
- After you ask:
  - the request, large;
  - how long it took;
  - "gpt-oss-120b, through Nova's layout agent";
  - the layout's changed lines, marked.

**Controller:**
- Tools: **Ask the model for a layout**.
- Notes:
  - [press "Put the button above the field"]
  - look at your phone
  - [take one from the room]

**Phones:** the form redraws in the new layout. What they typed is still there.

**You say:**
> Keep typing. I'm going to change your screen.
>
> [press "Put the button above the field"]
>
> That was a model. It rewrote the screen in your hand in about a second, and if you were mid-sentence, your sentence is still there.
>
> It can do that because it isn't writing code. It's filling in a document with a dozen shapes, from the components we gave it and an example of the data. A grammar that small doesn't need a huge model. This is gpt-oss-120b, small and fast. A frontier model would be slightly better and ten times slower, and you'd be watching a spinner.
>
> Somebody shout one.
>
> [type what someone calls out, send]

---

### 7. It can't do anything new.

**Projector:**
- Left: a layout with two mistakes, the faulty lines marked.
- Right, after the press: "Refused. Nobody's form changed.", and the sentences that refused it.

**Controller:**
- Tools: **Hand over a broken layout**.
- Notes:
  - [hand it over]
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

**Projector:** the install as it happens: the file's address on GitHub Pages, the checks it passed with ✓s, "Approved", then the screens it added.

**Controller:**
- Tools: **Integrations**.
- Notes:
  - [install the QA Company]
  - [approve]
  - check your phone

**Phones:** a screen from The QA Company appears in their list.

**You say:**
> If a model can write a screen safely, so can a stranger.
>
> This is The QA Company. They don't exist; I made them up. But their file does: it's on GitHub Pages, nowhere near my server.
>
> [install]
>
> It's three screens, as data. They use our components and call our queries, and they're checked before I'm even allowed to approve them.
>
> [approve]
>
> Check your phone. A company that has never seen this code just added a screen to it. Nobody deployed anything, and that screen can't do one thing ours couldn't.

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

**Phones:** the framework bar: React, Vue, Svelte, Angular, plain DOM, Terminal. They pick, and the phone redraws in that framework with its name in a corner. A half-typed question survives the switch.

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
- Right: the kit's button, `src/ui/kit.ts`, eleven lines.

**Controller:**
- Notes:
  - your components
  - your functions
  - the rest: documents

**You say:**
> So what's left for you to write? Your components — this is our button, eleven lines — because Nova has no look of its own. Your app looks like your app. And your functions, behind the calls, where the real work happens.
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
