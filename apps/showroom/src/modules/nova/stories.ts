import { counterStory } from './stories/actions/counter';
import { endpointStory } from './stories/actions/endpoint';
import { endpointFullStory } from './stories/actions/endpoint-full';
import { inputModelStory } from './stories/actions/input-model';
import { lifecycleStory } from './stories/actions/lifecycle';
import { listStory } from './stories/actions/list';
import { setFromUndoStory } from './stories/actions/set-from-undo';
import { strictErrorStory } from './stories/actions/strict-error';
import { toggleStory } from './stories/actions/toggle';
import { bindingsConditionalStory } from './stories/bindings/conditional';
import { bindingsMissingPathsStory } from './stories/bindings/missing-paths';
import { nestedConditionalsStory } from './stories/bindings/nested-conditionals';
import { bindingsPathStory } from './stories/bindings/path';
import { bindingsTemplatesStory } from './stories/bindings/templates';
import { boxStory } from './stories/components/box';
import { buttonVariantsStory } from './stories/components/button-variants';
import { inputDisplayStory } from './stories/components/input-display';
import { profileCardStory } from './stories/components/profile-card';
import { stackStory } from './stories/components/stack';
import { stackAlignmentsStory } from './stories/components/stack-alignments';
import { textStory } from './stories/components/text';
import { textColorsStory } from './stories/components/text-colors';
import { textTypographyStory } from './stories/components/text-typography';
import { structureConditionalInLoopStory } from './stories/structure/conditional-in-loop';
import { emptyListStory } from './stories/structure/empty-list';
import { structureLayoutRefsStory } from './stories/structure/layout-refs';
import { structureLoopStory } from './stories/structure/loop';
import { structureNestedLoopsStory } from './stories/structure/nested-loops';
import { numberedListStory } from './stories/structure/numbered-list';
import { crossCanvasMessagingStory } from './stories/shell/cross-canvas-messaging';
import { multiCanvasStory } from './stories/shell/multi-canvas';
import { pushPopNavigationStory } from './stories/shell/push-pop-navigation';
import { replaceWizardStory } from './stories/shell/replace-wizard';
import { suspendResumeOnNavStory } from './stories/shell/suspend-resume-on-nav';
import type { Story } from './story-types';

export const stories: Story[] = [
  // Bindings
  bindingsConditionalStory,
  bindingsMissingPathsStory,
  bindingsPathStory,
  bindingsTemplatesStory,
  nestedConditionalsStory,
  // Components
  boxStory,
  buttonVariantsStory,
  inputDisplayStory,
  profileCardStory,
  stackStory,
  stackAlignmentsStory,
  textStory,
  textColorsStory,
  textTypographyStory,
  // Structure
  structureConditionalInLoopStory,
  structureLayoutRefsStory,
  structureLoopStory,
  structureNestedLoopsStory,
  numberedListStory,
  emptyListStory,
  // Actions
  counterStory,
  setFromUndoStory,
  inputModelStory,
  toggleStory,
  listStory,
  lifecycleStory,
  endpointStory,
  endpointFullStory,
  strictErrorStory,
  // Shells
  pushPopNavigationStory,
  replaceWizardStory,
  multiCanvasStory,
  crossCanvasMessagingStory,
  suspendResumeOnNavStory,
];
