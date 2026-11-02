import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { Component, Directive, Injector, InjectionToken, ViewContainerRef, inject } from '@angular/core';
import type { EmbeddedViewRef, OnChanges, TemplateRef, Type } from '@angular/core';
import { NOVA_MODEL_PROP, NOVA_REF_PROP, isHeadNode, renderNodeKey, scopeDispatch } from '@niscorp/nova';
import type { ComponentRegistry, NovaEvent, RenderComponentNode, RenderNode } from '@niscorp/nova';
import type { TerminalApi } from '@niscorp/moss/terminal';

export type Props = Record<string, unknown>;

// Angular takes a component's element from its selector, so a component that
// is one element or another by its props is a pick between two components.
export type AngularComponent = Type<unknown> | { readonly pick: (props: Props) => Type<unknown> };

export type Screen = { readonly api: TerminalApi; readonly registry: ComponentRegistry<AngularComponent> };
export const SCREEN = new InjectionToken<Screen>('lyceum.angular.screen');

export type TreeContext = { $implicit: readonly RenderNode[]; scope: Scope };

// What a drawn node is handed through DI: where its events go, the template
// that draws its children, and the grid areas its sheet leaves out when narrow.
export type Scope = {
  readonly api: TerminalApi;
  readonly tree: TemplateRef<TreeContext>;
  readonly dispatch: (event: NovaEvent) => void;
  readonly publish: (channel: string, payload?: unknown) => void;
  readonly narrow: () => ReadonlySet<string> | undefined;
};
export const SCOPE = new InjectionToken<Scope>('lyceum.angular.scope');

const EMPTY: readonly RenderNode[] = [];
const wide = (): undefined => undefined;

// A narrow arrangement is the sheet's, for its own cells: below them it is lifted.
const lifted = new WeakMap<Scope, Scope>();
const liftedOf = (scope: Scope): Scope => {
  const held = lifted.get(scope);
  if (held !== undefined) return held;
  const made = { ...scope, narrow: wide };
  lifted.set(made, made);
  lifted.set(scope, made);
  return made;
};

@Directive({ selector: '[novaChildren]', inputs: ['nodes: novaChildren', 'scope: novaScope'] })
export class Children implements OnChanges {
  nodes: readonly RenderNode[] = EMPTY;
  scope: Scope | undefined;
  private readonly outer = inject(SCOPE);
  private readonly container = inject(ViewContainerRef);
  private view: EmbeddedViewRef<TreeContext> | undefined;

  ngOnChanges(): void {
    const context: TreeContext = { $implicit: this.nodes, scope: this.scope ?? liftedOf(this.outer) };
    if (this.view === undefined) this.view = this.container.createEmbeddedView(this.outer.tree, context);
    else Object.assign(this.view.context, context);
  }
}

type Keyed = { key: string; node: RenderNode };

@Component({
  selector: 'lyceum-angular-frame',
  imports: [NgComponentOutlet, NgTemplateOutlet],
  template: `
    <ng-template #tree let-nodes let-scope="scope">
      @for (item of keyed(nodes); track item.key) {
        @switch (item.node.type) {
          @case ('text') {{{ item.node.value }}}
          @case ('error') {<span role="alert" [attr.data-nova-error]="item.node.code">[{{ item.node.code }}] {{ item.node.message }}</span>}
          @case ('fragment') {<ng-container *ngTemplateOutlet="tree; context: { $implicit: item.node.children, scope }" />}
          @case ('component') {
            @if (!isHead(item.node)) {
              @if (componentOf(item.node); as component) {
                <ng-container *ngComponentOutlet="component; inputs: inputsOf(item.node); injector: injectorOf(scope)" />
              } @else {
                <span role="alert" data-nova-error="COMPONENT_NOT_FOUND">[COMPONENT_NOT_FOUND] {{ item.node.name }}</span>
              }
            }
          }
        }
      }
    </ng-template>
    <ng-container *ngTemplateOutlet="tree; context: { $implicit: screen.api.frame(), scope: rootOf(tree) }" />
  `,
})
export class Frame {
  protected readonly screen = inject(SCREEN);
  private readonly injector = inject(Injector);
  private root: Scope | undefined;
  private readonly keys = new WeakMap<readonly RenderNode[], Keyed[]>();
  private readonly inputs = new WeakMap<RenderComponentNode, { props: Props; children: RenderNode[] }>();
  private readonly injectors = new WeakMap<Scope, Injector>();

