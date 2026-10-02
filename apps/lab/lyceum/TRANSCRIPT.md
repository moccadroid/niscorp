# The talk, as I would say it

A read-through for the deck as it is on 2026-10-02 (34 slides, `src/db/deck.ts`). It is one way to say it, written to check that the story connects — not a script to learn. `[square brackets]` are things you do. Each slide starts with **→ Slide N**, so you can step through the app beside it.

Rough length when read aloud with the demos: 40–45 minutes.

---

## Part 1 — What this is, and why (slides 1–6)

**→ Slide 1 · nisc**

Hi. Before I start: please join. Scan the code, or type the address. You'll be asked for a name — pick one of the offered ones or type your own.

If you have a laptop, open the same address there and keep the devtools open. I'll ask you to look at things.

What you just opened is this talk. The slides, my controller here, and your phone are one app, running on one server. Everything I show tonight, I show in that app, while you're in it.

**→ Slide 2 · Everyone who has joined**

That's you. Every name is a row in a database. If you typed your own name, a model checked it before it went up here — that's why some of you got a different one.

[wait until most people are in]

**→ Slide 3 · First, a timer.**

One thing before we start. I'd like a timer for this talk.

[share the controller screen] [type: "Show the last slide in 40 minutes"]

I asked a model for that. Look at what came back: it did not start a timer. It wrote a small document. It says when it fires and what it does: put the last slide on screen. I can read it. If it's right, I save it.

[press Save, stop sharing]

It's running now. Keep it in mind — I'll come back to it, and it will end this talk for me.

**→ Slide 4 · GPT-3 could not write a React app.**

This started in 2020, with GPT-3. I wanted it to build user interfaces. It couldn't — it could not write a React app that worked.

What it could do, most of the time, was fill in a JSON schema. And JSON has one property code doesn't have: you can check it before you run it.

So the question became: what if the interface is the JSON?

**→ Slide 5 · Models write code faster than anyone can review it.**

Five years later the models can write React just fine. That turned out not to be the end of the problem. They now write more code than anyone can read. And every change still needs a person to look at it, because nothing else can tell whether it's safe.

**→ Slide 6 · A program checks it. Not a person.**

Our answer is the one from 2020, taken all the way. Every part of the app — the screens, the queries, the permissions, the automations — is a JSON document with a schema. A model writes it, a program checks it, a runtime runs it.

Code is still there, but only in four places: the components that draw, the endpoints that touch data, the setup, and the tests.

That whole thing is called nisc. It starts with the UI.

## Part 2 — Nova: the UI is JSON (slides 7–11)

**→ Slide 7 · Nova**

The UI part is called Nova. On the right is one real button from this app, three times. First as JSON — that's all a model has to write. Then checked against the schema. Then drawn.

Notice that Nova didn't draw it. A renderer did. That matters in a few minutes.

**→ Slide 8 · An action**

A screen in Nova is made of actions. This is a whole one: a form to send me a question.

It has its data — the draft you're typing. It has a layout, which is drawn on the right from this same JSON. It says where data goes: an endpoint called `post_question`. And it says what a tap does: a click on `send_btn` runs two steps, and the second one calls that endpoint.

There is no fetch call and no click handler anywhere. What the button does is written down as data. And only a few kinds of step exist: set a value, call an endpoint, send a message, a handful more. That's what I mean by a closed grammar: you can't write anything that isn't on the list.

This particular form isn't on your phone. A Q&A will arrive later, from outside this app.

**→ Slide 9 · Your screen, as JSON.**

If that's true, then your screen right now is just JSON, and you should be able to look at it.

[give everyone the X-ray]

You have an X-ray switch on your phone now. Turn it on. Every action on your screen gets an outline and its id. Tap an id, and you see that action's JSON, with its live data.

There is no code in there. You can read it. A program can read it. A model can read it — remember that.

[take it back]

**→ Slide 10 · One screen, any renderer.**

I said Nova doesn't draw. So far everything you saw was drawn by one small DOM renderer — no framework.

[phones → React]

Your phones are drawn by React now. Same JSON, same stylesheet. The column lit up because this slide reads the same row I just changed. Laptops: inspect the root element — it's a React root.

[stage → Vue]

Now the projector is Vue and your phones are React. Two frameworks, one app, at the same time. On the server, one row changed.

[all back to DOM]

