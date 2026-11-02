import type { Slide } from './talks';

// THE NOVA TALK — thirty minutes, written in talks/nova.md first. One
// decision, a screen is a document, and what follows from it; the room lives
// each step on their phones before it is explained.
export const NOVA_SLIDES: readonly Slide[] = [
  { slideId: 'slide.nova-title', title: 'Nova', tools: ['tools.questions-give'], notes: [
    '[give everybody the Q&A]',
    'Hi. Get your phones out and scan that. I’m serious: tonight, you’re the demo.',
    'You’ll get a form to ask me things. Use it whenever you like. And keep it open, because that form is going to change a few times while I talk, and every time it does, that’s the point I’m making.',
  ] },
  { slideId: 'slide.nova-map', title: 'Nova is where nisc draws.', tools: [], notes: [
    'Quick map first, so you know where we are. nisc is a stack for building apps, and the idea running through all of it is the same: the parts of an app that are usually code — screens, queries, permissions, schedules — are documents instead.',
    'This is all of it. Tonight is the top layer: Nova, the part that draws the screens. Everything underneath gets its own evening.',
  ] },
  { slideId: 'slide.nova-code', title: 'A screen is code.', tools: ['tools.step'], parts: 4, notes: [
    'Here’s where every one of us starts. A screen is code.',
    '[next] Which means only someone who writes code gets to write one. You, or your coding agent. Not a model inside your running app. Not a partner who wants a screen in your product. You’d be running their code, and nobody’s doing that.',
    '[next] It means a screen runs where it was built for. Your React screen isn’t going into a terminal anytime soon.',
    '[next] And it means that to change a screen, you ship.',
    'We’ve lived with all three for so long that they don’t even feel like decisions. Nova makes one decision that changes all three.',
  ] },
  { slideId: 'slide.nova-document', title: 'This one isn’t.', tools: ['tools.step'], parts: 5, notes: [
    'The form in your hand isn’t code. It’s this file, and there’s nothing behind it.',
    '[next: data] Some data to start with: an empty draft.',
    '[next: layout] A layout: a field and a button, by name, pointing into that data. Type something, and it lands in the draft.',
    '[next: triggers] And what a press does. There’s no click handler. A press runs steps, and the steps come from a short list Nova knows: set a value, call something, open a screen, go back. About twenty. None of them runs code.',
    '[next: endpoints] What it can call, by name. Anything that actually computes lives behind one of these.',
    'Nova calls this an action. And that’s the decision: a screen is a document, not a program. Let me show you what falls out of that, starting with the phone in your hand.',
  ] },
  { slideId: 'slide.nova-read', title: 'It can read all of it.', tools: ['tools.xray', 'tools.form-type'], notes: [
    'A model doesn’t have to guess what’s on your screen from a screenshot. It reads the screen itself. All of it.',
    '[give everybody the X-ray]',
    'There’s a new switch under your form. Switch it on, and tap the tag.',
    'That’s your screen as a model reads it. If you typed half a question, it’s in there.',
    '[type into the projector’s form]',
    'Same here: as I type, it’s in the data. Every part of the screen, what it shows, and what each button does. That’s what an assistant reads before it fills a form in for you.',
  ] },
  { slideId: 'slide.nova-model', title: 'A model can write it.', tools: ['tools.form-ask'], notes: [
    'Keep typing. I’m going to change your screen.',
    '[press "Put the button above the field"]',
    'That was a model. It rewrote the screen in your hand, and if you were mid-sentence, your sentence is still there.',
    'It can do that because it isn’t writing code. It’s filling in a document with a dozen shapes, from the components we gave it and an example of the data. A grammar that small doesn’t need a huge model. This is gpt-oss-120b, small and fast.',
    'Somebody shout one.',
    '[type what someone calls out, send]',
  ] },
  { slideId: 'slide.nova-broken', title: 'It can’t break it.', tools: ['tools.form-broken'], notes: [
    'You might be thinking: a model is writing screens in production, what could go wrong.',
    'Two things. First, it only writes the layout. What a press does stays what we wrote, so a model can rearrange your screen but it can’t give it a new behaviour.',
    'Second, if it gets the layout wrong — here’s one with a button nothing answers, and a line reading data that doesn’t exist —',
    '[hand it over]',
    '— your phone didn’t move. It was refused, one sentence per mistake. When it’s the model’s own layout, that sentence goes straight back to the model, and it tries again. You only ever see one that passed.',
  ] },
  { slideId: 'slide.nova-stranger', title: 'Someone else can write it.', tools: ['tools.applause'], notes: [
    'If a model can write a screen safely, so can a stranger.',
    'This is Applause. They don’t exist; I made them up. But their file does, and it’s nowhere near my server.',
    '[install]',
    'It’s two screens, as data: a button for your phone, and a counter for this screen. They use our components and call our queries, and they’re checked before I’m even allowed to approve them.',
    '[approve]',
    'Check your phone. Go on, clap.',
    'A company that has never seen this code just put a button on your phone and a counter on my screen. Nobody deployed anything, and neither can do one thing ours couldn’t.',
  ] },
  { slideId: 'slide.nova-draw', title: 'Anything can draw it.', tools: ['tools.screens-give', 'tools.look'], notes: [
    '[give everybody the framework bar]',
    'Last one, and you get to pick. There’s a bar on your phone: React, Vue, Svelte, Angular, plain DOM, or a terminal. Pick the one you’d defend in a code review.',
    '[flip the projector through all of them]',
    'This slide just went through three frameworks and plain text, and that counter never stopped. Your phone is now drawn by whatever you picked. Half a question typed? Still there.',
    'Nova doesn’t hand a framework your screen. It hands it a plain tree, and gets the same press back no matter who drew the button. That’s why your neighbour on Svelte and you on React are using the same app, and the server can’t tell you apart. A renderer for another framework is a walker and about fifteen components. Svelte and Angular were written exactly like that, for tonight.',
    'Got a laptop? That line at the bottom. ssh in, and you’re in this talk from your terminal.',
  ] },
  { slideId: 'slide.nova-write', title: 'What you still write.', tools: [], notes: [
    'So what’s left for you to write? Your components — this is our button, twelve lines — because Nova has no look of its own. Your app looks like your app. And your functions, behind the calls, where the real work happens.',
    'Everything in between is documents. Tonight a model wrote some, a company you’ve never heard of wrote some, and five different renderers drew them. Oh, and the rest? A coding agent wrote them. I read them. Documents are very easy to read.',
  ] },
  { slideId: 'slide.nova-layer', title: 'That was one layer.', tools: ['tools.form-ask'], notes: [
    'Everything you did tonight was one layer: the screen. Underneath it, the same idea goes all the way down. The queries are documents, the permissions are documents, the schedules are documents. That’s for the next few evenings.',
    '[put the form back as it was]',
  ] },
  { slideId: 'slide.nova-end', title: 'nisc.dev/nova', tools: [], notes: [
    'Everything about Nova is at nisc.dev/nova: the guides, the reference, and forty-two examples you can press. Thanks. Questions.',
  ] },
  { slideId: 'slide.nova-questions', title: 'Your questions.', tools: ['tools.questions-show'], notes: ['[press a question to put it up]', 'whoever asked it sees it on their phone'] },
];
