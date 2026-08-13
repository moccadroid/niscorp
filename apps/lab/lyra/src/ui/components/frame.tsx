import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';

// ═══════════════════════════════════════════════════════════════
// THE ONE PLACE THIS APP DOES NOT VALIDATE WHAT IT RENDERS.
//
// Everything else in this kit is a named component with a props schema, and a
// bundle naming anything outside that vocabulary is refused at intake. That is
// what stops a pack shipping arbitrary UI. Inside a frame, none of it applies —
// the page is the pack's, and this app checks nothing about it.
//
// It is bounded by three things, and they are the whole argument: the src is
// SAME-ORIGIN (moss serves it, and only for a path the bundle declared), the
// pack is approved, and it is installed at this studio. The alternative was
// this app importing a payment provider's SDK, which every app that ever
// installs the pack would then carry.
//
// GENERIC ON PURPOSE. It is `Frame`, not `StripeEmbed`; it renders a URL and
// knows nothing about any pack. The day a second pack needs one, it needs no
// change here.
//
// It does NOT mint its own src. A grant is fetched by the action, over the
// session's own wire, and arrives as data — because a component that fetches is
// a component with a policy, and policy belongs in the action.
// ═══════════════════════════════════════════════════════════════

const FrameProps = z
  .object({
    src: z.string().optional().describe('A grant URL from /api/integrations/frame. Empty renders nothing — a frame with no grant is not an error, it is a screen still asking.'),
    title: z.string().optional().describe('Accessible name for the frame. Screen readers announce it; give it the words the pack would.'),
    height: z.union([z.string(), z.number()]).optional().describe('Opening height. The page inside can grow it by posting {type:"frame:height"}.'),
    minHeight: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

const size = (value: string | number | undefined, fallback: string): string =>
  value === undefined ? fallback : typeof value === 'number' ? `${value}px` : value;

export const Frame: NovaComponent<z.infer<typeof FrameProps>> = ({ src, title, height, minHeight }: z.infer<typeof FrameProps>) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [grown, setGrown] = useState<number | null>(null);

  // THE HEIGHT HANDSHAKE. An iframe does not size to its content, and a
  // payment form is exactly the kind of page whose height nobody can predict —
  // it grows a validation error, a country changes its fields. So the page
  // inside asks, and this listens.
  //
  // The message is only believed if it came FROM THIS FRAME'S OWN WINDOW. A
  // page can post to anything; without that check any tab could resize this one.
  // Same-origin here, so `event.origin` is our own — the window identity is the
  // real check, not the origin string.
  useEffect(() => {
    if (src === undefined || src === '') return;
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== ref.current?.contentWindow) return;
      const data = event.data as { type?: unknown; height?: unknown } | null;
      if (data === null || data.type !== 'frame:height') return;
      const asked = Number(data.height);
      // A page asking for nothing, or for a screenful of nonsense, gets the
      // layout it was given. Capped so a bad number cannot push the thumb bar
      // off the bottom of somebody's phone.
      if (!Number.isFinite(asked) || asked <= 0) return;
      setGrown(Math.min(asked, 2400));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [src]);

  // A frame with no grant yet renders nothing rather than an empty box: the
  // action fetches the grant on mount, and a flash of chrome around a blank
  // rectangle reads as broken.
  if (src === undefined || src === '') return null;

  return (
    <iframe
      ref={ref}
      src={src}
      title={title ?? 'Embedded page'}
      // `allow-same-origin` IS GRANTED, and that is a decision, not a default.
      //
      // The first version withheld it, so the page ran with an opaque origin
      // and could not reach this app's storage or session. That was the
      // stronger fence, and it does not survive contact with the thing frames
      // exist for: sandbox flags INHERIT into every nested iframe, so a
      // vendor's own frame (Stripe's, at connect-js.stripe.com) also ran
      // origin-less — its message channel could never initialize, and the
      // component died after a 10s timeout with nothing rendered.
      //
      // So the honest position, and the one BUILD_STRIPE took from the start:
      // with the page served at this app's own origin, this sandbox is
      // ADVISORY — a same-origin document with scripts can reach the parent.
      // The real fence around a framed page is that the path was DECLARED at
      // intake, the pack was APPROVED by an operator, the studio INSTALLED it,
      // and the grant is short-lived. A pack framing a page is trusted with
      // the session of whoever is looking at it; that is what approval means.
      //
      // The browser-level fence comes back when framed pages move to the
      // pack's OWN origin (a redirect handshake instead of a proxy) — worth
      // doing before live, and a moss change rather than one here.
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      referrerPolicy="no-referrer"
      style={{
        display: 'block',
        width: '100%',
        border: 'none',
        background: 'transparent',
        height: grown === null ? size(height, '420px') : `${grown}px`,
        minHeight: size(minHeight, '0'),
      }}
    />
  );
};

Frame.meta = {
  description: 'Frames a page an installed pack serves, at this app’s own origin, from a declared path and a short-lived grant. What is inside it is not validated by this app — the only component of which that is true.',
  propsSchema: FrameProps,
};
