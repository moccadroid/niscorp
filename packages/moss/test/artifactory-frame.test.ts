import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { createRunningManifest } from '../src/artifactory';
import type { NiscApp, SessionArtifacts, ShellManifest } from '../src/manifest';
import { rowsDouble } from './saved-double';

const saying = (text: string): LayoutNode => ({ component: 'Text', children: text });
const slot = (canvasId: unknown): LayoutNode => ({ component: 'CanvasSlot', props: { canvasId } }) as LayoutNode;
const framed = (name: string, ...more: LayoutNode[]): LayoutNode => ({ component: 'Frame', props: { name }, children: [slot('main'), ...more] });

const home: ActionDefinition = { id: 'home', layout: saying('home, as built') };
const desk: ActionDefinition = { id: 'desk', layout: { component: 'Stack', children: [saying('the desk'), slot('beside-the-desk')] } };

const SHELL: ShellManifest = {
  canvases: [{ id: 'main', initial: 'home' }, { id: 'side', actionLayout: saying('each of the side canvas') }],
  layout: framed('as built', slot('side')),
};
const ABOUT = {
  path: '/about',
  canvases: [{ id: 'main', initial: 'home' }, { id: 'side', actionLayout: saying('each of the page’s side canvas') }],
  layout: framed('the page, as built', slot('side')),
  components: { Banner: {} },
};

const world = (shell: ShellManifest = SHELL) => {
  const rows = rowsDouble();
  const app: NiscApp = { charter: { public: ['home'], member: { actions: ['home', 'desk'] } }, actions: { home, desk }, shell, pages: { about: ABOUT } };
  const running = createRunningManifest({ shipped: app, grants: scopeGrants([]), shells: [shell, ABOUT], published: () => rows.as('*').inForce() });
  const callerOf = (principal: string, roles: readonly string[]) => async () => ({ roles, installed: undefined, saved: rows.as(principal) });
  const madeFor = (principal: string | null, of: ShellManifest = shell, roles: readonly string[] = ['public']) =>
    running.artifactsFor(of, { principal, roles, installed: undefined, ...(principal === null ? {} : { saved: rows.as(principal) }) });
  return {
    running,
    published: running.publishedArtifacts(rows.as('*')),
    of: (principal: string, roles: readonly string[] = ['public']): SessionArtifacts => running.sessionArtifacts(principal, callerOf(principal, roles)),
    draftOn: (of: ShellManifest, principal: string) => running.draftSavingFor(of, principal, callerOf(principal, ['public'])),
    madeFor,
    frameOf: async (principal: string | null, of: ShellManifest = shell) => (await madeFor(principal, of)).layoutStore['frame'],
    slottedOf: async (principal: string | null, of: ShellManifest = shell, roles: readonly string[] = ['public']) => (await madeFor(principal, of, roles)).slottedCanvases,
  };
};

const frame = (layout: unknown, use = true): { kind: 'layout'; body: unknown } => ({ kind: 'layout', body: { ref: 'frame', layout, ...(use ? { use: true } : {}) } });
const nothingUnder = (ref: string): string =>
  `moss: the layout for "${ref}" is refused: nothing is kept under "${ref}". A saved layout takes the place of the layout of an action its holder has, under "action/<the action’s id>", or of one the app’s own shell declares: its own under "frame", a canvas’s under "canvas/<the canvas’s id>".`;

