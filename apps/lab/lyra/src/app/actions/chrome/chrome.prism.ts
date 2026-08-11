import { themeCurrent } from '@lyra/app/vex/theme.entries';

// The studio's palette, as a read. `inputs` still seeds it at boot so there is
// no flash of the stock look on connect; this endpoint is what lets a change
// land on a shell that is already open.
export const themeCurrentPrism = { fingerprint: themeCurrent.fingerprint, context: {} };
