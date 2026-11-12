---
"create-nisc": patch
---

A model-first app answers each message with a turn of a conversation: a sentence, and up to three of the app's cards under it, filled in. It no longer rewrites the screen area by area.

- **One run of the model a message.** gpt-oss-120b on Groq, as a cortex agent, is told the cards the person may be shown, the last four turns and the message. The answer is checked — every card one the app has, its input one its schema takes, nothing shown twice — and sent back when it fails, five tries in all. Jev and the TypeSafe key are gone, and so are streaming, the reads, writes and arrangements in the prompt, and the bypass around moss that swapped layouts.
- **The conversation is in the dock**, above the screens and the line to ask in. The question shows at once, still being answered; messages are answered one at a time, in order; a turn and its cards never take a step Back. The conversation lasts as long as the person's shell. An answer that does not come is a turn saying why.
- **A screen is its cards, one under another**, the ones the person's roles reach, opened from the dock or by a card's link. The arrangements, the six areas and the answer stack with back and forward are gone.
- **The kits** lose `Area`, `Menu` and the `summary` button tone, which only the old model-first used, and gain `Talk`, the conversation's scroll box.
- **AGENTS.md** says how the assistant answers, how to remove the tour, and the first steps from there to a full app. `live-ask` fails on a miss.

**What to change:** nothing. An app already made keeps its files; this is what `npm create nisc --model-first` makes from now on.
