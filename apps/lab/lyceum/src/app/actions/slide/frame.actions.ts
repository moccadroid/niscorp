import type { ActionDefinition } from '@niscorp/nova';
import { stageRegisterAction } from '@lyceum/app/actions/stage/register.action';
import { openingTitleLayout } from './opening.layouts';
import { timerSlide } from './opening.actions';
import { endSlide } from './later.actions';

// Every talk opens and closes the same way. A slide is an action in one talk,
// so each talk has its own of these, over the same layouts.

export const titleOf = (id: string, title: string, line: string): ActionDefinition => ({
  id,
  title,
  data: { title, line, address: { url: '', host: '', ssh: '' } },
  layout: openingTitleLayout,
  endpoints: { address: { fn: 'room.address', target: 'address' } },
  lifecycle: { mount: [{ call: 'address' }] },
  triggers: [],
});

export const registerOf = (id: string): ActionDefinition => ({ ...stageRegisterAction, id, title: 'Everyone who has joined' });

export const timerOf = (id: string): ActionDefinition => ({ ...timerSlide, id });

export const endOf = (id: string): ActionDefinition => ({ ...endSlide, id, data: { ...endSlide.data, repo: 'https://nisc.dev', repoWords: 'nisc.dev' } });

export const copyOf = (slide: ActionDefinition, id: string): ActionDefinition => ({ ...slide, id });
