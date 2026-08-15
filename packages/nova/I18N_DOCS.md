# i18n Guide

How nova renders an application in more than one language.

Nova is **language-blind**, the same way it is surface-blind: it holds no
dictionary and knows no languages. A host supplies both, exactly as it supplies
the transform evaluator. What nova provides is the swap, the rules about what
may be swapped, and the extraction that makes filling a dictionary mechanical.

---

## Turning it on

```ts
import { createShell } from '@niscorp/nova';

const shell = createShell({
  canvases,
  actions,
  phrases: { 'Add a member': 'Mitglied hinzufügen' },
});
```

That is the whole wiring. The same two fields exist on any `RenderContext`, on
`render()` / `renderLayout()`, and on `<Nova.Layout>`:

```tsx
<Nova.Layout layout={layout} data={data} phrases={book} />
```

No server involved, no adapter code, and nothing to install.

## Where the swap happens, and why it matters

**In the renderer**, at the two points where a `RenderNode` is minted: the line
that resolves a component's props, and the branch that turns a layout's text
child into a text node.

Every tree in the system comes out of `renderLayout` / `renderLayoutFromStore`,
and there are three callers — the action runtime, the shell, and
`<Nova.Layout>`. So an **adapter contains no i18n code at all**. React, dom, tty,
ink and any adapter written later receive words that are already in the reader's
language and never learn that a second one exists.

That is deliberate. An adapter renders a `RenderNode`; if i18n changed the
adapter contract, every future adapter would inherit a copy of the same rule and
they would drift.

It also costs less than a pass over the finished tree would: the swap happens on
a value the renderer is already holding, so it is one dictionary lookup rather
than a second traversal of everything just built.

## The dictionary is keyed on the source string

```ts
const book = { 'Add a member': 'Mitglied hinzufügen' };
```

Not `t('people.add')`. The trade is deliberate, and it cuts both ways:

- **For.** Layouts stay readable — a file still says what it draws. Nothing has
  to be threaded through a component, and adding a language touches no layout.
- **Against.** One English word cannot carry two senses. "Book" the verb and
  "Book" the noun are one key here and two words in German.

The answer to the second is not to abandon the approach — it is to disambiguate
that one string at its author site when it actually bites.

## Proseness is decided by the KEY, never by the value

A render tree is mostly not prose. It carries person names, ids, css values,
tone words, icon names and row data. A pass that translated every string it
found would rename a member called "Pass" the day the studio started selling
one.

So the host names the carriers and everything else is left alone:

```ts
phraseKeys: {
  props: [...DEFAULT_PHRASE_KEYS.props, 'sentence'],
  suffixes: ['_display'],
}
```

- **`props`** — prop names whose string values are prose. Matched at **any
  depth** inside a prop value, which is what makes a spec prop work: a table's
  `columns: [{ label }]` and a select's `options: [{ label }]` are the same rule
  as a bare `label`. Note this **replaces** the default set, so spread
  `DEFAULT_PHRASE_KEYS.props` when you mean to extend it.
- **`suffixes`** — suffixes marking a DATA field as a display string. An app
  that spells its read-time display fields `status_display` declares
  `['_display']` once, and every closed-set word a query manufactures becomes
  translatable without naming forty fields. **Closed sets only** — a `_display`
  field holding a formatted date or an amount will simply miss.
- **`text`** — translate bare text nodes. Default `true`.

`DEFAULT_PHRASE_KEYS` covers `label`, `title`, `subtitle`, `heading`, `eyebrow`,
`lead`, `blurb`, `placeholder`, `hint`, `help`, `message`, `empty`,
`emptyHint`, `emptyLabel`, `noMatch`, `caption`, `description`, `confirmLabel`,
`cancelLabel`, `alt`, `tooltip`. Deliberately absent: `name`, `value`, `id`,
`icon`, `tone`, `variant`, `key` — those carry data or design tokens.

### An authored text child is prose; a bound one is data

```jsonc
{ "children": "Front desk" }        // translated — a person wrote it
{ "children": "$.member.surname" }  // never — it resolves to data
```

A text position has no key to protect it, so the renderer uses what only the
renderer knows: whether the string was authored or resolved. This distinction is
unrecoverable once a tree exists, because by then both are the same plain
string.

**Bound props are still translated** — that is the whole point of the suffix
rule, where a query manufactures a word and a read puts it on screen. There the
key is what protects data.