**→ Slide 11 · SSH into it.**

One more renderer. If you have a terminal, type this.

[give them a moment]

You join the same way you did on your phone, and you're in the same app. Same JSON, drawn as text.

## Part 3 — Isn't this …? (slides 12–14)

**→ Slide 12 · Isn't this json-render?**

Some of you are thinking: I've seen this. Vercel has json-render. Google has A2UI. A model writes JSON, a renderer draws it.

Yes. Same direction, and they're good. I take that as a sign the direction is right.

**→ Slide 13 · json-render ≈ Nova ∈ nisc**

Here's the difference. json-render is the screen as JSON — about what Nova does, with more renderers than we have. Past the screen, you're back in Next.js and your own code.

Nova is one part of nisc. The other parts are the rest of an app: the server, permissions, queries, data transforms, automations, migrations, and the model calls. Each one is the same idea in one more place. The bottom three are plumbing for model calls and streaming; they're there so the set is complete, and I won't spend time on them. The rest of this talk walks through the others.

**→ Slide 14 · Is JSON enough for a real app?**

The usual objection: fine for a demo, not for a real app.

This is this app, counted from its source just now. Green is JSON. Blue is the code a nisc app has to ship: one renderer, the endpoints, the setup. The hatched bars are extra: the four other renderers I built for the demo you just saw, and the tests.

About half of this app is data.

## Part 4 — What checking buys (slides 15–17)

**→ Slide 15 · A closed grammar can be checked.**

So why bother? Because of what a program can do with a closed grammar.

Two documents. On the left, a button that asks for a colour this app doesn't have. On the right, a trigger that listens for `x` and sends `x`.

[show the next part]

That's what the checks say. I didn't type those lines; this server ran both checks when the slide came up. The left one is plain schema validation. The right one is the kind you can't do with code: it found an infinite loop by reading the document, before anything ran. For code, a linter can only guess at that.

[show the next part]

And that's what makes the next thing safe. A model can write these documents while the app is running. It writes one, it's checked, and if something is wrong the errors go back and it tries again. You saw that at the start with the timer. You'll see it again with queries.

Checked means it's safe to run. It doesn't mean it's the right thing.

**→ Slide 16 · Review the result, not the code.**

Which changes what review is. When an agent writes code, there's too much to read, and things ship that nobody looked at.

When an agent writes nisc, validation and the mechanical checks cover what code review was for. What's left is the question only you can answer: does it do what I wanted? That's testing. You look at the result.

**→ Slide 17 · Installing someone else's Q&A**

Let me show you what that lets us do. This app has no Q&A. Somebody else makes one — call them the QA Company. It's a JSON file on GitHub. It's not part of this app, and I haven't read it.

[install the broken one]

Refused. One check failed: it has a loop. That's the trigger, from their file.

[install the Q&A]

Four checks passed. [approve]

It's on your phones now, and on my controller. Somebody else's screens and behaviour, running inside this app, and nobody reviewed a line. Ask me something — I'll take the questions at the end.

## Part 5 — Moss and Charter: who gets what (slides 18–24)

**→ Slide 18 · Your screen runs on the server.**

I've changed your screens four times now without you doing anything. How?

Type half a question into the Q&A. Don't send it. Now reload the page.

It's still there. Your screen isn't in your browser. It runs on the server. That server is called Moss.

**→ Slide 19 · Your phone only draws.**

This is everything that crosses the wire. Down: what to draw. Up: what you pressed. Laptops, look at the websocket frames — that's all there is.

That's why swapping the renderer was one row: the renderer was never part of the app.

**→ Slide 20 · The server is a list.**

And this is the whole server for this app. A list: the permissions, the actions, the queries, the row rules. Moss takes the list and runs it. There is no routing code and no controller code behind this.

**→ Slide 21 · It sends you only what you have.**

One consequence. A usual server has one app for everyone, and permission checks around it. Moss sends each person their own app. What you don't have isn't hidden. It was never sent.

Let me show you.

**→ Slide 22 · Some of you have an action now.**

[give it to three people]

Three of you just got a button. Hands up if you have it. Turn your volume up and press it.

[names appear]

Everyone else: look at your phone. It isn't greyed out — it isn't there. Laptops: search your websocket frames. It was never sent to you.

[take it back]

**→ Slide 23 · Where do you check permissions?**

