import { createServer } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import { app } from '../app/app';
import { runtime } from './runtime';

// The one composition: the app's artifacts plus an environment → the server.
// The dev server, `nisc build`, `nisc start` and every check boot through here.
// moss refuses to boot an incoherent charter — a refusal is a finding.
export const boot = async (): Promise<{ server: MossServer }> => ({ server: await createServer(app, await runtime()) });
