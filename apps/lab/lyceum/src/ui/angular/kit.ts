import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, Directive, ElementRef, inject, signal } from '@angular/core';
import type { OnChanges } from '@angular/core';
import { NOVA_MODEL_PROP, NOVA_REF_PROP } from '@niscorp/nova';
import type { NovaEvent, RenderNode } from '@niscorp/nova';
import type { KitOf } from '../kit.props';
import { foldOpen, rememberFold } from '../fold';
import { ALIGNS, GAPS, INKS, LANGS, LEVELS, MARKS, PANES, SCALES, SIGILS, SIZES, SPLITS, oneOf, records } from '../kit';
import {
  SIGIL_SHAPES,
  areaOf,
  codeLines,
  fitOf,
  flowDelays,
  instantOf,
  narrowOf,
  numbers,
  pipelineColumns,
  pipelineOf,
  qrOf,
  remaining,
  sheetStyle,
  templateOf,
  text,
  weight,
} from '../kit.shape';
import type { CodeLine, PipelineShape, Template } from '../kit.shape';
import { Children, SCOPE } from './tree';
import type { AngularComponent, Props, Scope } from './tree';

const SETS = {
  inks: INKS,
  marks: MARKS,
  aligns: ALIGNS,
  scales: SCALES,
  sizes: SIZES,
  panes: PANES,
  splits: SPLITS,
  gaps: GAPS,
  langs: LANGS,
  none: ['none'],
  muted: ['muted'],
  two: ['two'],
  large: ['large'],
  chime: ['chime'],
  y: ['y'],
  yEnd: ['y', 'end'],
} as const;

const flag = (on: boolean): '' | null => (on ? '' : null);

// Each component is the element the DOM kit (../kit.ts) draws: Angular makes
// a component's host from its selector, and the host bindings set its class
// and data attributes, so the one stylesheet draws both. A selector names the
// class too: a component matches elements in its own template, and a bare
// `div` would draw itself inside itself.
@Directive({ inputs: ['props', 'children'], host: { '[attr.data-ref]': 'ref', '(click)': 'press($event)' } })
abstract class Part {
  props: Props = {};
  children: readonly RenderNode[] = [];
  protected readonly scope: Scope = inject(SCOPE);
  protected readonly sets = SETS;

  protected one(key: string, options: readonly string[]): string | undefined {
    return oneOf(this.props[key], options);
  }

  protected say(key: string, otherwise = ''): string {
    return text(this.props[key]) ?? otherwise;
  }

  protected get ref(): string | undefined {
    return text(this.props[NOVA_REF_PROP]);
  }

  protected get model(): string | undefined {
    const model = this.props[NOVA_MODEL_PROP];
    return typeof model === 'object' && model !== null ? text(Reflect.get(model, 'ref')) : undefined;
  }

  protected dispatch(event: NovaEvent): void {
    this.scope.dispatch(event);
  }

  protected press(event: Event): void {
    const ref = this.ref;
    if (ref === undefined || this.model !== undefined) return;
    event.stopPropagation();
    const value = this.props['value'];
    this.dispatch(value === undefined ? { type: 'ui:click', ref } : { type: 'ui:click', ref, payload: value });
  }
}

// Placed in its sheet's grid by `area`, and left out by the sheet's narrow arrangement.
@Directive({ host: { '[style.grid-area]': 'area', '[attr.data-narrow-hidden]': 'hidden' } })
abstract class Placed extends Part {
  protected get area(): string | undefined {
    return areaOf(this.props['area']);
  }

  protected get hidden(): '' | null {
    const names = this.scope.narrow();
    const area = this.area;
    return flag(names !== undefined && area !== undefined && !names.has(area));
  }
}

const CHILDREN = `<ng-container [novaChildren]="children" />`;

@Component({ selector: 'div.page', imports: [Children], host: { class: 'page' }, template: `${CHILDREN}<span class="renderer">Angular</span>` })
class Page extends Part {}

@Component({
  selector: 'div.sheet',
  imports: [Children],
  host: { class: 'sheet', '[attr.data-size]': 'size', '[attr.data-scale]': "one('scale', sets.scales)", '[attr.data-narrow]': 'narrowed', '[style]': 'style' },
  template: `<ng-container [novaChildren]="children" [novaScope]="inner" />`,
})
class Sheet extends Part implements OnChanges {
  protected size: 'fill' | 'auto' = 'auto';
  protected style: Record<string, string> = {};
  private narrow: Template | undefined;
  protected readonly inner: Scope = { ...this.scope, narrow: () => this.narrow?.names };

