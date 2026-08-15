import type { NovaStory } from './story-types';

// Bindings
import { story as bindingsConditional } from './stories/bindings/conditional.story';
import { story as bindingsMissingPaths } from './stories/bindings/missing-paths.story';
import { story as bindingsNestedConditionals } from './stories/bindings/nested-conditionals.story';
import { story as bindingsPath } from './stories/bindings/path.story';
import { story as bindingsTemplates } from './stories/bindings/templates.story';

// Components
import { story as box } from './stories/components/box.story';
import { story as buttonVariants } from './stories/components/button-variants.story';
import { story as inputDisplay } from './stories/components/input-display.story';
import { story as profileCard } from './stories/components/profile-card.story';
import { story as stack } from './stories/components/stack.story';
import { story as stackAlignments } from './stories/components/stack-alignments.story';
import { story as text } from './stories/components/text.story';
import { story as textColors } from './stories/components/text-colors.story';
import { story as textTypography } from './stories/components/text-typography.story';

// Structure
import { story as structureConditionalInLoop } from './stories/structure/conditional-in-loop.story';
import { story as structureEmptyList } from './stories/structure/empty-list.story';
import { story as structureLayoutRefs } from './stories/structure/layout-refs.story';
import { story as structureLoop } from './stories/structure/loop.story';
import { story as structureNestedLoops } from './stories/structure/nested-loops.story';
import { story as structureNumberedList } from './stories/structure/numbered-list.story';

// Actions
import { story as counter } from './stories/actions/counter.story';
import { story as endpoint } from './stories/actions/endpoint.story';
import { story as endpointFull } from './stories/actions/endpoint-full.story';
import { story as functionEndpoint } from './stories/actions/function-endpoint.story';
import { story as functionEndpointMixed } from './stories/actions/function-endpoint-mixed.story';
import { story as inputModel } from './stories/actions/input-model.story';
import { story as lifecycle } from './stories/actions/lifecycle.story';
import { story as list } from './stories/actions/list.story';
import { story as setFromUndo } from './stories/actions/set-from-undo.story';
import { story as strictError } from './stories/actions/strict-error.story';
import { story as toggle } from './stories/actions/toggle.story';

// Composition (ActionFragments)
import { story as composeSlot } from './stories/composition/slot-fill.story';
import { story as composeReuse } from './stories/composition/reuse.story';
import { story as composeMerge } from './stories/composition/merge-rules.story';
import { story as composeStack } from './stories/composition/stacking.story';
import { story as composeModal } from './stories/composition/modal.story';

// Shells
import { story as conditionalDetail } from './stories/shell/conditional-detail.story';
import { story as crossCanvasMessaging } from './stories/shell/cross-canvas-messaging.story';
import { story as dashboardShell } from './stories/shell/dashboard-shell.story';
import { story as listModeFeed } from './stories/shell/list-mode-feed.story';
import { story as listModeKanban } from './stories/shell/list-mode-kanban.story';
import { story as multiCanvas } from './stories/shell/multi-canvas.story';
import { story as pushPopNavigation } from './stories/shell/push-pop-navigation.story';
import { story as replaceWizard } from './stories/shell/replace-wizard.story';
import { story as slotWrapperAnimation } from './stories/shell/slot-wrapper-animation.story';
import { story as slotWrapperAuthGate } from './stories/shell/slot-wrapper-auth-gate.story';
import { story as suspendResumeOnNav } from './stories/shell/suspend-resume-on-nav.story';

// i18n — the swap lives in nova's RENDERER, so every one of these runs on
// pure nova: no moss, no server, no wire, and no i18n code in any adapter.
import { story as i18nSwitch } from './stories/i18n/switch.story';
import { story as i18nKeys } from './stories/i18n/keys.story';
import { story as i18nDepth } from './stories/i18n/depth.story';
import { story as i18nPatterns } from './stories/i18n/patterns.story';
import { story as i18nHarvest } from './stories/i18n/harvest.story';
import { story as i18nFormatting } from './stories/i18n/formatting.story';

export const stories: readonly NovaStory[] = [
  // Bindings
  bindingsConditional,
  bindingsMissingPaths,
  bindingsPath,
  bindingsTemplates,
  bindingsNestedConditionals,
  // Components
  box,
  buttonVariants,
  inputDisplay,
  profileCard,
  stack,
  stackAlignments,
  text,
  textColors,
  textTypography,
  // Structure
  structureConditionalInLoop,
  structureLayoutRefs,
  structureLoop,
  structureNestedLoops,
  structureNumberedList,
  structureEmptyList,
  // Actions
  counter,
  setFromUndo,
  inputModel,
  toggle,
  list,
  lifecycle,
  endpoint,
  endpointFull,
  functionEndpoint,
  functionEndpointMixed,
  strictError,
  // Composition (ActionFragments)
  composeSlot,
  composeReuse,
  composeMerge,
  composeStack,
  composeModal,
  // Shells
  pushPopNavigation,
  replaceWizard,
  multiCanvas,
  crossCanvasMessaging,
  suspendResumeOnNav,
  listModeFeed,
  listModeKanban,
  dashboardShell,
  conditionalDetail,
  slotWrapperAnimation,
  slotWrapperAuthGate,
  // i18n
  i18nSwitch,
  i18nKeys,
  i18nDepth,
  i18nPatterns,
  i18nHarvest,
  i18nFormatting,
];
