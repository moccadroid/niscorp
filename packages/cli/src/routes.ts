// ═══════════════════════════════════════════════════════════════
// The paths an app has, where each one's file goes, and the table a build
// prints. Pure: no server, no disk — the command hands these what it found.
// ═══════════════════════════════════════════════════════════════

// What a build learned about one path (moss's `ExportedDocument`, without the
// markup).
export type RouteReport = {
  path: string;
  // the page the path led to; absent: the app's own shell
  page?: string;
  drawn: boolean;
  // something on it can still happen — it wants a server behind it
  live: boolean;
  why: readonly string[];
  // reads whose answers are in the markup as they were when it was drawn
  drawnWith: readonly string[];
  settled: boolean;
};

// `/`, and every page whose path names no parameter. A parameterised page has
// as many paths as there are rows; those are the app's to list.
export const defaultPaths = (pages: readonly { name: string; path: string }[]): string[] => [
  '/',
  ...pages
    .map((page) => page.path)
    .filter((path) => !path.split('/').some((segment) => segment.startsWith(':')))
    .sort(),
];

// Where a path's file goes under the output directory: `/` is index.html, and
// every other path is a folder with an index.html in it — what every static
// host serves for that path without being told to.
export const fileOf = (path: string): string => {
  const segments = path.split('?')[0]?.split('/').filter((segment) => segment !== '') ?? [];
  if (segments.some((segment) => segment === '..' || segment === '.')) throw new Error(`nisc: "${path}" is not a path a file can be written for.`);
  return [...segments, 'index.html'].join('/');
};

const pad = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - text.length));

// The table. One row per path: whether a file is the whole of it, or a server
// has to stand behind it — and, in the build's own words, why.
export const routeTable = (routes: readonly RouteReport[]): string => {
  const rows = routes.map((route) => {
    const mark = !route.drawn ? '✗' : route.live ? '●' : '○';
    const what = route.page === undefined ? 'the app' : `page ${route.page}`;
    const served = !route.drawn ? 'not drawn' : route.live ? 'server' : 'file';
    const notes = [
      ...(route.drawn ? route.why : ['it could not be drawn — it goes out as the undrawn template']),
      ...(route.drawn && !route.settled ? ['it was still loading when the wait ran out — drawn with what it had'] : []),
      ...(route.drawnWith.length > 0 ? [`drawn with ${route.drawnWith.join(', ')} — as it answered at build`] : []),
    ];
    return { mark, path: route.path, what, served, notes };
  });
  const widths = {
    path: Math.max(5, ...rows.map((row) => row.path.length)),
    what: Math.max(4, ...rows.map((row) => row.what.length)),
    served: Math.max(9, ...rows.map((row) => row.served.length)),
  };
  const lines = [`  ${pad('Route', widths.path + 2)}${pad('What', widths.what + 2)}${pad('Served as', widths.served + 2)}Because`];
  for (const row of rows) {
    const head = `${row.mark} ${pad(row.path, widths.path + 2)}${pad(row.what, widths.what + 2)}${pad(row.served, widths.served + 2)}`;
    const [first, ...rest] = row.notes.length > 0 ? row.notes : ['nothing on it can still happen'];
    lines.push(`${head}${first ?? ''}`);
    for (const note of rest) lines.push(`${' '.repeat(head.length)}${note}`);
  }
  lines.push('');
  lines.push('○  file    drawn once, for nobody in particular; nothing on it can still happen');
  lines.push('●  server  something on it can still happen; it wants moss behind it');
  return lines.join('\n');
};
