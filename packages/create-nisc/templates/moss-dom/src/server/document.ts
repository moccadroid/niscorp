import { JSDOM } from 'jsdom';
import type { ShellSnapshot } from '@niscorp/moss';
import { renderSnapshot } from '@niscorp/moss/terminal/dom/server';
import { buildRegistry } from '../ui/registry';

const registry = buildRegistry();
const { window } = new JSDOM('');

export const drawing = {
  draw: (snapshot: ShellSnapshot): string => renderSnapshot({ snapshot, registry, window }),
};