  // The frame is chrome: events come only from inside a canvas.
  protected rootOf(tree: TemplateRef<TreeContext>): Scope {
    this.root ??= { api: this.screen.api, tree, dispatch: () => undefined, publish: this.screen.api.publish, narrow: wide };
    return this.root;
  }

  // Two siblings with one key (looped rows that share a ref) are told apart by order.
  protected keyed(nodes: readonly RenderNode[]): Keyed[] {
    const held = this.keys.get(nodes);
    if (held !== undefined) return held;
    const seen = new Map<string, number>();
    const made = nodes.map((node, index) => {
      const key = renderNodeKey(node, index);
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      return { key: count === 0 ? key : `${key}#${count}`, node };
    });
    this.keys.set(nodes, made);
    return made;
  }

  protected isHead(node: RenderComponentNode): boolean {
    return isHeadNode(node);
  }

  protected componentOf(node: RenderComponentNode): Type<unknown> | undefined {
    const entry = this.screen.registry.get(node.name)?.component;
    if (entry === undefined) return undefined;
    return 'pick' in entry ? entry.pick(node.props) : entry;
  }

  protected inputsOf(node: RenderComponentNode): { props: Props; children: RenderNode[] } {
    const held = this.inputs.get(node);
    if (held !== undefined) return held;
    const props: Props = { ...node.props };
    if (node.model !== undefined) props[NOVA_MODEL_PROP] = { ref: node.model.ref, path: node.model.path };
    if (node.ref !== undefined) props[NOVA_REF_PROP] = node.ref;
    const made = { props, children: node.children };
    this.inputs.set(node, made);
    return made;
  }

  protected injectorOf(scope: Scope): Injector {
    const held = this.injectors.get(scope);
    if (held !== undefined) return held;
    const made = Injector.create({ providers: [{ provide: SCOPE, useValue: scope }], parent: this.injector });
    this.injectors.set(scope, made);
    return made;
  }
}

const textOf = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

// Drawn as the DOM adapter draws a canvas: a <div data-canvas> holding its tree.
@Component({
  selector: 'div[data-canvas]',
  inputs: ['props', 'children'],
  imports: [Children],
  host: { '[attr.data-canvas]': 'canvasId' },
  template: `<ng-container [novaChildren]="tree()" [novaScope]="inner()" />`,
})
export class CanvasSlot {
  props: Props = {};
  children: readonly RenderNode[] = EMPTY;
  private readonly outer = inject(SCOPE);
  private readonly scopes = new Map<string, Scope>();

  protected get canvasId(): string {
    return textOf(this.props['canvasId']) ?? '';
  }

  protected tree(): readonly RenderNode[] {
    const tree = this.canvasId === '' ? EMPTY : this.outer.api.canvasTree(this.canvasId);
    return tree.length === 0 ? EMPTY : tree;
  }

  protected inner(): Scope {
    const canvasId = this.canvasId;
    const held = this.scopes.get(canvasId);
    if (held !== undefined) return held;
    const { api } = this.outer;
    const made: Scope = { ...this.outer, dispatch: (event) => api.dispatch(canvasId, event), publish: api.publish, narrow: wide };
    this.scopes.set(canvasId, made);
    return made;
  }
}

// An instance's events carry it as their origin, so they reach its own triggers
// only. Its box is lyceum's: what the x-ray tags.
@Component({
  selector: 'div[data-action]',
  inputs: ['props', 'children'],
  imports: [Children],
  host: { '[attr.data-action]': 'action', '[attr.data-instance]': 'instanceId' },
  template: `<span class="xray-tag">{{ action }}</span><ng-container [novaChildren]="children" [novaScope]="inner()" />`,
})
export class ActionSlot {
  props: Props = {};
  children: readonly RenderNode[] = EMPTY;
  private readonly outer = inject(SCOPE);
  private held: { instanceId: string; scope: Scope } | undefined;

  protected get action(): string {
    return textOf(this.props['definitionId']) ?? '';
  }

  protected get instanceId(): string {
    return textOf(this.props['instanceId']) ?? '';
  }

  protected inner(): Scope {
    const instanceId = this.instanceId;
    if (this.held?.instanceId !== instanceId) {
      const outer = liftedOf(this.outer);
      this.held = { instanceId, scope: instanceId === '' ? outer : { ...outer, dispatch: scopeDispatch(outer.dispatch, instanceId) } };
    }
    return this.held.scope;
  }
}
