# Atrium

A guest-and-staff platform for hotels, built by a third party that integrates
property management systems. One deployment serves two hotels on two different
PMS backends and five audiences, from one URL.

The application a token produces is not a filtered view of one screen. It is a
different set of actions, resolved from what the integration behind that
property can actually do.

The app knows nothing about Opera, Mews or HotelFix. It knows where to ask.
Every capability, action, query, surface and menu those vendors contribute
arrives over HTTP from their own service and is stored as rows.

## Run it

```bash
pnpm --filter atrium integrations # the integrations service, separate process
pnpm --filter atrium dev          # app + server in one process, http://localhost:5175
pnpm --filter atrium admin        # the administration tool, separate process
pnpm --filter atrium check        # every check, headless
```

Start the integrations service first: the app pulls its integrations from it
at boot. Boot with it down and the app comes up with only its own surfaces —
honestly, since it has not been told any others exist. *Pull all bundles* in
the Atrium Integrations console fixes that at any time.

Pick a name on the login page. Each one is described there.

| Who | What they get |
|---|---|
| Amara Osei | In house at The Lumen (Opera Cloud), night three of five. No mobile key — that integration has not shipped. |
| Theo Lindqvist | Arriving at five, same hotel, asking about a junior suite. A pre-arrival shell is a different application. |
| Inés Marchetti | In house at Casa Marisol (Mews). Spa and housekeeping, never a key, no online check-in. |
| Rosa Delgado | Front office at The Lumen, mid-shift. |
| Pilar Ferrer | Front office at Casa Marisol — the same desk over a different hotel. |
| Kwame Boateng | Maintenance. Three big targets on a phone. |
| Henrik Sørensen | Operations. The house tonight, and which services this hotel offers. |
| Atrium Integrations | Us. What each connector offers, and the switches that ship it. |

## The hotels

Both are running when you sign in, at a quarter to four on a Tuesday.

**The Lumen**, Copenhagen — 36 rooms over six floors, 78% full, three out of
order. Nine arrivals still to walk in, five of them a wedding party due at half
past four whose last two rooms are not turned yet. Twelve faults on the board,
two of them days old with nobody assigned. Fourteen live conversations, three of
which nobody has answered. Four months of departed stays behind it, which is
what makes "her third stay this year" a count rather than a claim.

**Casa Marisol**, Palma — 14 casitas, a spa with a working day in its diary, and
a guest who has put a bottle of Rioja on her own bill by mistake.

## Sign in as Rosa

The shortest path through the product is one clerk's afternoon, in order.

**Something is waiting.** *Needs a person* leads her screen: three guests nobody
has answered, two faults nobody has been sent to, five asks waiting on a yes, and
how many rooms housekeeping still owes her. None of it is authored — it is five
reads over what is actually stalled, oldest first. Every row opens the record it
is about rather than a list containing it.

**Open the guest at the top.** Amara has written twice about the air conditioning
and heard nothing since last night. Beside her thread, *Who this is* assembles
what a clerk needs in the two seconds before they speak: gold, third stay this
year, €698 on the bill, and a note from her last visit saying she reported the
same fault then and it was closed as no-fault-found.

**Move her.** *Move rooms* offers the rooms that are signed off and genuinely
free — not the one she is in, not one held for an arrival at half four, not one
out of order. One press moves the stay, puts 412 down for turning, takes the new
room off the sellable list and sends her the line that was written. Four rows,
one gesture.

**Put it right.** *Put it right* is a menu the connector priced — dinner for two,
a bottle of wine, a night at half rate. Pick one, write the apology, press once:
the credit lands on the folio as a credit and the note goes to the guest. **The
price is never chosen by the software.** That constraint is the surface.

**The taxi.** Nadia has asked for a car to the airport for an 08:20 flight. Open
her and book it: the routes and fares are Opera's, the pickup time is the one
judgement on the card, and the confirmation comes back from the vendor. At Casa
Marisol the same card offers Palma, because the menu is the other connector's.

