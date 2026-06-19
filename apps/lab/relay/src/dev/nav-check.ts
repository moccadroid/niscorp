// Headless check for cross-link navigation (Model A): opening a related record
// must switch main + detail + the sidebar highlight TOGETHER. Guards the
// step-order gotcha — a trigger that replaces its own canvas must do so last,
// or the steps after it are aborted with the popped action.
import { shell } from '../nova/shell';

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 40));

const actionOf = (canvasId: string): string | undefined => {
  const active = shell.getCanvasState(canvasId).active;
  return active !== undefined ? shell.getRuntime(active.id)?.definition.id : undefined;
};
const sidebarActive = (): unknown => {
  const a = shell.getCanvasState('sidebar').active;
  return a !== undefined ? shell.getRuntime(a.id)?.getData()['active'] : undefined;
};
const mainHighlight = (): unknown => {
  const a = shell.getCanvasState('main').active;
  return a !== undefined ? shell.getRuntime(a.id)?.getData()['highlight_id'] : undefined;
};

const main = async (): Promise<void> => {
  // Be on Companies, open a company in the detail panel.
  shell.replace('main', 'companies');
  shell.publish('screen-companies');
  shell.replace('detail', 'company-detail', { id: 'cmp_001' });
  await settle();

  // Cross-link to one of its people (fires company-detail's open-contact).
  shell.dispatch({ type: 'ui:click', ref: 'open-contact', payload: 'con_001' });
  await settle();

  const checks: [string, unknown, unknown][] = [
    ['main      → contacts', actionOf('main'), 'contacts'],
    ['detail    → contact-detail', actionOf('detail'), 'contact-detail'],
    ['sidebar   → contacts', sidebarActive(), 'contacts'],
    ['highlight → con_001', mainHighlight(), 'con_001'],
  ];
  let ok = true;
  for (const [label, got, want] of checks) {
    const pass = got === want;
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}   (got: ${String(got)})`);
  }
  console.log(ok ? '\nOK — cross-link switches main + detail + sidebar together.' : '\nFAIL — cross-link is incoherent.');
  process.exit(ok ? 0 : 1);
};

void main();
