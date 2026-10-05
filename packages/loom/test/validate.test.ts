import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { Shell } from '@niscorp/nova';
import { attachValidation, createLoomEditor, parse, toNova } from '../src/index.js';
import { collectModels, mountForm, permissiveRegistry } from './helpers.js';

// WHAT `_errors` AND `validations` HOLD — DESIGN.md's "Validation", held to the
// code. They are the messages a form shows, written after an edit, keyed by
// field path. They are not the verdict on the document: each case below is a
// document the schema refuses while the tree says less, or nothing. A change
// to any of them changes that section with it.

type Mounted = { shell: Shell; runtime: NonNullable<ReturnType<Shell['getRuntime']>> };

// One edit through the same `ui:model` pipeline a control uses.
const write = ({ shell, runtime }: Mounted, path: string, value: unknown): void => {
  const bound = collectModels(runtime.render()).find((model) => model.path === path);
  if (bound === undefined) throw new Error(`no control bound to ${path}`);
  shell.dispatch({ type: 'ui:model', ref: bound.ref, payload: value });
};

const errorsOf = ({ runtime }: Mounted): unknown => runtime.getData()['_errors'];

describe('attachValidation — what is written, and when', () => {
  const Booking = z.object({ member: z.string(), email: z.email('Not an email address.'), note: z.string() });

  it('writes nothing before the first change, whatever the schema says of the starting document', () => {
    const form = mountForm(toNova(parse(Booking)));
    const reported: unknown[] = [];
    attachValidation(form.shell, form.instanceId, Booking, (document) => reported.push(document));

    expect(Booking.safeParse(form.runtime.getData()).success).toBe(false);
    expect('_errors' in form.runtime.getData()).toBe(false);
    expect(reported).toEqual([]);

    write(form, 'note', 'aisle seat');
    expect(errorsOf(form)).toEqual({ email: 'Not an email address.' });
    expect(reported).toEqual([{ member: '', email: '', note: 'aisle seat' }]);
  });

  it('a problem with no path is written nowhere; the same rule given a path lands at its field', () => {
    const Run = z.object({ from: z.string(), to: z.string() });
    const ends = (run: { from: string; to: string }): boolean => run.to >= run.from;
    const message = 'A run cannot end before it starts.';
    const start = { from: '2026-10-05', to: '2026-10-09' };

    const pathless = Run.refine(ends, message);
    const first = mountForm(toNova(parse(pathless), { value: start }));
    attachValidation(first.shell, first.instanceId, pathless);
    write(first, 'to', '2026-10-01');
    expect(pathless.safeParse({ from: '2026-10-05', to: '2026-10-01' }).success).toBe(false);
    expect(errorsOf(first)).toEqual({});

    const pathed = Run.refine(ends, { message, path: ['to'] });
    const second = mountForm(toNova(parse(pathed), { value: start }));
    attachValidation(second.shell, second.instanceId, pathed);
    write(second, 'to', '2026-10-01');
    expect(errorsOf(second)).toEqual({ to: message });
  });

  it('one slot holds one thing: a message on a list is dropped when a row in it has one', () => {
    const Night = z.object({
      guests: z.array(z.object({ name: z.string().min(1, 'A guest needs a name.') })).min(2, 'A night needs two guests.'),
    });
    const form = mountForm(toNova(parse(Night), { value: { guests: [{ name: 'Ada' }] } }));
    attachValidation(form.shell, form.instanceId, Night);
    write(form, 'guests.0.name', '');

    const refused = Night.safeParse({ guests: [{ name: '' }] });
    expect(refused.success ? [] : refused.error.issues.map((issue) => issue.message).sort()).toEqual([
      'A guest needs a name.',
      'A night needs two guests.',
    ]);
    expect(errorsOf(form)).toEqual({ guests: { '0': { name: 'A guest needs a name.' } } });
  });

  it('a field in a list row binds no error slot: its message is in the tree and no frame is handed it', () => {
    const Night = z.object({ play: z.string().min(1, 'A night needs a play.'), guests: z.array(z.object({ name: z.string().min(1, 'A guest needs a name.') })) });
    const form = mountForm(toNova(parse(Night), { value: { play: 'The Tempest', guests: [{ name: 'Ada' }, { name: 'Grace' }] } }));
    attachValidation(form.shell, form.instanceId, Night);
    write(form, 'play', '');
    write(form, 'guests.1.name', '');

    expect(errorsOf(form)).toEqual({ play: 'A night needs a play.', guests: { '1': { name: 'A guest needs a name.' } } });
    const handed: unknown[] = [];
    const walk = (nodes: ReturnType<typeof form.runtime.render>): void => {
      for (const node of nodes) {
        if (node.type === 'component' && node.name === 'loom:field') handed.push(node.props['error']);
        if (node.type === 'component' || node.type === 'fragment') walk(node.children);
      }
    };
    walk(form.runtime.render());
    // The root field gets its message; the list's own frame gets the subtree
    // (not a string, so not drawn); the two rows' `name` frames get nothing.
    expect(handed).toEqual(['A night needs a play.', { '1': { name: 'A guest needs a name.' } }, undefined, undefined]);
  });
});

describe('createLoomEditor — validations', () => {
  it('are empty at open for a stored document the schema refuses; the schema itself answers', () => {
    const Booking = z.object({ member: z.string(), email: z.email('Not an email address.') });
    const editor = createLoomEditor({ registry: permissiveRegistry() });
    editor.loadPlugin({ name: 'box-office', documents: { booking: Booking } });
    editor.open({ type: 'box-office', documents: { booking: { member: 'grace', email: 'grace-at-example' } } });

    expect(editor.validations).toEqual({ booking: {} });
    expect(Booking.safeParse(editor.documents['booking']).success).toBe(false);

    const instanceId = editor.shell.getCanvasState('form:booking').active?.id ?? '';
    const runtime = editor.shell.getRuntime(instanceId);
    if (runtime === undefined) throw new Error('no form runtime');
    write({ shell: editor.shell, runtime }, 'member', 'Grace');
    expect(editor.validations).toEqual({ booking: { email: 'Not an email address.' } });
    editor.dispose();
  });
});
