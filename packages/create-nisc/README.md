# create-nisc

A new [nisc](https://github.com/moccadroid/niscorp) application.

```bash
npm create nisc
```

Three questions, because they are what shape the files:

1. **Where should it go?**
2. **Where does the shell run?** On a server — moss: one shell per person on
   the server, the charter enforced there, data stays there. Or in the page —
   no server: offline, static hosting, and the charter is not a security
   boundary.
3. **What draws the screen?** React, or plain DOM (no framework in the page).

What you get: the structure the rulebook describes, one action on a canvas,
a kit, a check, and a first screen that arrives as markup — drawn by the
server, or written at build — and is picked up by the page. Every `@niscorp`
package pinned to the set `@niscorp/nisc` was released with.

And two documents:

- **`PLAN.md`** — what was decided when it was made (the posture with its
  consequences, the renderer), and everything else the rulebook's interview
  asks, written down as **open**. Nothing gets built on an open decision.
- **`AGENTS.md`** — where the rules are: `node_modules/@niscorp/nisc/AGENTS.md`,
  the rulebook for the version installed. It does not copy them.

```bash
npm create nisc my-app -- --moss --react    # or --page, --dom; --yes for the defaults
```

The templates are real apps in the nisc repository, typechecked, built and
checked by its CI on every change — a new app starts from something that
works today, not something that worked when the template was written.

## License

Apache-2.0