describe('the layout of the app’s own shell, saved from a session', () => {
  it('is its principal’s alone and is drawn in the app’s own shell: marked in use it is what the store holds under `frame`, for nobody else, and a page keeps its own', async () => {
    const { of, frameOf, madeFor } = world();
    const adas = framed('as ada has it', slot('side'));
    await of('ada').save([frame(adas)]);

    expect(await frameOf('ada')).toEqual(adas);
    expect((await madeFor('ada')).frame).toBe('frame');
    expect(await frameOf('ben')).toBe(SHELL.layout);
    expect(await frameOf(null)).toBe(SHELL.layout);
    expect(await frameOf('ada', ABOUT)).toBe(ABOUT.layout);
  });

  it('is kept and not drawn while it is not marked in use', async () => {
    const { of, frameOf } = world();
    const saved = await of('ada').save([frame(framed('a frame ada is not using'), false)]);

    expect(await frameOf('ada')).toBe(SHELL.layout);
    expect((await of('ada').list('layout')).map((version) => version.id)).toEqual([saved.artifacts[0]?.id]);
  });

  it('under `frame` the order is: one’s own marked in use, the one published for everybody, the build’s; a reset shows what is under it', async () => {
    const { of, published, frameOf } = world();
    const everybodys = framed('as published', slot('side'));
    await published.save([frame(everybodys)]);
    expect(await frameOf('ben')).toEqual(everybodys);
    expect(await frameOf(null)).toEqual(everybodys);
    expect(await frameOf('ben', ABOUT)).toBe(ABOUT.layout);

    const saved = await of('ada').save([frame(framed('as ada has it', slot('side')))]);
    expect(await frameOf('ada')).toEqual(framed('as ada has it', slot('side')));

    await of('ada').reset('layout', saved.artifacts[0]?.id ?? '');
    expect(await frameOf('ada')).toEqual(everybodys);
  });

  it('may leave a canvas of the shell out: the canvas stays the shell’s, and is drawn nowhere', async () => {
    const { of, frameOf, madeFor } = world();
    await of('ada').save([frame(framed('main alone'))]);

    expect(await frameOf('ada')).toEqual(framed('main alone'));
    expect((await madeFor('ada')).canvases.map((canvas) => canvas.id)).toEqual(['main', 'side']);
  });

  it('a draft of the app’s own shell takes one, and a draft of a page’s does not', async () => {
    const { draftOn } = world();
    const put = await draftOn(SHELL, 'ada').put([frame(framed('as ada drafts it'))], []);
    expect(put.drafted.map((one) => one.body)).toEqual([{ ref: 'frame', layout: framed('as ada drafts it'), use: true }]);

    await expect(draftOn(ABOUT, 'ada').put([frame(framed('for the page'))], [])).rejects.toThrow(nothingUnder('frame'));
  });
});

describe('what is refused of a frame, in a sentence', () => {
  it('where the app’s own shell declares no layout, nothing is kept under `frame`', async () => {
    const { of, madeFor } = world({ canvases: [{ id: 'main', initial: 'home' }] });
    await expect(of('ada').save([frame(framed('where there is none'))])).rejects.toThrow(nothingUnder('frame'));
    expect('frame' in (await madeFor('ada'))).toBe(false);
  });

  it('where the app’s own shell names a stored layout as its layout, the shell is told that name and nothing is kept under `frame`', async () => {
    const shell: ShellManifest = { canvases: [{ id: 'main', initial: 'home', actionLayout: 'each' }], layout: 'main-split', layoutStore: { 'main-split': framed('the stored one'), each: saying('each') } };
    const { of, madeFor } = world(shell);

    const made = await madeFor('ada', shell);
    expect(made.frame).toBe('main-split');
    expect(made.canvases).toEqual(shell.canvases);
    expect(Object.keys(made.layoutStore)).toEqual(['main-split', 'each', 'action/home']);
    await expect(of('ada').save([frame(framed('in its place'))])).rejects.toThrow(nothingUnder('frame'));
  });

  it('a layout that is written as nothing is none: nova draws its own, as it does with none', async () => {
    const nothing = null as unknown as LayoutNode;
    const shell: ShellManifest = { canvases: [{ id: 'main', initial: 'home', actionLayout: nothing }], layout: nothing };
    const made = await world(shell).madeFor('ada', shell);

    expect('frame' in made).toBe(false);
    expect(made.canvases).toEqual(shell.canvases);
    expect(Object.keys(made.layoutStore)).toEqual(['action/home']);
  });

  it('a component the app’s own shell has none for, though a page has it', async () => {
    const { of } = world();
    await expect(of('ada').save([frame({ component: 'Carousel' })])).rejects.toThrow('moss: the layout for "frame" is refused: layout uses "Carousel", which this app has no component for');
    await expect(of('ada').save([frame({ component: 'Banner', children: [slot('main')] })])).rejects.toThrow(
      'moss: the layout for "frame" is refused: layout uses "Banner", which this app has no component for',
    );
  });

  it('a frame that names a place moss keeps a layout: an action’s, a canvas’s, its own', async () => {
    const { of } = world();
    const naming = (ref: string): { kind: 'layout'; body: unknown } => frame({ component: 'Frame', children: [slot('main'), { ref }] });
    await expect(of('ada').save([naming('action/home')])).rejects.toThrow(
      'moss: the layout for "frame" is refused: it names the layout "action/home": a name beginning with "action/" is where the layout of that action is kept',
    );
    await expect(of('ada').save([naming('canvas/side')])).rejects.toThrow(
      'moss: the layout for "frame" is refused: it names the layout "canvas/side": a name beginning with "canvas/" is where the layout of that canvas is kept',
    );
    await expect(of('ada').save([naming('frame')])).rejects.toThrow('moss: the layout for "frame" is refused: it names the layout "frame": "frame" is where the layout of the shell is kept');
  });
});

