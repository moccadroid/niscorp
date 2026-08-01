import type { LayoutNode, Step } from '@niscorp/nova';

// ═══════════════════════════════════════════════════════════
// Preview-capable actions — the composed home's building block.
//
// An action opts in by declaring `expanded` as INPUT (rule 14: the level is a
// parameter an opener may set, and the ONLY marker the home seeding looks
// for). Its layout root branches: collapsed renders the PREVIEW — one
// tappable box with one live line — expanded renders the full surface. The
// default is `expanded: true`, so every existing path (sheet pushes, agent
// pushes, desk flows) is untouched; only the home seeds collapsed.
//
// `sheetTitle` doubles as "where am I": present → on a sheet (the overlay's
// close is the exit, no card chrome at all); absent → on a canvas, where the
// expanded card carries its own header.
//
// ONE control, and it says what it does: "Collapse" with an upward chevron.
// There used to be two — "Done" (collapse, reversible) beside "Close"
// (dismiss, not) — which is the same sentence twice with opposite meanings,
// and on the workspace it meant a mis-click destroyed a card that had been
// composed for you with no way to get it back. Dismissal left with it: a
// composed canvas is rebuilt by re-opening the guest, not curated card by
// card.
// ═══════════════════════════════════════════════════════════

// The card's own name, taken from the PREVIEW it was given. Every preview is a
// Tile (or a Card) whose title already says what the surface is, so the frame
// reads it rather than asking every call site to repeat it — one source, and
// it cannot drift out of step with the collapsed face.
// The collapsed face's title, carried through to the expanded header so a card
// keeps its name when it opens. A binding string ('{{$.cardTitle}}') passes
// through like any other: a surface named after the record it shows puts that
// name in its own data and binds to it here.
const titleOf = (preview: LayoutNode): string => {
  const title = (preview as { props?: { title?: unknown } }).props?.title;
  return typeof title === 'string' ? title : '';
};

export const previewable = (preview: LayoutNode, full: LayoutNode): LayoutNode => ({
  if: '$.expanded',
  then: {
    // On a sheet the overlay already frames the surface AND titles it — render
    // it bare. On a canvas an expanded card must LOOK like a card: the same
    // boundary the collapsed preview has, and the same NAME. Losing the title
    // on expand was worse than the oversized headings it replaced: opening a
    // card took away the one word telling you what you had opened.
    if: '$.sheetTitle',
    then: full,
    else: {
      component: 'Card',
      props: {},
      children: {
        component: 'Stack',
        props: { gap: 12 },
        children:
          titleOf(preview) === ''
            ? // A preview that is already its own headline gets no second
              // name, only the way back.
              [{ component: 'Row', props: { justify: 'end' }, children: [{ component: 'Button', ref: 'collapse', props: { variant: 'plain', icon: 'chevron-up' }, children: 'Collapse' }] }, full]
            : [
                {
                  component: 'Row',
                  props: { justify: 'between', align: 'center', gap: 10 },
                  children: [
                    { component: 'Text', props: { serif: true, size: 'lg' }, children: titleOf(preview) },
                    { component: 'Button', ref: 'collapse', props: { variant: 'plain', icon: 'chevron-up' }, children: 'Collapse' },
                  ],
                },
                { component: 'Rule', props: {} },
                full,
              ],
      },
    },
  },
  else: preview,
});

// The two triggers every preview-capable action carries — spread into the
// action's own list.
//
// Opening a card RE-READS it (`reload` re-runs the action's own mount hook).
// A composed canvas keeps every card live and suspends nothing, so a card
// seeded at login and opened an hour later would otherwise answer with the
// hour-old figures. Nothing here knows which endpoints an action has — it
// re-runs whatever that action does on mount, which is the only definition of
// "current" the action itself has.
export const previewTriggers: { event: string; ref: string; do: Step[] }[] = [
  { event: 'ui:click', ref: 'expand', do: [{ set: 'expanded', value: true }, { reload: true }] },
  { event: 'ui:click', ref: 'collapse', do: [{ set: 'expanded', value: false }] },
];

// A crew card's collapsed face. Identical mechanics to a guest preview — one
// tappable box, one live line off the action's own loaded data — and named
// separately only because the line is a figure the desk works from ("4 open,
// 1 high") rather than an invitation.
//
// This is what lets the crew surface be COMPOSED instead of navigated: a nav
// bar presumes the items are known when the layout is written, so it can never
// be discovered. A card that renders itself small can.
// `title` is a string, and a surface whose name depends on what it loaded binds
// to its own data ('{{$.cardTitle}}') rather than computing the name here.
export const crewCard = (title: string, icon: string, line: unknown): LayoutNode => ({
  component: 'Tile',
  ref: 'expand',
  props: { title, icon, blurb: line },
});
