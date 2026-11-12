# Read mistakes: what failed and what to change

Status: proposal, nothing built. Evidence: live rounds `data/pilot/bench17-runs2`, `bench17-runs3`, `bench17-runs3c` (17 pages × 2, gpt-oss-120b), every Read answer read by hand with `data/pilot/bench17/read-answers.mjs`.

## What the failing runs were

Reading each answer against the page lines changed three of my earlier labels:

| Page, run | What happened | Cause |
|---|---|---|
| zlib ×2 (both rounds) | Read cited the permalink, not the three downloads | **Text view.** The downloads sit in `<dd><a>US (zlib.net)</a> (<a>GPG signature</a>)</dd>`. A line that holds two or more links shows no link at all, so Read could not cite them. |
| 7-Zip run 2 (twice, two rounds) | Three retries, then no answer | **Text check.** Read wrote `7‑Zip` with U+2011 (non-breaking hyphen); the page has `-`. The retry message prints both and they look the same. 7 of the 15 text retries in all rounds differ only in dash, quote or space characters. |
| Perl run 2 | All links `null` in the result | **Mapping step.** The records held the links; the model decided none were "read online" links. The examples check exists but only runs after the result is accepted. |
| Ruby run 1 | 2 of 3 | **Mapping step.** Read was right; the mapping filtered out the first item. Same gap. |
| Gutenberg run 1, Perl run 1, Django news (earlier round) | `limit: 5` cut the list to 5 | **Read prompt.** The instruction gives no number; 5 is the number in the prompt's own "up to 5 of the items" line. 3 of 109 Read answers. |

Not addressed here, each with its reason:
- Debian run 2: Read counted 19 rows (there are 16); code chose a 19-row list. One run; counting is the reader's estimate.
- Django linked posts ×2: "the three most recent" — Read skipped the post marked Featured (Oct 19) and took Oct 8. Separately, stages keep page order, so "most recent" works only where page order is date order. That is a question about order in the artifact, for later.
- 7-Zip run 1: Read added fields the instruction did not ask for (type, arch, desc); desc is one cell shared by three rows. One run; 7-Zip also has nested tables.
- SQLite release notes, one run: Read split one release note into its heading and each change. One run.
- Ruby run 2: the record list holds other paragraphs of the same section; the mapping kept 4 of them. Telling them apart needs the section heading, which no record has.
- SQLite download: the link is set by JavaScript. Page limit.
- Perl run 2's chosen list holds all 12 books, sample-chapter ones included, where Read counted 9: list choice as well as mapping.
- SQLite release notes: its fixture capture is not among the 16 measured above, so the view change is unmeasured there until round A.

## The changes

### 1. Text view: every link can be cited (changes what Read sees)

Rule today: a link inside a sentence folds into the sentence's line; a line that ends up with two or more folded links shows none. Today the count also takes in links of nested blocks, so 6 lines (GitHub 1, Perl 3, Ruby 2) are shown as links whose link is not in their text.

New rule: a link belongs to its nearest block, and a block's line keeps all its words. A block with one link of its own folds it into its line (as today). A block with several links of its own also gives each of them its own line, right after it.

zlib, before (lines 189–191):
```text
189 zlib source code, version 1.4, tar.gz format (1472K, SHA-256 hash ):
190 02dd159783677a749c04adbdd02b55b8a2bcc7e054f51b76b549199a916ad584
191 US (zlib.net) (GPG signature)
```
after (lines 211–215):
```text
211 zlib source code, version 1.4, tar.gz format (1472K, SHA-256 hash ):
212 02dd159783677a749c04adbdd02b55b8a2bcc7e054f51b76b549199a916ad584
213 US (zlib.net) (GPG signature)
214 → US (zlib.net) [/zlib-1.4.tar.gz]
215 → GPG signature [/zlib-1.4.tar.gz.asc]
```
Lua, after (the line that holds the answer):
```text
18 All versions are available for download. The current version is Lua 5.5 and its current release is Lua 5.5.1.
19 → versions [/versions.html]
20 → download [/ftp/]
21 → Lua 5.5 [/versions.html]
22 → Lua 5.5.1 [/ftp/lua-5.5.1.tar.gz]
```
Size: +0% to +19% per page (Lua +57%, a 2.8k-character page). No change to Read's instructions or answer shape. Lines shown as a link whose link is not in their text: 6 today, 0 after. Every citation in the saved answers (162 text, 121 link, 12 follow) resolves to the same element under the new rule (the reviewer's replay).

