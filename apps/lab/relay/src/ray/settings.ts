// Ray UI preferences — browser-local, like the API key. For now just the debug
// toggle: when on, Ray streams its tool calls (input + output + timing) into the
// chat. Read by run.ts (to capture a trace) and the settings screen (the switch).
import { lsGet, lsSet } from '../storage';

const DEBUG_KEY = 'relay.ray.debug';

export const getDebug = (): boolean => lsGet(DEBUG_KEY) === '1';

export const setDebug = (on: boolean): void => lsSet(DEBUG_KEY, on ? '1' : '0');
