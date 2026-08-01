// .env first — OPERATOR_KEY lives there, on both sides of the seam.
try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { startAdminService } from './service';
import { atriumBase, operatorKey } from './port';
import { adminToken } from './token';

// `pnpm --filter atrium admin`. Its own process, so it restarts on its own
// clock and the app it administers never notices — the same posture the
// integrations service has, and the reason both live outside src/app.

const main = async (): Promise<void> => {
  if (operatorKey() === '') {
    console.error('admin: OPERATOR_KEY is not set. The app server serves the operator seam only when it holds the same key,');
    console.error('       so without one this tool has nothing to talk to. Put OPERATOR_KEY in apps/lab/atrium/.env and start again.');
    process.exit(1);
  }
  const { port } = await startAdminService();
  console.log(`atrium admin listening on http://localhost:${port}`);
  console.log(`  administering ${atriumBase()} through its operator seam`);
  console.log('');
  console.log('  Open this once. The pill appears bottom left and stays.');
  console.log(`    ${atriumBase()}/?admin=${adminToken()}`);
  console.log('');
  console.log(`  Done with it:  ${atriumBase()}/?admin=off`);
  console.log('');
  console.log('  Nobody but us can follow that link anywhere: without the token this service refuses to');
  console.log('  serve a single action, and no token a hotel can hold is one it has ever heard of.');
};

void main();
