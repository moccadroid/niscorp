# Talk A — One decision, everything after it

30 minutes. Nova makes one decision, and the talk walks through what follows from it, one consequence at a time. Everything happens in this talk: on the projector, the speaker's controller, and the phones in the room.

Each slide is written the same way as Talk B (`nova-b.md`): what the projector shows, the controller, the phones, and what you say. The strip at the top of the projector shows only the address and the number joined.

---

### 1. Nova

**Projector:**
- "Nova", and "The screen is a document."
- A terminal pane with `$ pnpm add @niscorp/nova @niscorp/prism @niscorp/strata zod`.
- The join QR, and `talk.nisc.dev`.

**Controller:**
- Tools: **The Q&A on phones**.
- Notes:
  - [give everybody the Q&A]
  - join now

**Phones:** the Q&A form.

**You say:**
> Hi. Scan that and you'll have a form for questions. Keep it open; it'll change a few times during the talk.
>
> This is a talk about Nova, the part of nisc that draws screens. It's about one decision Nova makes, and everything that follows from it.

---

### 2. A screen is code.

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
> Here's where we all start. A screen is code. That means three things we don't usually think about, because they've always been true.
>
> Only someone who writes code can write a screen: you, or your coding agent. A model in your running app can't, a partner company can't — you'd be running their code.
>
> A screen runs where it was built for. Your React screen doesn't run in a terminal, or in a Vue app, without work.
>
> And to change a screen, you ship.
>
> Nova makes one decision that undoes all three.

---

### 3. In Nova, a screen is a document.

**Projector:**
- Left: the Q&A form as it is drawn on everyone's phone.
- Right: its file, `questions/send.action.ts`, whole, with `data`, `layout`, `triggers` and `endpoints` marked as you name them.

**Controller:**
- Tools: **The document, part by part**.
- Notes:
  - [mark each part]
  - no handler: steps from a closed list
  - your components draw it

**Phones:** the same form.

**You say:**
> This is the form on your phone, whole.
>
> [Data] What it starts with.
> [Layout] What it shows: components by name, pointing into the data. The field writes what you type into the draft.
> [Triggers] What a press does. Not a handler. Steps, from a list of about twenty that Nova knows: set a value, call something, open a screen, go back. None of them runs code.
> [Endpoints] What it can call, by name. Anything that computes is behind one of these.
>
> Nova calls this an action, and your own components draw it. That's the decision: a screen is a document. Everything else in this talk follows from it.

---

### 4. A model can write it.

**Projector:**
- Before you ask: "Say how the form should look."
- After you ask:
  - the request, large;
  - the time it took;
  - "gpt-oss-120b, through Nova's layout agent";
  - the changed lines of the layout, marked.

**Controller:**
- Tools: **Ask the model for a layout**.
- Notes:
  - [press a request, or type one from the room]
  - about a second
  - a small model is enough: closed grammar, checked

**Phones:** the form redraws in the new layout. Anything typed is still there.

**You say:**
> First thing that follows: a model can write a screen.
>
> [press "Put the button above the field"]
>
> About a second, and your form changed. Anything you'd typed is still in it.
>
> A model can do this because it isn't writing code. It's filling in a document from a small grammar, with the components it was given and the data it was shown. That's small enough for a small, fast model — this is gpt-oss-120b. A frontier model would be a bit more reliable and ten times slower, and you'd wait.
>
> [take a request from the room]

---

### 5. It can't do anything new.

**Projector:**
- Left: a layout with two mistakes, the faulty lines marked.
- Right, after the press: "Refused. Nobody's form changed.", and the sentences that refused it.

**Controller:**
- Tools: **Hand over a broken layout**.
- Notes:
  - [hand it over]
  - a refused layout goes back to the model with the sentence
  - steps from a closed list: no new behaviour

**Phones:** nothing changes.

**You say:**
> Second thing that follows: whatever a model hands you, it can't do anything your screens couldn't already do. It writes a layout; the steps a press runs stay the ones you wrote. And if the layout is wrong —
>
> [hand over the broken one]
>
> — it's refused, with a sentence for each mistake: a button nothing answers, a line reading data that isn't there. When the model's own layout is refused, that sentence goes back to it and it tries again.

---

### 6. It can come from another company.

**Projector:** the install: the other company's file address on GitHub Pages, the checks it passed with ✓s, "Approved", then the screens it added.

**Controller:**
- Tools: **Integrations**.
- Notes:
  - [install the QA Company]
  - a static file, data only
  - checked, then [approve]

**Phones:** a screen from The QA Company appears in their list.

**You say:**
> Same reason, bigger consequence: a screen can come from someone you don't trust yet. This is another company's file — The QA Company, made up for this talk, but the file is real and it's on GitHub Pages.
>
> [install]
>
> It's data only, in our components, calling our queries. It's checked before I can approve it.
>
> [approve]
>
> And now it's on your phone. Nobody deployed anything, and it can't do anything our own screens can't.

---

### 7. It draws anywhere.

**Projector:**
- The projector flips: plain DOM → React → Vue → the terminal renderer → back, with the room's picks tallied live.
- The ssh line.

**Controller:**
- Tools: **Which renderer draws**.
- Notes:
  - [flip the projector]
  - pick yours
  - ssh in

**Phones:** the framework bar. They pick, and their phone redraws in that framework. A half-typed question survives the switch.

**You say:**
> Third: a document doesn't belong to a framework. Nova turns a screen into a plain tree, and a renderer draws the tree.
>
> [flip the projector]
>
> That was this slide in three frameworks and then in text, and the count never stopped. Now pick yours. React, Vue, Svelte, Angular, plain DOM, or a terminal. The same press comes back from every one, and if you were halfway through a question, it's still there.
>
> If you've got a laptop, ssh in with that line and you get this talk in your terminal. Writing a renderer for another framework is a walker and about fifteen components; Svelte and Angular were written that way for this talk.

---

### 8. A program can read it.

**Projector:**
- Left: a phone's screen as the terminal renderer prints it, every button numbered.
- Right: the same screen's data and what each button does.

**Controller:**
- Tools: **X-ray, everybody's own screen**.
- Notes:
  - [give everybody the X-ray]
  - tap the tag → that screen's document, your data
  - tests and assistants read this

**Phones:** a tag on every screen. Tap it, and the document opens with their own data.

**You say:**
> Fourth: a program can read a screen without a screenshot.
>
> [give everybody the X-ray]
>
> Tap the tag on any screen. That's its document, with your data in it. A test reads that. An assistant reads that, sees every button and what it does, fills the form in, and leaves the pressing to you.

---

### 9. What you still write.

**Projector:**
- Left: this talk's components, as tiles in the code font.
- Right: the kit's button, eleven lines, as written.

**Controller:**
- Notes:
  - your components
  - your functions
  - the rest is documents

**You say:**
> What you write: your components, because Nova has no look of its own. Your functions, behind the named calls. Everything between them is a document — and you've seen a model, another company, five renderers and a program all work with one.

---

### 10. nisc.dev/nova

**Projector:** `nisc.dev/nova`, large. "The guides, the reference, and forty-two examples you can press."

**You say:**
> That's Nova. Everything is on nisc.dev/nova, including forty-two examples you can press. Questions.

---

### 11. Your questions.

The same as Talk B, slide 12.