  protected get narrowed(): '' | null {
    return flag(this.narrow !== undefined);
  }

  ngOnChanges(): void {
    this.size = oneOf(this.props['size'], ['fill', 'auto'] as const) ?? 'auto';
    this.narrow = narrowOf(this.props['narrow'], this.size);
    this.style = sheetStyle(templateOf(this.props['areas'], this.props['rows'], this.props['cols'], this.size), this.narrow, this.size);
  }
}

@Component({
  selector: 'div.cell',
  imports: [Children],
  host: {
    class: 'cell',
    '[attr.data-ink]': "one('ink', sets.inks)",
    '[attr.data-mark]': "one('mark', sets.marks)",
    '[attr.data-align]': "one('align', sets.aligns)",
    '[attr.data-pad]': "one('pad', sets.none)",
    '[attr.data-xray]': "props['xray'] === true ? '' : null",
    '[attr.data-scroll]': "one('scroll', sets.yEnd)",
  },
  template: CHILDREN,
})
class Cell extends Placed {}

@Component({ selector: 'span.label', imports: [Children], host: { class: 'label' }, template: CHILDREN })
class Label extends Part {}

const HEADLINE = { imports: [Children], host: { class: 'headline', '[attr.data-level]': 'level' }, template: CHILDREN };

@Directive()
abstract class Heading extends Part {
  protected get level(): string {
    return oneOf(this.props['level'], LEVELS) ?? 'title';
  }
}

@Component({ selector: 'h1.headline', ...HEADLINE })
class DisplayHeadline extends Heading {}

@Component({ selector: 'h2.headline', ...HEADLINE })
class Headline extends Heading {}

@Component({
  selector: 'p.text',
  imports: [Children],
  host: { class: 'text', '[attr.data-tone]': "one('tone', sets.muted)", '[attr.data-size]': "one('size', sets.sizes)" },
  template: CHILDREN,
})
class Text extends Part {}

// <pre> keeps the template's whitespace, so its markup is on one line.
@Component({
  selector: 'figure.exhibit',
  host: {
    class: 'exhibit',
    '[attr.data-lang]': "one('lang', sets.langs)",
    '[attr.data-tone]': "one('tone', sets.panes)",
    '[attr.data-flag]': "one('flag', sets.inks)",
    '[attr.data-fit]': 'fit === undefined ? null : ""',
    '[style]': 'fit',
  },
  template: `<figcaption>{{ say('label') }}</figcaption><pre>@for (line of lines; track $index) {<span [innerHTML]="line.html" [attr.data-marked]="line.marked ? '' : null"></span>}</pre>`,
})
class Exhibit extends Placed implements OnChanges {
  protected lines: CodeLine[] = [];
  protected fit: Record<string, string> | undefined;

  ngOnChanges(): void {
    const source = text(this.props['text']) ?? '';
    this.lines = codeLines(source, oneOf(this.props['lang'], LANGS), numbers(this.props['marked']));
    this.fit = fitOf(this.props['fit'], source);
  }
}

@Component({ selector: 'div.pair', imports: [Children], host: { class: 'pair', '[attr.data-split]': "one('split', sets.splits)" }, template: CHILDREN })
class Pair extends Placed {}

@Component({
  selector: 'div.stack',
  imports: [Children],
  host: { class: 'stack', '[attr.data-gap]': "one('gap', sets.gaps)", '[attr.data-scroll]': "one('scroll', sets.y)" },
  template: CHILDREN,
})
class Stack extends Placed {}

@Component({
  selector: 'div.stats',
  host: { class: 'stats' },
  template: `@for (item of items; track $index) {<div [attr.data-ink]="item.ink"><b>{{ item.value }}</b><span>{{ item.label }}</span></div>}`,
})
class Stats extends Placed implements OnChanges {
  protected items: { ink: string | undefined; value: string; label: string }[] = [];

  ngOnChanges(): void {
    this.items = records(this.props['items']).map((item) => ({ ink: oneOf(item['ink'], INKS), value: text(item['value']) ?? '—', label: text(item['label']) ?? '' }));
  }
}

