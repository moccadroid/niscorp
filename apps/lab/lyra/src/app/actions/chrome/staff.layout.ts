import type { LayoutNode } from '@niscorp/nova';

// THE TOP BAR AND THE MENU.
//
// The menu this replaces was a flat list of twelve entities under two headings
// that named nothing. What is here now has four properties a long list does
// not, and each one is doing a job:
//
//   A HEADER. Who you are and which studio you are in, at the top, where a
//   drawer header always is. It gives identity somewhere to live and gives
//   "Sign out" a reason not to float above the fold. It is also where a studio
//   switcher goes the day somebody works at two.
//
//   HOME, ALONE. One thing, before any grouping, because it is where you land
//   and it belongs to no category.
//
//   GROUPS NAMED AFTER JOBS, ordered by how often they are wanted. Run the day
//   before What's on before The business before Set up.
//
//   THE CURRENT PLACE, MARKED. Without it a twelve-item menu makes you read
//   the whole thing to work out where you already are.
//
// The bar itself carries three things and no more: the way in, where you are,
// and who you are. That is the standard shape because it is the one that
// survives a narrow screen.
export const staffChromeLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 0 },
  children: [
    { component: 'Theme', props: { tokens: '$.themeTokens', name: '$.themeName' } },

    // ── NO TOP BAR ───────────────────────────────────────────
    //
    // There was one, and it went for the reason the desktop CSS had already
    // written down about itself: with the burger gone it held the studio name,
    // the role and the avatar — precisely what the drawer's own header holds,
    // one tap away behind More. Forty-four points of a phone screen, spent
    // repeating something.
    //
    // What killed it was the screenshot: the identity bar and the area tabs
    // stacked into two strips before a single line of content, on the device
    // this pass exists to serve. A phone gets ONE strip at the top — the tabs,
    // which are navigation — and one at the bottom, where the thumb is. Which
    // screen you are on is said by the screen's own title, in type big enough
    // to read, rather than by a 12px eyebrow above it.

    {
      component: 'Drawer',
      props: { open: '$.menuOpen' },
      ref: 'closeMenu',
      children: {
        component: 'Stack',
        props: { gap: 0 },
        children: [
          // Who, and where. The one block in the menu that is not a
          // destination.
          {
            component: 'DrawerHeader',
            props: { name: '$.personName', role: '$.roleLabel', studio: '$.studioName' },
          },

          // Home, before any grouping.
          {
            component: 'DrawerLink',
            props: { label: '$.home.label', value: '$.home.action', current: '$.currentArea', icon: 'home' },
            ref: 'nav',
          },

          // THE AREAS, FLAT. One level, because the second one is TABS above
          // the content — visible on every screen and on every width, rather
          // than folded inside a panel a phone keeps closed.
          //
          // The drawer used to expand the open area into its screens. That
          // worked on a desk and was worthless on a phone: below 860px this is
          // a scrim overlay behind a burger, so the trail was invisible until
          // you opened a modal on top of the thing you were reading, and
          // navigating cost three taps. The tab row costs none.
          {
            for: '$.areas',
            as: 'area',
            key: 'action',
            do: {
              component: 'DrawerLink',
              // Lights by the AREA, opens its FIRST SCREEN — see `Tab` for why
              // those are two props rather than one.
              props: { label: '$.area.label', value: '$.area.areaId', payload: '$.area.action', current: '$.currentArea', icon: '$.area.icon' },
              ref: 'nav',
            },
          },
          // Below everything, quiet, and separated by a rule — it is the one
          // thing in here nobody should hit by accident.
          { component: 'DrawerFooter', props: { label: 'Sign out' }, ref: 'leave' },
        ],
      },
    },

    // ── THE THUMB BAR ────────────────────────────────────────
    //
    // Pinned to the bottom, where a thumb is. The frame's own comment has
    // described this since the layout overhaul — "a tab bar pinned to the
    // bottom, where a thumb is" — and `Tab` was built for it and then never
    // used: the drawer took over and the primary device got a burger.
    //
    // FOUR AND A DOOR. `primaryAreas` is the four most-wanted destinations for
    // this principal; everything past them lives behind More, which opens the
    // same drawer the desktop rail uses. Five is the ceiling on a phone, and
    // the fifth slot is worth more as an escape hatch than as a fifth
    // destination.
    //
    // CSS hides this at the rail's breakpoint — one arrangement, two shapes,
    // which is the same trade the sheet makes.
    {
      component: 'Bar',
      props: { position: 'bottom' },
      children: [
        {
          for: '$.primaryAreas',
          as: 'area',
          key: 'action',
          do: { component: 'Tab', props: { label: '$.area.label', value: '$.area.areaId', payload: '$.area.action', current: '$.currentArea', icon: '$.area.icon' }, ref: 'nav' },
        },
        // More is a door until you are behind it. `moreValue` is empty while
        // you are in one of the four, and the open area's id when you are not —
        // so it lights for Money, Settings and Add-ons, and never for People.
        { component: 'Tab', props: { label: 'More', value: '$.moreValue', current: '$.currentArea', icon: 'more' }, ref: 'openMenu' },
      ],
    },

    // ── THE SECOND LEVEL, IN THE CONTENT ─────────────────────
    //
    // The screens inside the area you are in. This is the piece that makes the
    // whole thing work on a phone: it is not in the drawer, so it does not
    // need the drawer to be open, and it reads the same on a 375px screen as
    // on a desk.
    //
    // `tabs` comes from `nav.context` — derived on every move from the same
    // taxonomy the menu is built from, because a message carries no payload
    // here and `inputs` only ever answers once. An area with one screen sends
    // an empty list and this renders nothing at all.
    {
      if: '$.tabCount',
      then: {
        // The hairline runs the full width and the tabs sit on the measure —
        // so the rule reads as the edge of the chrome rather than as a box
        // drawn around the tabs.
        component: 'Box',
        props: { border: 'bottom' },
        children: {
          component: 'Box',
          props: { px: 24, maxWidth: 1040, center: true },
          children: { component: 'Tabs', props: { value: '$.currentLeaf', options: '$.tabs', look: 'underline' }, ref: 'navLeaf' },
        },
      },
      else: '',
    },
  ],
};
