import type { WireStatus } from '../../client';
import { STATUS_WORDS } from '../status';

// What the REPL says of the connection. Real transitions only: up once, down
// once — never the closed↔connecting flap of every backoff retry.
export const createLinkReport = (say: (text: string) => void, prompt: () => void): ((now: WireStatus) => void) => {
  let link: 'unknown' | 'up' | 'down' | 'incompatible' = 'unknown';
  return (now) => {
    if (now === 'incompatible') {
      if (link !== 'incompatible') say(STATUS_WORDS.incompatible);
      link = 'incompatible';
      return;
    }
    if (now === 'open' && link !== 'up') {
      link = 'up';
      say(STATUS_WORDS.connected);
      prompt();
    } else if (now !== 'open' && link === 'up') {
      link = 'down';
      say(STATUS_WORDS.lost);
      prompt();
    } else if (link === 'unknown') {
      link = 'down';
      say(STATUS_WORDS.connecting);
    }
  };
};