// A line of steps and one detour under it, as in the DOM kit.
@Component({
  selector: 'div.pipeline',
  imports: [NgTemplateOutlet],
  host: { class: 'pipeline', '[style.grid-template-columns]': 'columns' },
  template: `
    <ng-template #step let-item let-column="column" let-row="row">
      <div class="pipeline-step" [style.grid-column]="column" [style.grid-row]="row" [attr.data-ink]="inkOf(item.ink)" [attr.data-off]="item.off ? '' : null"><b>{{ item.label }}</b><i>{{ item.note }}</i><span>{{ item.value }}</span></div>
    </ng-template>
    <ng-template #link let-name let-said="said" let-off="off" let-column="column" let-row="row">
      <div [class]="name" [style.grid-column]="column" [style.grid-row]="row" [attr.data-off]="off ? '' : null"><span>{{ said }}</span></div>
    </ng-template>
    @for (item of shape.steps; track $index) {
      <ng-container *ngTemplateOutlet="step; context: { $implicit: item, column: '' + ($index * 2 + 1), row: '1' }" />
      @if (shape.links[$index]; as next) {
        <ng-container *ngTemplateOutlet="link; context: { $implicit: 'pipeline-link', said: next.label, off: next.off, column: '' + ($index * 2 + 2), row: '1' }" />
      }
    }
    @if (shape.detour; as detour) {
      <ng-container *ngTemplateOutlet="link; context: { $implicit: 'pipeline-enter', said: detour.enter, off: detour.off, column: '' + (detour.from * 2 + 1), row: '2' }" />
      <ng-container *ngTemplateOutlet="link; context: { $implicit: 'pipeline-leave', said: detour.leave, off: !detour.back, column: '' + (detour.to * 2 + 1), row: '2' }" />
      <div class="pipeline-detour" [style.grid-column]="(detour.from * 2 + 1) + ' / ' + (detour.to * 2 + 2)" style="grid-row: 3" [attr.data-off]="detour.off ? '' : null">
        <span class="pipeline-said">{{ detour.label }}</span>
        <div class="pipeline-inner">
          @for (item of detour.steps; track $index) {
            @if ($index > 0) {
              <ng-container *ngTemplateOutlet="link; context: { $implicit: 'pipeline-link', said: '', off: item.off }" />
            }
            <ng-container *ngTemplateOutlet="step; context: { $implicit: item }" />
          }
        </div>
      </div>
    }
    @if (shape.legend.length > 0) {
      <div class="pipeline-legend" [style.grid-column]="((shape.detour?.to ?? 0) * 2 + 3) + ' / -1'" style="grid-row: 3">
        @for (item of shape.legend; track $index) {<span [attr.data-ink]="inkOf(item.ink)">{{ item.label }}</span>}
      </div>
    }
  `,
})
class Pipeline extends Placed implements OnChanges {
  protected shape: PipelineShape = pipelineOf({});
  protected columns = '';

  protected inkOf(value: unknown): string | undefined {
    return oneOf(value, INKS);
  }

  ngOnChanges(): void {
    this.shape = pipelineOf(this.props);
    this.columns = pipelineColumns(this.shape.steps.length);
  }
}

@Component({ selector: 'div.figure', host: { class: 'figure' }, template: `<span class="label">{{ say('label') }}</span><span class="value">{{ say('value', '—') }}</span>` })
class Figure extends Part {}

// On the viewer's clock rather than the server's: a tree re-sent every second
// would be a render a second for nothing.
@Component({
  selector: 'div.countdown',
  host: { class: 'figure countdown', '[attr.data-done]': 'left.done ? "" : null' },
  template: `<span class="label">{{ say('label') }}</span><span class="value">{{ left.shown }}</span>`,
})
class Countdown extends Part implements OnChanges {
  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  protected get left(): ReturnType<typeof remaining> {
    return remaining(instantOf(text(this.props['to'])), this.now());
  }

  ngOnChanges(): void {
    clearInterval(this.timer);
    this.now.set(Date.now());
    if (!this.left.running) return;
    this.timer = setInterval(() => {
      this.now.set(Date.now());
      if (!this.left.running) clearInterval(this.timer);
    }, 1000);
  }
}

@Component({
  selector: 'div.code',
  host: { class: 'code' },
  template: `@for (line of lines; track $index) {<span [attr.data-marked]="line.marked ? '' : null">{{ line.text }}</span>}`,
})
class Code extends Part implements OnChanges {
  protected lines: { text: string; marked: boolean }[] = [];

  ngOnChanges(): void {
    const marked = new Set(numbers(this.props['marked']));
    this.lines = (text(this.props['text']) ?? '').split('\n').map((line, i) => ({ text: line === '' ? ' ' : line, marked: marked.has(i + 1) }));
  }
}