## Counted phrases

A dictionary can hold "Standing". It can never hold "12 of 20" — two numbers
make the cardinality unbounded. What a book *can* hold is the **pattern**:

```ts
{ phrase: '{n} of {total}', slots: { n: 12, total: 20 } }
```

At a prose key, the renderer translates the pattern string whole and then closes
the holes. Whole-pattern translation is what lets word order move — `{n} left`
becomes `noch {n}`, and the hole changes sides. A per-word table ("of" → "von")
starts at two entries and never stops growing.

A **string** slot is offered to the book too, so a composed sentence and its
fragments are separate rows that each translate.

Holes close **in every language, including the source one**, so no component
ever meets the raw `{ phrase, slots }` shape. Withdrawing a book means the
source language, not switching i18n off — a shell is language-bearing from the
moment it is given a book or a key set.

For a pattern held as data rather than shown — a check reading engine output, a
fixture, an exporter — use `fillPhrase(value)` from `@niscorp/nova/i18n`.

## What this cannot do

- **Open-ended formatted values** — dates, money, counts. "Fri 14 Mar" has
  unbounded cardinality and no dictionary will hold it. Format those at their
  source with a locale (prism's `$localeDate`, `$localeMoney`, `$localeNumber`).
  Note the axes differ: **words are per language, formatting is per region.**
  One German book serves Vienna, Hamburg and Zürich; the same currency is
  written three ways across them.
- **Anything not in the tree** — a server error message, a notification body, a
  component's own hard-coded default copy. Default copy must be authored as a
  prop, or the kit must translate it itself.

## Changing the language at runtime

```ts
shell.setPhrases(book);       // reaches instances ALREADY mounted
shell.setPhrases(undefined);  // back to the source language
shell.getPhrases();           // for overlaying rather than replacing
```

A runtime asks for the book at each render rather than holding one from spawn,
so a screen that is already open switches with everything else. `setPhrases`
fires a state change, so mounted adapters re-render.

This reaches what nova renders. Text a **host** composed in the old language —
a greeting built in TypeScript, a seeded label — is the host's problem, and
usually means rebuilding.

## Filling a dictionary: the harvest

Keying on source strings only works if there is a mechanical way to enumerate
them. Otherwise "translate the app" means a person reading every layout, and the
second language is permanently 90% done.

```ts
import { harvestDefinitions, missingFrom } from '@niscorp/nova/i18n';

const found = harvestDefinitions(actions, phraseKeys);
const absent = missingFrom(found, book);   // a release gate
```

`harvestLayout` / `harvestDefinition` / `harvestDefinitions` walk the **authored
artifacts** — not a rendered tree — and return every phrase with every author
site. They reach:

- props at prose keys, at any depth, including inside `$if` / `$then` branches
- a layout's text children
- an action's `title` and its `data` defaults
- literals a trigger or lifecycle step **writes** into data — an error message a
  trigger sets is as much product copy as a heading

Reading artifacts rather than a rendered tree is the second half of the
collision guard: only a string a person wrote can enter the dictionary, so a
value that happened to be on screen the day somebody ran the harvest cannot get
in.

At runtime, `onPhraseMiss(phrase, where)` reports every lookup that failed. A
miss renders as the **source language** — never an empty box, never a raw key —
which is the only sane failure and also the one that hides, so wire the report.

## API

From `@niscorp/nova/i18n`:

| Export | Purpose |
|---|---|
| `harvestLayout` / `harvestDefinition` / `harvestDefinitions` | Enumerate the phrases an artifact can show |
| `missingFrom(harvested, book)` | What a language is still missing |
| `fillPhrase(value)` | Close a counted phrase held as data, outside a render |
| `translateRenderTree(tree, opts)` | For a tree you did **not** render — a replayed frame, a fixture |
| `DEFAULT_PHRASE_KEYS` | The default prose prop set |
| `isBinding` / `isPhrase` / `matcherFor` | The primitives the rules are built from |
| `Phrasebook` / `PhraseKeys` | Types |

Config fields: `phrases`, `phraseKeys`, `onPhraseMiss` on `ShellConfig`,
`RenderContext`, `RenderOptions` and `<Nova.Layout>`. Shell methods:
`setPhrases`, `getPhrases`.

**Both `phrases` and `phraseKeys` absent = not doing i18n**, and it costs
nothing: no matcher is built and a `{ phrase, slots }` passes through as the
object it is.
