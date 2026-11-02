# Talk B — Who writes the screen

30 minutes. Told in order of who writes a screen. Each new author needs more of Nova than the one before. Everything happens in this talk: on the projector, the speaker's controller, and the phones in the room.

**How each slide is written below:**
- **Projector:** what the room sees.
- **Controller:** the speaker's tools for that slide, and the notes as they appear on the controller (short cues, presses in brackets).
- **Phones:** what people with a phone see or do.
- **You say:** the speaker's words.

The strip at the top of the projector shows only the address and the number joined.

---

### 1. Nova

**Projector:**
- "Nova", large.
- Under it: "The screen is a document."
- A terminal pane:
  ```
  $ pnpm add @niscorp/nova @niscorp/prism \
      @niscorp/strata zod
  ```
- On the right: the join QR and `talk.nisc.dev` in the code font.

**Controller:**
- Tools: **The Q&A on phones**.
- Notes:
  - [give everybody the Q&A]
  - join now
  - your phone changes later

**Phones:** they join, pick a name, and get the Q&A form.

**You say:**
> Hi. Before I start, scan that code. You'll get a form to ask me questions, and a bit later that screen on your phone is going to change a few times. Ask whatever you want, whenever you want; we'll do questions at the end.
>
> This talk is about Nova. Nova is the part of nisc that draws screens. And the whole talk is one question: who writes the screens in your app?

---

### 2. Someone has to write every screen.

**Projector:** that sentence, alone.

**Controller:**
- Notes:
  - today: you and your coding agent
  - a screen is code: it can do anything
  - more authors want in

**You say:**
> Today, the answer is: you do. Or your coding agent does and you review it. Either way, a screen is code. It can do anything code can do, it runs on the platform it was written for, and when you want to change it, you ship.
>
> That's fine as long as the only people writing screens work on your team. But more and more, someone else wants to write one. A model in your running app that should lay out a screen for this user, right now. Another company whose product should show up inside yours. With code, you can't let them in. You'd be running their code.
>
> Nova changes what a screen is, so that you can.

---

### 3. In Nova, a screen is a document.

**Projector:**
- Left: the Q&A form, drawn as it is on everyone's phone.
- Right: its file, `questions/send.action.ts`, whole.
- As you name each part, it is marked: `data`, `layout`, `triggers`, `endpoints`.

**Controller:**
- Tools: **The document, part by part**: four buttons, Data, Layout, Triggers, Endpoints.
- Notes:
  - [mark each part as you name it]
  - no click handler anywhere
  - a press runs steps from a closed list

**Phones:** the same form.

**You say:**
> This is the form on your phone, and this is all of it. There is no other file behind it.
>
> [Data] It starts with this data: an empty draft, and whether you've sent something.
>
> [Layout] Then a layout. It names components — a label, a field, a button — and points into the data. The field is bound to the draft, so what you type is written straight into it.
>
> [Triggers] Then what a press does. The button has no click handler. Pressing it runs these steps: clear the error, call the endpoint, and when it answers, empty the draft and mark it sent. Those steps come from a list Nova knows. Set a value, push onto a list, call something by name, open another screen, go back. About twenty of them. There is no step that runs code.
>
> [Endpoints] And the calls it can make, by name. This one sends your question to the server. Anything that has to compute happens behind a call like this, in code somebody wrote and reviewed.
>
> Nova calls this an action. Your own components draw it. This talk's button is eleven lines; Nova doesn't come with a look.

---

### 4. Your coding agent writes it.

**Projector:**
- "Every screen in this talk was written by a coding agent." The count of screens appears beside it and is real (measure it on the day).
- Under it, one real change to a screen from this talk's git history: about ten lines of diff, a layout node added and a trigger.

**Controller:**
- Notes:
  - this talk's screens: Claude Opus 5.5
  - what I review: a few lines of document
  - no effect, no handler, no state hidden in a component

**You say:**
> The second author is the one most of you already have. Every screen you'll see tonight was written by a coding agent: Claude Opus, in my case. I didn't write them; I reviewed them.
>
> And reviewing a document is a different job from reviewing a component. This is a real change from last week. A node in the layout, a trigger, a step. When I read it, I know everything the screen can now do, because there's nowhere else for it to do anything. No effect that fires on some dependency, no handler three files away.

---

### 5. A model in the running app writes it.

**Projector:**
- Before you ask: one sentence, "Say how the form should look."
- After you ask:
  - the request, large;
  - how long it took ("1,140 ms", the real number);
  - which model ("gpt-oss-120b, through Nova's layout agent");
  - beneath, the layout's lines, with the changed ones marked.

**Controller:**
- Tools: **Ask the model for a layout**: three ready requests, or type your own.
- Notes:
  - [press a request, or type what someone calls out]
  - every phone redraws
  - what you'd typed is still there

**Phones:** the form redraws in its new layout. Anything typed is still in the field.

**You say:**
> Now the third author: a model, inside the running app, writing a screen for the people using it.
>
> [press "Put the button above the field"]
>
> That took about a second. Look at your phone. The form you had is laid out differently now, and if you'd started typing a question, it's still there.
>
> Why is this possible with a small, fast model? Because the model doesn't write code. It fills in a document in a grammar that has maybe a dozen shapes. It's handed the components it may use, an example of the data, and what it must keep: the field and the button. And whatever it hands back is checked before anyone sees it. The model here is gpt-oss-120b on Groq. A frontier model would be a bit more reliable and ten times slower. This is enough.
>
> [take a request from the room, type it, press Send]

---

### 6. A wrong one is refused.

**Projector:**
- Left: a layout with two mistakes, the faulty lines marked: a button no trigger answers, and a line that reads data the form doesn't have.
- Right, after the press: "Refused. Nobody's form changed.", and under it the sentences that refused it, word for word.