const SIGIL = `
  <svg viewBox="0 0 100 100" class="sigil" aria-hidden="true" [attr.data-size]="large ? 'large' : null">
    @for (part of parts; track $index) {
      @switch (part.tag) {
        @case ('polygon') { <polygon [attr.points]="part.attrs['points']" /> }
        @case ('circle') { <circle [attr.cx]="part.attrs['cx']" [attr.cy]="part.attrs['cy']" [attr.r]="part.attrs['r']" /> }
        @case ('rect') { <rect [attr.x]="part.attrs['x']" [attr.y]="part.attrs['y']" [attr.width]="part.attrs['width']" [attr.height]="part.attrs['height']" /> }
      }
    }
  </svg>
`;

const partsOf = (shape: unknown): (typeof SIGIL_SHAPES)[keyof typeof SIGIL_SHAPES] => {
  const known = oneOf(shape, SIGILS);
  return known === undefined ? [] : SIGIL_SHAPES[known];
};

// A sigil inside another component's template: the <span> it is put on is its element.
@Component({ selector: 'span[sigil]', inputs: ['shape: sigil'], template: SIGIL })
class SigilMark {
  shape: unknown;
  protected readonly large = false;

  protected get parts(): ReturnType<typeof partsOf> {
    return partsOf(this.shape);
  }
}

@Component({ selector: 'span', template: SIGIL })
class Sigil extends Part {
  protected get parts(): ReturnType<typeof partsOf> {
    return partsOf(this.props['shape']);
  }

  protected get large(): boolean {
    return this.props['size'] === 'large';
  }
}

@Component({
  selector: 'span.qr',
  host: { class: 'qr' },
  template: `
    @if (qr; as drawn) {
      <svg [attr.viewBox]="drawn.viewBox" shape-rendering="crispEdges" role="img" [attr.aria-label]="say('value')"><rect width="100%" height="100%" class="qr-ground" /><path [attr.d]="drawn.d" /></svg>
    }
  `,
})
class Qr extends Part implements OnChanges {
  protected qr: { viewBox: string; d: string } | undefined;

  ngOnChanges(): void {
    const value = text(this.props['value']) ?? '';
    this.qr = value === '' ? undefined : qrOf(value);
  }
}

type RowCell = { kind: 'text' | 'mono' | 'sigil' | 'missing'; value: unknown; said: string };

@Component({
  selector: 'div.rows',
  imports: [SigilMark],
  host: { class: 'rows', '[attr.data-head]': 'labelled ? "" : null' },
  template: `
    @if (labelled) {
      <div [style.--cols]="cols">@for (label of labels; track $index) {<span>{{ label }}</span>}</div>
    }
    @for (row of body; track $index) {
      <div [style.--cols]="cols" [attr.data-selected]="row.selected ? '' : null" [attr.data-press]="rowRef === undefined ? null : ''" (click)="choose(row.key)">
        @for (cell of row.cells; track $index) {
          @switch (cell.kind) {
            @case ('sigil') { <span><span [sigil]="cell.value"></span></span> }
            @default { <span [attr.data-kind]="cell.kind">{{ cell.said }}</span> }
          }
        }
      </div>
    } @empty {
      <div class="empty">{{ say('empty') }}</div>
    }
  `,
})
class Rows extends Part implements OnChanges {
  protected cols = '';
  protected labelled = false;
  protected labels: string[] = [];
  protected rowRef: string | undefined;
  protected body: { key: unknown; selected: boolean; cells: RowCell[] }[] = [];

  ngOnChanges(): void {
    const columns = records(this.props['columns']);
    const clickKey = text(this.props['clickKey']) ?? text(this.props['rowKey']) ?? '';
    const selected = this.props['selected'];
    this.rowRef = text(this.props['rowRef']);
    this.cols = columns.map((column) => `${weight(column['w']) ?? 1}fr`).join(' ');
    this.labels = columns.map((column) => text(column['label']) ?? '');
    this.labelled = this.labels.some((label) => label !== '');
    this.body = records(this.props['rows']).map((record) => {
      const key = record[clickKey];
      return {
        key,
        selected: selected !== undefined && selected !== null && key === selected,
        cells: columns.map((column): RowCell => {
          const kind = oneOf(column['kind'], ['text', 'mono', 'sigil'] as const) ?? 'text';
          const value = record[text(column['key']) ?? ''];
          const missing = value === null || value === undefined || (kind !== 'sigil' && value === '');
          return missing ? { kind: 'missing', value, said: text(column['missing']) ?? '' } : { kind, value, said: text(value) ?? '' };
        }),
      };
    });
  }

