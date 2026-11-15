export type RouteReport = {
  path: string;
  page?: string;
  drawn: boolean;
  live: boolean;
  why: readonly string[];
  drawnWith: readonly string[];
  settled: boolean;
  head?: { elements: readonly unknown[]; actions: readonly string[] };
};

export const defaultPaths = (pages: readonly { name: string; path: string }[]): string[] => [
  '/',
  ...pages
    .map((page) => page.path)
    .filter((path) => !path.split('/').some((segment) => segment.startsWith(':')))
    .sort(),
];

export const fileOf = (path: string): string => {
  const segments = path.split('?')[0]?.split('/').filter((segment) => segment !== '') ?? [];
  if (segments.some((segment) => segment === '..' || segment === '.')) throw new Error(`nisc: "${path}" is not a path a file can be written for.`);
  return [...segments, 'index.html'].join('/');
};

const pad = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - text.length));

export const routeTable = (routes: readonly RouteReport[]): string => {
  const says = (route: RouteReport): boolean => (route.head?.elements.length ?? 0) > 0;
  const headed = routes.some(says);
  const rows = routes.map((route) => {
    const mark = !route.drawn ? '✗' : route.live ? '●' : '○';
    const what = route.page === undefined ? 'the app' : `page ${route.page}`;
    const served = !route.drawn ? 'not drawn' : route.live ? 'server' : 'file';
    const notes = [
      ...(route.drawn ? route.why : ['it could not be drawn — it goes out as the undrawn template']),
      ...(route.drawn && !route.settled ? ['it was still loading when the wait ran out — drawn with what it had'] : []),
      ...(route.drawnWith.length > 0 ? [`drawn with ${route.drawnWith.join(', ')} — as it answered at build`] : []),
    ];
    const head = headed && route.drawn ? [says(route) ? `head: its own, said by ${route.head?.actions.join(', ') || 'the shell’s chrome'}` : 'head: the template’s own'] : [];
    return { mark, path: route.path, what, served, notes, head };
  });
  const widths = {
    path: Math.max(5, ...rows.map((row) => row.path.length)),
    what: Math.max(4, ...rows.map((row) => row.what.length)),
    served: Math.max(9, ...rows.map((row) => row.served.length)),
  };
  const lines = [`  ${pad('Route', widths.path + 2)}${pad('What', widths.what + 2)}${pad('Served as', widths.served + 2)}Because`];
  for (const row of rows) {
    const head = `${row.mark} ${pad(row.path, widths.path + 2)}${pad(row.what, widths.what + 2)}${pad(row.served, widths.served + 2)}`;
    const [first, ...rest] = [...(row.notes.length > 0 ? row.notes : ['nothing on it can still happen']), ...row.head];
    lines.push(`${head}${first ?? ''}`);
    for (const note of rest) lines.push(`${' '.repeat(head.length)}${note}`);
  }
  lines.push('');
  lines.push('○  file    drawn once, for nobody in particular; nothing on it can still happen');
  lines.push('●  server  something on it can still happen; it wants moss behind it');
  return lines.join('\n');
};