Trace, zlib:
- Read cites lines 214, 219, 224 as links, count 3 → `candidates` → `chooseList` picks `dl:nth-child(5)` by the count, 3 records: `zlib-1.4.tar.gz`, `zlib-1.4.tar.xz`, `zlib14.zip`. The blind reference also counts the permalink, so this grades 3 of 4.
- If Read also cites the permalink (as the reference does), no list holds just those 4: the lists left hold 63–110 links of the page, and the mapping step would have to filter them down. That is worse than today's 1 of 4 unless the mapping does it.

Cost: line numbers move on 15 of 16 captures, so the saved Read answers no longer replay offline; the next live round becomes the offline baseline.

### 2. Text check folds dash, quote and space variants (code only)

When code checks that cited text is on its line, it compares both sides after Unicode NFKC normalisation, with U+2010–U+2015 and U+2212 read as `-`, curly quotes as straight quotes, and any run of spaces as one space (the measurement above used exactly this). The same comparison is used where the pilot checks examples in the result. What Read sees does not change.

### 3. The mapping step must keep the examples (code only, adds one retry message)

The examples check moves into the mapping step's own check, after the result-schema check, and becomes exact:
- Each example's record is found among the extracted records; its field values (as the records give them) must appear in one result item with equal values. Today's check matches substrings and the last path part, so an address ending in `/` matches anything and Ruby run 1 was never flagged.
- The retry is sent only for examples whose record is among the extracted records. An example the stage itself lost (its limit cut it, the chosen list misses it) stays a finding, since the mapping cannot bring it back.

The retry message:
```text
These items answer the request but are not in the result:
- {"title":"Beginning Perl","url":"https://www.perl.org/books/beginning-perl/"}
- {"title":"Modern Perl","url":"http://modernperlbooks.com/books/modern_perl_2016/index.html"}
Change the program so the result contains them.
```
The count comparison stays a finding only: Read's count is an estimate (Debian run 2 said 19 for 16). It cannot loop (the mapping step stops after 4 tries). The risk to watch in round A: the model drops its filter and keeps every record, such as all 12 Perl books including the sample-chapter ones.

### 4. Read prompt: limit only from the instruction (one sentence)

Today:
```text
- limit: how many items the instruction asks for, when it gives a number; null when it asks for all of them.
```
Proposed, today's line unchanged plus one sentence:
```text
- limit: how many items the instruction asks for, when it gives a number; null when it asks for all of them. How many items you list in items has nothing to do with limit.
```
In round B, also check the two answers that give limit 1 today without a number: Adafruit ("single-unit price") and Django linked posts at the second level.

## Order and cost

The view change (1) and the limit sentence (4) both change Read's input, so they are measured apart:
- Round A: changes 1, 2, 3. 17 pages × 2, about 600k input tokens.
- Round B: change 4 on top. 17 pages × 2, about 600k input tokens.

Changes 2 and 3 only act when an answer fails a check, so they do not change Read's first answers.

## Results (2026-11-06, 17 pages × 2, gpt-oss-120b)

| Round | Complete | Partial | Unusable | Stopped | Input tokens |
|---|---|---|---|---|---|
| 3 (before) | 16 | 4 | 6 | 6 | ~665k |
| A (changes 1–3) | 13 | 7 | 3 | 11 | ~720k |
| B (A + change 4) | 21 | 5 | 2 | 6 | ~750k |

- Change 4: Read gave no invented limit in round B (0 of 37 answers; before, 3 of 109, and Gutenberg again in round A). Its only limits are numbers in the instruction, and Adafruit's 1 for "single-unit".
- Change 1: zlib went from 1 of 4 to 3 of 4 (A) and 4 of 4 (B). Django linked posts reached its second level for the first time.
- Change 2: 7-Zip's Read now finishes; it stops at the nested tables.
- Change 3: the retry fired correctly on Ruby, zlib and Perl; Perl no longer returns null links.
- Two runs per page swing by about ±4 complete between rounds with nothing changed for those pages (Lua, Debian, PythonAnywhere, release notes flipped between A and B), so most of the A→B gain is not change 4.

Left after round B:
- The mapping step keeps rows only text tells apart: Perl ×2 (+3 sample-chapter books), zlib run 2 (+59), Ruby run 2 (+75). The same list was filtered correctly in the other run.
- "Invalid key in record" (cortex's wording of a Prism schema error): Python, in every round. Covered by the Prism session's proposal.
- What one item is: Django linked posts (a body element cited as many mixed lines that no CSS rule covers), Lua in round A (two links to the same address widened the list).
- Read cited a title as a link: Django news run 2.
- Page limits: 7-Zip's nested tables, SQLite's JavaScript link.
