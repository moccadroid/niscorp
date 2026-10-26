import { existsSync } from 'node:fs';
import { createServer } from '@niscorp/moss';
import type { MossServer, NiscApp, RunSink } from '@niscorp/moss';
import { buildApp } from '../app/app';
import { composer, dockInputs } from './compose';
import type { Models } from './compose';
import { createDoor, identitySeam, resendMail } from './identity';
import type { Door, SendMail } from './identity';
import { modelsFromEnv } from './models';
import { logRun } from './runs';
import { runtime } from './runtime';
import type { Runtime } from './runtime';

export type BootConfig = { models: Models; runs: RunSink; mail: SendMail; owner: string; publicUrl: string; databaseUrl: string };
export type Booted = { server: MossServer; door: Door; close: () => Promise<void> };

const envFile = (): NodeJS.ProcessEnv => {
  if (existsSync('.env')) process.loadEnvFile('.env');
  return process.env;
};

export const configFromEnv = (): BootConfig => {
  const env = envFile();
  const models = modelsFromEnv(env);
  console.log(`[app] ${models.summary}`);
  if (models.missing.length > 0) console.log(`[app] ${models.missing.join(', ')} is empty in .env: until it is set, a message is answered with a notice saying so.`);
  const owner = env['MIRA_OWNER'] ?? '';
  if (owner === '') console.log('[app] MIRA_OWNER is empty in .env: until it is set, nobody can sign in.');
  return {
    models,
    runs: logRun,
    mail: resendMail(env['RESEND_API_KEY'] ?? '', env['MAIL_FROM'] ?? 'Mira <onboarding@resend.dev>'),
    owner,
    publicUrl: env['PUBLIC_URL'] ?? 'http://localhost:5173',
    databaseUrl: env['DATABASE_URL'] ?? '',
  };
};

const manifest = (functions: NonNullable<NiscApp['functions']>, runs: RunSink): NiscApp => buildApp({ functions, identity: identitySeam, inputs: dockInputs, runs });

export const boot = async (config: BootConfig = configFromEnv()): Promise<Booted> => {
  const opened = await runtime(config.databaseUrl);
  let server: MossServer | undefined;
  const serverOf = (): MossServer => {
    if (server === undefined) throw new Error('mira: a function was called before the server was up.');
    return server;
  };
  const door = createDoor({ pool: opened.pool, server: serverOf, mail: config.mail, publicUrl: config.publicUrl, owner: config.owner });
  const compose = composer(config.models);
  server = await createServer(manifest((session) => [...compose(session), ...door.functions], config.runs), opened);
  await door.admitOwner();
  const up = server;
  return {
    server: up,
    door,
    close: async () => {
      up.close();
      await opened.close();
    },
  };
};

// What `nisc migrate` is handed: the manifest, whose entries it holds against the tables it leaves, and the
// environment. It builds no shell, so no function is called.
export const migration = {
  app: manifest(() => [], logRun),
  runtime: (): Promise<Runtime> => runtime(envFile()['DATABASE_URL'] ?? ''),
};