**Half past four.** The wedding block is five rooms arriving together and two of
them are still dirty. *The group* checks in everybody whose room is signed off
and leaves the rest alone — the rule lives in SQL, so the button cannot get it
wrong.

**End of shift.** *Handover* holds what the night porter left at seven, and takes
what Rosa leaves for whoever is on next.

## What to look at

**Two guests, two hotels, one deployment.** Open Amara and Inés side by side.
Different tiles, different palettes, identical code. Neither difference is a flag
in a layout.

**Shipping is a data change.** Leave Amara's shell open. Sign in as Atrium
Integrations in another tab, open the Opera Cloud connector, switch on *Mobile
room key*, press *Go live*. A room key appears in Amara's hand. No reload, no
restart, no deploy. Casa Marisol is untouched.

**The app discovers its integrations.** Everything in that console arrived
over the wire: the console lists what each service reported, and *Pull all
bundles* asks again. A vendor ships by deploying their own service — the
actions, queries, surfaces and menus in the payload become rows here, and the
app that had never heard of them serves them. A payload that fails validation
is refused whole, the reasons are printed in the console, and the previous
rows keep serving.

**The concierge places; it never invents.** Ask Amara's concierge for a massage
and it offers the desk, because The Lumen has no spa module. Ask Inés and it
opens the spa. The only action ids either can reach came out of the database — so
a car to the airport works at both hotels and a helicopter works at neither, and
the difference is a row rather than a rule.

**Nothing is navigated.** No audience has a nav bar. Every working surface is a
live card composed from what resolved — a guest's and a clerk's alike — each
showing one live figure and opening in place. Sign in as Rosa: the issue board,
the inbox, the call sheet, the car sheet and the approvals queue are cards
because Opera reports those capabilities at The Lumen, and Pilar's screen carries
Mews's spa diary instead for the same reason. Nobody wrote either list.

**A guest is a workspace.** As Rosa, open a message thread or a movements row.
Beside it appears everything the hotel can do *for that guest* — who they are,
their bill, a room to move them to, what the desk has written down, the wake-up
switchboard, a car — each already carrying them. As Pilar, open Inés's note about
the Rioja she added by mistake and take it off her bill in two taps; her total
drops and the line is reversed, not deleted.

**What the desk knows is the desk's.** *Notes* on a stay — wants a high floor,
celebrating an anniversary, reported this same fault last time — are read by
every job on the floor and by no guest anywhere. There is no visibility switch on
that card: the guest role does not name the table, so there is no path to write
one. Absence, again, rather than a flag.

**One sentence, four applications.** As Amara, report a problem. It appears on
Rosa's board in Amara's own words, dispatches to Kwame's phone, and moves
Henrik's count. Nothing is copied between surfaces — it is one row.

**Messaging is two-way.** Write to the desk as Amara; open Rosa's Messages inbox
and reply; Amara's home shows the reply. Pilar — the desk at the other hotel —
never sees a word of it: the tenant boundary is enforced in the engine.

**Menus come from the integrations.** The spa treatments are Mews rows, the
housekeeping items are Mews rows, the fault categories are HotelFix rows — a
separate TICKETING connector both hotels run. Nothing in a layout lists an
option; change a service's catalogue, pull, and the menus change with it.

**Rooms are real inventory, and two people own different halves of it.** As
Henrik, take a room out of service — the out-of-order figure on the house pane
moves, both ways. As Rosa, the same column answers a different question: what is
turned, what is signed off, and what can be given to the person at the counter.
One state, one write, two decisions made by two people at two speeds.

**Nothing resets.** Everything above survives logout, login as someone else, and
a fresh session: the interface state is rows, and the checks assert it.

**Absence, not disablement.** As Inés, nothing offers a room key: Mews has no
door API at any version. Her charter grants her `stay.key` at every hotel on
earth; her hotel's integration is what decides whether it is ever placed.

**The integrations service is a separate process.** Stop `pnpm integrations`
and cut a key. The guest reads which service did not answer and that nothing
was issued, and the database agrees. Everything else in the app keeps working,
including every surface that service shipped — those are rows now.

