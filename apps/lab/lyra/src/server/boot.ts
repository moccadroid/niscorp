import { createServer, mintDevToken, sessionCookies } from '@niscorp/moss';
import { redeemLink } from './links';
import { unsubscribe } from './unsubscribe';
import { readMailEvent } from './mail/send';
import type { ExecuteAs, MossServer, NiscApp } from '@niscorp/moss';
import { createTideDriver } from '@niscorp/tide';
import type { Tide, TideDriver } from '@niscorp/tide';
import { buildLyra } from '@lyra/app/app';
import { COMPONENT_NAMES } from '@lyra/ui/registry';
import { registerDevIntegrations } from '../dev/dev-integrations';
import { devRuntime } from './runtime';
import { reflexesForEveryStudio, wireTide } from './tide';
import type { DevRuntime } from './runtime';

export const reloadReflexes = async (runAs: ExecuteAs, tide: Tide): Promise<number> => {
  const studios = await runAs('scheduler', 'scheduler/studio-zones', {});
  const rows = await runAs('scheduler', 'scheduler/reflex-rows', {});
  const reflexes = reflexesForEveryStudio(
    (Array.isArray(studios) ? studios : []) as { id: string; timezone: string }[],
    (Array.isArray(rows) ? rows : []) as never,
  );
  await tide.load(reflexes, { at: Date.now() });
  void driver?.wake();
  return reflexes.length;
};

let driver: TideDriver | undefined;
export const tideDriver = (): TideDriver => {
  if (driver === undefined) throw new Error('boot: the tide driver is not up yet');
  return driver;
};


export const boot = async (): Promise<{ server: MossServer; runtime: DevRuntime; app: NiscApp; tide: Tide }> => {
  const runtime = await devRuntime();
  let built: MossServer | undefined;
  let tide: Tide | undefined;
  const signingSeed = process.env['LYRA_SIGNING_SEED'] ?? '';
  const app = buildLyra(
    {
      ...(signingSeed === '' ? {} : { signingSeed }),
      pool: runtime.pool,
      server: () => (built === undefined ? (() => { throw new Error('boot: the server is not up yet'); })() : built),
      tide: () => (tide === undefined ? (() => { throw new Error('boot: tide is not up yet'); })() : tide),
      driver: tideDriver,
      reloadAutomations: async () => (tide === undefined || built === undefined ? 0 : reloadReflexes(built.executeAs, tide)),
    },
  );

  if (app.shell !== undefined) {
    app.shell.components = Object.fromEntries(COMPONENT_NAMES.map((name) => [name, {}]));
  }

  const server = await createServer(app, runtime);

  // Unsubscribe is served on GET and POST: a person clicking the footer link
  // sends a GET, a mailbox provider's one-click unsubscribe sends a POST.
  const buildUnsubscribePage = (message: string): string =>
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Unsubscribed</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:20vh auto;padding:0 1.5rem">` +
    `<p>${message}</p></body>`;

  const handleUnsubscribeRequest = async (c: { req: { param: (name: string) => string | undefined } }): Promise<Response> => {
    const done = await unsubscribe(server.executeAs, c.req.param('token') ?? '');
    return new Response(
      buildUnsubscribePage(
        done === null
          ? 'That link is not one we recognise. If you are still hearing from a studio you would rather not, reply to one of their emails and they will take you off.'
          : 'Done — you will not hear from this studio again. Anything you have booked still stands, and they can still write to you about it.',
      ),
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  };

  // No principal: the signature is the authentication, checked over the raw
  // body before anything is parsed. Always 200, even for a forged call: a
  // webhook sender retries on a 4xx.
  server.post('/api/mail/events', async (c) => {
    const raw = await c.req.text();
    const headers: Record<string, string> = {};
    for (const name of ['svix-id', 'svix-timestamp', 'svix-signature']) headers[name] = c.req.header(name) ?? '';
    const event = readMailEvent(headers, raw, Date.now());
    if (event === null) return c.json({ ok: true }, 200);

    if (event.kind === 'delivered') {
      await server.executeAs('mailer', 'mailer/record-delivered', { providerMessageId: event.id, at: new Date().toISOString() });
      return c.json({ ok: true });
    }
    if (event.kind === 'bounced' || event.kind === 'complained') {
      const origin = (await server.executeAs('mailer', 'mailer/outbox-origin', { providerMessageId: event.id })) as { studio_id?: unknown; person_id?: unknown } | null;
      const studioId = String(origin?.studio_id ?? '');
      const personId = String(origin?.person_id ?? '');
      // A bounce is about the address and holds everywhere; a complaint is
      // about the relationship and holds at the studio complained about.
      const suppressAt = event.kind === 'bounced' ? '' : studioId;
      await server.executeAs('mailer', 'mailer/suppress', { address: event.to, studioId: suppressAt, kind: event.kind, reason: event.reason });
      await server.executeAs('mailer', 'mailer/record-failed', { providerMessageId: event.id, reason: event.reason });
      if (event.kind === 'complained' && studioId !== '' && personId !== '') {
        await server.executeAs('mailer', 'mailer/opt-out', { studioId, personId }, { studioId, personId });
      }
    }
    return c.json({ ok: true });
  });

  server.get('/api/unsubscribe/:token', handleUnsubscribeRequest);
  server.post('/api/unsubscribe/:token', handleUnsubscribeRequest);

  server.post('/api/auth/redeem', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { nonce?: unknown };
    const personId = await redeemLink(server.executeAs, String(body.nonce ?? ''), Date.now());
    if (personId === null) return c.json({ message: 'That sign-in link has expired or has already been used.' }, 401);
    // The session goes into a cookie no script can read; the page is handed nothing.
    for (const cookie of sessionCookies(c.req.raw, mintDevToken(personId))) c.header('set-cookie', cookie, { append: true });
    return c.body(null, 204);
  });
  built = server;

  tide = wireTide({ server: () => server, now: () => Date.now(), pool: runtime.pool, base: () => process.env['LYRA_BASE'] ?? 'http://localhost:5180' });
  driver?.stop();
  driver = createTideDriver({ tide, retention: { facts: 7 * 24 * 3_600_000, tasks: 30 * 24 * 3_600_000, runs: 30 * 24 * 3_600_000 } });
  await reloadReflexes(server.executeAs, tide);

  return { server, runtime, app, tide };
};

// Not part of `boot()`: every check calls `boot()` too, and integrations
// registered there would break a check's own registration.
export const bootDevServer = async (): Promise<Awaited<ReturnType<typeof boot>>> => {
  const booted = await boot();
  await registerDevIntegrations(booted.server, booted.runtime.pool, booted.runtime.operatorKey ?? '', async () => { booted.server.refresh(); });
  return booted;
};
