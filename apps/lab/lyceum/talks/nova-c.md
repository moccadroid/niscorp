# Talk C — Built in this room

30 minutes. Everything the room does on their phones is a Nova claim, lived first and explained after.

Each slide is written the same way as Talk B (`nova-b.md`). The strip at the top of the projector shows only the address and the number joined.

---

### 1. Nova

**Projector:**
- "Nova", and "The screen is a document."
- A terminal pane with the install line.
- The join QR, and `talk.nisc.dev`.

**Controller:**
- Tools: **The Q&A on phones**.
- Notes:
  - [give everybody the Q&A]
  - everyone join: you're the demo

**Phones:** the Q&A form.

**You say:**
> Hi. Please scan that, because tonight you're the demo. Everything your phone does from now on is the thing I'm talking about. You've got a form for questions; use it whenever you like.
>
> This talk is about Nova, the part of nisc that draws screens. And the screen you're looking at is one.

---

### 2. This is a Nova screen.

**Projector:**
- Left: the Q&A form as everyone has it.
- Right: its file, `questions/send.action.ts`, whole, with the four parts marked as you name them.

**Controller:**
- Tools: **The document, part by part**.
- Notes:
  - [mark each part]
  - no handler: steps
  - our components draw it

**Phones:** the same form.

**You say:**
> That form in your hand is this file, and nothing else.
>
> [Data] What it starts with: an empty draft.
> [Layout] What it shows: a field and a button, by name, pointing into the data. What you type goes straight into the draft.
> [Triggers] What a press does: steps from a closed list Nova knows. No click handler, and no step that runs code.
> [Endpoints] What it can call, by name.
>
> Nova calls this an action, and this talk's own components draw it. That's the whole idea of Nova: a screen is a document. Let's see what that means for the phone in your hand.

---

### 3. Open it yourself.

**Projector:** your own phone's screen, as the terminal renderer prints it, every button numbered. Beside it, what that screen says to a program: its data, and what each button does.

**Controller:**
- Tools: **X-ray, everybody's own screen**.
- Notes:
  - [give everybody the X-ray]
  - tap the tag → your screen's document, with what you typed
  - a program sees the same thing

**Phones:** a tag on every screen. Tapping it opens that screen's document with their own data.

**You say:**
> [give everybody the X-ray]
>
> You've each got a little tag on your screen now. Tap it. That's the document of the screen you're using, with your data in it. If you'd typed half a question, there it is.
>
> This is also what a program sees. No screenshot, no guessing at pixels: every button and what it does. A test reads this, and an assistant can read this, fill in a form for you and leave the pressing to you.

---

### 4. A model just rewrote your screen.

**Projector:**
- The request, large.
- The time: the real number.
- "gpt-oss-120b, through Nova's layout agent".
- The layout's changed lines, marked.

**Controller:**
- Tools: **Ask the model for a layout**.
- Notes:
  - [press "Put the button above the field"]
  - check your phone: same form, new layout, your words still in it
  - small grammar → small fast model; checked

**Phones:** the form redraws in the new layout. What they typed is still there.

**You say:**
> Look at your phone.
>
> [press "Put the button above the field"]
>
> A model just rewrote that screen, in about a second, while some of you were typing in it. You didn't lose a word.
>
> It's gpt-oss-120b, a small, fast, open model. It can do this because it doesn't write code. It fills in a document in a small grammar, with the components it was handed. Anything it writes is checked before your phone sees it.
>
> [take a request from the room]

---

### 5. And when it gets it wrong.

**Projector:**
- Left: a layout with two mistakes, marked.
- Right: "Refused. Nobody's form changed.", and the sentences that refused it.

**Controller:**
- Tools: **Hand over a broken layout**.
- Notes:
  - [hand it over]
  - your phone didn't move
  - the sentence goes back to the model

**Phones:** nothing changes, and that's the point.

**You say:**
> Here's one with mistakes in it: a button nothing answers, and a line reading data that isn't there.
>
> [hand it over]
>
> Your phone didn't move. It was refused, with a sentence for each mistake. When the model's own layout is refused, that sentence goes back to it and it tries again. You only ever see one that passed.

---

### 6. A company you've never met just added a screen.

**Projector:** the install: the file's address on GitHub Pages, the checks with ✓s, "Approved", then the screens added.

**Controller:**
- Tools: **Integrations**.
- Notes:
  - [install the QA Company]
  - [approve]
  - check your phone

**Phones:** a new screen from The QA Company appears in their list.

**You say:**
> [install]
>
> That's a file from another company, The QA Company. Made up for tonight, but the file is real, and it's on GitHub Pages. It's screens as data, in our components, calling our queries, checked before I can approve it.
>
> [approve]
>
> Check your phone. A screen from a company that has never seen this code, and nobody deployed anything. It can't do anything our own screens can't.

---

### 7. Pick your framework.

**Projector:**
- The projector flips: plain DOM → React → Vue → the terminal renderer → back, with the room's picks tallied live.
- The ssh line.

**Controller:**
- Tools: **Which renderer draws**.
- Notes:
  - [flip the projector]
  - everyone: pick yours
  - laptops: ssh in

**Phones:** the framework bar. They pick, and their phone redraws in that framework, with its name in a corner. A half-typed question survives the switch.

**You say:**
> Now something you get to choose. On your phone there's a bar: React, Vue, Svelte, Angular, plain DOM, or a terminal. Pick the one you'd defend in a code review.
>
> [flip the projector]
>
> This slide just went through three frameworks and plain text, and the count never stopped. Your phone is now drawn by what you picked. If you were halfway through a question, it's still there. And the server can't tell which of you picked what: a press is the same event from all of them.
>
> If you've got a laptop: ssh in with that line, and you get this talk in a terminal. A renderer for another framework is a walker and about fifteen components; Svelte and Angular were written that way, for tonight.

---

### 8. What you still write.

**Projector:** this talk's components as tiles in the code font, and the kit's button, eleven lines.

**Controller:**
- Notes:
  - your components
  - your functions
  - the rest is documents

**You say:**
> What I wrote for all this: the components — this is our button — and the functions behind the calls. Everything else you touched tonight was a document. And to be honest about who wrote those documents: a coding agent, Claude Opus. I reviewed them, and a document is very easy to review.

---

### 9. Everything you did tonight was Nova.

**Projector:** that sentence, and `nisc.dev/nova`.

**You say:**
> You opened your screen's document, watched a model rewrite it, watched another company add to it, and picked your own framework. All of it was Nova. Everything is at nisc.dev/nova, including forty-two examples you can press. Questions.

---

### 10. Your questions.

The same as Talk B, slide 12.