**Controller:**
- Tools: **Hand over a broken layout**.
- Notes:
  - [hand it over]
  - refused, one sentence per mistake
  - a refused layout goes back to the model with that sentence

**Phones:** nothing changes.

**You say:**
> What if the model gets it wrong? Here's a layout with two mistakes in it — the kind a model actually makes. A button called "Vote" that nothing answers, and a line that reads something called "speaker" that this form doesn't have.
>
> [hand it over]
>
> Refused. Your phones didn't move. And the reason is written in a sentence a model can read. When the model's own layout is refused, that sentence goes straight back to it, and it tries again. Three tries, and if it still can't, you keep the screen you had.
>
> You can only check this because the screen is a document. You can't read a component and know that a button does nothing.

---

### 7. Another company writes it.

**Projector:**
- First, the install as it happens: the address of the other company's file, a static file on GitHub Pages; the checks it passed, each with a ✓; then "Approved".
- Then a list of the screens it added and where they went.

**Controller:**
- Tools: **Integrations**: install, approve, take back.
- Notes:
  - [install the QA Company]
  - a static file: data only
  - checked before I approve
  - [approve] → on your phone

**Phones:** a new screen appears in their list, from "The QA Company".

**You say:**
> The fourth author is another company. This is a company called The QA Company — I made them up, but their file is real. It's sitting on GitHub Pages right now, nowhere near this server.
>
> [install]
>
> What they ship is three screens. Data only: actions written in this talk's components, calling this talk's queries. Before I can even approve it, it's checked: every screen against what this talk can draw, every call against what this talk offers.
>
> [approve]
>
> Look at your phone. There's a screen from a company that has never seen this code, drawn with our components, and it can't do anything our own screens couldn't do. Nobody deployed anything.

---

### 8. Anyone can draw it.

**Projector:**
- The projector itself flips: plain DOM → React → Vue → the terminal renderer, where the whole slide turns into text with numbered buttons → back.
- A live tally of the room's picks runs throughout.
- At the bottom: the ssh line in the code font.

**Controller:**
- Tools: **Which renderer draws**.
- Notes:
  - [flip the projector through all of them]
  - everyone: pick yours
  - same events come back from every one
  - laptops: ssh in

**Phones:** a bar in their list: React, Vue, Svelte, Angular, plain DOM, Terminal. Their phone redraws with what they pick, and the framework's name is in a corner.

**You say:**
> Four authors, and Nova never asked any of them which framework they use. That's because Nova draws a screen as a plain tree — no React in it, no DOM — and a renderer turns that tree into something on a surface.
>
> [flip the projector to React, to Vue, to the terminal]
>
> That's this slide, drawn three different ways, and the count on it kept going. Now pick yours. React, Vue, Svelte, Angular, plain DOM, or a terminal.
>
> The server can't tell which of you picked what. A press comes back as the same event from every one of them. And if you'd rather not use a browser at all: that line at the bottom. ssh in, and you get this talk in your terminal, every button numbered.
>
> Writing a renderer for a new framework is a walker and about fifteen components. Svelte and Angular were written that way, for this talk.

---

### 9. A program can read it.

**Projector:**
- Left: a phone's screen as the terminal renderer prints it, every button numbered.
- Right: what the same screen says to a program: its data, and what each button does.

**Controller:**
- Tools: **X-ray, everybody's own screen**.
- Notes:
  - [give everybody the X-ray]
  - tap the tag on any screen → its document, with your data
  - no screenshot: a test or an assistant reads this

**Phones:** every screen gets a small tag. Tap it, and that screen's document opens, with their own data in it.

**You say:**
> One more reader: a program. Because the screen is a document, a program doesn't need a screenshot to know what's on it.
>
> [give everybody the X-ray]
>
> Tap the tag on any screen on your phone. That's its document, with your data in it — whatever you typed is right there. A test reads exactly that. So does an assistant that wants to help you fill something in: it can see every button and what it does, prepare the form, and leave the pressing to you.

---

### 10. You still write your components.

**Projector:**
- Left: the components this talk's screens name, as tiles in the code font.
- Right: the kit's button, `src/ui/kit.ts`, eleven lines, as written.

**Controller:**
- Notes:
  - your components, your design system
  - your functions, behind named calls
  - everything else is a document

**You say:**
> So what's left for you? Two things. Your components — this is our button, eleven lines — because Nova has no look of its own; the screens look like your product. And your functions, behind the named calls, where the real work happens. Everything in between is a document, and you just watched four different authors write one.

---

### 11. The screen is a document.

**Projector:** `nisc.dev/nova` in the code font, large. Under it: "The guides, the reference, and forty-two examples you can press."

**Controller:**
- Notes:
  - nisc.dev/nova
  - questions now

**You say:**
> Everything I showed you is on nisc.dev/nova: the guides, the whole reference, and forty-two examples you can press. Thanks. Let's do questions.

---

### 12. Your questions.

**Projector:**
- The question you put up, large.
- Before any: "Ask on your phone." and the address.

**Controller:**
- Tools: **Put a question on the screen**: every question the moderator let through; one press puts it up.

**Phones:** whoever asked the question on the screen sees "Your question is on the screen."

**You say:** *(answers)*

---

## What has to exist before this can be built

- The model-writes-the-form tool and the broken layout, pointed at the Q&A form (`questions.send`).
- A renderer choice per person (today it's one per surface), and the phone's framework bar.
- Svelte and Angular adapters, as kit adapters in this talk's app, using only Nova's public surface.
- The terminal renderer as a projector look (`canvasText` exists on the server).
- Numbers to measure on the day of the talk:
  - the count of this talk's screens;
  - the model's time;
  - the lines of the diff on slide 4.
