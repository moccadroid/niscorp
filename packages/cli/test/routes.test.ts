import { describe, expect, it } from 'vitest';
import { defaultPaths, fileOf, routeTable } from '../src/routes';
import type { RouteReport } from '../src/routes';

const route = (path: string, extra: Partial<RouteReport> = {}): RouteReport => ({ path, drawn: true, live: false, why: [], drawnWith: [], settled: true, ...extra });

describe('defaultPaths — the paths a build walks when the app lists none', () => {
  it('the app’s own, and every page whose path names no parameter', () => {
    expect(defaultPaths([{ name: 'welcome', path: '/welcome' }, { name: 'about', path: '/about' }])).toEqual(['/', '/about', '/welcome']);
  });

  it('a parameterised page is left out: only the app knows its paths', () => {
    expect(defaultPaths([{ name: 'doc', path: '/docs/:slug' }, { name: 'docs', path: '/docs' }])).toEqual(['/', '/docs']);
  });

  it('no pages at all is the app alone', () => {
    expect(defaultPaths([])).toEqual(['/']);
  });
});

describe('fileOf — where a path’s file goes', () => {
  it('the root is index.html; every other path is a folder with one in it', () => {
    expect(fileOf('/')).toBe('index.html');
    expect(fileOf('/about')).toBe('about/index.html');
    expect(fileOf('/docs/getting-started/')).toBe('docs/getting-started/index.html');
  });

  it('a query is not part of where the file goes', () => {
    expect(fileOf('/about?ref=mail')).toBe('about/index.html');
  });

  it('a path that would climb out of the folder is refused', () => {
    expect(() => fileOf('/../etc/passwd')).toThrow(/not a path a file can be written for/);
    expect(() => fileOf('/docs/./x')).toThrow();
  });
});

describe('routeTable — how each path is served, and why', () => {
  const table = routeTable([
    route('/about', { page: 'about' }),
    route('/', { live: true, why: ['auth.login: a person can act on it', 'auth.login: it calls the function endpoint "enter", which is code'] }),
    route('/docs/intro', { page: 'doc', drawnWith: ['docs/page'] }),
    route('/broken', { page: 'broken', drawn: false, live: true }),
    route('/slow', { page: 'slow', settled: false }),
  ]);
  const line = (path: string): string => table.split('\n').find((row) => row.includes(` ${path} `)) ?? '';

  it('a finished page is a file', () => {
    expect(line('/about')).toMatch(/^○ \/about\s+page about\s+file\s+nothing on it can still happen$/);
  });

  it('a page that can still do something wants a server, and says every reason', () => {
    expect(line('/')).toMatch(/^● \/\s+the app\s+server\s+auth\.login: a person can act on it$/);
    expect(table).toContain('auth.login: it calls the function endpoint "enter", which is code');
  });

  it('a read made at build is named as frozen', () => {
    expect(line('/docs/intro')).toContain('drawn with docs/page — as it answered at build');
  });

  it('a page that could not be drawn is said so, never passed off as a file', () => {
    expect(line('/broken')).toMatch(/^✗ \/broken\s+page broken\s+not drawn\s+it could not be drawn/);
  });

  it('a page drawn before it settled says so', () => {
    expect(line('/slow')).toContain('still loading when the wait ran out');
  });

  it('ends with what the two marks mean', () => {
    expect(table).toContain('○  file');
    expect(table).toContain('●  server');
  });
});