  protected choose(key: unknown): void {
    if (this.rowRef !== undefined) this.dispatch({ type: 'ui:click', ref: this.rowRef, payload: key });
  }
}

@Component({
  selector: 'div.bar',
  host: { class: 'bar', '[style.grid-template-columns]': 'columns' },
  template: `@for (segment of segments; track $index) {<span [attr.data-ink]="segment.ink" [attr.data-mark]="segment.mark"></span>}`,
})
class Bar extends Part implements OnChanges {
  protected columns = '1fr';
  protected segments: { ink: string | undefined; mark: string | undefined }[] = [];

  ngOnChanges(): void {
    const segments = records(this.props['segments']).filter((segment) => typeof segment['value'] === 'number' && segment['value'] > 0);
    this.columns = segments.map((segment) => `${text(segment['value']) ?? '1'}fr`).join(' ') || '1fr';
    this.segments = segments.map((segment) => ({ ink: oneOf(segment['ink'], INKS), mark: oneOf(segment['mark'], MARKS) }));
  }
}

// Each lane starts where the wall clock says it is, not at its beginning.
@Component({
  selector: 'div.flow',
  host: { class: 'flow' },
  template: `
    <div class="flow-end">{{ say('from') }}</div>
    <div class="flow-lanes">
      @for (lane of lanes; track $index) {
        <div class="flow-lane" [attr.data-toward]="lane.toward" [attr.data-ink]="lane.ink">
          <span class="label">{{ lane.label }}</span>
          <div class="flow-track">@for (delay of delays; track $index) {<span class="flow-dot" [style.animation-delay]="delay"></span>}</div>
        </div>
      }
    </div>
    <div class="flow-end">{{ say('to') }}</div>
  `,
})
class Flow extends Part implements OnChanges {
  protected readonly delays = flowDelays(Date.now());
  protected lanes: { label: string; toward: string; ink: string | undefined }[] = [];

  ngOnChanges(): void {
    this.lanes = records(this.props['lanes']).map((lane) => ({
      label: text(lane['label']) ?? '',
      toward: oneOf(lane['toward'], ['to', 'from'] as const) ?? 'to',
      ink: oneOf(lane['ink'], INKS),
    }));
  }
}

@Component({
  selector: 'div.columns',
  host: { class: 'columns' },
  template: `
    @for (bar of bars; track $index) {
      <div class="columns-bar">
        <div class="columns-track"><span class="columns-fill" [style.height]="bar.height" [attr.data-ink]="bar.ink" [attr.data-mark]="bar.mark"><span class="columns-value">{{ bar.value }}</span></span></div>
        <span class="label">{{ bar.label }}</span>
      </div>
    }
  `,
})
class Columns extends Part implements OnChanges {
  protected bars: { height: string; ink: string | undefined; mark: string | undefined; value: string; label: string }[] = [];

  ngOnChanges(): void {
    const bars = records(this.props['bars']);
    const values = bars.map((bar) => (typeof bar['value'] === 'number' && bar['value'] > 0 ? bar['value'] : 0));
    const most = Math.max(1, ...values);
    this.bars = bars.map((bar, i) => ({
      height: `${((values[i] ?? 0) / most) * 100}%`,
      ink: oneOf(bar['ink'], INKS),
      mark: oneOf(bar['mark'], MARKS),
      value: text(bar['value']) ?? '0',
      label: text(bar['label']) ?? '',
    }));
  }
}

@Component({
  selector: 'button.action',
  host: {
    type: 'button',
    class: 'action',
    '[attr.data-ink]': "one('ink', sets.inks)",
    '[attr.data-lines]': "one('lines', sets.two)",
    '[attr.data-size]': "one('size', sets.large)",
    '[attr.data-sound]': "one('sound', sets.chime)",
  },
  template: `<span>{{ say('label') }}</span>`,
})
class Action extends Placed {}

// While the field has focus, what the person is typing is the value: a tree
// arriving a round trip later must not overwrite it.
@Component({
  selector: 'input.field',
  host: {
    type: 'text',
    class: 'field',
    spellcheck: 'false',
    autocomplete: 'off',
    '[attr.placeholder]': "props['placeholder']",
    '[value]': 'shown',
    '(focus)': 'focused($event)',
    '(input)': 'typed($event)',
    '(keydown)': 'keyed($event)',
    '(blur)': 'left()',
  },
  template: '',
})
class Field extends Placed {
  private draft: string | undefined;
  private pending: { value: string; timer: ReturnType<typeof setTimeout> } | undefined;