How did the server decide that? In most apps, permissions are checked in three places: on routes, in components, and on rows in the database. Three sets of rules, written by different people, that drift apart.

[show the next part]

Here it's one file, called the charter. A role lists the actions it gets and the data it may touch.

`member` is all of you. `button` is the three of you from a minute ago: one action, and the one write it makes. Who has which role is a row in a table — that's what I changed when I pressed "give".

**→ Slide 24 · Enforced twice.**

That one file is enforced in two places. On your screen: you only get what you were given. And in every query: you only get your rows.

Your phone lists your questions. My controller lists everybody's. Same query. The rule on the right is why: the server stamps who you are. There's no field you could put somebody else's id into.

## Part 6 — Data: Prism and Vex (slides 25–27)

**→ Slide 25 · Functions are JSON too.**

Two more things an app needs that are normally code. First: small functions.

This is my Next button. "The next position is the current one plus one, but never past the last slide." That's a function — written as JSON. It's called Prism.

On the right is that same JSON, run on this slide, right now. [press Back, then Next] The numbers follow.

It's a closed set of operations. No code strings, anywhere.

And notice the first line: it calls something named `deck/go`.

**→ Slide 26 · Queries are JSON too.**

That's a stored query. This one is the "joined" number at the top of the screen. It says what it's for, the shape of the answer, and the query.

The screen only ever sends the small thing on the right: a name. No SQL crosses the wire. Under it is the answer, live. Your permissions are applied inside the engine, every time. And it's marked reactive: when somebody joins, it answers again on every screen that shows it. Nobody wrote code to announce that.

This part is called Vex.

**→ Slide 27 · Asked in words.**

A query has a sentence saying what it's for. So you can ask for one in words.

[give everybody the assistant] Ask it: how many people joined?

A small model only decides one thing: has this been asked before? If yes, the stored query runs again. No model writes anything. If it's new, a bigger model writes the query — under your permissions — and it's stored. If you ask for something you may not see, it's refused, and you're told why.

So a model writes each query once. After that it's just a query.

## Part 7 — The assistant (slides 28–30)

**→ Slide 28 · 18,000 cups of water.**

Last year someone ordered eighteen thousand cups of water at a Taco Bell drive-through run by an AI. The year before, McDonald's ended its AI drive-through test after it put 260 McNuggets on one order.

The model wasn't the problem. It was allowed to act on its own.

**→ Slide 29 · It can't press Send.**

Your assistant reads your screen — it's JSON, you saw it in the X-ray. And it can open one of your actions, filled in.

It cannot press anything. There is no way for it to call an endpoint. The only thing that calls an endpoint is an action, and the only thing that presses an action is you.

You saw that at the very start: the model wrote the timer. I pressed Save.

[demo — undecided, see TALK.md §10]

**→ Slide 30 · The same file governs the AI.**

And what the assistant can open is decided by the same file as everything else. It can open your actions, nobody else's.

Same for the timer. It runs as a role called `clock`. Clock can move the slide. That's all it can do — whatever a model wrote into that timer.

## Part 8 — Tide and Strata (slides 31–33)

**→ Slide 31 · The timer is a row.**

So here is that timer. This is it, as it's stored: when it fires, what it does, who it runs as. It runs as `clock` — saving stamped that, not the model.

No model is running right now. It's a row in the database, so a restart doesn't lose it.

**→ Slide 32 · No agent loop.**

The usual way to do this is an agent with a skill: every time it runs, a model reads the instructions and decides what to do. You pay for tokens on every run, and every run can go differently.

Here a model wrote the automation once. I read it and saved it. Since then, no model.

**→ Slide 33 · Grammars get migrations.**

Last part. If everything is a document, what happens to all those documents when the grammar changes?

Tables get migrations. Here, grammars do too. This is the list for this app's own components — twelve changes while I built these slides. Eleven only added something. Number seven renamed a value, so it rewrote every layout that used the old one.

Every stored document knows which version it was written in, and it's upgraded when it's read. If I change a grammar without writing the migration, a check refuses the change.

## Part 9 — The end (slide 34)

**→ Slide 34 · It's all in one folder.**

[if the timer put this slide up] That was the timer. It ran as clock, with no model.

Everything you saw tonight is one folder in a public repository. Scan the code.

Your questions are on this slide — the ones the check found fit to show. Let's take them.