describe('the layout of a canvas of the app’s own shell, saved from a session', () => {
  const forSide = (layout: unknown, use = true): { kind: 'layout'; body: unknown } => ({ kind: 'layout', body: { ref: 'canvas/side', layout, ...(use ? { use: true } : {}) } });
  const sideOf = async (made: Promise<{ layoutStore: Readonly<Record<string, LayoutNode>> }>): Promise<LayoutNode | undefined> => (await made).layoutStore['canvas/side'];

  it('is its principal’s alone and is drawn in the app’s own shell, under one published for everybody and over the build’s; a page keeps its own, and a reset shows what is under it', async () => {
    const { of, published, madeFor } = world();
    await published.save([forSide(saying('each, as published'))]);
    const saved = await of('ada').save([forSide(saying('each, as ada has it'))]);

    expect(await sideOf(madeFor('ada'))).toEqual(saying('each, as ada has it'));
    expect(await sideOf(madeFor('ben'))).toEqual(saying('each, as published'));
    expect(await sideOf(madeFor('ada', ABOUT))).toBe(ABOUT.canvases[1]?.actionLayout);
    expect((await madeFor('ada')).canvases[1]).toEqual({ id: 'side', actionLayout: 'canvas/side' });

    await of('ada').reset('layout', saved.artifacts[0]?.id ?? '');
    expect(await sideOf(madeFor('ada'))).toEqual(saying('each, as published'));
    await published.reset('layout', (await published.list('layout'))[0]?.id ?? '');
    expect(await sideOf(madeFor('ada'))).toBe(SHELL.canvases[1]?.actionLayout);
  });

  it('a draft of the app’s own shell takes one, and a draft of a page’s does not', async () => {
    const { draftOn } = world();
    const put = await draftOn(SHELL, 'ada').put([forSide(saying('each, as ada drafts it'))], []);
    expect(put.drafted.map((one) => one.body)).toEqual([{ ref: 'canvas/side', layout: saying('each, as ada drafts it'), use: true }]);

    await expect(draftOn(ABOUT, 'ada').put([forSide(saying('for the page'))], [])).rejects.toThrow(nothingUnder('canvas/side'));
  });

  it('is refused for a canvas that has no layout of its own, one that names a stored layout, and one the shell does not have', async () => {
    const shell: ShellManifest = {
      canvases: [{ id: 'main', initial: 'home' }, { id: 'rail', actionLayout: 'each' }, { id: 'side', actionLayout: saying('each of the side canvas') }],
      layout: framed('as built'),
      layoutStore: { each: saying('each') },
    };
    const { of } = world(shell);
    const under = (ref: string): { kind: 'layout'; body: unknown } => ({ kind: 'layout', body: { ref, layout: saying('x') } });

    await expect(of('ada').save([under('canvas/main')])).rejects.toThrow(nothingUnder('canvas/main'));
    await expect(of('ada').save([under('canvas/rail')])).rejects.toThrow(nothingUnder('canvas/rail'));
    await expect(of('ada').save([under('canvas/nowhere')])).rejects.toThrow(nothingUnder('canvas/nowhere'));
    await expect(of('ada').save([under('canvas/side')])).resolves.toBeDefined();
  });

  it('is held to what a frame is: the components of the app’s own shell, and no name moss keeps a layout under', async () => {
    const { of } = world();
    await expect(of('ada').save([forSide({ component: 'Banner' })])).rejects.toThrow('moss: the layout for "canvas/side" is refused: layout uses "Banner", which this app has no component for');
    await expect(of('ada').save([forSide({ component: 'Frame', children: [{ ref: 'canvas/side' }] })])).rejects.toThrow(
      'moss: the layout for "canvas/side" is refused: it names the layout "canvas/side": a name beginning with "canvas/" is where the layout of that canvas is kept',
    );
  });
});

