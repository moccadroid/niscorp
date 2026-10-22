import { createServer } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import { app } from '../app/app';
import { runtime } from './runtime';

export const boot = async (): Promise<{ server: MossServer }> => ({ server: await createServer(app, await runtime()) });