## Behind the scenes

`pnpm admin` starts a second application on its own port: the tool we run the
platform with. It is not part of atrium — its own charter, its own actions, its
own principal space — and it reaches the app through a key-gated seam no token
a hotel can hold will open. It shows what the estate offers and lets us change
it; it cannot read a hotel's data, because it mounts no data layer at all.

It needs a key in `.env`, which the app server reads too:

```
OPERATOR_KEY=some-long-secret
```

The service prints a link. Open it once and a pill appears bottom left, over
whoever you are signed in as — a second wire in the page, to a different server,
under a different token — and it stays until `?admin=off`. Five panes, each
named for the artifact it shows:

| | |
|---|---|
| **Explain** | Why can this principal not see that? Pick a principal and a stay state; every slot shows the chain — audience → charter → resolver → stay — and which link broke, in a sentence. The stay state is *asked*, not read, so no real stay is touched. |
| **Charter** | Roles as compiled and principals as resolved: ring 1 per principal, anonymous included. Tap an action to see everyone who may hold it. Plus the warnings `verifyCharter` raises to nobody. |
| **Catalog** | Every action definition — its rule-14 input contract, its declared data, its endpoints and triggers — and a **live preview** of its layout, rendered from the JSON the shell renders from, filled with sample data derived from the layout's own bindings. |
| **Entries** | Every read and write the app can make. Warm-only, so this list *is* the API: what each binds, which tables it touches, what it returns, who calls it. Flags entries nothing calls, and calls with no entry. |
| **Surface** | Every slot × every property, live or dark, with the resolver's reason. Carries our own switch: withdrawing a surface takes it off every property at once. |
| **Capabilities** | Connector offers, property enablement, and the discovery pull with its refusal reasons. |
| **Shells** | Living server shells — who holds one, how many terminals are attached to it, the stack on each of its canvases, and the process behind them. Carries the one control here that lands on a person: **restart this shell**. |
| **Timeline** | Every endpoint the living shells called — which action, how long, whether it worked. Names and timings only; no payload of any kind is kept. |

Try it with Theo signed in: Surface → The Lumen → switch off *Check in online*.
The database is correct immediately — his shell is merely stale until it reads
again, so sign him out and back in and the card is gone. Switch it back on and
it returns. No deploy and no restart either way. Rosa and Amara never see the
pill: nothing they can hold authenticates to a service that is not theirs.

Then try Shells → pick Theo → *Restart this shell*. His terminal stays
connected and stays signed in, and lands back on the screen login gives him —
no sign-out, no reload, nothing written. That is the answer to "my thing is
broken": a shell runs on the server, keyed by principal, so a stuck one
survives everything the person in front of it can do (reloading reattaches to
it, and so does signing out and back in). From the terminal itself the same
recovery is `ctrl+shift+u`.

## The four factors

Whether an action reaches a shell is the intersection of:

1. what the **connector** offers and has switched on,
2. what the **property** has switched on — and whether it runs the connector
   that shipped the surface,
3. what the **charter** grants that principal,
4. what **state** the stay is in,

and, in front of all four, whether **we** have withdrawn the surface at all.

The first two are recomputed into `property_slots` by the connector sync and read
as rows. The third is compiled at boot. The fourth is one filter on the read. No
layout asks any of the four.

## Where things are

```
src/
  app/          artifacts only — pure JSON authored in TS
    charter/    who may ever hold what
    vex/        every read and write, as prewarmed cache entries
    actions/    the trios: chrome/, domains/<audience>/, surfaces/
    shell/      the frame and the sheet fragment
  db/           schema, seed, and the connector sync (resolve.ts)
  server/       moss glue, the fn seam, the bundle pull and its intake gate,
                and operator.ts — the key-gated seam our own tool plugs into
  integrations/ the vendors' service — its own process, its own deploy
  admin/        OUR tool — its own moss app, its own process, its own charter
  ui/           the component kit, the only React in the app
  dev/          headless checks
```

`DESIGN.md` covers why it is arranged this way, and what is still open.