describe('the canvases a shell’s layouts hold a slot for, beside the ones its manifest declares', () => {
  it('a saved frame with a slot for a canvas the shell does not declare: that canvas is answered for that person’s own shell alone, and no longer once the frame is reset', async () => {
    const { of, slottedOf, madeFor } = world();
    const saved = await of('ada').save([frame(framed('with notes', slot('side'), slot('notes')))]);

    expect(await slottedOf('ada')).toEqual(['notes']);
    expect((await madeFor('ada')).canvases.map((canvas) => canvas.id)).toEqual(['main', 'side']);
    expect(await slottedOf('ben')).toEqual([]);
    expect(await slottedOf('ada', ABOUT)).toEqual([]);

    await of('ada').reset('layout', saved.artifacts[0]?.id ?? '');
    expect(await slottedOf('ada')).toEqual([]);
  });

  it('a saved layout for an action counts as a frame does, while it is in use', async () => {
    const { of, slottedOf } = world();
    const forHome = (use: boolean): { kind: 'layout'; body: unknown } => ({ kind: 'layout', body: { ref: 'action/home', layout: { component: 'Frame', children: [saying('home'), slot('beside')] }, ...(use ? { use: true } : {}) } });
    const saved = await of('ada').save([forHome(true)]);
    expect(await slottedOf('ada')).toEqual(['beside']);

    await of('ada').save([{ ...forHome(false), id: saved.artifacts[0]?.id }]);
    expect(await slottedOf('ada')).toEqual([]);
  });

  it('a slot whose canvas is worked out when it is drawn, or that names none, counts for none, and neither does what is not a slot', async () => {
    const { of, slottedOf } = world();
    const none = [slot('$.c.id'), slot('$which'), slot('{{ $.which }}'), slot('@event.payload'), slot(''), slot(7), { component: 'CanvasSlot' }, { component: 'Text', props: { canvasId: 'not-a-slot' } }];
    await of('ada').save([frame(framed('with slots that name none', ...none))]);

    expect(await slottedOf('ada')).toEqual([]);
  });

  it('every layout a shell is built from counts: an action’s that its person holds, a fragment’s, one the app keeps in its layout store', async () => {
    const shell: ShellManifest = {
      canvases: [{ id: 'main', initial: 'home' }],
      layoutStore: { dock: { component: 'Frame', children: [slot('tray'), slot('main')] } },
      fragments: { sheet: { kind: 'fragment', id: 'sheet', layout: { component: 'Sheet', children: [{ slot: 'body' }, slot('drawer')] } } },
    };
    const { slottedOf } = world(shell);

    expect(await slottedOf('ada', shell, ['member'])).toEqual(['tray', 'beside-the-desk', 'drawer']);
    expect(await slottedOf('ben', shell, ['public'])).toEqual(['tray', 'drawer']);
  });
});
