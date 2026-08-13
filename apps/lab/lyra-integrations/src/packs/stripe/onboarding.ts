// ── THE PAGE LYRA FRAMES ─────────────────────────────────────
//
// Stripe compels three embedded components for accounts where it carries the
// losses — onboarding, account management, and the notification banner — and
// they are browser UI from `@stripe/connect-js`. Lyra validates every layout
// against a fixed component vocabulary and refuses a bundle naming anything
// else, so a pack cannot ship a component. The way through is not to teach
// lyra's kit about Stripe: the pack serves a page and lyra frames it, at lyra's
// own origin, through a declared path and a short-lived grant (moss: the frames
// seam).
//
// SELF-CONTAINED, and it has to be. A relative `<script src>` in here would
// resolve against LYRA's origin and arrive at its proxy with no session, so
// everything local is inline and the only outside thing is Stripe's own SDK,
// loaded straight from Stripe. That is also why the frame is sandboxed without
// `allow-same-origin` on lyra's side: this document gets an opaque origin and
// cannot reach lyra's storage or session.
//
// The page refreshes its own session rather than holding one — Account Sessions
// are short-lived, and a form somebody is halfway through must not die on them.

export type EmbedPage = {
  publishableKey: string;
  clientSecret: string;
  /** Which of Stripe's components to mount — the pack's screens each frame one. */
  component: 'account-onboarding' | 'account-management' | 'notification-banner';
  /** Where the page re-fetches a session when the one it holds expires. */
  refreshPath: string;
};

const ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// Every value below is minted by this service, not sent by a caller — but it is
// interpolated into a document, and "trusted today" is how an injection gets
// written. Escaped because it is HTML, not because the input is suspect.
const esc = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);

export const embedPage = (page: EmbedPage): string => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payments</title>
<style>
  /* No branding of its own: the host frames this, and a page that styles itself
     differently from the app around it reads as a different application. Stripe
     takes an appearance object below for the same reason. */
  html, body { margin: 0; background: transparent; font: 14px/1.5 system-ui, -apple-system, sans-serif; }
  #mount { min-height: 120px; }
  .fallback { padding: 16px; color: #6b6b70; }
</style>
</head>
<body>
  <div id="mount"><p class="fallback">Loading…</p></div>
  <script src="https://connect-js.stripe.com/v1.0/connect.js"></script>
  <script>
    (function () {
      var mount = document.getElementById('mount');
      if (!window.StripeConnect) {
        mount.innerHTML = '<p class="fallback">Payments could not load. Check the connection and try again.</p>';
        return;
      }
      var instance = window.StripeConnect.init({
        publishableKey: ${JSON.stringify(page.publishableKey)},
        // SHORT-LIVED BY DESIGN. Stripe calls this whenever the session it holds
        // is about to expire, and the answer is a fresh secret from our own
        // server — which is why this is a function and not a value. The fetch is
        // same-origin to THIS page, so it rides the frame grant already spent.
        fetchClientSecret: function () {
          // FROM THIS DOCUMENT'S OWN PATH, not a relative string. The page is
          // served at /integrations/<pack>/frame/<token>, and a bare 'session'
          // resolves by REPLACING the last segment — landing on
          // /frame/session, which is not a grant and 404s. The component then
          // renders nothing at all, with no error anybody sees.
          //
          // Appending to the pathname keeps the token, which is the only thing
          // this page has to authenticate with.
          var back = location.pathname.replace(/\\/+$/, '') + '/' + ${JSON.stringify(page.refreshPath)};
          return fetch(back, { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (j) { return j.client_secret; });
        },
        appearance: { overlays: 'dialog' },
      });
      mount.innerHTML = '';
      mount.appendChild(instance.create(${JSON.stringify(page.component)}));

      // THE HEIGHT HANDSHAKE, the pack's half. An iframe does not size to its
      // content and an onboarding form's height is not predictable — it grows a
      // validation error, a country changes its fields. So the page says, and
      // keeps saying.
      var tell = function () {
        parent.postMessage({ type: 'frame:height', height: document.documentElement.scrollHeight }, '*');
      };
      tell();
      if (window.ResizeObserver) new ResizeObserver(tell).observe(document.body);
      setInterval(tell, 1000);
    })();
  </script>
</body></html>`;

/** What a studio sees before anybody has created their account. */
export const notOnboardedPage = (): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>Payments</title>
<style>body{margin:0;font:14px/1.5 system-ui,sans-serif;color:#6b6b70}</style></head>
<body><p>This studio has not been connected to payments yet.</p>
<script>parent.postMessage({ type: 'frame:height', height: 60 }, '*');</script>
</body></html>`;

export const unavailablePage = (why: string): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>Payments</title>
<style>body{margin:0;font:14px/1.5 system-ui,sans-serif;color:#6b6b70}</style></head>
<body><p>${esc(why)}</p>
<script>parent.postMessage({ type: 'frame:height', height: 60 }, '*');</script>
</body></html>`;