  protected get shown(): string {
    return this.draft ?? text(this.props['value']) ?? '';
  }

  protected focused(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.draft = event.target.value;
  }

  protected typed(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const value = event.target.value;
    this.draft = value;
    const wait = this.props['debounce'];
    if (typeof wait !== 'number' || wait <= 0) {
      this.send(value);
      return;
    }
    if (this.pending !== undefined) clearTimeout(this.pending.timer);
    const timer = setTimeout(() => {
      this.pending = undefined;
      this.send(value);
    }, wait);
    this.pending = { value, timer };
  }

  protected keyed(event: KeyboardEvent): void {
    const model = this.model;
    if (model !== undefined) this.dispatch({ type: 'ui:key', ref: model, key: event.key });
    if (oneOf(this.props['enter'], ['clears'] as const) !== undefined && event.key === 'Enter') this.draft = '';
  }

  protected left(): void {
    if (this.pending !== undefined) {
      clearTimeout(this.pending.timer);
      const { value } = this.pending;
      this.pending = undefined;
      this.send(value);
    }
    this.draft = undefined;
  }

  private send(value: string): void {
    const model = this.model;
    if (model !== undefined) this.dispatch({ type: 'ui:model', ref: model, payload: value });
  }
}

@Component({
  selector: 'label.check',
  host: { class: 'check', '(keydown)': 'keyed($event)' },
  template: `<input type="checkbox" [checked]="props['value'] === true" (change)="toggled($event)" /><span>{{ say('label') }}</span>`,
})
class Check extends Placed {
  protected toggled(event: Event): void {
    const model = this.model;
    if (model !== undefined && event.target instanceof HTMLInputElement) this.dispatch({ type: 'ui:model', ref: model, payload: event.target.checked });
  }

  protected keyed(event: KeyboardEvent): void {
    const model = this.model;
    if (model !== undefined) this.dispatch({ type: 'ui:key', ref: model, key: event.key });
  }
}

// Shows nothing: the render target reads Look's `look` and Xray's `on` off the tree.
@Component({ selector: 'span.look', host: { class: 'look' }, template: '' })
class Look extends Part {}

// An entry that is pressed closes the menu. Caught on the way down, because an
// entry's own press does not let the click travel up.
@Component({
  selector: 'details.menu',
  imports: [Children],
  host: { class: 'menu' },
  template: `<summary class="menu-icon" [attr.aria-label]="say('label', 'Menu')"></summary><div class="menu-items">${CHILDREN}</div>`,
})
class Menu extends Placed {
  constructor() {
    super();
    const node: HTMLElement = inject(ElementRef).nativeElement;
    const close = (event: Event): void => {
      const items = node.querySelector(':scope > .menu-items');
      if (event.target instanceof Node && items !== null && items.contains(event.target)) node.removeAttribute('open');
    };
    node.addEventListener('click', close, true);
    inject(DestroyRef).onDestroy(() => node.removeEventListener('click', close, true));
  }
}

// A heading that opens and shuts what is under it, on this screen alone (../fold.ts).
@Component({
  selector: 'details.fold',
  imports: [Children],
  host: { class: 'fold', '[open]': 'opened()', '(toggle)': 'toggled($event)' },
  template: `<summary class="fold-label">{{ say('label') }}</summary><div class="fold-body">${CHILDREN}</div>`,
})
class Fold extends Part {
  protected opened(): boolean {
    return foldOpen(this.say('name'));
  }

  protected toggled(event: Event): void {
    rememberFold(this.say('name'), (event.target as HTMLDetailsElement).open);
  }
}

export const ANGULAR_KIT: KitOf<AngularComponent> = {
  Page,
  Sheet,
  Cell,
  Label,
  Headline: { pick: (props) => (oneOf(props['level'], LEVELS) === 'display' ? DisplayHeadline : Headline) },
  Text,
  Figure,
  Countdown,
  Code,
  Sigil,
  Qr,
  Rows,
  Bar,
  Flow,
  Columns,
  Action,
  Field,
  Check,
  Look,
  Xray: Look,
  Menu,
  Fold,
  Exhibit,
  Pair,
  Stack,
  Stats,
  Pipeline,
};
