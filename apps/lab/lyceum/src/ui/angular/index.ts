import '@angular/compiler';
import { createComponent, provideZonelessChangeDetection, signal } from '@angular/core';
import type { ApplicationRef } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME, createComponentRegistry } from '@niscorp/nova';
import type { Target, TerminalApi } from '@niscorp/moss/terminal';
import { ANGULAR_KIT } from './kit';
import { ActionSlot, CanvasSlot, Frame, SCREEN } from './tree';
import type { AngularComponent } from './tree';

const STATUS = 'data-wire-status';

// Components are compiled in the browser, and drawn without zone.js: a new
// frame bumps a signal the templates read.
export const angularRenderer = (host: HTMLElement): Target => (api) => {
  const revision = signal(0);
  const live: TerminalApi = {
    frame: () => {
      revision();
      return api.frame();
    },
    canvasTree: (canvasId) => {
      revision();
      return api.canvasTree(canvasId);
    },
    dispatch: (canvasId, event) => api.dispatch(canvasId, event),
    publish: (channel, payload) => api.publish(channel, payload),
    status: () => {
      revision();
      return api.status();
    },
  };
  const registry = createComponentRegistry<AngularComponent>();
  registry.registerAll(ANGULAR_KIT);
  registry.register(CANVAS_SLOT_NAME, CanvasSlot);
  registry.register(ACTION_SLOT_NAME, ActionSlot);

  host.setAttribute(STATUS, api.status());
  let app: ApplicationRef | undefined;
  let gone = false;
  void createApplication({ providers: [provideZonelessChangeDetection(), { provide: SCREEN, useValue: { api: live, registry } }] }).then((made) => {
    if (gone) {
      made.destroy();
      return;
    }
    app = made;
    made.attachView(createComponent(Frame, { environmentInjector: made.injector, hostElement: host }).hostView);
  });
  return {
    update: () => {
      host.setAttribute(STATUS, api.status());
      revision.update((n) => n + 1);
    },
    destroy: () => {
      gone = true;
      app?.destroy();
      host.removeAttribute(STATUS);
    },
  };
};
